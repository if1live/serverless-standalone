import {
  FunctionUrlConfig,
  ListFunctionUrlConfigsResponse,
} from "@aws-sdk/client-lambda";
import * as R from "remeda";
import * as helpers from "../../helpers.js";
import { FunctionDefinition } from "../../types.js";
import { Req, Res, region, account } from "./types.js";
import { Action } from "../actions.js";

export class UrlsHandler {
  constructor(readonly definitions: FunctionDefinition[]) {}

  async handle(req: Req, res: Res, action: Action & { _tag: "urls" }) {
    const found = this.definitions.find((x) => x.name === action.functionName);
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
  }
}
