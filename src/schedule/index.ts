import { ScheduledEvent, ScheduledHandler } from "aws-lambda";
import { CronJob } from "cron";
import * as helpers from "../helpers.js";
import {
  FunctionDefinition,
  FunctionEvent_Schedule,
  ServiceRunner,
} from "../types.js";

export interface Options {}

export const create = (
  definitions: FunctionDefinition[],
  options: Options,
): ServiceRunner => {
  const functions = definitions
    .map((x) => FunctionDefinition.dropDisabledEvent(x))
    .map((x) => FunctionDefinition.narrow_event(x, "schedule"))
    .map((x) => {
      const fn: ScheduledHandler = () => {};
      return FunctionDefinition.narrow_handler(x, fn);
    })
    .flatMap((definition) => {
      return definition.events.map((event) => ({
        name: definition.name,
        handler: definition.handler,
        sched: event.schedule,
      }));
    });

  const jobs = functions.map(({ name, handler: f, sched }) => {
    return new CronJob(sched.rate, async () => {
      const now = new Date();
      const event = createEvent(sched, now);
      const awsRequestId = helpers.createUniqueId();
      const context = helpers.generateLambdaContext(name, awsRequestId);
      try {
        await f(event, context, helpers.emptyCallback);
      } catch (e) {
        console.error(e);
      }
    });
  });

  const start = () => {
    for (const job of jobs) {
      job.start();
    }
  };

  const stop = () => {
    for (const job of jobs) {
      job.stop();
    }
  };

  return {
    start,
    stop,
  };
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
