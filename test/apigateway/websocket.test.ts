import { faker } from "@faker-js/faker";
import { APIGatewayProxyHandler } from "aws-lambda";
import { assert, afterAll, beforeAll, describe, it } from "vitest";
import WebSocket from "ws";
import { create } from "../../src/apigateway/websocket.js";
import { FunctionDefinition } from "../../src/types.js";

const createFn_status = (status: number): APIGatewayProxyHandler => {
  return async (event, context) => {
    return { statusCode: status, body: "OK" };
  };
};

const fn_status_200 = createFn_status(200);
const fn_status_401 = createFn_status(401);

const createDefinition = (
  fn: APIGatewayProxyHandler,
  route: "$connect" | "$disconnect" | "$default",
): FunctionDefinition => {
  return {
    name: fn.constructor.name,
    events: [{ websocket: { route } }],
    handler: fn,
  };
};

const createFn_exc = (message: string): APIGatewayProxyHandler => {
  return async (event, context) => {
    throw new Error(message);
  };
};
const fn_exc_foo = createFn_exc("foo");

type Result_T<TTag, TEvent> = {
  type: TTag;
  evt: TEvent;
};

type Result_Open = Result_T<"open", WebSocket.Event>;
type Result_Error = Result_T<"error", WebSocket.ErrorEvent>;
type Result_Close = Result_T<"close", WebSocket.CloseEvent>;
type Result_Message = Result_T<"message", WebSocket.MessageEvent>;

type Result = Result_Open | Result_Error | Result_Close | Result_Message;

describe("websocket.connect", () => {
  const port = faker.internet.port();

  async function connect(port: number): Promise<Result> {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const promise_onopen = new Promise<Result_Open>((resolve) => {
      ws.onopen = (evt) => resolve({ type: "open", evt });
    });
    const promise_onclose = new Promise<Result_Close>((resolve) => {
      ws.onclose = (evt) => resolve({ type: "close", evt });
    });
    const promise_onerror = new Promise<Result_Error>((resolve) => {
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
    const functions = [createDefinition(fn_status_200, "$connect")];
    const { start, stop } = create(functions, { port });

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
    const functions = [createDefinition(fn_status_401, "$connect")];
    const { start, stop } = create(functions, { port });

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
    const functions = [createDefinition(fn_exc_foo, "$connect")];
    const { start, stop } = create(functions, { port });

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

describe("websocket.default", () => {
  const port = faker.internet.port();

  describe("2xx", () => {
    const functions = [createDefinition(fn_status_200, "$default")];
    const { start, stop } = create(functions, { port });

    beforeAll(async () => {
      await start();
    });
    afterAll(async () => {
      await stop();
    });

    it("message: ok", async () => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      await new Promise((resolve) => {
        ws.onopen = () => {
          ws.send("hello");
          resolve(true);
        };
      });

      // 연결 상태 유지
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });
  });

  describe("4xx", () => {
    const functions = [createDefinition(fn_status_401, "$default")];
    const { start, stop } = create(functions, { port });

    beforeAll(async () => {
      await start();
    });
    afterAll(async () => {
      await stop();
    });

    it("message: ok", async () => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      await new Promise((resolve) => {
        ws.onopen = () => {
          ws.send("hello");
          resolve(true);
        };
      });

      // 연결 상태 유지
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });
  });

  describe("throw", () => {
    const functions = [createDefinition(fn_exc_foo, "$default")];
    const { start, stop } = create(functions, { port });

    beforeAll(async () => {
      await start();
    });
    afterAll(async () => {
      await stop();
    });

    it("message", async () => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.onopen = () => ws.send("hello");

      const promise_message = new Promise<Result_Message>((resolve) => {
        ws.onmessage = (evt) => resolve({ type: "message", evt });
      });
      const promise_close = new Promise<Result_Close>((resolve) => {
        ws.onclose = (evt) => resolve({ type: "close", evt });
      });
      const promise_error = new Promise<Result_Error>((resolve) => {
        ws.onerror = (evt) => resolve({ type: "error", evt });
      });

      const result = await Promise.race([
        promise_message,
        promise_close,
        promise_error,
      ]);

      if (result.type !== "message") {
        assert.fail();
      }

      const text = result.evt.data;
      const json = JSON.parse(text as string);
      assert.strictEqual(json.message, "Internal server error");
      assert.strictEqual(typeof json.connectionId, "string");
      assert.strictEqual(typeof json.requestId, "string");

      // 연결 상태 유지
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });
  });
});
