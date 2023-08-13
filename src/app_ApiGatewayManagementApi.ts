import http from "http";
import { WebSocketServer } from "ws";
import type {
  GetConnectionCommandOutput,
  GetConnectionResponse,
} from "@aws-sdk/client-apigatewaymanagementapi";
import * as helpers from "./helpers.js";
import { AwsApiHandler, FunctionDefinition, ServiceRunner } from "./types.js";
import {
  APIGatewayEventIdentity,
  APIGatewayEventRequestContext,
  APIGatewayEventWebsocketRequestContextV2,
  APIGatewayProxyHandler,
  APIGatewayProxyWebsocketHandlerV2,
  Context,
} from "aws-lambda";
import { isArrayBuffer } from "node:util/types";

type MyWebSocket = WebSocket & {
  connectionId: string;
  connectedAt: Date;
  lastActiveAt: Date;
};

function touchSocket(sock: MyWebSocket) {
  sock.lastActiveAt = new Date();
}

const isConnectFn = (x: FunctionDefinition) => {
  return x.events.find((x) => x.websocket && x.websocket.route === "$connect");
};

const isDisconnectFn = (x: FunctionDefinition) => {
  return x.events.find(
    (x) => x.websocket && x.websocket.route === "$disconnect",
  );
};

const isDefaultFn = (x: FunctionDefinition) => {
  return x.events.find((x) => x.websocket && x.websocket.route === "$default");
};

const emptyCallback = () => {};

const sockets = new Map<string, MyWebSocket>();

export const execute: ServiceRunner = async (
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

      const event = generateEvent_connect({
        connectedAt,
        connectionId,
        port,
        searchParams: url.searchParams,
      });

      await Promise.allSettled(
        handlers_connect.map(async (f) => {
          const awsRequestId = helpers.createUniqueId();
          const context = generateContext(f.name, awsRequestId);
          await f(event as any, context, emptyCallback);
        }),
      );
    }

    ws.on("close", async () => {
      // TODO: 종료코드?
      const event = generateEvent_disconnect({
        connectedAt,
        connectionId,
        statusCode: 1005,
        reason: "",
      });

      await Promise.allSettled(
        handlers_disconnect.map(async (f) => {
          const awsRequestId = helpers.createUniqueId();
          const context = generateContext(f.name, awsRequestId);
          await f(event as any, context, emptyCallback);
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

      const event = generateEvent_message({
        connectedAt,
        connectionId,
        message,
      });

      await Promise.allSettled(
        handlers_default.map(async (f) => {
          const awsRequestId = helpers.createUniqueId();
          const context = generateContext(f.name, awsRequestId);
          await f(event as any, context, emptyCallback);
        }),
      );
    });

    ws.on("ping", () => touchSocket(sock));
    ws.on("pong", () => touchSocket(sock));

    ws.on("error", console.error);
  });
};

export const prefix = "/apigatewaymanagementapi/";

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

// https://github.com/dherault/serverless-offline/blob/master/src/lambda/LambdaContext.js
function generateContext(functionName: string, awsRequestId: string): Context {
  const context: Partial<Context> = {
    awsRequestId,
    callbackWaitsForEmptyEventLoop: true,
    clientContext: undefined,
    functionName,
    functionVersion: "$LATEST",
    identity: undefined,
    invokedFunctionArn: `offline_invokedFunctionArn_for_${functionName}`,
    logGroupName: `offline_logGroupName_for_${functionName}`,
    logStreamName: `offline_logStreamName_for_${functionName}`,
    memoryLimitInMB: "1024",
  };
  return context as any;
}

function generateRequestContext_connect(params: {
  connectionId: string;
  connectedAt: Date;
}) {
  const common = generateRequestContext_common({
    ...params,
    routeKey: "$connect",
    eventType: "CONNECT",
  });
  return {
    ...common,
  };
}

function generateRequestContext_disconnect(params: {
  connectionId: string;
  connectedAt: Date;
  /** @example 1005 */
  disconnectStatusCode: number;
  /** @example "Client-side close frame status not set" */
  disconnectReason: string;
}) {
  const common = generateRequestContext_common({
    ...params,
    routeKey: "$disconnect",
    eventType: "DISCONNECT",
  });
  return {
    ...common,
    disconnectStatusCode: params.disconnectStatusCode,
    disconnectReason: params.disconnectReason,
  };
}

function generateRequestContext_message(params: {
  connectionId: string;
  connectedAt: Date;
}) {
  const common = generateRequestContext_common({
    ...params,
    routeKey: "$default",
    eventType: "MESSAGE",
  });
  return {
    ...common,
    messageId: "IMcbMeVitjMCJZA=",
  };
}

// https://github.com/dherault/serverless-offline/blob/master/src/events/websocket/lambda-events/WebSocketRequestContext.js#L7
// 상황에 따라 메세지 규격이 조금씩 달라진다
function generateRequestContext_common(params: {
  eventType: APIGatewayEventWebsocketRequestContextV2["eventType"];
  routeKey: string;
  connectionId: string;
  connectedAt: Date;
}) {
  const timeEpoch = new Date();

  const identity: Pick<APIGatewayEventIdentity, "sourceIp"> = {
    sourceIp: "127.0.0.1",
  };

  const requestContext: Partial<APIGatewayEventRequestContext> = {
    routeKey: params.routeKey,
    messageId: helpers.createUniqueId(),
    eventType: params.eventType,

    // extendedRequestId 하고 requestId는 웬만해서는 같을듯?
    // correlation id 때문에 분리된듯
    extendedRequestId: helpers.createUniqueId(),

    // clf 규격까진 필요없을거같아서 야매로 때움. formatToClfTime(timeEpoch)
    // requestTime: "12/Aug/2023:13:49:11 +0000",
    requestTime: timeEpoch.toISOString(),
    requestTimeEpoch: timeEpoch.getTime(),

    messageDirection: "IN" as const,
    stage: "local",
    connectedAt: params.connectedAt.getTime(),
    requestId: helpers.createUniqueId(),
    domainName: "localhost",
    connectionId: params.connectionId,
    apiId: "private",
  };

  return {
    ...requestContext,
    identity,
  };
}

// https://github.com/dherault/serverless-offline/blob/eb12f341de2e44ee2f8652abb8ea3b1d12e8d3da/src/events/websocket/lambda-events/WebSocketConnectEvent.js
// 헤더 남길거 참고용
function generateEvent_connect(params: {
  connectionId: string;
  connectedAt: Date;
  searchParams: URLSearchParams;
  port: number;
}) {
  const { searchParams } = params;

  const queryStringParameters: { [key: string]: string } = {};
  for (const key of searchParams.keys()) {
    const value_single = searchParams.get(key);
    if (typeof value_single === "string") {
      queryStringParameters[key] = value_single;
    }
  }

  const multiValueQueryStringParameters: { [key: string]: string[] } = {};
  for (const key of searchParams.keys()) {
    multiValueQueryStringParameters[key] = searchParams.getAll(key);
  }

  const headers = {
    Host: "localhost",
    "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits",
    "Sec-WebSocket-Key": helpers.createUniqueId(),
    "Sec-WebSocket-Version": "13",
    "X-Amzn-Trace-Id": `Root=${helpers.createUniqueId()}`,
    "X-Forwarded-For": "127.0.0.1",
    "X-Forwarded-Port": `${params.port}`,
    "X-Forwarded-Proto": "http",
  };
  const multiValueHeaders = transform_multiValueHeaders(headers);

  return {
    headers,
    multiValueHeaders,
    queryStringParameters,
    multiValueQueryStringParameters,
    requestContext: generateRequestContext_connect({ ...params }),
    isBase64Encoded: false,
  };
}

// https://github.com/dherault/serverless-offline/blob/master/src/events/websocket/lambda-events/WebSocketDisconnectEvent.js
// 어떤 헤더 남길지 참고용
function generateEvent_disconnect(params: {
  connectionId: string;
  connectedAt: Date;
  statusCode: number;
  reason: string;
}) {
  const headers = {
    Host: "localhost",
    "x-api-key": "",
    "X-Forwarded-For": "",
    "x-restapi": "",
  };
  const multiValueHeaders = transform_multiValueHeaders(headers);

  return {
    headers,
    multiValueHeaders,
    requestContext: generateRequestContext_disconnect({
      connectedAt: params.connectedAt,
      connectionId: params.connectionId,
      disconnectStatusCode: params.statusCode,
      disconnectReason: params.reason,
    }),
    isBase64Encoded: false,
  };
}

function generateEvent_message(params: {
  connectionId: string;
  connectedAt: Date;
  message: Buffer | string;
}) {
  let body: string;
  let isBase64Encoded: boolean;
  if (typeof params.message === "string") {
    body = params.message;
    isBase64Encoded = false;
  } else {
    body = params.message.toString("utf-8");
    isBase64Encoded = false;
  }

  return {
    requestContext: generateRequestContext_message(params),
    body,
    isBase64Encoded,
  };
}

function transform_multiValueHeaders(input: { [key: string]: string }) {
  const entries = Object.entries(input).map((entry) => {
    const [key, value] = entry;
    return [key, [value]] as const;
  });
  return Object.fromEntries(entries);
}
