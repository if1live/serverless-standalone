import zlib from "node:zlib";
import { promisify } from "node:util";
import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { FunctionDefinition } from "../src/types.js";
import { standalone } from "../src/index.js";

const endpoint = "http://127.0.0.1:9000";

type RouteMatchResult = {
  label: string;
  pathParameters: APIGatewayProxyEventV2["pathParameters"];
};

const execute_route = (
  label: string,
  event: APIGatewayProxyEventV2,
): APIGatewayProxyResultV2 => {
  const data: RouteMatchResult = {
    label,
    pathParameters: event.pathParameters,
  };

  return {
    statusCode: 200,
    body: JSON.stringify(data, null, 2),
  };
};

const http_exact_get: APIGatewayProxyHandlerV2 = async (event, context) => {
  return execute_route("route_exact_get", event);
};

async function test_route_exact_get() {
  const url = `${endpoint}/foo`;
  const resp = await fetch(url, { method: "GET" });
  const actual: RouteMatchResult = await resp.json();
  const expected: RouteMatchResult = {
    label: "route_exact_get",
    pathParameters: {},
  };
  assert.deepEqual(actual, expected);
}

const http_exact_post: APIGatewayProxyHandlerV2 = async (event, context) => {
  return execute_route("route_exact_post", event);
};

async function test_route_exact_post() {
  const url = `${endpoint}/foo`;
  const resp = await fetch(url, { method: "POST" });
  const actual: RouteMatchResult = await resp.json();
  const expected: RouteMatchResult = {
    label: "route_exact_post",
    pathParameters: {},
  };
  assert.deepEqual(actual, expected);
}

const http_fixed: APIGatewayProxyHandlerV2 = async (event, context) => {
  return execute_route("route_fixed", event);
};

async function test_route_fixed() {
  const url = `${endpoint}/fixed/1/2`;
  const resp = await fetch(url);
  const actual: RouteMatchResult = await resp.json();
  const expected: RouteMatchResult = {
    label: "route_fixed",
    pathParameters: { foo: "1", bar: "2" },
  };
  assert.deepEqual(actual, expected);
}

const http_variadic: APIGatewayProxyHandlerV2 = async (event, context) => {
  return execute_route("route_variadic", event);
};

async function test_route_variadic() {
  const url = `${endpoint}/variadic/1/2`;
  const resp = await fetch(url);
  const actual: RouteMatchResult = await resp.json();
  const expected: RouteMatchResult = {
    label: "route_variadic",
    pathParameters: {
      proxy: "1/2",
    },
  };
  assert.deepEqual(actual, expected);
}

const http_mixed: APIGatewayProxyHandlerV2 = async (event, context) => {
  return execute_route("route_mixed", event);
};

async function test_route_mixed() {
  const url = `${endpoint}/mixed/a/hello/b/hello/world/`;
  const resp = await fetch(url);
  const actual: RouteMatchResult = await resp.json();
  const expected: RouteMatchResult = {
    label: "route_mixed",
    pathParameters: {
      foo: "a",
      bar: "b",
      proxy: "hello/world/",
    },
  };
  assert.deepEqual(actual, expected);
}

async function test_route_404() {
  const url = `${endpoint}/not-found`;
  const resp = await fetch(url);
  const actual = await resp.json();
  assert.equal(resp.status, 404);
  assert.deepEqual(actual, { message: "Not Found" });
}

type DumpResult = {
  query: APIGatewayProxyEventV2["queryStringParameters"];
  headers: APIGatewayProxyEventV2["headers"];
  body: APIGatewayProxyEventV2["body"];
};
const http_dump: APIGatewayProxyHandlerV2 = async (event, context) => {
  const data: DumpResult = {
    query: event.queryStringParameters,
    headers: event.headers,
    body: event.body,
  };

  return {
    statusCode: 200,
    body: JSON.stringify(data, null, 2),
  };
};

async function test_dump_get() {
  const url = `${endpoint}/dump?a=1&a=2&b=9`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "custom-header-foo": "10",
    },
  });
  const json: DumpResult = await resp.json();
  assert.deepEqual(json.query, {
    a: "1,2",
    b: "9",
  });
  assert.equal(json.headers["custom-header-foo"], "10");
}

async function test_dump_post() {
  const body = JSON.stringify({ a: 1, b: 2 });
  const contentType = "application/json";

  const url = `${endpoint}/dump`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
  const json: DumpResult = await resp.json();
  assert.equal(json.body, body);
  assert.equal(json.headers["content-type"], contentType);
}

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

const http_binary: APIGatewayProxyHandlerV2 = async (event, context) => {
  const buffer = Buffer.from("hello", "utf-8");
  const binary = await gzipAsync(buffer);
  const body = binary.toString("base64");
  return {
    statusCode: 200,
    isBase64Encoded: true,
    body,
  };
};
async function test_binary() {
  const url = `${endpoint}/binary`;
  const resp = await fetch(url);
  const blob = await resp.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const message = await gunzipAsync(buffer);
  assert.equal(message, "hello");
}

export const definitions: FunctionDefinition[] = [
  {
    name: "http_fixed",
    handler: http_fixed,
    events: [{ httpApi: { route: "ANY /fixed/{foo}/{bar}" } }],
  },
  {
    name: "http_variadic",
    handler: http_variadic,
    events: [{ httpApi: { route: "ANY /variadic/{proxy+}" } }],
  },
  {
    name: "http_mixed",
    handler: http_mixed,
    events: [{ httpApi: { route: "ANY /mixed/{foo}/hello/{bar}/{proxy+}" } }],
  },
  {
    name: "http_exact_get",
    handler: http_exact_get,
    events: [{ httpApi: { route: "GET /foo" } }],
  },
  {
    name: "http_exact_post",
    handler: http_exact_post,
    events: [{ httpApi: { route: "POST /foo" } }],
  },
  {
    name: "http_dump",
    handler: http_dump,
    events: [{ httpApi: { route: "ANY /dump" } }],
  },
  {
    name: "http_binary",
    handler: http_binary,
    events: [{ httpApi: { route: "ANY /binary" } }],
  },
];

const inst = standalone({
  functions: definitions,
  ports: {
    http: 9000,
    websocket: 9001,
    lambda: 9002,
  },
  urls: {},
});

describe("http", () => {
  before(async () => inst.start());
  after(async () => inst.stop());

  describe("http#route", () => {
    it("exact_get", async () => test_route_exact_get());
    it("exact_post", async () => test_route_exact_post());
    it("fixed", async () => test_route_fixed());
    it("variadic", async () => test_route_variadic());
    it("mixed", async () => test_route_mixed());
    it("404", async () => test_route_404());
  });

  describe("http#dump", () => {
    it("get", async () => test_dump_get());
    it("post", async () => test_dump_post());
  });

  describe("http#binary", () => {
    it("binary", async () => test_binary());
  });
});
