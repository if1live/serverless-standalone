import assert from "node:assert";
import { describe, it, before, after } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { SQSHandler } from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { standalone, type FunctionDefinition } from "../src/index.js";

// elasticmq
export const endpoint = "http://127.0.0.1:9324";

const client = new SQSClient({
  region: "ap-northeast-1",
  endpoint,
  credentials: {
    accessKeyId: "localAccessKeyId",
    secretAccessKey: "localAecretAccessKey",
  },
});

function createQueueUrl(queueName: string) {
  return `${endpoint}/queue/${queueName}`;
}

let invoked = false;
const sqs_simple: SQSHandler = async (event, context) => {
  invoked = true;
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

const inst = standalone({
  functions: definitions,
  sqs: { url: endpoint },
});

describe("sqs", () => {
  before(async () => inst.start());
  after(async () => inst.stop());

  const queueUrl = createQueueUrl("hello-queue");

  it("message 1: not invoked", async () => {
    const input = { a: 1 };
    const output = await client.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(input),
        QueueUrl: queueUrl,
      }),
    );
    assert.equal(invoked, false);
  });

  it("message 2: batchSize", async () => {
    const input = { a: 2 };
    const output = await client.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(input),
        QueueUrl: queueUrl,
      }),
    );
    await delay(100);
    assert.equal(invoked, true);
  });
});
