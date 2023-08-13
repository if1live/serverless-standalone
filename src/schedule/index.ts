import { ScheduledEvent, ScheduledHandler } from "aws-lambda";
import { CronJob } from "cron";
import * as R from "remeda";
import * as helpers from "../helpers.js";
import { FunctionDefinition, FunctionEvent_Schedule } from "../types.js";

export const execute = async (definitions: FunctionDefinition[]) => {
  const functions = definitions.flatMap((definition) => {
    const handler = definition.handler as ScheduledHandler;
    const events = definition.events
      .map((x) => x.schedule)
      .filter((schedule) => schedule?.enabled ?? true)
      .filter(R.isNot(R.isNil));
    return events.map((sched) => ({ handler, sched }));
  });

  const jobs = functions.map(({ handler, sched }) => {
    return new CronJob(sched.rate, async () => {
      const now = new Date();
      const event = createEvent(sched, now);
      const awsRequestId = helpers.createUniqueId();
      const context = helpers.generateLambdaContext(handler.name, awsRequestId);
      await handler(event, context, helpers.emptyCallback);
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
