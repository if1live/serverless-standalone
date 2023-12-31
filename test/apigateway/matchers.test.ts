import * as R from "remeda";
import { assert, describe, it } from "vitest";
import {
  MethodMatcher,
  PathMatcher,
  PathMatcher_Exact,
  PathMatcher_Node,
} from "../../src/apigateway/matchers.js";

describe("MethodMatcher", () => {
  describe("any", () => {
    const matcher = MethodMatcher.build("ANY");

    it("match", () => {
      assert.equal(MethodMatcher.match(matcher, "GET"), "GET");
      assert.equal(MethodMatcher.match(matcher, "POST"), "POST");
    });
  });

  describe("exact", () => {
    const matcher = MethodMatcher.build("GET");

    it("match", () => {
      assert.equal(MethodMatcher.match(matcher, "GET"), "GET");
    });

    it("not match", () => {
      assert.equal(MethodMatcher.match(matcher, "POST"), null);
    });
  });
});

describe("PathMatcher#match", () => {
  describe("exact", () => {
    const matcher = PathMatcher.build("/pets/dog/1");

    it("match", () => {
      assert.deepEqual(PathMatcher.match(matcher, "/pets/dog/"), null);
      assert.deepEqual(PathMatcher.match(matcher, "/pets/dog/1"), {});
      assert.deepEqual(PathMatcher.match(matcher, "/pets/dog/1/"), null);
    });
  });

  describe("fixed argument", () => {
    const matcher = PathMatcher.build("/pets/dog/{id}");

    it("match", () => {
      assert.deepEqual(PathMatcher.match(matcher, "/pets/dog/"), null);
      assert.deepEqual(PathMatcher.match(matcher, "/pets/dog/1"), { id: "1" });
      assert.deepEqual(PathMatcher.match(matcher, "/pets/dog/1/"), null);
    });
  });

  describe("variadic argument", () => {
    const matcher = PathMatcher.build("/pets/{proxy+}");
    const match = (input: string) => PathMatcher.match(matcher, input);

    it("match", () => {
      assert.deepEqual(match("/pets"), null);
      assert.deepEqual(match("/pets/"), { proxy: "" });
      assert.deepEqual(match("/pets/dog"), { proxy: "dog" });
      assert.deepEqual(match("/pets/dog/"), { proxy: "dog/" });
      assert.deepEqual(match("/pets/dog/1"), { proxy: "dog/1" });
      assert.deepEqual(match("/pets/dog/1/"), { proxy: "dog/1/" });
    });
  });
});

describe("PathMatcher#sort", () => {
  describe("by tag", () => {
    // GET /pets/dog/1
    const m_exact: PathMatcher_Exact = {
      _tag: "exact",
      path: "/pets/dog/1",
    };

    // GET /pets/dog/{id}
    const m_fixed: PathMatcher_Node = {
      _tag: "node",
      nodes: [
        { _tag: "slash" },
        { _tag: "constant", value: "pets" },
        { _tag: "slash" },
        { _tag: "constant", value: "dogs" },
        { _tag: "fixed_argument", identifier: "id" },
      ],
    };

    // GET /pets/{proxy+}
    const m_variadic: PathMatcher_Node = {
      _tag: "node",
      nodes: [
        { _tag: "slash" },
        { _tag: "constant", value: "pets" },
        { _tag: "slash" },
        { _tag: "variadic_argument", identifier: "proxy" },
      ],
    };

    const matchers = R.shuffle([m_exact, m_fixed, m_variadic]);

    it("sort", () => {
      const sortedList = PathMatcher.toSorted(matchers);
      assert.deepEqual(sortedList[0], m_exact);
      assert.deepEqual(sortedList[1], m_fixed);
      assert.deepEqual(sortedList[2], m_variadic);
    });
  });

  describe("by length", () => {
    const m_a: PathMatcher_Exact = { _tag: "exact", path: "/1" };
    const m_b: PathMatcher_Exact = { _tag: "exact", path: "/1/2" };
    const m_c: PathMatcher_Exact = { _tag: "exact", path: "/1/2/3" };
    const matchers = R.shuffle([m_a, m_b, m_c]);

    it("sort", () => {
      const sortedList = PathMatcher.toSorted(matchers);
      assert.deepEqual(sortedList[0], m_c);
      assert.deepEqual(sortedList[1], m_b);
      assert.deepEqual(sortedList[2], m_a);
    });
  });
});
