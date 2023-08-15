import { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { FunctionDefinition } from "../src/types.js";

const execute = (functionName: string, event: APIGatewayProxyEventV2) => {
  const data = {
    method: event.requestContext.http.method,
    path: event.requestContext.http.path,
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
    name: "http_exact_get",
    handler: http_exact_get,
    events: [
      {
        httpApi: { method: "GET", path: "/foo" },
      },
    ],
  },
  {
    name: "http_exact_post",
    handler: http_exact_post,
    events: [
      {
        httpApi: { method: "POST", path: "/foo" },
      },
    ],
  },
  {
    name: "http_fixed",
    handler: http_fixed,
    events: [
      {
        httpApi: { method: "ANY", path: "/fixed/{foo}/{bar}" },
      },
    ],
  },
  {
    name: "http_variadic",
    handler: http_variadic,
    events: [
      {
        httpApi: { method: "ANY", path: "/variadic/{proxy+}" },
      },
    ],
  },
];
