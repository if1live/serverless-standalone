import http from "node:http";
type InvocationType = "RequestResponse" | "Event";

type Action_Invoke = {
  _tag: "invoke";
  functionName: string;
  invocationType: InvocationType;
};

type Action_List = {
  _tag: "list";
};

type Action_Urls = {
  _tag: "urls";
  functionName: string;
};

type Action_EventSourceMappings = {
  _tag: "eventSourceMappings";
  functionName: string;
};

export type Action =
  | Action_Invoke
  | Action_List
  | Action_Urls
  | Action_EventSourceMappings;

type SimpleReq = {
  method: string;
  url: URL;
  headers: http.IncomingHttpHeaders;
};

/** POST /2015-03-31/functions/lambda_simple/invocations */
const re_invoke = /^\/2015-03-31\/functions\/([a-zA-Z0-9_-]+)\/invocations$/;

const parseRequest_invoke = (req: SimpleReq): Action_Invoke | undefined => {
  const m = re_invoke.exec(req.url.pathname);
  if (req.method === "POST" && m) {
    const invocationType = req.headers["x-amz-invocation-type"];

    return {
      _tag: "invoke" as const,
      functionName: m[1] as string,
      invocationType: invocationType as InvocationType,
    };
  }
};

const parseRequest_list = (req: SimpleReq): Action_List | undefined => {
  const target_url = "/2015-03-31/functions";
  if (req.method === "GET" && req.url.pathname === target_url) {
    return {
      _tag: "list" as const,
    };
  }
};

/** GET /2021-10-31/functions/lambda_simple/urls */
const re_urls = /^\/2021-10-31\/functions\/([a-zA-Z0-9_-]+)\/urls$/;

const parseRequest_urls = (req: SimpleReq): Action_Urls | undefined => {
  const m = re_urls.exec(req.url.pathname);
  if (req.method === "GET" && m) {
    return {
      _tag: "urls" as const,
      functionName: m[1] as string,
    };
  }
};

/** GET /2015-03-31/event-source-mappings?FunctionName=lambda_simple NotFound */
const parseRequest_eventSourceMappings = (
  req: SimpleReq,
): Action_EventSourceMappings | undefined => {
  if (req.method !== "GET") {
    return;
  }

  if (req.url.pathname !== "/2015-03-31/event-source-mappings") {
    return;
  }

  const functionName = req.url.searchParams.get("FunctionName");
  if (!functionName) {
    return;
  }

  return {
    _tag: "eventSourceMappings" as const,
    functionName,
  };
};

export const parseRequest = (
  req: Pick<http.IncomingMessage, "method" | "url" | "headers">,
): Action => {
  const url = new URL(`http://localhost${req.url ?? ""}`);
  const req0: SimpleReq = {
    method: req.method ?? "GET",
    url,
    headers: req.headers,
  };

  const result_invoke = parseRequest_invoke(req0);
  if (result_invoke) {
    return result_invoke;
  }

  const result_list = parseRequest_list(req0);
  if (result_list) {
    return result_list;
  }

  const result_urls = parseRequest_urls(req0);
  if (result_urls) {
    return result_urls;
  }

  const result_eventSourceMappings = parseRequest_eventSourceMappings(req0);
  if (result_eventSourceMappings) {
    return result_eventSourceMappings;
  }

  throw new Error("cannot parse lambda request");
};
