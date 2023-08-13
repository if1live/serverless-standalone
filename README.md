# serverless-standalone

Emulate AWS λ and aws-sdk locally when developing your Serverless node.js project

## features

* AWS WebSocket API + @aws-sdk/client-apigatewaymanagementapi

## demo

* server: `pnpm dev`, see `src/dev.ts`
* client: `wscat -c "ws://127.0.0.1:9001/path?foo=1&foo=2"`
* aws-sdk example: `node ./examples/index.mjs {connectionId}`

## usage

define serverless function. similar with serverless.yml.

```ts
const websocket_connect: APIGatewayProxyHandler = async (event, context) => {
  ...
}
const websocket_disconnect: APIGatewayProxyHandler = async (event, context) => {
  ...
}
const websocket_message: APIGatewayProxyWebsocketHandlerV2 = async (
  ...
}

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
```

start serverless-standalone at localhost.

```ts
await StandAlone.start(definitions, {
  http: 9000,
  websocket: 9001,
  api: 9002,
});
```

connect websocket. aws lambda handler are invoked.
`wscat -c "ws://127.0.0.1:9001/path?username=me&password=pw"`

use aws-sdk locally.

```ts
const client = new ApiGatewayManagementApiClient({
  region: "ap-northeast-1",
  endpoint: "http://127.0.0.1:9002/apigatewaymanagementapi/",
  credentials: {
    accessKeyId: "localAccessKeyId",
    secretAccessKey: "localAecretAccessKey",
  },
});

const output = await client.send(
  new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: new TextEncoder().encode("hello"),
  }),
);
```
