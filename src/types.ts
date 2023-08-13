import http from "http";
import {
  APIGatewayProxyHandler,
  APIGatewayProxyWebsocketHandlerV2,
} from "aws-lambda";

export type AwsApiHandler = http.RequestListener;

export type FunctionEvent = {
  websocket?: {
    route: "$connect" | "$disconnect" | "$default";
  };
};

export type FunctionHandler =
  | APIGatewayProxyHandler
  | APIGatewayProxyWebsocketHandlerV2;

export type FunctionDefinition = {
  handler: FunctionHandler;
  events: FunctionEvent[];
};
