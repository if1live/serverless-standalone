import http from "node:http";
import { createHttpTerminator } from "http-terminator";
import { FunctionDefinition, ServiceRunner, UnknownHandler } from "../types.js";
import * as helpers from "../helpers.js";
import { InvocationType } from "@aws-sdk/client-lambda";

export const prefix = "/2015-03-31/functions/";

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
    if (parsed._tag === "invoke") {
      const found = definitions.find((x) => x.name === parsed.functionName);
      if (!found) {
        throw new Error("function not found");
      }

      // TODO: 클라의 입력이 항상 json이라고 가정해도 되나?
      const buffer = await helpers.getBody(req);
      const text = buffer.toString("utf-8");
      const event = JSON.parse(text);

      const awsRequestId = helpers.createUniqueId();
      const context = helpers.generateLambdaContext(found.name, awsRequestId);
      const f = found.handler as UnknownHandler;

      const invocationType = req.headers["x-amz-invocation-type"];
      if (invocationType === InvocationType.RequestResponse) {
        const output = await f(event, context);
        return helpers.replyJson(res, 200, output);
      } else if (invocationType === InvocationType.Event) {
        f(event, context).then();
        return helpers.replyJson(res, 200, {});
      } else {
        const resp = {
          message: `not supported invocationType: ${invocationType}`,
        };
        return helpers.replyJson(res, 400, resp);
      }
    } else {
      throw new Error("cannot perform");
    }
  };

  const dispatchApi: http.RequestListener = async (req, res) => {
    try {
      if (req.url?.startsWith(prefix)) {
        return handle(req, res);
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

  const server = http.createServer(dispatchApi);
  const httpTerminator = createHttpTerminator({ server });

  const start = async () => {
    return new Promise((resolve) => {
      server.listen(port, () => {
        console.log(`listen lambda: http://127.0.0.1:${port}`);
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

/** POST /2015-03-31/functions/lambda_simple/invocations */
const re_invoke = /^\/2015-03-31\/functions\/([a-zA-Z0-0_]+)\/invocations$/;

const parseRequest_invoke = (
  req: Pick<http.IncomingMessage, "method" | "url">,
) => {
  const m = re_invoke.exec(req.url ?? "");
  if (req.method === "POST" && m) {
    return {
      _tag: "invoke" as const,
      functionName: m[1]!,
    };
  }
};

export const parseRequest = (
  req: Pick<http.IncomingMessage, "method" | "url">,
) => {
  const result_invoke = parseRequest_invoke(req);
  if (result_invoke) {
    return result_invoke;
  }

  throw new Error("cannot parse lambda request");
};
