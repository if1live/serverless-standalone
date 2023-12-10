import http from "node:http";
import { Context } from "aws-lambda";
import { createHttpTerminator } from "http-terminator";
import { FunctionDefinition, ServiceRunner, UnknownHandler } from "../types.js";
import * as helpers from "../helpers.js";

export const prefix = "/2015-03-31/functions/";

type InvocationType = "RequestResponse" | "Event";

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
      const invocation: Invocation = {
        handler: found.handler as UnknownHandler,
        context,
        event,
      };

      if (parsed.invocationType === "RequestResponse") {
        return await invoke_requestResponse(res, invocation);
      } else if (parsed.invocationType === "Event") {
        return invoke_event(res, invocation);
      } else {
        const resp = {
          message: `not supported invocationType: ${parsed.invocationType}`,
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
const re_invoke = /^\/2015-03-31\/functions\/([a-zA-Z0-9_-]+)\/invocations$/;

const parseRequest_invoke = (
  req: Pick<http.IncomingMessage, "method" | "url" | "headers">,
) => {
  const m = re_invoke.exec(req.url ?? "");
  if (req.method === "POST" && m) {
    const invocationType = req.headers["x-amz-invocation-type"];

    return {
      _tag: "invoke" as const,
      functionName: m[1]!,
      invocationType: invocationType as InvocationType,
    };
  }
};

export const parseRequest = (
  req: Pick<http.IncomingMessage, "method" | "url" | "headers">,
) => {
  const result_invoke = parseRequest_invoke(req);
  if (result_invoke) {
    return result_invoke;
  }

  throw new Error("cannot parse lambda request");
};

type Invocation = {
  handler: UnknownHandler;
  event: object;
  context: Context;
};

const invoke_requestResponse = async (
  res: http.ServerResponse,
  invocation: Invocation,
) => {
  const { handler: f, event, context } = invocation;

  try {
    const output = await f(event, context);
    return helpers.replyJson(res, 200, output);
  } catch (e) {
    console.error(e);

    // TODO: 에러 처리 중복?
    const json_standard = {
      message: "Internal Server Error",
    };

    let json_extra;
    if (e instanceof Error) {
      json_extra = {
        error_name: e.name,
        error_message: e.message,
        stack: (e.stack ?? "").split("\n"),
      };
    } else {
      json_extra = {
        unknown: e,
      };
    }

    const json = {
      ...json_standard,
      ...json_extra,
    };
    return helpers.replyJson(res, 500, json);
  }
};

const invoke_event = (res: http.ServerResponse, invocation: Invocation) => {
  const { handler: f, event, context } = invocation;

  f(event, context)
    .then()
    .catch((e) => {
      console.log(e);
    });

  return helpers.replyJson(res, 200, {});
};
