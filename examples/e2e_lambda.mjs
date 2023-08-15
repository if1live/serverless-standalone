import {
  LambdaClient,
  InvocationType,
  InvokeCommand,
} from "@aws-sdk/client-lambda";

const client = new LambdaClient({
  region: "ap-northeast-1",
  endpoint: "http://127.0.0.1:9002/",
  credentials: {
    accessKeyId: "localAccessKeyId",
    secretAccessKey: "localAecretAccessKey",
  },
});

{
  const input = { a: 1, b: 2 };
  const invocationType = InvocationType.RequestResponse;

  const output = await client.send(
    new InvokeCommand({
      FunctionName: "lambda_simple",
      Payload: new TextEncoder().encode(JSON.stringify(input)),
      InvocationType: invocationType,
    }),
  );

  const statusCode = output.StatusCode;
  const payloadText = output.Payload
    ? new TextDecoder().decode(output.Payload)
    : undefined;

  console.log("invoke", {
    statusCode,
    payload: JSON.parse(payloadText),
  });
}
