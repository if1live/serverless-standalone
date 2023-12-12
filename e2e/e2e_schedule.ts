import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { ScheduledHandler } from "aws-lambda";
import { standalone, type FunctionDefinition } from "../src/index.js";

let counter = 0;
const schedule_simple: ScheduledHandler = async (event, context) => {
  counter += 1;
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
// 테스트 편의상 cron 주기를 짧게 가져감
const definition: FunctionDefinition = {
  name: "schedule_simple",
  handler: schedule_simple,
  events: [
    {
      schedule: {
        rate: "*/1 * * * * *",
        input: { foo: 1, bar: 2 },
      },
    },
  ],
};
const functions: FunctionDefinition[] = [definition];

const inst = standalone({
  functions: functions,
  schedule: {},
});

describe("schedule", () => {
  before(async () => inst.start());
  after(async () => inst.stop());

  it("invoke", async () => {
    await delay(2_000);
    assert.equal(counter > 0, true);
  });
});
