import url from "node:url";
import { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { FunctionDefinition } from "../src/types.js";

const execute = (functionName: string, event: APIGatewayProxyEventV2) => {
  const data = {
    http: event.requestContext.http,
    body: event.body,
    queryStringParameters: event.queryStringParameters,
    pathParameters: event.pathParameters,
  };
  console.log(functionName, data);

  return {
    statusCode: 200,
    body: JSON.stringify(data, null, 2),
  };
};

const http_exact_get: APIGatewayProxyHandlerV2 = async (event, context) => {
  return execute("http_exact_get", event);
};

const http_exact_post: APIGatewayProxyHandlerV2 = async (event, context) => {
  return execute("http_exact_post", event);
};

const http_fixed: APIGatewayProxyHandlerV2 = async (event, context) => {
  return execute("http_fixed", event);
};

const http_variadic: APIGatewayProxyHandlerV2 = async (event, context) => {
  return execute("http_variadic", event);
};

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
    name: "http_exact_get",
    handler: http_exact_get,
    events: [{ httpApi: { route: "GET /foo" } }],
  },
  {
    name: "http_exact_post",
    handler: http_exact_post,
    events: [{ httpApi: { route: "POST /foo" } }],
  },
];

const endpoint = "http://127.0.0.1:9000";

async function main() {
  {
    const url = `${endpoint}/foo?a=1&a=2&b=10`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "custom-header-x": "1",
      },
    });
    const json = await resp.json();
    console.log(json);
  }
  {
    const url = `${endpoint}/foo?a=1&a=2&b=10`;
    const resp = await fetch(url, {
      method: "POST",
      body: "x=10&y=20",
    });
    const json = await resp.json();
    console.log(json);
  }
  {
    const url = `${endpoint}/fixed/1/2`;
    const resp = await fetch(url);
    const json = await resp.json();
    console.log(json);
  }
  {
    const url = `${endpoint}/variadic/1/2`;
    const resp = await fetch(url);
    const json = await resp.json();
    console.log(json);
  }
}

if (import.meta.url.startsWith("file:")) {
  const modulePath = url.fileURLToPath(import.meta.url);
  if (process.argv[1] === modulePath) {
    await main();
  }
}
