import { IoTHandler } from "aws-lambda";
import mqtt from "mqtt";
import * as R from "remeda";
import {
  FunctionDefinition,
  ServiceRunner,
  castFunctionDefinition,
} from "../types.js";
import * as helpers from "../helpers.js";

export interface Options {
  mqtt: string;
}

export const create = (
  definitions: FunctionDefinition[],
  options: Options,
): ServiceRunner => {
  const { mqtt: url } = options;

  const functions = definitions.flatMap((x) => {
    const definition = castFunctionDefinition<IoTHandler>(x);

    const events = definition.events
      .map((x) => x.iot)
      .filter((iot) => iot?.enabled ?? true)
      .filter(R.isNot(R.isNil));
    return events.map((iot) => ({
      name: definition.name,
      handler: definition.handler,
      iot,
    }));
  });

  let g_client: mqtt.MqttClient | null;

  const start = async () => {
    const client = mqtt.connect(url);
    g_client = client;

    const p_connect = new Promise((resolve) => {
      client.on("connect", async (packet) => {
        const topics = functions
          .map((x) => x.iot.sql)
          .map((sql) => extractTopic(sql))
          .filter(R.isNonNull);

        if (topics.length > 0) {
          await client.subscribeAsync(topics);
        }

        resolve(true);
      });
    });

    client.on("error", (e) => {
      console.error("error", e);
    });

    client.on("close", () => {
      console.error("close");
    });

    client.on("reconnect", () => {
      console.error("reconnect");
    });

    client.on("message", async (topic, payload, packet) => {
      const event = payload.toString("utf-8");

      // TODO: handler mapping? topic에 맞는 핸들러만 찾기
      // TODO: +, # 같은거 쓰면 어떻게 핸들러 찾지?
      const founds = functions.filter((x) => {
        const topic_sql = extractTopic(x.iot.sql);
        return topic === topic_sql;
      });

      const tasks = founds.map(async (entry) => {
        const { name, handler: f } = entry;
        const awsRequestId = helpers.createUniqueId();
        const context = helpers.generateLambdaContext(name, awsRequestId);
        await f(event, context, helpers.emptyCallback);
      });
      await Promise.allSettled(tasks);
    });

    // 적어도 connect는 끝나야 다음 작업을 보장할 수 있다
    await p_connect;
  };

  const stop = async () => {
    if (!g_client) {
      throw new Error("iot is not started");
    }
    await g_client.endAsync(true);
  };

  return { start, stop };
};

function extractTopic(sql: string): string | null {
  // TODO: 편의상 iot sql은 간단한거만 지원
  // SELECT * FROM 'some_topic'
  const re = /^SELECT \* FROM '(.+)'$/i;
  const m = re.exec(sql);
  return m ? m[1]! : null;
}
