import { APIGatewayProxyHandler } from "aws-lambda";
import { describe, it, assert, beforeAll, afterAll } from "vitest";
import { create } from "../../src/apigateway/websocket.js";
import { FunctionDefinition } from "../../src/types.js";
import WebSocket from "ws";

const createFn_status = (status: number): APIGatewayProxyHandler => {
  return async (event, context) => {
    return { statusCode: status, body: "OK" };
  };
};

const fn_status_200 = createFn_status(200);
const fn_status_401 = createFn_status(401);

const createDefinition = (fn: APIGatewayProxyHandler): FunctionDefinition => {
  return {
    name: fn.constructor.name,
    events: [{ websocket: { route: "$connect" } }],
    handler: fn,
  };
};

const createFn_exc = (message: string): APIGatewayProxyHandler => {
  return async (event, context) => {
    throw new Error(message);
  };
};
const fn_exc_foo = createFn_exc("foo");

type WebSocketResult_Open = {
  type: "open";
  evt: WebSocket.Event;
};

type WebSocketResult_Error = {
  type: "error";
  evt: WebSocket.ErrorEvent;
};

type WebSocketResult_Close = {
  type: "close";
  evt: WebSocket.CloseEvent;
};

type WebSocketResult =
  | WebSocketResult_Open
  | WebSocketResult_Error
  | WebSocketResult_Close;

describe("websocket.connect", () => {
  async function connect(port: number): Promise<WebSocketResult> {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const promise_onopen = new Promise<WebSocketResult_Open>((resolve) => {
      ws.onopen = (evt) => resolve({ type: "open", evt });
    });
    const promise_onclose = new Promise<WebSocketResult_Close>((resolve) => {
      ws.onclose = (evt) => resolve({ type: "close", evt });
    });
    const promise_onerror = new Promise<WebSocketResult_Error>((resolve) => {
      ws.onerror = (evt) => resolve({ type: "error", evt });
    });
    const result = await Promise.race([
      promise_onopen,
      promise_onclose,
      promise_onerror,
    ]);
    return result;
  }

  describe("2xx", () => {
    const port = 3000;
    const { start, stop } = create([createDefinition(fn_status_200)], { port });

    beforeAll(async () => {
      await start();
    });
    afterAll(async () => {
      await stop();
    });

    it("connect: ok", async () => {
      const result = await connect(port);
      assert.strictEqual(result.type, "open");
    });
  });

  describe("4xx", () => {
    const port = 3000;
    const { start, stop } = create([createDefinition(fn_status_401)], { port });

    beforeAll(async () => {
      await start();
    });
    afterAll(async () => {
      await stop();
    });

    it("connect: failed", async () => {
      const result = await connect(port);
      if (result.type !== "error") {
        assert.fail();
      }

      const { evt } = result;
      assert.strictEqual(evt.message, "Unexpected server response: 401");
    });
  });

  describe("throw", () => {
    const port = 3000;
    const { start, stop } = create([createDefinition(fn_exc_foo)], { port });

    beforeAll(async () => {
      await start();
    });
    afterAll(async () => {
      await stop();
    });

    it("connect: failed", async () => {
      const result = await connect(port);
      if (result.type !== "error") {
        assert.fail();
      }

      const { evt } = result;
      assert.strictEqual(evt.message, "Unexpected server response: 502");
    });
  });
});
