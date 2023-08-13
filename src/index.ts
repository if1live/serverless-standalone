import http from "http";
import * as helpers from "./helpers.js";
import * as apigatewaymanagementapi from "./apigatewaymanagementapi/index.js";
import * as schedule from "./schedule/index.js";
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

export const StandAlone = {
  async start(
    functions: FunctionDefinition[],
    ports: {
      http: number;
      websocket: number;
      api: number;
    },
  ) {
    await Promise.all([
      main_api(ports.api),
      apigatewaymanagementapi.execute(ports.websocket, functions),
      schedule.execute(functions),
    ]);
  },
};

export * from "./types.js";
