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
    http: number;
    websocket: number;
    api: number;
  };
  urls: {
    mqtt?: string;
    sqs?: string;
  };
}) {
  const { functions, ports, urls } = params;

  const lambdaMain = lambda.create(functions);

  const main_api = async (port: number) => {
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

  const main_http = async (port: number) => {
    http.createServer(dispatchHttp).listen(port);
  };

  const dispatchHttp: http.RequestListener = async (req, res) => {
    console.log(`httpApi ${req.method} ${req.url}`);
    helpers.replyJson(res, 200, { ok: true });
  };

  const fn_apigateway_websocket = async () => {
    await apigateway.websocket.execute(ports.websocket, functions);
  };

  const fn_schedule = async () => {
    await schedule.execute(functions);
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
    main_http(ports.http),
    main_api(ports.api),
    fn_apigateway_websocket(),
    fn_schedule(),
    fn_iot(),
    fn_sqs(),
  ]);
}

export const StandAlone = {
  start,
};

export * from "./types.js";
