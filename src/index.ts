import http from "http";
import * as helpers from "./helpers.js";
import * as apigatewaymanagementapi from "./apigatewaymanagementapi/index.js";
import * as schedule from "./schedule/index.js";
import * as iot from "./iot/index.js";
import { FunctionDefinition } from "./types.js";

const main_api = async (port: number) => {
  http.createServer(dispatchApi).listen(port);
};

const dispatchApi: http.RequestListener = async (req, res) => {
  try {
    if (req.url?.startsWith(apigatewaymanagementapi.prefix)) {
      return apigatewaymanagementapi.handle(req, res);
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

async function start(params: {
  functions: FunctionDefinition[];
  ports: {
    http: number;
    websocket: number;
    api: number;
  };
  urls: {
    mqtt?: string;
  };
}) {
  const { functions, ports, urls } = params;

  const fn_apigatewaymanagementapi = async () => {
    await apigatewaymanagementapi.execute(ports.websocket, functions);
  };

  const fn_schedule = async () => {
    await schedule.execute(functions);
  };

  const fn_iot = async () => {
    if (typeof urls.mqtt !== "string") {
      return;
    }
    await iot.execute(urls.mqtt, functions);
  };

  await Promise.all([
    main_api(ports.api),
    fn_apigatewaymanagementapi(),
    fn_schedule(),
    fn_iot(),
  ]);
}

export const StandAlone = {
  start,
};

export * from "./types.js";
