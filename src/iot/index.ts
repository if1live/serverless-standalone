import { IoTHandler } from "aws-lambda";
import mqtt from "mqtt";
import * as R from "remeda";
import { FunctionDefinition } from "../types.js";
import * as helpers from "../helpers.js";

export const execute = async (
  url: string,
  definitions: FunctionDefinition[],
) => {
  const functions = definitions.flatMap((definition) => {
    const handler = definition.handler as IoTHandler;
    const events = definition.events
      .map((x) => x.iot)
      .filter((iot) => iot?.enabled ?? true)
      .filter(R.isNot(R.isNil));
    return events.map((iot) => ({ handler, iot }));
  });

  const client = mqtt.connect(url);

  client.on("connect", async (packet) => {
    const topics = functions
      .map((x) => x.iot.sql)
      .map((sql) => extractTopic(sql))
      .filter(R.isNonNull);

    if (topics.length > 0) {
      await client.subscribeAsync(topics);
    }
  });

  client.on("error", (e) => {
    console.error("error", e);
  });

  client.on("reconnect", () => {
    console.error("reconnect");
  });

  client.on("message", async (topic, payload, packet) => {
    const event = payload.toString("utf-8");

    // TODO: handler mapping? topic에 맞는 핸들러만 찾기
    // TODO: +, # 같은거 쓰면 어떻게 핸들러 찾지?
    const handlers = functions
      .filter((x) => {
        const topic_sql = extractTopic(x.iot.sql);
        return topic === topic_sql;
      })
      .map((x) => x.handler);

    const tasks = handlers.map(async (f) => {
      const awsRequestId = helpers.createUniqueId();
      const context = helpers.generateLambdaContext(f.name, awsRequestId);
      await f(event, context, helpers.emptyCallback);
    });
    await Promise.allSettled(tasks);
  });
};

function extractTopic(sql: string): string | null {
  // TODO: 편의상 iot sql은 간단한거만 지원
  // SELECT * FROM 'some_topic'
  const re = /^SELECT \* FROM '(.+)'$/i;
  const m = re.exec(sql);
  return m ? m[1]! : null;
}
