import url from "node:url";
import assert from "node:assert";
import { describe, it, before, after } from "node:test";
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

export const definitions: FunctionDefinition[] = [
  {
    name: "lambda_simple",
    handler: lambda_simple,
    events: [],
  },
];

async function main() {
  const inst = standalone({
    functions: definitions,
    ports: {
      http: 9000,
      websocket: 9001,
      lambda: 9002,
    },
    urls: {},
  });

  describe("lambda", () => {
    before(async () => inst.start());
    after(async () => inst.stop());

    const functionName = "lambda_simple";

    function extractPayload(output: InvokeCommandOutput) {
      const payloadText = output.Payload
        ? new TextDecoder().decode(output.Payload)
        : undefined;
      const payload = payloadText ? JSON.parse(payloadText) : payloadText;
      return payload;
    }

    it("request-response", async () => {
      const label = "request-response";
      const input = { label };

      const output = await client.send(
        new InvokeCommand({
          FunctionName: functionName,
          Payload: new TextEncoder().encode(JSON.stringify(input)),
          InvocationType: InvocationType.RequestResponse,
        }),
      );
      const payload = extractPayload(output);

      assert.equal(output.StatusCode, 200);
      assert.deepEqual(payload, input);
      // assert.equal(invokedSet.has(label), true);
    });

    it("event", async () => {
      const label = "event";
      const input = { label };

      const output = await client.send(
        new InvokeCommand({
          FunctionName: functionName,
          Payload: new TextEncoder().encode(JSON.stringify(input)),
          InvocationType: InvocationType.Event,
        }),
      );
      const payload = extractPayload(output);

      assert.equal(output.StatusCode, 200);
      assert.deepEqual(payload, {});
      // assert.equal(invokedSet.has(label), true);
    });
  });
}

// https://2ality.com/2022/07/nodejs-esm-main.html
if (import.meta.url.startsWith("file:")) {
  const modulePath = url.fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath) {
    await main();
  }
}
