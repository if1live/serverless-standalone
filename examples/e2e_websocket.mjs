import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  DeleteConnectionCommand,
  GetConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

/**
 * usage
 *
 * 1. wscat -c "ws://127.0.0.1:9001/path?username=me&password=pw"
 * 2. get connection id
 * 3. node e2e_websocket.mjs <connection_id>
 */

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
