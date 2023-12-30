import http from "node:http";
import { createHttpTerminator } from "http-terminator";
import * as R from "remeda";
import { WebSocketServer } from "ws";
import {
  APIGatewayProxyHandler,
  APIGatewayProxyWebsocketHandlerV2,
} from "aws-lambda";
import { isArrayBuffer } from "node:util/types";
import type { GetConnectionResponse } from "@aws-sdk/client-apigatewaymanagementapi";
import { AwsApiHandler, FunctionDefinition, ServiceRunner } from "../types.js";
import * as helpers from "../helpers.js";
import { WebSocketEventFactory } from "./events.js";

export const prefix = "/@connections/";

type MyWebSocket = WebSocket & {
  connectionId: string;
  connectedAt: Date;
  lastActiveAt: Date;
};

function touchSocket(sock: MyWebSocket) {
  sock.lastActiveAt = new Date();
}

const isConnectFn = (x: FunctionDefinition) => {
  return x.events.some((x) => x.websocket?.route === "$connect");
};

const isDisconnectFn = (x: FunctionDefinition) => {
  return x.events.some((x) => x.websocket?.route === "$disconnect");
};

const isDefaultFn = (x: FunctionDefinition) => {
  return x.events.some((x) => x.websocket?.route === "$default");
};

const sockets = new Map<string, MyWebSocket>();

export interface Options {
  port: number;
}

export const create = (
  definitions: FunctionDefinition[],
  options: Options,
): ServiceRunner => {
  const { port } = options;

  const definitions_base = definitions
    .map((x) => FunctionDefinition.dropDisabledEvent(x))
    .map((x) => FunctionDefinition.narrow_event(x, "websocket"));

  // 타입 정의때문에 만든 빈 함수
  const handler_v1: APIGatewayProxyHandler = () => {};
  const handler_websocket_v2: APIGatewayProxyWebsocketHandlerV2 = () => {};

  // connect, disconnect, default 핸들러는 0~1개로 보장된다.
  // custom route는 많아질수 있는데 그건 나중에 생각해도 되는 스펙
  const definition_connect = R.pipe(
    definitions_base,
    R.filter(isConnectFn),
    R.map((x) => FunctionDefinition.narrow_handler(x, handler_v1)),
    R.first(),
  );

  const definition_disconnect = R.pipe(
    definitions_base,
    R.filter(isDisconnectFn),
    R.map((x) => FunctionDefinition.narrow_handler(x, handler_v1)),
    R.first(),
  );

  const definition_default = R.pipe(
    definitions_base,
    R.filter(isDefaultFn),
    R.map((x) => FunctionDefinition.narrow_handler(x, handler_websocket_v2)),
    R.first(),
  );

  const dispatchApi: http.RequestListener = async (req, res) => {
    try {
      if (req.url?.startsWith(prefix)) {
        return handle(req, res);
      } else {
        const data = {
          message: `${req.method} ${req.url} NotFound`,
        };
        helpers.replyJson(res, 400, data);
      }
    } catch (err) {
      const e = err as any;
      const status = e.status ?? e.statusCode ?? 500;
      const data = { message: (e as any).message };
      helpers.replyJson(res, status, data);
    }
  };

  const server = http.createServer(dispatchApi);
  const wss = new WebSocketServer({ server });
  const httpTerminator = createHttpTerminator({ server });

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

      if (!definition_connect) {
        return;
      }

      const { handler: f, name } = definition_connect;
      const awsRequestId = helpers.createUniqueId();
      const context = helpers.generateLambdaContext(name, awsRequestId);
      try {
        const result = await f(event as any, context, helpers.emptyCallback);
        if (typeof result === "object") {
          if (result.statusCode != 200) {
            // code 범위는 websocket에 정의된 숫자를 써야한다
            // http status code랑 달라서 뭐랑 맵핑해야 될지 모르겠다. 대충 땜빵
            const message = `${result.statusCode}: ${result.body}`;
            ws.close(1000, message);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }

    ws.on("close", async () => {
      // TODO: 종료코드?
      const event = WebSocketEventFactory.disconnect({
        connectedAt,
        connectionId,
        port,
        statusCode: 1005,
        reason: "",
      });

      if (!definition_disconnect) {
        return;
      }

      const { handler: f, name } = definition_disconnect;
      const awsRequestId = helpers.createUniqueId();
      const context = helpers.generateLambdaContext(name, awsRequestId);
      try {
        const result = await f(event as any, context, helpers.emptyCallback);
      } catch (e) {
        console.error(e);
      }
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

      if (!definition_default) {
        return;
      }

      const { handler: f, name } = definition_default;
      const awsRequestId = helpers.createUniqueId();
      const context = helpers.generateLambdaContext(name, awsRequestId);
      try {
        const result = await f(event as any, context, helpers.emptyCallback);
      } catch (e) {
        console.error(e);
      }
    });

    ws.on("ping", () => touchSocket(sock));
    ws.on("pong", () => touchSocket(sock));

    ws.on("error", console.error);
  });

  const start = async () => {
    return new Promise((resolve) => {
      server.listen(port, () => {
        resolve(port);
      });
    });
  };

  const stop = async () => httpTerminator.terminate();

  return {
    start,
    stop,
  };
};

export const handle: AwsApiHandler = async (req, res) => {
  // https://docs.aws.amazon.com/ko_kr/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html
  // /@connections/<connection_id>
  const re = /^\/@connections\/([A-Za-z0-9-+=]+)$/;
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
  const buffer = await helpers.getBodyBuffer(req);
  // https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-develop-binary-media-types.html
  // aws websocket api는 기본적으로 string만 지원한다.
  const body = buffer.toString("utf-8");
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
