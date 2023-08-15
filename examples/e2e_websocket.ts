import url from "node:url";
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
import type { FunctionDefinition } from "../src/index.js";

/**
 * usage
 *
 * 1. wscat -c "ws://127.0.0.1:9001/path?username=me&password=pw"
 * 2. get connection id
 * 3. node e2e_websocket.mjs <connection_id>
 */

const websocket_connect: APIGatewayProxyHandler = async (event, context) => {
  const connectionId = event.requestContext.connectionId;
  console.log("connect", {
    connectionId,
    queryStringParameters: event.queryStringParameters,
    multiValueQueryStringParameters: event.multiValueQueryStringParameters,
  });
  return { statusCode: 200, body: "OK" };
};

const websocket_disconnect: APIGatewayProxyHandler = async (event, context) => {
  const connectionId = event.requestContext.connectionId;
  console.log("disconnect", { connectionId });
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
  const client = new ApiGatewayManagementApiClient({
    region: "ap-northeast-1",
    endpoint: "http://127.0.0.1:9002/",
    credentials: {
      accessKeyId: "localAccessKeyId",
      secretAccessKey: "localAecretAccessKey",
    },
  });
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

async function main() {
  const client = new ApiGatewayManagementApiClient({
    region: "ap-northeast-1",
    endpoint: "http://127.0.0.1:9002/",
    credentials: {
      accessKeyId: "localAccessKeyId",
      secretAccessKey: "localAecretAccessKey",
    },
  });

  const connectionId = process.argv[process.argv.length - 1];
  console.log("connectionId", connectionId);

  {
    // text message
    const output = await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: new TextEncoder().encode("hello"),
      }),
    );
    console.log("PostToConnection: string", output);
  }

  {
    // binary message
    const data = new Uint8Array(2);
    data[0] = 0x12;
    data[1] = 0x34;

    const output = await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: data,
      }),
    );
    console.log("PostToConnection: string", output);
  }

  {
    const output = await client.send(
      new GetConnectionCommand({
        ConnectionId: connectionId,
      }),
    );
    console.log("GetConnection", output);
  }

  {
    const output = await client.send(
      new DeleteConnectionCommand({
        ConnectionId: connectionId,
      }),
    );
    console.log("DeleteConnection", output);
  }
}

// https://2ality.com/2022/07/nodejs-esm-main.html
if (import.meta.url.startsWith("file:")) {
  const modulePath = url.fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath) {
    await main();
  }
}
