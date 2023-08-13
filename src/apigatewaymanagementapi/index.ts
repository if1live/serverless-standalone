import http from "http";
import { WebSocketServer } from "ws";
import {
  APIGatewayProxyHandler,
  APIGatewayProxyWebsocketHandlerV2,
} from "aws-lambda";
import { isArrayBuffer } from "node:util/types";
import type { GetConnectionResponse } from "@aws-sdk/client-apigatewaymanagementapi";
import { AwsApiHandler, FunctionDefinition } from "../types.js";
import * as helpers from "../helpers.js";
import { WebSocketEventFactory } from "./events.js";

export const prefix = "/apigatewaymanagementapi/";

type MyWebSocket = WebSocket & {
  connectionId: string;
  connectedAt: Date;
  lastActiveAt: Date;
};

function touchSocket(sock: MyWebSocket) {
  sock.lastActiveAt = new Date();
}

const isConnectFn = (x: FunctionDefinition) => {
  return x.events.find((x) => x.websocket?.route === "$connect");
};

const isDisconnectFn = (x: FunctionDefinition) => {
  return x.events.find((x) => x.websocket?.route === "$disconnect");
};

const isDefaultFn = (x: FunctionDefinition) => {
  return x.events.find((x) => x.websocket?.route === "$default");
};

const sockets = new Map<string, MyWebSocket>();

export const execute = async (
  port: number,
  definitions: FunctionDefinition[],
) => {
  const handlers_connect = definitions
    .filter(isConnectFn)
    .map((x) => x.handler as APIGatewayProxyHandler);

  const handlers_disconnect = definitions
    .filter(isDisconnectFn)
    .map((x) => x.handler as APIGatewayProxyHandler);

  const handlers_default = definitions
    .filter(isDefaultFn)
    .map((x) => x.handler as APIGatewayProxyWebsocketHandlerV2);

  const wss = new WebSocketServer({ port });
  wss.on("connection", async (ws, req) => {
    const connectedAt = new Date();
    const sock = ws as any as MyWebSocket;
    sock.lastActiveAt = connectedAt;
    sock.connectedAt = connectedAt;

    const connectionId = helpers.createUniqueId();
    sock.connectionId = connectionId;
    sockets.set(connectionId, sock);

    // connect
    {
      // req.url 접근하면 "/path?foo=1&foo=2" 같이 나와서 URL로 바로 파싱 안된다
      const url = new URL("http://localhost" + req.url);

      const event = WebSocketEventFactory.connect({
        connectedAt,
        connectionId,
        port,
        searchParams: url.searchParams,
      });

      await Promise.allSettled(
        handlers_connect.map(async (f) => {
          const awsRequestId = helpers.createUniqueId();
          const context = helpers.generateLambdaContext(f.name, awsRequestId);
          await f(event as any, context, helpers.emptyCallback);
        }),
      );
    }

    ws.on("close", async () => {
      // TODO: 종료코드?
      const event = WebSocketEventFactory.disconnect({
        connectedAt,
        connectionId,
        statusCode: 1005,
        reason: "",
      });

      await Promise.allSettled(
        handlers_disconnect.map(async (f) => {
          const awsRequestId = helpers.createUniqueId();
          const context = helpers.generateLambdaContext(f.name, awsRequestId);
          await f(event as any, context, helpers.emptyCallback);
        }),
      );
    });

    ws.on("message", async (data) => {
      touchSocket(sock);

      let message;
      if (Buffer.isBuffer(data)) {
        message = data;
      } else if (isArrayBuffer(data)) {
        // https://miguelmota.com/bytes/arraybuffer-to-buffer/
        const buffer = Buffer.alloc(data.byteLength);
        const view = new Uint8Array(data);
        for (var i = 0; i < buffer.length; ++i) {
          (buffer as any)[i] = view[i];
        }
        message = buffer;
      } else {
        message = Buffer.concat(data);
      }

      const event = WebSocketEventFactory.message({
        connectedAt,
        connectionId,
        message,
      });

      await Promise.allSettled(
        handlers_default.map(async (f) => {
          const awsRequestId = helpers.createUniqueId();
          const context = helpers.generateLambdaContext(f.name, awsRequestId);
          await f(event as any, context, helpers.emptyCallback);
        }),
      );
    });

    ws.on("ping", () => touchSocket(sock));
    ws.on("pong", () => touchSocket(sock));

    ws.on("error", console.error);
  });
};

export const handle: AwsApiHandler = async (req, res) => {
  // https://docs.aws.amazon.com/ko_kr/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html
  // /apigatewaymanagementapi/@connections/<connection_id>
  const re = /^\/apigatewaymanagementapi\/@connections\/([A-Za-z0-9-+=]+)$/;
  const m = re.exec(req.url ?? "");
  if (!m) {
    throw new Error("cannot parse url");
  }

  const connectionId = m[1];
  if (!connectionId) {
    throw new Error("cannot parse connectionId");
  }

  const method = req.method;
  switch (method) {
    case "GET": {
      const json = await fn_get(connectionId, req);
      return helpers.replyJson(res, 200, json);
    }
    case "POST": {
      const json = await fn_post(connectionId, req);
      return helpers.replyJson(res, 200, json);
    }
    case "DELETE": {
      const json = await fn_delete(connectionId, req);
      return helpers.replyJson(res, 200, json);
    }
    default: {
      throw new Error(`unknown http method: ${method}`);
    }
  }
};

function getOrFail(connectionId: string) {
  const sock = sockets.get(connectionId);
  if (!sock) {
    const e = new Error("connection not found");
    (e as any).status = 404;
    throw e;
  }
  return sock;
}

const fn_get = async (connectionId: string, req: http.IncomingMessage) => {
  const sock = getOrFail(connectionId);

  // TODO: 타입 정의는 대문자로 시작하는데 json은 소문자로 나가야한다
  // aws-sdk의 타입을 거치는건 필드 이름 확인용
  const output: GetConnectionResponse = {
    ConnectedAt: sock.connectedAt,
    LastActiveAt: sock.lastActiveAt,
  };

  const entries = Object.entries(output).map(([key, value]) => {
    const head = key[0]?.toLowerCase();
    const rest = key.substring(1, key.length);
    const newKey = `${head}${rest}`;
    return [newKey, value];
  });
  return Object.fromEntries(entries);
};
const fn_post = async (connectionId: string, req: http.IncomingMessage) => {
  const sock = getOrFail(connectionId);
  const body = await helpers.getBody(req);
  sock.send(body);
  touchSocket(sock);
  return {};
};

const fn_delete = async (
  connectionId: string,
  req: http.IncomingMessage,
): Promise<{}> => {
  const sock = getOrFail(connectionId);
  sock.close();
  sockets.delete(connectionId);
  return {};
};
