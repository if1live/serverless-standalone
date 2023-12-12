import http from "node:http";
import assert from "node:assert/strict";
import * as R from "remeda";
import { Context } from "aws-lambda";
import { createHttpTerminator } from "http-terminator";
import { FunctionDefinition, ServiceRunner, UnknownHandler } from "../types.js";
import * as helpers from "../helpers.js";
import {
  EventSourceMappingConfiguration,
  FunctionConfiguration,
  FunctionUrlConfig,
  ListEventSourceMappingsResponse,
  ListFunctionUrlConfigsResponse,
  ListFunctionsResponse,
} from "@aws-sdk/client-lambda";

type InvocationType = "RequestResponse" | "Event";

const region = "ap-northeast-1";
const account = "123456789012";

export interface Options {
  port: number;
}

type Action_Invoke = {
  _tag: "invoke";
  functionName: string;
  invocationType: InvocationType;
};

type Action_List = {
  _tag: "list";
};

type Action_Urls = {
  _tag: "urls";
  functionName: string;
};

type Action_EventSourceMappings = {
  _tag: "eventSourceMappings";
  functionName: string;
};

type Action =
  | Action_Invoke
  | Action_List
  | Action_Urls
  | Action_EventSourceMappings;

export const create = (
  definitions: FunctionDefinition[],
  options: Options,
): ServiceRunner => {
  const { port } = options;

  type Req = Parameters<http.RequestListener>[0];
  type Res = Parameters<http.RequestListener>[1];

  const handle_invoke = async (
    req: Req,
    res: Res,
    action: Action & { _tag: "invoke" },
  ) => {
    const found = definitions.find((x) => x.name === action.functionName);
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

    if (action.invocationType === "RequestResponse") {
      return await invoke_requestResponse(res, invocation);
    } else if (action.invocationType === "Event") {
      return invoke_event(res, invocation);
    } else {
      const resp = {
        message: `not supported invocationType: ${action.invocationType}`,
      };
      return helpers.replyJson(res, 400, resp);
    }
  };

  const handle_list = async (
    req: Req,
    res: Res,
    action: Action & { _tag: "list" },
  ) => {
    // TODO: 멀쩡하게 구현
    const functions = definitions.map((x): FunctionConfiguration => {
      const functionArn = `arn:aws:lambda:${region}:${account}:function:${x.name}`;
      return {
        FunctionArn: functionArn,
        FunctionName: x.name,
      };
    });

    const resp: ListFunctionsResponse = {
      Functions: functions,
    };
    return helpers.replyJson(res, 200, resp);
  };

  const handle_urls = async (
    req: Req,
    res: Res,
    action: Action & { _tag: "urls" },
  ) => {
    const found = definitions.find((x) => x.name === action.functionName);
    if (!found) {
      throw new Error("function not found");
    }

    const configs_httpApi = found.events
      .map((x) => x.httpApi)
      .filter(R.isNot(R.isNil))
      .map((x): FunctionUrlConfig => {
        const functionArn = `arn:aws:lambda:${region}:${account}:function:${found.name}`;
        const functionUrl = `http://127.0.0.1:3000/`;

        // TODO: 시간 뭐로 가라치지?
        const now = new Date();

        return {
          AuthType: "NONE",
          FunctionArn: functionArn,
          FunctionUrl: functionUrl,
          CreationTime: now.toISOString(),
          LastModifiedTime: now.toISOString(),
        };
      });

    const resp: ListFunctionUrlConfigsResponse = {
      FunctionUrlConfigs: configs_httpApi,
    };
    return helpers.replyJson(res, 200, resp);
  };

  const handle_eventSourceMappings = async (
    req: Req,
    res: Res,
    action: Action & { _tag: "eventSourceMappings" },
  ) => {
    const found = definitions.find((x) => x.name === action.functionName);
    if (!found) {
      throw new Error("function not found");
    }

    // 상위 레이어에서 disabled된 이벤트를 잘라버린다.
    // 그래서 state enabled/disabled를 표현할 수 없는 상태.
    const mappings_sqs = found.events
      .map((x) => x.sqs)
      .filter(R.isNot(R.isNil))
      .map((x): EventSourceMappingConfiguration => {
        // TODO: uuid는 확정적으로 나와야한다. 일단 함수 이름으로 떔빵
        const uuid = `${found.name}-${x.queueName}`;
        const eventSourceArn = `arn:aws:sqs:${region}:${account}:${x.queueName}`;
        const functionArn = `arn:aws:lambda:${region}:${account}:function:${found.name}`;
        return {
          UUID: uuid,
          EventSourceArn: eventSourceArn,
          FunctionArn: functionArn,
          BatchSize: x.batchSize,
          State: "Enabled",
        };
      });

    const resp: ListEventSourceMappingsResponse = {
      EventSourceMappings: mappings_sqs,
    };
    return helpers.replyJson(res, 200, resp);
  };

  const handle: http.RequestListener = async (req, res) => {
    const parsed = parseRequest(req);
    switch (parsed._tag) {
      case "invoke":
        return await handle_invoke(req, res, parsed);
      case "list":
        return await handle_list(req, res, parsed);
      case "urls":
        return await handle_urls(req, res, parsed);
      case "eventSourceMappings":
        return await handle_eventSourceMappings(req, res, parsed);
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

type SimpleReq = Pick<http.IncomingMessage, "method" | "url" | "headers">;

/** POST /2015-03-31/functions/lambda_simple/invocations */
const re_invoke = /^\/2015-03-31\/functions\/([a-zA-Z0-9_-]+)\/invocations$/;

const parseRequest_invoke = (req: SimpleReq): Action_Invoke | undefined => {
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

const parseRequest_list = (req: SimpleReq): Action_List | undefined => {
  const target_url = "/2015-03-31/functions";
  if (req.method === "GET" && req.url === target_url) {
    return {
      _tag: "list" as const,
    };
  }
};

/** GET /2021-10-31/functions/lambda_simple/urls */
const re_urls = /^\/2021-10-31\/functions\/([a-zA-Z0-9_-]+)\/urls$/;

const parseRequest_urls = (req: SimpleReq): Action_Urls | undefined => {
  const m = re_urls.exec(req.url ?? "");
  if (req.method === "GET" && m) {
    return {
      _tag: "urls" as const,
      functionName: m[1]!,
    };
  }
};

/** GET /2015-03-31/event-source-mappings?FunctionName=lambda_simple NotFound */
const parseRequest_eventSourceMappings = (
  req: SimpleReq,
): Action_EventSourceMappings | undefined => {
  if (req.method !== "GET") {
    return;
  }

  const url = new URL(`http://localhost${req.url ?? ""}`);
  if (url.pathname !== "/2015-03-31/event-source-mappings") {
    return;
  }

  const functionName = url.searchParams.get("FunctionName");
  if (!functionName) {
    return;
  }

  return {
    _tag: "eventSourceMappings" as const,
    functionName,
  };
};

export const parseRequest = (
  req: Pick<http.IncomingMessage, "method" | "url" | "headers">,
): Action => {
  const result_invoke = parseRequest_invoke(req);
  if (result_invoke) {
    return result_invoke;
  }

  const result_list = parseRequest_list(req);
  if (result_list) {
    return result_list;
  }

  const result_urls = parseRequest_urls(req);
  if (result_urls) {
    return result_urls;
  }

  const result_eventSourceMappings = parseRequest_eventSourceMappings(req);
  if (result_eventSourceMappings) {
    return result_eventSourceMappings;
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
