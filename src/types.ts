import http from "node:http";
import {
  APIGatewayProxyHandler,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyWebsocketHandlerV2,
  Context,
  IoTHandler,
  SQSHandler,
  ScheduledHandler,
} from "aws-lambda";

export type AwsApiHandler = http.RequestListener;

export interface FunctionEvent_Base {
  enabled?: boolean;
}

export interface FunctionEvent_WebSocket extends FunctionEvent_Base {
  route: "$connect" | "$disconnect" | "$default";
}

export interface FunctionEvent_Schedule extends FunctionEvent_Base {
  // cron format
  rate: string;
  input?: { [key: string]: unknown };
}

export interface FunctionEvent_IoT extends FunctionEvent_Base {
  /** @example "SELECT * FROM 'some_topic'" */
  sql: string;
}

export type HttpMethod =
  | "*"
  | "ANY"
  | "GET"
  | "POST"
  | "DELETE"
  | "PATCH"
  | "PUT"
  | "OPTIONS"
  | "HEAD";

export type HttpPath = `/${string}`;

// method, path 묶어서 관리하고 싶다
export type HttpRoute = `${HttpMethod} ${HttpPath}`;

// HTTP API만 지원해도 충분할듯
export interface FunctionEvent_ApiGatewayProxyV2 extends FunctionEvent_Base {
  route: HttpRoute;
}

export interface FunctionEvent_SQS extends FunctionEvent_Base {
  arn?: string;
  queueName: string;
  batchSize?: number;
}

export type FunctionEvent = {
  httpApi?: FunctionEvent_ApiGatewayProxyV2;
  websocket?: FunctionEvent_WebSocket;
  schedule?: FunctionEvent_Schedule;
  iot?: FunctionEvent_IoT;
  sqs?: FunctionEvent_SQS;
};

export type UnknownHandler = (event: any, context: Context) => Promise<any>;

export type FunctionHandler =
  | APIGatewayProxyHandler
  | APIGatewayProxyHandlerV2
  | APIGatewayProxyWebsocketHandlerV2
  | IoTHandler
  | SQSHandler
  | ScheduledHandler
  | UnknownHandler;

export type FunctionDefinition = {
  name: string;
  handler: FunctionHandler;
  events: FunctionEvent[];
};

export const castFunctionDefinition = <T>(x: FunctionDefinition) => {
  return {
    name: x.name,
    events: x.events,
    handler: x.handler as T,
  };
};
