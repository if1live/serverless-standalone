import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import { WebSocket } from "ws";
import { setTimeout as delay } from "node:timers/promises";
import {
  APIGatewayProxyHandler,
  APIGatewayProxyWebsocketHandlerV2,
} from "aws-lambda";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  DeleteConnectionCommand,
  GetConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { standalone, type FunctionDefinition } from "../src/index.js";

const client = new ApiGatewayManagementApiClient({
  region: "ap-northeast-1",
  endpoint: "http://127.0.0.1:9001/",
  credentials: {
    accessKeyId: "localAccessKeyId",
    secretAccessKey: "localAecretAccessKey",
  },
});

let g_connectionId: string | null = null;

const websocket_connect: APIGatewayProxyHandler = async (event, context) => {
  const connectionId = event.requestContext.connectionId!;
  console.log("connect", {
    connectionId,
    queryStringParameters: event.queryStringParameters,
    multiValueQueryStringParameters: event.multiValueQueryStringParameters,
  });

  g_connectionId = connectionId;
  return { statusCode: 200, body: "OK" };
};

const websocket_disconnect: APIGatewayProxyHandler = async (event, context) => {
  const connectionId = event.requestContext.connectionId;
  console.log("disconnect", { connectionId });

  g_connectionId = null;
  return { statusCode: 200, body: "OK" };
};

const websocket_message: APIGatewayProxyWebsocketHandlerV2 = async (
  event,
  context,
) => {
  const connectionId = event.requestContext.connectionId;
  console.log("message", {
    connectionId,
    body: event.body,
    isBase64Encoded: event.isBase64Encoded,
  });

  // echo
  await client.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: new TextEncoder().encode(event.body),
    }),
  );

  return { statusCode: 200, body: "OK" };
};

export const definitions: FunctionDefinition[] = [
  {
    name: "websocket_connect",
    handler: websocket_connect,
    events: [{ websocket: { route: "$connect" } }],
  },
  {
    name: "websocket_disconnect",
    handler: websocket_disconnect,
    events: [{ websocket: { route: "$disconnect" } }],
  },
  {
    name: "websocket_message",
    handler: websocket_message,
    events: [{ websocket: { route: "$default" } }],
  },
];

const inst = standalone({
  functions: definitions,
  websocket: { port: 9001 },
});

describe("websocket", () => {
  before(async () => inst.start());
  after(async () => inst.stop());

  let ws: WebSocket;
  it("open", async () => {
    ws = new WebSocket("ws://127.0.0.1:9001");

    ws.onopen = (evt) => console.log("open");

    ws.onclose = (evt) =>
      console.log("close", {
        code: evt.code,
        reason: evt.reason,
        wasClean: evt.wasClean,
      });

    ws.onerror = (evt) =>
      console.log("error", {
        message: evt.message,
        error: evt.error,
      });

    ws.onmessage = (evt) => {
      if (Buffer.isBuffer(evt.data)) {
        const text = evt.data.toString("utf-8");
        console.log("message", text);
      } else {
        console.log("message", evt.data);
      }
    };

    // 커넥션 붙을떄까지 대기
    for (let i = 0; i < 10; i++) {
      if (g_connectionId) {
        break;
      }
      await delay(100);
    }
  });

  it("PostToConnection: string", async () => {
    const output = await client.send(
      new PostToConnectionCommand({
        ConnectionId: g_connectionId!,
        Data: new TextEncoder().encode("hello"),
      }),
    );
  });

  it("PostToConnection: binary", async () => {
    const data = new Uint8Array(2);
    data[0] = 0x12;
    data[1] = 0x34;

    const output = await client.send(
      new PostToConnectionCommand({
        ConnectionId: g_connectionId!,
        Data: data,
      }),
    );
  });

  it("GetConnection", async () => {
    const output = await client.send(
      new GetConnectionCommand({
        ConnectionId: g_connectionId!,
      }),
    );
    assert.equal(output.ConnectedAt instanceof Date, true);
    assert.equal(output.LastActiveAt instanceof Date, true);
  });

  it("DeleteConnection", async () => {
    const output = await client.send(
      new DeleteConnectionCommand({
        ConnectionId: g_connectionId!,
      }),
    );
  });
});
