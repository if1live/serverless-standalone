import url from "node:url";
import { SQSHandler } from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { FunctionDefinition } from "../src/index.js";

const sqs_simple: SQSHandler = async (event, context) => {
  console.log("sqs_simple", JSON.stringify(event.Records, null, 2));
};

export const definitions: FunctionDefinition[] = [
  {
    name: "sqs_simple",
    handler: sqs_simple,
    events: [
      {
        sqs: {
          queueName: "hello-queue",
          batchSize: 2,
        },
      },
    ],
  },
];

// elasticmq
export const endpoint = "http://127.0.0.1:9324";

function createQueueUrl(queueName: string) {
  return `${endpoint}/queue/${queueName}`;
}

async function main() {
  const client = new SQSClient({
    region: "ap-northeast-1",
    endpoint,
    credentials: {
      accessKeyId: "localAccessKeyId",
      secretAccessKey: "localAecretAccessKey",
    },
  });

  {
    const input = { a: 1 };
    const queueUrl = createQueueUrl("hello-queue");

    const output = await client.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(input),
        QueueUrl: queueUrl,
      }),
    );
    console.log("SendMessage", output);
  }
}

// https://2ality.com/2022/07/nodejs-esm-main.html
if (import.meta.url.startsWith("file:")) {
  const modulePath = url.fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath) {
    await main();
  }
}
