import assert from "node:assert";
import { describe, it, before, after, beforeEach } from "node:test";
import {
  LambdaClient,
  InvocationType,
  InvokeCommand,
  InvokeCommandOutput,
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

  function extractPayload(output: InvokeCommandOutput) {
    const payloadText = output.Payload
      ? new TextDecoder().decode(output.Payload)
      : undefined;
    const payload = payloadText ? JSON.parse(payloadText) : payloadText;
    return payload;
  }

  beforeEach(() => invokedSet.clear());

  describe("request-response", () => {
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

  describe("event", () => {
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
});
