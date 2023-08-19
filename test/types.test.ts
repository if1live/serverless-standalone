import { describe, it, assert } from "vitest";
import { FunctionEvent } from "../src/types.js";

describe("FunctionEvent#isEnabled", () => {
  it("event not defined", () => {
    const event: FunctionEvent = {};
    const actual = FunctionEvent.isEnabled(event);
    assert.equal(actual, false);
  });

  it("enabled defined", () => {
    const bools = [true, false];
    for (const enabled of bools) {
      const event: FunctionEvent = {
        websocket: { enabled, route: "$connect" },
      };
      const actual = FunctionEvent.isEnabled(event);
      assert.equal(actual, enabled);
    }
  });

  it("enabled not defined", () => {
    const event: FunctionEvent = {
      websocket: { route: "$connect" },
    };
    const actual = FunctionEvent.isEnabled(event);
    assert.equal(actual, true);
  });
});
