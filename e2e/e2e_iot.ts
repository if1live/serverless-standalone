import mqtt from "mqtt";
import { before, after, describe, it } from "node:test";
import assert from "node:assert";
import { setTimeout as delay } from "node:timers/promises";
import { IoTHandler } from "aws-lambda";
import { standalone, type FunctionDefinition } from "../src/index.js";

export const endpoint = "mqtt://artemis:artemis@127.0.0.1:1883";

let invoked = false;
const iot_simple: IoTHandler = async (event, context) => {
  invoked = true;
  console.log("iot_simple", event);
};

export const definitions: FunctionDefinition[] = [
  {
    name: "iot_simple",
    handler: iot_simple,
    events: [
      {
        iot: {
          sql: "SELECT * FROM 'pub/foo'",
        },
      },
    ],
  },
];

const inst = standalone({
  functions: definitions,
  iot: { mqtt: endpoint },
});

describe("iot", () => {
  let g_client: mqtt.MqttClient | null;

  before(async () => inst.start());

  after(async () => {
    await inst.stop();
    await g_client?.endAsync(true);
  });

  it("scenario", async () => {
    const client = mqtt.connect(endpoint);
    g_client = client;

    const p = await new Promise((resolve) => {
      client.on("connect", async () => {
        const topic_foo = "pub/foo";
        const payload = JSON.stringify({ tag: "foo" });

        await client.publishAsync(topic_foo, payload);
        resolve(undefined);
      });
    });

    await delay(100);

    assert.equal(invoked, true);
  });
});
