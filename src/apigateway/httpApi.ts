import http from "node:http";
import { createHttpTerminator } from "http-terminator";
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
  ServiceRunner,
  castFunctionDefinition,
} from "../types.js";
import * as helpers from "../helpers.js";
import {
  MethodMatchResult,
  MethodMatcher,
  PathMatchResult,
  PathMatcher,
} from "./matchers.js";

export const create = (
  port: number,
  definitions: FunctionDefinition[],
): ServiceRunner => {
  // 이벤트 중심으로 생각하려고 이벤트-핸들러를 1:1로 맵핑
  const functions = definitions
    .flatMap((x) => {
      const definition = castFunctionDefinition<APIGatewayProxyHandlerV2>(x);
      const events = definition.events
        .map((x) => x.httpApi)
        .filter((httpApi) => httpApi?.enabled ?? true)
        .filter(R.isNot(R.isNil));

      return events.map((event) => {
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
    // req.url에는 query string 붙어있어서 이를 떼어내는 작업이 필요
    const host = req.headers["host"] ?? "";
    const url = new URL(`http://${host}${req.url}`);

    const found = functions
      .map((x) => {
        const match_method = MethodMatcher.match(x.matcher_method, req.method!);
        const match_path = PathMatcher.match(x.matcher_path, url.pathname);

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

    const event = await createEventV2(req, url, {
      method: found.match_method!,
      path: found.match_path!,
    });

    const awsRequestId = helpers.createUniqueId();
    const context = helpers.generateLambdaContext(found.name, awsRequestId);
    const output = await found.handler(event, context, helpers.emptyCallback);
    const result = output as APIGatewayProxyStructuredResultV2;

    // https://docs.aws.amazon.com/ko_kr/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
    const isBase64Encoded = result.isBase64Encoded ?? false;
    const statusCode = result.statusCode ?? 200;

    const headers_entries = result.headers
      ? Object.entries(result.headers)
      : [];
    const header_contentType = headers_entries
      .filter((x) => x[0].toLowerCase() === "content-type")
      .map((x) => x[1] as string);
    const contentType = header_contentType[0];

    res.statusCode = statusCode;

    for (const [key, value] of headers_entries) {
      res.setHeader(key, `${value}`);
    }
    if (result.cookies) {
      res.setHeader("Set-Cookie", result.cookies);
    }

    // contentType 없을땐 apigateway 명세의 기본값을 사용
    if (!contentType) {
      res.setHeader("content-type", "application/json");
    }

    if (isBase64Encoded && result.body) {
      const buffer = Buffer.from(result.body, "base64");
      res.end(buffer);
    } else {
      res.end(result.body);
    }
  };

  const server = http.createServer(dispatchHttp);
  const httpTerminator = createHttpTerminator({ server });

  const start = async () => {
    return new Promise((resolve) => {
      server.listen(port, () => {
        console.log(`listen httpApi: http://127.0.0.1:${port}`);
        resolve(port);
      });
    });
  };

  const stop = async () => httpTerminator.terminate();

  return {
    start,
    stop,
  };
};

async function createEventV2(
  req: http.IncomingMessage,
  url: URL,
  match: {
    method: NonNullable<MethodMatchResult>;
    path: NonNullable<PathMatchResult>;
  },
): Promise<APIGatewayProxyEventV2> {
  // 매칭되었을때만 진입하니까 nullable로 취급해도 된다
  const pathParameters = match.path;
  const method = match.method;

  const rawPath = url.pathname;

  // querystring에서 ? 를 제외해야한다
  const rawQueryString = url.search.substring(1, url.search.length);

  const bodyBuffer = await helpers.getBody(req);
  const body =
    bodyBuffer.byteLength > 0 ? bodyBuffer.toString("utf-8") : undefined;

  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([key, value]) => {
      return [key, value?.toString()] as const;
    }),
  );

  const cookies = req.headers["cookie"]
    ? req.headers["cookie"].split(";").map((x) => x.trim())
    : undefined;

  const queryStringParameters: Record<string, string> = {};
  for (const key of url.searchParams.keys()) {
    const value = url.searchParams.getAll(key);
    queryStringParameters[key] = value.join(",");
  }

  const userAgent = req.headers["user-agent"];
  const sourceIp = helpers.parseIp(req);

  const timeEpoch = new Date();
  const requestContext: APIGatewayEventRequestContextV2 = {
    accountId: "123456789012",
    apiId: "private",
    domainName: "localhost",
    domainPrefix: "TODO",
    http: {
      method,
      path: rawPath,
      protocol: url.protocol.replace(":", ""),
      sourceIp: sourceIp ?? "1.2.3.4",
      userAgent: userAgent ?? "",
    },
    requestId: helpers.createUniqueId(),
    routeKey: "TODO",
    stage: "local",
    time: timeEpoch.toISOString(),
    timeEpoch: timeEpoch.getTime(),
  };

  // https://docs.aws.amazon.com/ko_kr/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
  const event: APIGatewayProxyEventV2 = {
    version: "2.0",
    routeKey: "$default",
    rawPath,
    rawQueryString,
    headers,
    cookies,
    queryStringParameters,
    pathParameters,
    body,
    isBase64Encoded: false,
    requestContext,
  };

  return event;
}
