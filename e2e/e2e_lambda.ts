import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";
import {
  LambdaClient,
  InvocationType,
  InvokeCommand,
  InvokeCommandOutput,
  ListEventSourceMappingsCommand,
  ListFunctionsCommand,
  ListFunctionUrlConfigsCommand,
} from "@aws-sdk/client-lambda";
import { Context } from "aws-lambda";
import { FunctionDefinition, standalone } from "../src/index.js";

const client = new LambdaClient({
  region: "ap-northeast-1",
  endpoint: "http://127.0.0.1:9002/",
  credentials: {
    accessKeyId: "localAccessKeyId",
    secretAccessKey: "localAecretAccessKey",
  },
});

// e2e 테스트 안에서 서버까지 돌릴때만 쓸수 있다
const invokedSet = new Set<string>();

// 테스트 편의상 echo로 구현
const lambda_simple = async (
  event: Record<string, string>,
  context: Context,
) => {
  const label = event.label ?? "";
  invokedSet.add(label);
  return event;
};

const lambda_exception = async (
  event: Record<string, string>,
  context: Context,
) => {
  const label = event.label ?? "";
  invokedSet.add(label);
  throw new Error("simple");
};

export const definitions: FunctionDefinition[] = [
  {
    name: "lambda_simple",
    handler: lambda_simple,
    events: [],
  },
  {
    name: "lambda_exception",
    handler: lambda_exception,
    events: [],
  },
  {
    name: "lambda_event",
    handler: lambda_simple,
    events: [
      {
        sqs: {
          queueName: "hello-queue",
          batchSize: 2,
        },
      },
      {
        sqs: {
          queueName: "world-queue",
          batchSize: 3,
        },
      },
      {
        httpApi: {
          route: "POST /foo",
        },
      },
    ],
  },
];

const inst = standalone({
  functions: definitions,
  lambda: { port: 9002 },
});

describe("lambda", () => {
  before(async () => inst.start());
  after(async () => inst.stop());

  const functionName_echo = "lambda_simple";
  const functionName_exception = "lambda_exception";
  const functionName_event = "lambda_event";

  function extractPayload(output: InvokeCommandOutput) {
    const payloadText = output.Payload
      ? new TextDecoder().decode(output.Payload)
      : undefined;
    const payload = payloadText ? JSON.parse(payloadText) : payloadText;
    return payload;
  }

  beforeEach(() => invokedSet.clear());

  describe("invoke: request-response", () => {
    const label = "request-response";
    const input = { label };
    const invocationType = InvocationType.RequestResponse;

    it("ok", async () => {
      const output = await client.send(
        new InvokeCommand({
          FunctionName: functionName_echo,
          Payload: new TextEncoder().encode(JSON.stringify(input)),
          InvocationType: invocationType,
        }),
      );
      const payload = extractPayload(output);

      assert.equal(output.StatusCode, 200);
      assert.deepEqual(payload, input);
      // assert.equal(invokedSet.has(label), true);
    });

    it("exception", async () => {
      await assert.rejects(async () => {
        const output = await client.send(
          new InvokeCommand({
            FunctionName: functionName_exception,
            Payload: new TextEncoder().encode(JSON.stringify(input)),
            InvocationType: invocationType,
          }),
        );
      });
    });
  });

  describe("invoke: event", () => {
    const label = "event";
    const input = { label };
    const invocationType = InvocationType.Event;

    it("ok", async () => {
      const output = await client.send(
        new InvokeCommand({
          FunctionName: functionName_echo,
          Payload: new TextEncoder().encode(JSON.stringify(input)),
          InvocationType: invocationType,
        }),
      );
      const payload = extractPayload(output);

      assert.equal(output.StatusCode, 200);
      assert.deepEqual(payload, {});
      // assert.equal(invokedSet.has(label), true);
    });

    it("exception", async () => {
      const output = await client.send(
        new InvokeCommand({
          FunctionName: functionName_exception,
          Payload: new TextEncoder().encode(JSON.stringify(input)),
          InvocationType: invocationType,
        }),
      );

      const payload = extractPayload(output);

      assert.equal(output.StatusCode, 200);
      assert.deepEqual(payload, {});
    });
  });

  describe("listFunctions", () => {
    it("ok", async () => {
      const output = await client.send(new ListFunctionsCommand({}));

      const list = output.Functions ?? [];
      assert.equal(list.length, definitions.length);

      const [first, _rest] = list;

      assert.ok(first);
      assert.equal(first.FunctionName, functionName_echo);
      assert.equal(
        first.FunctionArn,
        "arn:aws:lambda:ap-northeast-1:123456789012:function:lambda_simple",
      );
    });
  });

  describe("listFunctionUrlConfigs", () => {
    it("function exists + with httpApi", async () => {
      const output = await client.send(
        new ListFunctionUrlConfigsCommand({
          FunctionName: functionName_event,
        }),
      );
      const list = output.FunctionUrlConfigs ?? [];
      assert.equal(list.length, 1);

      const [first, _rest] = list;
      assert.ok(first);

      console.log(first);

      assert.equal(
        first.FunctionArn,
        "arn:aws:lambda:ap-northeast-1:123456789012:function:lambda_event",
      );
      assert.ok(typeof first.FunctionUrl == "string");
    });

    it("function exists + no httpApi", async () => {
      const output = await client.send(
        new ListFunctionUrlConfigsCommand({
          FunctionName: functionName_echo,
        }),
      );
      const list = output.FunctionUrlConfigs ?? [];
      assert.equal(list.length, 0);
    });
  });

  describe("listEventSourceMappings", () => {
    it("function exists + with sqs", async () => {
      const output = await client.send(
        new ListEventSourceMappingsCommand({
          FunctionName: functionName_event,
        }),
      );
      const list = output.EventSourceMappings ?? [];
      assert.equal(list.length, 2);

      const [first, _rest] = list;
      assert.ok(first);

      assert.equal(first.BatchSize, 2);
      assert.equal(
        first.EventSourceArn,
        "arn:aws:sqs:ap-northeast-1:123456789012:hello-queue",
      );
      assert.equal(
        first.FunctionArn,
        "arn:aws:lambda:ap-northeast-1:123456789012:function:lambda_event",
      );
      assert.equal(first.State, "Enabled");
    });

    it("function exists + no sqs", async () => {
      const output = await client.send(
        new ListEventSourceMappingsCommand({
          FunctionName: functionName_echo,
        }),
      );
      const list = output.EventSourceMappings ?? [];
      assert.equal(list.length, 0);
    });

    it("no exists", async () => {
      try {
        const output = await client.send(
          new ListEventSourceMappingsCommand({
            FunctionName: "unknown",
          }),
        );
        assert.fail("should not reach");
      } catch (e) {
        assert.ok(true);
      }
    });
  });
});
