import {
  FunctionConfiguration,
  ListFunctionsResponse,
} from "@aws-sdk/client-lambda";
import { Action } from "../actions.js";
import { FunctionDefinition } from "../../types.js";
import * as helpers from "../../helpers.js";
import { Req, Res, region, account } from "./types.js";

export class ListHandler {
  constructor(readonly definitions: FunctionDefinition[]) {}

  async handle(req: Req, res: Res, action: Action & { _tag: "list" }) {
    // TODO: 멀쩡하게 구현
    const functions = this.definitions.map((x): FunctionConfiguration => {
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
  }
}
