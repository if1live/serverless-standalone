import { ScheduledEvent, ScheduledHandler } from "aws-lambda";
import { CronJob } from "cron";
import * as R from "remeda";
import * as helpers from "../helpers.js";
import {
  FunctionDefinition,
  FunctionEvent_Schedule,
  castFunctionDefinition,
} from "../types.js";

export const execute = async (definitions: FunctionDefinition[]) => {
  const functions = definitions.flatMap((definition0) => {
    const definition = castFunctionDefinition<ScheduledHandler>(definition0);
    const events = definition.events
      .map((x) => x.schedule)
      .filter((schedule) => schedule?.enabled ?? true)
      .filter(R.isNot(R.isNil));
    return events.map((sched) => ({
      name: definition.name,
      handler: definition.handler,
      sched,
    }));
  });

  const jobs = functions.map(({ name, handler: f, sched }) => {
    return new CronJob(sched.rate, async () => {
      const now = new Date();
      const event = createEvent(sched, now);
      const awsRequestId = helpers.createUniqueId();
      const context = helpers.generateLambdaContext(name, awsRequestId);
      await f(event, context, helpers.emptyCallback);
    });
  });

  for (const job of jobs) {
    job.start();
  }
};

// https://docs.aws.amazon.com/ko_kr/AmazonCloudWatch/latest/events/RunLambdaSchedule.html
function createEvent(sched: FunctionEvent_Schedule, now: Date): ScheduledEvent {
  const region = "ap-northeast-1";
  const account = "123456789012";
  const detail = sched.input ?? {};
  return {
    version: "0",
    id: helpers.uuid(),
    "detail-type": "Scheduled Event",
    source: "aws.events",
    account,
    time: now.toISOString(),
    region,
    resources: [
      `arn:aws:events:${region}:${account}:rule/standalone-scheduled-rule`,
    ],
    detail,
  };
}
