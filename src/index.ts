import { httpApi, websocket } from "./apigateway/index.js";
import * as schedule from "./schedule/index.js";
import * as lambda from "./lambda/index.js";
import * as iot from "./iot/index.js";
import * as sqs from "./sqs/index.js";
import { FunctionDefinition, FunctionEvent, ServiceRunner } from "./types.js";

const mock: ServiceRunner = {
  start() {},
  stop() {},
};

export function standalone(params: {
  functions: FunctionDefinition[];
  httpApi?: httpApi.Options;
  websocket?: websocket.Options;
  lambda?: lambda.Options;
  schedule?: schedule.Options;
  sqs?: sqs.Options;
  iot?: iot.Options;
}) {
  const functions = params.functions.map((x) => {
    const events = x.events.filter((e) => FunctionEvent.isEnabled(e));
    return { ...x, events };
  });

  // TODO: 핸들러 없으면 건너뛰도록
  const inst_httpApi = params.httpApi
    ? httpApi.create(functions, params.httpApi)
    : mock;

  const inst_webscoket = params.websocket
    ? websocket.create(functions, params.websocket)
    : mock;

  const inst_lambda = params.lambda
    ? lambda.create(functions, params.lambda)
    : mock;

  const inst_schedule = params.schedule
    ? schedule.create(functions, params.schedule)
    : mock;

  const inst_sqs = params.sqs ? sqs.create(functions, params.sqs) : mock;

  const inst_iot = params.iot ? iot.create(functions, params.iot) : mock;

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
