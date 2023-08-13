import http from "http";
import {
  APIGatewayProxyHandler,
  APIGatewayProxyWebsocketHandlerV2,
  ScheduledHandler,
} from "aws-lambda";

export type AwsApiHandler = http.RequestListener;

export type FunctionEvent_WebSocket = {
  route: "$connect" | "$disconnect" | "$default";
};

export type FunctionEvent_Schedule = {
  enabled?: boolean;
  // cron format
  rate: string;
  input?: { [key: string]: unknown };
};

export type FunctionEvent = {
  websocket?: FunctionEvent_WebSocket;
  schedule?: FunctionEvent_Schedule;
};

export type FunctionHandler =
  | APIGatewayProxyHandler
  | APIGatewayProxyWebsocketHandlerV2
  | ScheduledHandler;

export type FunctionDefinition = {
  handler: FunctionHandler;
  events: FunctionEvent[];
};
