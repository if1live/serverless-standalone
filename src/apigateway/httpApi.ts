import http from "node:http";
import {
  APIGatewayEventRequestContextV2,
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import * as R from "remeda";
import {
  FunctionDefinition,
  HttpMethod,
  castFunctionDefinition,
} from "../types.js";
import * as helpers from "../helpers.js";
import { MethodMatcher, PathMatcher } from "./matchers.js";

export const execute = async (
  port: number,
  definitions: FunctionDefinition[],
) => {
  // 이벤트 중심으로 생각하려고 이벤트-핸들러를 1:1로 맵핑
  const functions = definitions
    .flatMap((x) => {
      const definition = castFunctionDefinition<APIGatewayProxyHandlerV2>(x);
      const events = definition.events
        .map((x) => x.httpApi)
        .filter((httpApi) => httpApi?.enabled ?? true)
        .filter(R.isNot(R.isNil));

      return events.map((event) => {
        // TODO: 문자열 쪼개는걸 컴파일 타임에 검증할수 있나?
        const tokens = event.route.split(" ");
        const method = tokens[0] as HttpMethod;
        const path = tokens[1] as string;

        const matcher_method = MethodMatcher.build(method);
        const matcher_path = PathMatcher.build(path);

        return {
          name: definition.name,
          handler: definition.handler,
          event,
          matcher_method,
          matcher_path,
        };
      });
    })
    .sort((a, b) => PathMatcher.compare(a.matcher_path, b.matcher_path));

  const dispatchHttp: http.RequestListener = async (req, res) => {
    const method = req.method ?? "";

    // req.url에는 query string 붙어있어서 이를 떼어내는 작업이 필요
    const host = req.headers["host"] ?? "";
    const url = new URL(`http://${host}${req.url}`);

    const rawPath = url.pathname;
    const rawQueryString = url.search.substring(1, url.search.length);

    const userAgent = req.headers["user-agent"];
    const sourceIp = helpers.parseIp(req);

    const found = functions
      .map((x) => {
        const match_method = MethodMatcher.match(x.matcher_method, method);
        const match_path = PathMatcher.match(x.matcher_path, rawPath);

        return {
          name: x.name,
          handler: x.handler,
          event: x.event,
          match_method,
          match_path,
        };
      })
      .find((x) => x.match_method && x.match_path);

    if (!found) {
      const json = { message: "Not Found" };
      return helpers.replyJson(res, 404, json);
    }

    const timeEpoch = new Date();
    const requestContext: APIGatewayEventRequestContextV2 = {
      accountId: "123456789012",
      apiId: "private",
      domainName: "localhost",
      domainPrefix: "TODO",
      http: {
        method,
        path: rawPath,
        protocol: url.protocol,
        sourceIp: sourceIp ?? "1.2.3.4",
        userAgent: userAgent ?? "",
      },
      requestId: helpers.createUniqueId(),
      routeKey: "TODO",
      stage: "local",
      time: timeEpoch.toISOString(),
      timeEpoch: timeEpoch.getTime(),
    };

    const bodyBuffer = await helpers.getBody(req);
    const body =
      bodyBuffer.byteLength > 0 ? bodyBuffer.toString("utf-8") : undefined;
    const isBase64Encoded = false;

    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([key, value]) => {
        return [key, value?.toString()] as const;
      }),
    );

    const queryStringParameters: Record<string, string> = {};
    for (const key of url.searchParams.keys()) {
      const value = url.searchParams.getAll(key);
      queryStringParameters[key] = value.join(",");
    }

    const pathParameters = found.match_path ?? {};

    // https://docs.aws.amazon.com/ko_kr/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
    const event: Partial<APIGatewayProxyEventV2> = {
      version: "2.0",
      routeKey: "$default",
      rawPath,
      rawQueryString,
      headers,
      queryStringParameters,
      pathParameters,
      body,
      isBase64Encoded,
      requestContext,
    };

    const awsRequestId = helpers.createUniqueId();
    const context = helpers.generateLambdaContext(found.name, awsRequestId);
    const output = await found.handler(
      event as APIGatewayProxyEventV2,
      context,
      helpers.emptyCallback,
    );
    const result = output as APIGatewayProxyStructuredResultV2;

    res.statusCode = result.statusCode ?? 200;
    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        res.setHeader(key, `${value}`);
      }
    }
    if (result.cookies) {
      // TODO: cookie?
    }

    // TODO: binary?
    res.end(result.body);
  };

  http.createServer(dispatchHttp).listen(port);
};
