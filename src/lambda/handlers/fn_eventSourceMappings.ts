import {
  EventSourceMappingConfiguration,
  ListEventSourceMappingsResponse,
} from "@aws-sdk/client-lambda";
import * as R from "remeda";
import { Action } from "../actions.js";
import { FunctionDefinition, FunctionEvent } from "../../types.js";
import * as helpers from "../../helpers.js";
import { Req, Res, region, account } from "./types.js";

export class EventSourceMappingsHandler {
  constructor(readonly definitions: FunctionDefinition[]) {}

  async handle(
    req: Req,
    res: Res,
    action: Action & { _tag: "eventSourceMappings" },
  ) {
    const found = this.definitions.find((x) => x.name === action.functionName);
    if (!found) {
      throw new Error("function not found");
    }

    const mappings_sqs = found.events
      .map((x) => x.sqs)
      .filter(R.isNot(R.isNil))
      .map((x): EventSourceMappingConfiguration => {
        // TODO: uuid는 확정적으로 나와야한다. 일단 함수 이름으로 떔빵
        const uuid = `${found.name}-${x.queueName}`;
        const eventSourceArn = `arn:aws:sqs:${region}:${account}:${x.queueName}`;
        const functionArn = `arn:aws:lambda:${region}:${account}:function:${found.name}`;

        const enabled = FunctionEvent.isEnabled({ sqs: x });
        const state = enabled ? "Enabled" : "Disabled";

        return {
          UUID: uuid,
          EventSourceArn: eventSourceArn,
          FunctionArn: functionArn,
          BatchSize: x.batchSize,
          State: state,
        };
      });

    const resp: ListEventSourceMappingsResponse = {
      EventSourceMappings: mappings_sqs,
    };
    return helpers.replyJson(res, 200, resp);
  }
}
