import http from "http";
import {
  APIGatewayProxyHandler,
  APIGatewayProxyWebsocketHandlerV2,
  IoTHandler,
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

export type FunctionEvent_IoT = {
  enabled?: boolean;

  /** @example "SELECT * FROM 'some_topic'" */
  sql: string;
};

export type FunctionEvent = {
  websocket?: FunctionEvent_WebSocket;
  schedule?: FunctionEvent_Schedule;
  iot?: FunctionEvent_IoT;
};

export type FunctionHandler =
  | APIGatewayProxyHandler
  | APIGatewayProxyWebsocketHandlerV2
  | IoTHandler
  | ScheduledHandler;

export type FunctionDefinition = {
  handler: FunctionHandler;
  events: FunctionEvent[];
};
