import mqtt from "mqtt";
import url from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { IoTHandler } from "aws-lambda";
import type { FunctionDefinition } from "../src/index.js";

const iot_simple: IoTHandler = async (event, context) => {
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

export const endpoint = "mqtt://artemis:artemis@127.0.0.1:1883";

async function main() {
  const client = mqtt.connect(endpoint);

  client.on("connect", async () => {
    console.log("connect");

    const topic_foo = "pub/foo";
    const topic_drop = "pub/drop";

    const loop = 1;
    for (let i = 1; i <= loop; i++) {
      await client.publishAsync(topic_foo, JSON.stringify({ tag: "foo", i }));
      await client.publishAsync(topic_drop, JSON.stringify({ tag: "drop", i }));
      console.log("publish", i);

      if (i !== loop) {
        await delay(1_000);
      }
    }

    process.exit(0);
  });
}

// https://2ality.com/2022/07/nodejs-esm-main.html
if (import.meta.url.startsWith("file:")) {
  const modulePath = url.fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath) {
    await main();
  }
}
