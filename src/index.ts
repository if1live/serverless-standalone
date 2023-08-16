import { httpApi, websocket } from "./apigateway/index.js";
import * as schedule from "./schedule/index.js";
import * as lambda from "./lambda/index.js";
import * as iot from "./iot/index.js";
import * as sqs from "./sqs/index.js";
import { FunctionDefinition, ServiceRunner } from "./types.js";

const mock: ServiceRunner = {
  start() {},
  stop() {},
};

export function standalone(params: {
  functions: FunctionDefinition[];
  ports: {
    http: number;
    websocket: number;
    lambda: number;
  };
  urls: {
    mqtt?: string;
    sqs?: string;
  };
}) {
  const { functions, ports, urls } = params;

  // TODO: 핸들러 없으면 건너뛰도록
  const inst_httpApi = httpApi.create(ports.http, functions);
  const inst_webscoket = websocket.create(ports.websocket, functions);
  const inst_lambda = lambda.create(ports.lambda, functions);
  const inst_schedule = schedule.create(functions);
  const inst_sqs = urls.sqs ? sqs.create(urls.sqs, functions) : mock;
  const inst_iot = urls.mqtt ? iot.create(urls.mqtt, functions) : mock;

  const items: ServiceRunner[] = [
    inst_httpApi,
    inst_webscoket,
    inst_lambda,
    inst_schedule,
    inst_sqs,
    inst_iot,
  ];

  const start = async () => {
    await Promise.all(items.map((x) => x.start()));
  };

  const stop = async () => {
    await Promise.all(items.map((x) => x.stop()));
  };

  return { start, stop };
}

export * from "./types.js";
