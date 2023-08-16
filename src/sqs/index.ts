import {
  SQSEvent,
  SQSHandler,
  SQSMessageAttribute,
  SQSMessageAttributes,
  SQSRecord,
  SQSRecordAttributes,
} from "aws-lambda";
import { setTimeout as delay } from "node:timers/promises";
import * as R from "remeda";
import {
  SQSClient,
  CreateQueueCommand,
  ReceiveMessageCommand,
  Message,
  DeleteMessageBatchCommand,
  DeleteMessageBatchRequestEntry,
} from "@aws-sdk/client-sqs";
import {
  FunctionDefinition,
  FunctionEvent_SQS,
  ServiceRunner,
  castFunctionDefinition,
} from "../types.js";
import * as helpers from "../helpers.js";

interface Element {
  name: string;
  handler: SQSHandler;
  queueUrl: string;
  event: FunctionEvent_SQS;
}

let running = true;

// serverless-offline-sqs 참고
// https://github.com/CoorpAcademy/serverless-plugins/blob/master/packages/serverless-offline-sqs/src/sqs.js
export const create = (
  url: string,
  definitions: FunctionDefinition[],
): ServiceRunner => {
  const client = new SQSClient({
    region: "ap-northeast-1",
    endpoint: url,
    credentials: {
      accessKeyId: "localAccessKeyId",
      secretAccessKey: "localAecretAccessKey",
    },
  });

  // sqs와 handler는 1:1 관계로 가정
  // queue에 lambda 여러개 붙이면 어떤 람다가 호출될지 모르니까 일반적인 시나리오가 아님
  const functions = definitions
    .map((x) => {
      const definition = castFunctionDefinition<SQSHandler>(x);
      const events = definition.events
        .map((x) => x.sqs)
        .filter((sqs) => sqs?.enabled ?? true)
        .filter(R.isNot(R.isNil));

      const first = events[0];
      if (!first) {
        return null;
      }

      return {
        name: definition.name,
        handler: definition.handler,
        event: first,
      };
    })
    .filter(R.isNonNull);

  const start = async () => {
    // queue 만들기. queue 생성하면 queue url 얻을수 있다
    // 빠른 기동을 위해 얻은 queue url을 재사용
    // elasticmq: http://localhost:9324/000000000000/hello-queue
    const commands_create = functions.map((x) => {
      return new CreateQueueCommand({
        QueueName: x.event.queueName,
      });
    });
    const outputs_create = await Promise.all(
      commands_create.map(async (c) => client.send(c)),
    );
    const queueUrls = outputs_create.map((x) => x.QueueUrl ?? "");
    const elements = R.zip(functions, queueUrls).map((x): Element => {
      const [definition, queueUrl] = x;
      return { ...definition, queueUrl };
    });

    await Promise.all(
      elements.map(async (element) => startLoop(client, element)),
    );
  };

  const stop = () => {
    running = false;
  };

  return {
    start,
    stop,
  };
};

const startLoop = async (client: SQSClient, definition: Element) => {
  const { queueUrl } = definition;

  const getMessages = async (
    size: number,
    messages: Message[],
  ): Promise<Message[]> => {
    if (size <= 0) {
      return messages;
    }

    const output = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: size > 10 ? 10 : size,
        AttributeNames: ["All"],
        MessageAttributeNames: ["All"],
        WaitTimeSeconds: 5,
      }),
    );

    const receivedMessages = output.Messages;
    if (!receivedMessages || receivedMessages.length === 0) {
      return messages;
    }

    return await getMessages(size - receivedMessages.length, [
      ...messages,
      ...receivedMessages,
    ]);
  };

  const deleteMessages = async (messages: Message[]) => {
    const chunks = R.chunk(messages, 10);
    const commands = chunks.map((chunk) => {
      const entries = chunk.map((m): DeleteMessageBatchRequestEntry => {
        return {
          Id: m.MessageId,
          ReceiptHandle: m.ReceiptHandle,
        };
      });
      return new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: entries,
      });
    });
    await Promise.all(commands.map(async (c) => client.send(c)));
  };

  const { handler: f } = definition;
  const batchSize = definition.event.batchSize ?? 10;

  while (running) {
    const messages = await getMessages(batchSize, []);
    if (messages.length > 0) {
      try {
        const event = createEvent(definition.event, messages);
        const awsRequestId = helpers.createUniqueId();
        const context = helpers.generateLambdaContext(
          definition.name,
          awsRequestId,
        );
        await f(event, context, helpers.emptyCallback);
        await deleteMessages(messages);
      } catch (e) {
        console.error(e);
      }
    } else {
      await delay(10);
    }
  }
};

function createEvent(
  definition: FunctionEvent_SQS,
  messages: Message[],
): SQSEvent {
  const region = "ap-northeast-1";
  const account = "123456789012";
  const defaultArn = `arn:aws:sqs:${region}:${account}:${definition.queueName}`;
  const arn = definition.arn ?? defaultArn;

  const records = messages.map((m): SQSRecord => {
    const attributes = convert_attributes(m.Attributes);
    const messageAttributes = convert_messageAttributes(m.MessageAttributes);

    return {
      messageId: m.MessageId ?? "",
      receiptHandle: m.ReceiptHandle ?? "",
      body: m.Body ?? "",
      md5OfBody: m.MD5OfBody ?? "",
      attributes,
      messageAttributes,
      eventSource: "aws:sqs",
      eventSourceARN: arn,
      awsRegion: region,
    };
  });

  return {
    Records: records,
  };
}

function convert_messageAttributes(
  messageAttributes: Message["MessageAttributes"],
): SQSMessageAttributes {
  const input = messageAttributes ?? {};
  const entries = Object.entries(input).map(([key, naive]) => {
    const value: SQSMessageAttribute = {
      stringValue: `${naive}`,
      dataType: "String",
    };
    return [key, value] as const;
  });
  return Object.fromEntries(entries);
}

function convert_attributes(
  attributes: Message["Attributes"],
): SQSRecordAttributes {
  const input = attributes ?? {};
  const keys: Array<keyof SQSRecordAttributes> = [
    "AWSTraceHeader",
    "ApproximateReceiveCount",
    "SentTimestamp",
    "SenderId",
    "ApproximateFirstReceiveTimestamp",
    "SequenceNumber",
    "MessageGroupId",
    "MessageDeduplicationId",
    "DeadLetterQueueSourceArn",
  ];
  const entries = keys.map((key) => {
    const value = input[key];
    return [key, value] as const;
  });
  return Object.fromEntries(entries) as any;
}
