import {
  APIGatewayProxyHandler,
  APIGatewayProxyWebsocketHandlerV2,
} from "aws-lambda";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { StandAlone, FunctionDefinition } from "./index.js";

const websocket_connect: APIGatewayProxyHandler = async (event, context) => {
  const connectionId = event.requestContext.connectionId!;
  console.log("connect", {
    connectionId,
    queryStringParameters: event.queryStringParameters,
    multiValueQueryStringParameters: event.multiValueQueryStringParameters,
  });
  return { statusCode: 200, body: "OK" };
};

const websocket_disconnect: APIGatewayProxyHandler = async (event, context) => {
  const connectionId = event.requestContext.connectionId!;
  console.log("disconnect", { connectionId });
  return { statusCode: 200, body: "OK" };
};

const websocket_message: APIGatewayProxyWebsocketHandlerV2 = async (
  event,
  context,
) => {
  const connectionId = event.requestContext.connectionId!;
  console.log("message", {
    connectionId,
    body: event.body,
    isBase64Encoded: event.isBase64Encoded,
  });

  // echo
  const client = new ApiGatewayManagementApiClient({
    region: "ap-northeast-1",
    endpoint: "http://127.0.0.1:9002/apigatewaymanagementapi/",
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

const definitions: FunctionDefinition[] = [
  {
    handler: websocket_connect,
    events: [{ websocket: { route: "$connect" } }],
  },
  {
    handler: websocket_disconnect,
    events: [{ websocket: { route: "$disconnect" } }],
  },
  {
    handler: websocket_message,
    events: [{ websocket: { route: "$default" } }],
  },
];

await StandAlone.start(definitions, {
  http: 9000,
  websocket: 9001,
  api: 9002,
});
