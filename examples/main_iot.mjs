import mqtt from "mqtt";
import { setTimeout as delay } from "node:timers/promises";

const client = mqtt.connect("mqtt://artemis:artemis@127.0.0.1:1883");

client.on("connect", async () => {
  console.log("connect");

  const topic_foo = "pub/foo";
  const topic_drop = "pub/drop";
  for (let i = 1; i <= 999; i++) {
    await client.publishAsync(topic_foo, JSON.stringify({ tag: "foo", i }));
    await client.publishAsync(topic_drop, JSON.stringify({ tag: "drop", i }));
    console.log("publish", i);

    await delay(1_000);
  }
});
