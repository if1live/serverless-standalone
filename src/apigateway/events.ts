import * as helpers from "../helpers.js";
import {
  APIGatewayEventIdentity,
  APIGatewayEventRequestContext,
  APIGatewayEventWebsocketRequestContextV2,
} from "aws-lambda";

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
export function connect(params: {
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

  const port = params.port;
  const hostname = "127.0.0.1";

  const headers = {
    Host: `${hostname}:${port}`,
    "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits",
    "Sec-WebSocket-Key": helpers.createUniqueId(),
    "Sec-WebSocket-Version": "13",
    "X-Amzn-Trace-Id": `Root=${helpers.createUniqueId()}`,
    "X-Forwarded-For": hostname,
    "X-Forwarded-Port": `${port}`,
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
function disconnect(params: {
  connectionId: string;
  connectedAt: Date;
  port: number;
  statusCode: number;
  reason: string;
}) {
  const port = params.port;
  const hostname = "127.0.0.1";

  const headers = {
    Host: `${hostname}:${port}`,
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

function message(params: {
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

export function transform_multiValueHeaders(input: { [key: string]: string }) {
  const entries = Object.entries(input).map((entry) => {
    const [key, value] = entry;
    return [key, [value]] as const;
  });
  return Object.fromEntries(entries);
}

export const WebSocketEventFactory = {
  connect,
  disconnect,
  message,
};
