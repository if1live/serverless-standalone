import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  DeleteConnectionCommand,
  GetConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

const client = new ApiGatewayManagementApiClient({
  // region이 없으면 작동하지 않는다
  region: "ap-northeast-1",
  endpoint: "http://127.0.0.1:9002/apigatewaymanagementapi/",
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
