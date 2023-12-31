import http from "node:http";
import { Context } from "aws-lambda";
import * as helpers from "../../helpers.js";
import { FunctionDefinition, UnknownHandler } from "../../types.js";
import { Action } from "../actions.js";
import { Req, Res } from "./types.js";

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

export class InvokeHandler {
  constructor(readonly definitions: FunctionDefinition[]) {}

  async handle(req: Req, res: Res, action: Action & { _tag: "invoke" }) {
    const found = this.definitions.find((x) => x.name === action.functionName);
    if (!found) {
      throw new Error("function not found");
    }

    // TODO: 클라의 입력이 항상 json이라고 가정해도 되나?
    const buffer = await helpers.getBodyBuffer(req);
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
  }
}
