import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

// elasticmq
const endpoint = "http://127.0.0.1:9324";

const client = new SQSClient({
  region: "ap-northeast-1",
  endpoint,
  credentials: {
    accessKeyId: "localAccessKeyId",
    secretAccessKey: "localAecretAccessKey",
  },
});

/**
 * @param {string} queueName
 * @returns
 */
function createQueueUrl(queueName) {
  return `${endpoint}/queue/${queueName}`;
}

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
