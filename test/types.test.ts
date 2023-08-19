import { describe, it, assert } from "vitest";
import { assert as typeAssert, IsExact } from "conditional-type-checks";
import { APIGatewayProxyHandler, SQSHandler } from "aws-lambda";
import {
  FunctionDefinition,
  FunctionEvent,
  FunctionEvent_ApiGatewayProxyV2,
  FunctionEvent_Base,
} from "../src/types.js";

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

describe("FunctionDefinition#narrow_event", () => {
  const fn_sample: APIGatewayProxyHandler = async (event, context) => {
    return { statusCode: 200, body: "" };
  };

  const definition: FunctionDefinition = {
    name: "foo",
    handler: fn_sample,
    events: [
      { httpApi: { route: "GET /" } },
      { websocket: { route: "$connect" } },
      { websocket: { route: "$disconnect" } },
    ],
  };

  it("not exist", () => {
    const actual = FunctionDefinition.narrow_event(definition, "iot");
    assert.equal(actual.events.length, 0);
  });

  it("one", () => {
    const actual = FunctionDefinition.narrow_event(definition, "httpApi");
    assert.equal(actual.events.length, 1);

    // type
    type Actual = (typeof actual)["events"][number];
    type Expected = {
      httpApi: FunctionEvent_ApiGatewayProxyV2 & FunctionEvent_Base;
    };
    typeAssert<IsExact<Actual, Expected>>(true);
  });

  it("many", () => {
    const actual = FunctionDefinition.narrow_event(definition, "websocket");
    assert.equal(actual.events.length, 2);
  });
});

describe("FunctionDefinition#narrow_handler", () => {
  const fn_sample: APIGatewayProxyHandler = async (event, context) => {
    return { statusCode: 200, body: "" };
  };

  const definition: FunctionDefinition = {
    name: "foo",
    handler: fn_sample,
    events: [
      { httpApi: { route: "GET /" } },
      { websocket: { route: "$connect" } },
      { websocket: { route: "$disconnect" } },
    ],
  };

  it("cast", () => {
    const fn: SQSHandler = () => {};
    const actual = FunctionDefinition.narrow_handler(definition, fn);
    type Actual = (typeof actual)["handler"];
    typeAssert<IsExact<Actual, SQSHandler>>(true);
  });
});
