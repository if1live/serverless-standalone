import http from "node:http";
import { createHttpTerminator } from "http-terminator";
import {
  APIGatewayEventRequestContextV2,
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  FunctionDefinition,
  FunctionEvent,
  HttpMethod,
  ServiceRunner,
} from "../types.js";
import * as helpers from "../helpers.js";
import {
  MethodMatchResult,
  MethodMatcher,
  PathMatchResult,
  PathMatcher,
} from "./matchers.js";

export interface Options {
  port: number;
}

type MyFunctionDefinition = FunctionDefinition<
  APIGatewayProxyHandlerV2,
  Pick<Required<FunctionEvent>, "httpApi">
>;

export const create = (
  definitions: FunctionDefinition[],
  options: Options,
): ServiceRunner => {
  const { port } = options;

  // 이벤트 중심으로 생각하려고 이벤트-핸들러를 1:1로 맵핑
  const functions: MyFunctionDefinition[] = definitions
    .map((x) => FunctionDefinition.dropDisabledEvent(x))
    .map((x) => FunctionDefinition.narrow_event(x, "httpApi"))
    .map((x) => {
      const fn: APIGatewayProxyHandlerV2 = () => {};
      return FunctionDefinition.narrow_handler(x, fn);
    });

  const mappings = functions
    .flatMap((definition) => {
      return definition.events.map((event) => {
        const tokens = event.httpApi.route.split(" ");
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

    const found = mappings
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
      return handle_notFound(res, functions);
    }

    const event = await createEventV2(req, url, {
      method: found.match_method!,
      path: found.match_path!,
    });

    const awsRequestId = helpers.createUniqueId();
    const context = helpers.generateLambdaContext(found.name, awsRequestId);

    let result: APIGatewayProxyStructuredResultV2;
    try {
      const output = await found.handler(event, context, helpers.emptyCallback);
      result = output as APIGatewayProxyStructuredResultV2;
    } catch (e) {
      console.error(e);
      return handle_exception(res, e);
    }

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

const handle_notFound = (
  res: http.ServerResponse,
  functions: MyFunctionDefinition[],
) => {
  // aws lambda 규격
  const json_standard = {
    message: "Not Found",
  };

  // 추가 정보가 있으면 디버깅에서 편할듯
  // serverless-standalone은 aws lambda와 똑같을 필요가 없다
  const routes = functions.flatMap((x) => {
    return x.events.map((event) => event.httpApi?.route);
  });

  const json_extra = {
    routes,
  };

  const json = {
    ...json_standard,
    ...json_extra,
  };
  return helpers.replyJson(res, 404, json);
};

const handle_exception = (res: http.ServerResponse, e: unknown) => {
  const json_standard = {
    message: "Internal Server Error",
  };

  let json_extra;
  if (e instanceof Error) {
    json_extra = {
      error_name: e.name,
      error_message: e.message,
      stack: (e.stack ?? "").split("\n"),
    };
  } else {
    json_extra = {
      unknown: e,
    };
  }

  const json = {
    ...json_standard,
    ...json_extra,
  };
  return helpers.replyJson(res, 500, json);
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

  const bodyBuffer = await helpers.getBodyBuffer(req);
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
