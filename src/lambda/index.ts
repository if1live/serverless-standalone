import http from "node:http";
import { createHttpTerminator } from "http-terminator";
import * as helpers from "../helpers.js";
import { FunctionDefinition, ServiceRunner } from "../types.js";
import { parseRequest } from "./actions.js";
import { EventSourceMappingsHandler } from "./handlers/fn_eventSourceMappings.js";
import { InvokeHandler } from "./handlers/fn_invoke.js";
import { ListHandler } from "./handlers/fn_list.js";
import { UrlsHandler } from "./handlers/fn_urls.js";

export interface Options {
  port: number;
}

export const create = (
  definitions: FunctionDefinition[],
  options: Options,
): ServiceRunner => {
  const { port } = options;

  const handle: http.RequestListener = async (req, res) => {
    const parsed = parseRequest(req);
    switch (parsed._tag) {
      case "invoke":
        return await new InvokeHandler(definitions).handle(req, res, parsed);
      case "list":
        return await new ListHandler(definitions).handle(req, res, parsed);
      case "urls":
        return await new UrlsHandler(definitions).handle(req, res, parsed);
      case "eventSourceMappings": {
        const c = new EventSourceMappingsHandler(definitions);
        return await c.handle(req, res, parsed);
      }
      default:
        throw new Error("cannot perform");
    }
  };

  const dispatchApi: http.RequestListener = async (req, res) => {
    try {
      const parsed = parseRequest(req);
      if (!parsed) {
        const data = {
          message: `${req.method} ${req.url} NotFound`,
        };
        helpers.replyJson(res, 400, data);
      }

      // 주의: await 떼면 handle에서 예외 발생시 문제 생긴다!
      // lint에서 시키는대로 하지 말것
      return await handle(req, res);
    } catch (err) {
      const e = err as any;
      const status = e.status ?? e.statusCode ?? 500;
      const data = { message: (e as any).message };
      helpers.replyJson(res, status, data);
    }
  };

  const server = http.createServer(dispatchApi);
  const httpTerminator = createHttpTerminator({ server });

  const start = async () => {
    return new Promise((resolve) => {
      server.listen(port, () => {
        resolve(port);
      });
    });
  };

  const stop = async () => httpTerminator.terminate();

  return {
    start,
    stop,
  };
};
