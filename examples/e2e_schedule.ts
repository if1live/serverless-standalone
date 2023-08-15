import { ScheduledHandler } from "aws-lambda";
import type { FunctionDefinition } from "../src/index.js";

const schedule_simple: ScheduledHandler = async (event, context) => {
  console.log("schedule", {
    time: event.time,
    detail: event.detail,
  });
};

export const definitions: FunctionDefinition[] = [
  {
    name: "schedule_simple",
    handler: schedule_simple,
    events: [
      {
        schedule: {
          rate: "*/10 * * * * *",
          enabled: true,
          input: { foo: 1, bar: 2 },
        },
      },
    ],
  },
];
