import http from "node:http";
import * as helpers from "./helpers.js";
import * as apigateway from "./apigateway/index.js";
import * as schedule from "./schedule/index.js";
import * as lambda from "./lambda/index.js";
import * as iot from "./iot/index.js";
import * as sqs from "./sqs/index.js";
import { FunctionDefinition } from "./types.js";

async function start(params: {
  functions: FunctionDefinition[];
  ports: {
    httpApi: number;
    websocket: number;
    awsApi: number;
  };
  urls: {
    mqtt?: string;
    sqs?: string;
  };
}) {
  const { functions, ports, urls } = params;

  const lambdaMain = lambda.create(functions);

  const main_awsApi = async (port: number) => {
    http.createServer(dispatchApi).listen(port);
  };

  const dispatchApi: http.RequestListener = async (req, res) => {
    try {
      if (req.url?.startsWith(apigateway.websocket.prefix)) {
        return apigateway.websocket.handle(req, res);
      } else if (req.url?.startsWith(lambda.prefix)) {
        return lambdaMain.handle(req, res);
      } else {
        const data = {
          message: `${req.method} ${req.url} NotFound`,
        };
        helpers.replyJson(res, 400, data);
      }
    } catch (err) {
      const e = err as any;
      const status = e.status ?? e.statusCode ?? 500;
      const data = { message: (e as any).message };
      helpers.replyJson(res, status, data);
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
    main_awsApi(ports.awsApi),
    fn_apigateway_httpApi(ports.httpApi),
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
