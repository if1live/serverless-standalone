import { describe, it, assert } from "vitest";
import http from "node:http";
import { parseRequest } from "../../src/lambda/index.js";

describe("parse", () => {
  type Req = Pick<http.IncomingMessage, "method" | "url" | "headers">;

  it("invoke", () => {
    const req: Req = {
      method: "POST",
      url: "/2015-03-31/functions/toki-example-dev-sqsMain-01/invocations",
      headers: {
        "x-amz-invocation-type": "RequestResponse",
      },
    };
    const actual = parseRequest(req);

    assert.equal(actual?._tag, "invoke");
    if (actual._tag === "invoke") {
      assert.equal(actual.functionName, "toki-example-dev-sqsMain-01");
    }
  });

  it("list", () => {
    const req: Req = {
      method: "GET",
      url: "/2015-03-31/functions",
      headers: {},
    };
    const actual = parseRequest(req);

    assert.equal(actual?._tag, "list");
  });

  it("urls", () => {
    const req: Req = {
      method: "GET",
      url: "/2021-10-31/functions/lambda_simple/urls",
      headers: {},
    };
    const actual = parseRequest(req);

    assert.equal(actual?._tag, "urls");
    if (actual._tag === "urls") {
      assert.equal(actual.functionName, "lambda_simple");
    }
  });

  it("event source mappings", () => {
    const req: Req = {
      method: "GET",
      url: "/2015-03-31/event-source-mappings?FunctionName=lambda_simple",
      headers: {},
    };
    const actual = parseRequest(req);

    assert.equal(actual?._tag, "eventSourceMappings");
    if (actual._tag === "eventSourceMappings") {
      assert.equal(actual.functionName, "lambda_simple");
    }
  });
});
