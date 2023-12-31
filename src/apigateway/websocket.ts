import http from "node:http";
import { isArrayBuffer } from "node:util/types";
import type { GetConnectionResponse } from "@aws-sdk/client-apigatewaymanagementapi";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
  Context,
} from "aws-lambda";
import { createHttpTerminator } from "http-terminator";
import * as R from "remeda";
import { VerifyClientCallbackAsync, WebSocketServer } from "ws";
import * as helpers from "../helpers.js";
import { AwsApiHandler, FunctionDefinition, ServiceRunner } from "../types.js";
import { WebSocketEventFactory } from "./events.js";

export const prefix = "/@connections/";

// https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-integration-responses.html
// The template selection expression, as described above, functions identically. For example:
// /2\d\d/: Receive and transform successful responses
// /4\d\d/: Receive and transform bad request errors
// $default: Receive and transform all unexpected responses
const handleResult = (result: APIGatewayProxyResult): [boolean, number?] => {
  // status code 없는 경우는 성공으로 간주
  if (!result) {
    return [true, undefined];
  }
  if (!result.statusCode) {
    return [true, undefined];
  }

  const statusCode = result.statusCode;
  if (200 <= statusCode && statusCode < 300) {
    return [true, undefined];
  }
  return [false, statusCode];
};

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
  const handler_v1 = async (
    evt: APIGatewayProxyEvent,
    context: Context,
  ): Promise<APIGatewayProxyResult> => {
    return { statusCode: 200, body: "OK" };
  };
  const handler_websocket_v2 = async (
    evt: APIGatewayProxyWebsocketEventV2,
    context: Context,
  ): Promise<APIGatewayProxyResultV2> => {
    return { statusCode: 200, body: "OK" };
  };

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
      }
      const data = {
        message: `${req.method} ${req.url} NotFound`,
      };
      helpers.replyJson(res, 400, data);
    } catch (err) {
      const e = err as any;
      const status = e.status ?? e.statusCode ?? 500;
      const data = { message: (e as any).message };
      helpers.replyJson(res, status, data);
    }
  };

  // connection에서 거부했을떄의 동작
  // onerror
  // onclose 1006
  // onopen은 호출되지 않아야한다
  // verifyClient에서 막아야 onopen보다 onerror를 빠르게 띄울수 있다
  const verifyClient: VerifyClientCallbackAsync = async (info, cb) => {
    const connectedAt = new Date();
    const connectionId = helpers.createUniqueId();
    (info.req as any)._connectionId = connectionId;
    (info.req as any)._connectedAt = connectedAt;

    // req.url 접근하면 "/path?foo=1&foo=2" 같이 나와서 URL로 바로 파싱 안된다
    const url = new URL(`http://localhost${info.req.url}`);

    const event = WebSocketEventFactory.connect({
      connectedAt,
      connectionId,
      port,
      searchParams: url.searchParams,
    });

    if (!definition_connect) {
      return cb(true);
    }

    const { handler: f, name } = definition_connect;
    const awsRequestId = helpers.createUniqueId();
    const context = helpers.generateLambdaContext(name, awsRequestId);
    try {
      const result = await f(event as any, context);
      const [ok, code] = handleResult(result);
      cb(ok, code);
    } catch (e) {
      cb(false, 502);
    }
  };

  const server = http.createServer(dispatchApi);
  const wss = new WebSocketServer({ server, verifyClient });
  const httpTerminator = createHttpTerminator({ server });

  wss.on("connection", async (ws, req) => {
    // verifyClient와 하드코딩 어떻게 연결하지
    const connectionId = (req as any)._connectionId;
    const connectedAt = (req as any)._connectedAt;

    const sock = ws as any as MyWebSocket;
    sock.lastActiveAt = connectedAt;
    sock.connectedAt = connectedAt;
    sock.connectionId = connectionId;
    sockets.set(connectionId, sock);

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
        const result = await f(event as any, context);
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
        for (let i = 0; i < buffer.length; ++i) {
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
        const result = await f(event as any, context);
      } catch (e) {
        const err = e as Error;
        const payload = {
          message: "Internal server error",
          connectionId,
          requestId: awsRequestId,
          // custom
          err_name: err.name,
          err_message: err.message,
          err_stack: (err.stack ?? "").split("\n").map((x) => x.trim()),
        };
        ws.send(JSON.stringify(payload));
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
): Promise<object> => {
  const sock = getOrFail(connectionId);
  sock.close();
  sockets.delete(connectionId);
  return {};
};
