import url from "node:url";
import {
  LambdaClient,
  InvocationType,
  InvokeCommand,
} from "@aws-sdk/client-lambda";
import { Context } from "aws-lambda";
import type { FunctionDefinition } from "../src/index.js";

const lambda_simple = async (event: unknown, context: Context) => {
  console.log("lambda_simple", event);
  return { now: Date.now() };
};

export const definitions: FunctionDefinition[] = [
  {
    name: "lambda_simple",
    handler: lambda_simple,
    events: [],
  },
];

async function main() {
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
    const payload = payloadText ? JSON.parse(payloadText) : payloadText;

    console.log("invoke", {
      statusCode,
      payload,
    });
  }
}

// https://2ality.com/2022/07/nodejs-esm-main.html
if (import.meta.url.startsWith("file:")) {
  const modulePath = url.fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath) {
    await main();
  }
}
