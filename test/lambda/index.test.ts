import { describe, it, assert } from "vitest";
import http from "node:http";
import { parseRequest } from "../../src/lambda/index.js";

describe("parse", () => {
  it("invoke", () => {
    const req: Partial<http.IncomingMessage> = {
      method: "POST",
      url: "/2015-03-31/functions/lambda_simple/invocations",
    };
    const actual = parseRequest(req);

    assert.equal(actual?._tag, "invoke");
    assert.equal(actual?.functionName, "lambda_simple");
  });
});