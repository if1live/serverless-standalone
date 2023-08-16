import { standalone, FunctionDefinition } from "../src/index.js";
import { definitions as definitions_httpApi } from "./e2e_httpApi.js";
import { definitions as definitions_websocket } from "./e2e_websocket.js";
import { definitions as definitions_lambda } from "./e2e_lambda.js";
import { definitions as definitions_schedule } from "./e2e_schedule.js";
import {
  definitions as definitions_sqs,
  endpoint as url_sqs,
} from "./e2e_sqs.js";
import {
  definitions as definitions_iot,
  endpoint as url_mqtt,
} from "./e2e_iot.js";

const definitions: FunctionDefinition[] = [
  ...definitions_httpApi,
  ...definitions_websocket,
  ...definitions_lambda,
  ...definitions_schedule,
  ...definitions_sqs,
  ...definitions_iot,
];

const inst = standalone({
  functions: definitions,
  ports: {
    http: 9000,
    websocket: 9001,
    lambda: 9002,
  },
  urls: {
    mqtt: url_mqtt,
    sqs: url_sqs,
  },
});
await inst.start();
