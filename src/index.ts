import * as apigateway from "./apigateway/index.js";
import * as schedule from "./schedule/index.js";
import * as lambda from "./lambda/index.js";
import * as iot from "./iot/index.js";
import * as sqs from "./sqs/index.js";
import { FunctionDefinition } from "./types.js";

async function start(params: {
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

  const fn_lambda = async (port: number) => {
    // TODO: 람다 함수 하나도 없을떄만 건너뛰기
    if (true) {
      await lambda.execute(port, functions);
    }
  };

  const fn_apigateway_httpApi = async (port: number) => {
    // TODO: 핸들러 없으면 건너뛰도록
    if (true) {
      await apigateway.httpApi.execute(port, functions);
    }
  };

  const fn_apigateway_websocket = async (port: number) => {
    // TODO:  핸들러 없으면 건너뛰도록
    if (true) {
      await apigateway.websocket.execute(port, functions);
    }
  };

  const fn_schedule = async () => {
    // TODO:  핸들러 없으면 건너뛰도록
    if (true) {
      await schedule.execute(functions);
    }
  };

  const fn_iot = async () => {
    if (urls.mqtt) {
      await iot.execute(urls.mqtt, functions);
    }
  };

  const fn_sqs = async () => {
    if (urls.sqs) {
      await sqs.execute(urls.sqs, functions);
    }
  };

  await Promise.all([
    fn_lambda(ports.lambda),
    fn_apigateway_httpApi(ports.http),
    fn_apigateway_websocket(ports.websocket),
    fn_schedule(),
    fn_iot(),
    fn_sqs(),
  ]);
}

export const StandAlone = {
  start,
};

export * from "./types.js";
