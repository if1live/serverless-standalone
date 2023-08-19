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

export interface FunctionEvent_WebSocket {
  route: "$connect" | "$disconnect" | "$default";
}

export interface FunctionEvent_Schedule {
  // cron format
  rate: string;
  input?: { [key: string]: unknown };
}

export interface FunctionEvent_IoT {
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
export interface FunctionEvent_ApiGatewayProxyV2 {
  route: HttpRoute;
}

export interface FunctionEvent_SQS {
  arn?: string;
  queueName: string;
  batchSize?: number;
}

export type FunctionEvent = {
  httpApi?: FunctionEvent_ApiGatewayProxyV2 & FunctionEvent_Base;
  websocket?: FunctionEvent_WebSocket & FunctionEvent_Base;
  schedule?: FunctionEvent_Schedule & FunctionEvent_Base;
  iot?: FunctionEvent_IoT & FunctionEvent_Base;
  sqs?: FunctionEvent_SQS & FunctionEvent_Base;
};

export const FunctionEvent = {
  isEnabled(self: FunctionEvent): boolean {
    const keys = Object.keys(self) as Array<keyof FunctionEvent>;
    for (const key of keys) {
      if (self[key]) {
        return self[key]?.enabled ?? true;
      }
    }
    return false;
  },
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

export type FunctionDefinition<
  Handler = FunctionHandler,
  Event = FunctionEvent,
> = {
  name: string;
  handler: Handler;
  events: Event[];
};

declare const fn_sqs: SQSHandler;

export const FunctionDefinition = {
  narrow_event<Handler, Event, Tag extends keyof Event>(
    self: FunctionDefinition<Handler, Event>,
    tag: Tag,
  ): FunctionDefinition<Handler, Pick<Required<Event>, Tag>> {
    const events = self.events
      .filter((x) => x[tag])
      .map((x) => {
        const inner = x[tag] as NonNullable<Event[Tag]>;
        const next = { [tag]: inner } as Pick<Required<Event>, Tag>;
        return next;
      });

    return { ...self, events };
  },

  narrow_handler<HandlerNext, HandlerPrev, TEvent>(
    self: FunctionDefinition<HandlerPrev, TEvent>,
    _next: HandlerNext,
  ): FunctionDefinition<HandlerNext, TEvent> {
    return {
      name: self.name,
      events: self.events,
      handler: self.handler as any as HandlerNext,
    };
  },
  fn_sqs,
};

export const castFunctionDefinition = <T>(x: FunctionDefinition) => {
  return {
    name: x.name,
    events: x.events,
    handler: x.handler as T,
  };
};

export interface ServiceRunner {
  start(): Promise<unknown> | unknown;
  stop(): Promise<unknown> | unknown;
}
