import { HttpMethod } from "../types.js";
import * as R from "remeda";

export type MethodMatcher_Exact = {
  _tag: "exact";
  method: string;
};

export type MethodMatcher_Any = {
  _tag: "any";
};

export type MethodMatcher = MethodMatcher_Exact | MethodMatcher_Any;

const method_build = (method: HttpMethod): MethodMatcher => {
  switch (method) {
    case "*":
    case "ANY": {
      return {
        _tag: "any",
      };
    }
    default: {
      return {
        _tag: "exact",
        method,
      };
    }
  }
};

const method_match = (self: MethodMatcher, method: string): boolean => {
  switch (self._tag) {
    case "any":
      return true;
    case "exact":
      return self.method === method;
  }
};

export const MethodMatcher = {
  build: method_build,
  match: method_match,
};

export type PathMatcher_Exact = {
  _tag: "exact";
  path: string;
};

// https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-routes.html
export type PathMatcher_Node = {
  _tag: "node";
  nodes: PathNode[];
};

export type PathMatcher = PathMatcher_Exact | PathMatcher_Node;

const path_build = (path: string): PathMatcher => {
  if (!path.includes("{") && !path.includes("}")) {
    return path_build_exact(path);
  } else {
    return path_build_node(path);
  }
};

const path_build_exact = (path: string): PathMatcher_Exact => {
  return {
    _tag: "exact",
    path,
  };
};

const path_build_node = (path: string): PathMatcher_Node => {
  const parse_token = (input: string): PathNode => {
    // 예외처리 없이 멍청하게 구현
    if (input.endsWith("+}")) {
      const identifier = input.replace("{", "").replace("+}", "");
      return {
        _tag: "variadic_argument",
        identifier,
      };
    } else if (input.endsWith("}")) {
      const identifier = input.replace("{", "").replace("}", "");
      return {
        _tag: "fixed_argument",
        identifier,
      };
    } else {
      return {
        _tag: "constant",
        value: input,
      };
    }
  };

  const slash: PathNode_Slash = { _tag: "slash" };
  // path는 항상 /로 시작하니까 첫글자는 로직에서 떼도 된다
  const tokens = path.substring(1, path.length).split("/");

  const nodes: PathNode[] = [];
  for (const token of tokens) {
    nodes.push(slash);

    if (token.length > 0) {
      const node = parse_token(token);
      nodes.push(node);
    }
  }
  return {
    _tag: "node",
    nodes,
  };
};

type PathMatchResult = { [key: string]: string } | null;
const path_match = (self: PathMatcher, path: string): PathMatchResult => {
  switch (self._tag) {
    case "exact":
      return path_match_exact(self, path);
    case "node":
      return path_match_node(self, path);
    default:
      return null;
  }
};

const path_match_exact = (
  self: PathMatcher_Exact,
  path: string,
): PathMatchResult => {
  if (self.path === path) {
    return {};
  }
  return null;
};

const path_match_node = (
  self: PathMatcher_Node,
  path: string,
): PathMatchResult => {
  const { nodes: nodes_input } = path_build_node(path);
  const { nodes: nodes_matcher } = self;

  const result: { [key: string]: string } = {};
  for (const node_matcher of nodes_matcher) {
    if (node_matcher._tag === "constant") {
      const node_input = nodes_input.shift();
      const m = R.equals(node_input, node_matcher);
      if (!m) {
        return null;
      }
    } else if (node_matcher._tag === "slash") {
      const node_input = nodes_input.shift();
      const m = R.equals(node_input, node_matcher);
      if (!m) {
        return null;
      }
    } else if (node_matcher._tag === "fixed_argument") {
      const node_input = nodes_input.shift();
      if (node_input?._tag === "constant") {
        result[node_matcher.identifier] = node_input.value;
      } else {
        return null;
      }
    } else if (node_matcher._tag === "variadic_argument") {
      // 남은 입력토큰을 전부 사용한다
      const nodes = [];
      while (nodes_input.length > 0) {
        const x = nodes_input.shift();
        nodes.push(x!);
      }

      const tokens = nodes
        .map((x) => {
          switch (x._tag) {
            case "constant":
              return x.value;
            case "slash":
              return "/";
            default:
              return null;
          }
        })
        .filter(R.isNonNull);
      const rest = tokens.join("");

      if (rest) {
        result[node_matcher.identifier] = rest;
      } else {
        return null;
      }
    } else {
      node_matcher satisfies never;
    }
  }

  // 처리되지 않은 토큰이 있으면 매칭 실패
  if (nodes_input.length > 0) {
    return null;
  }

  return result;
};

const path_toSorted = (list: PathMatcher[]): PathMatcher[] => {
  return [...list].sort(path_compare);
};

const path_compare = (a: PathMatcher, b: PathMatcher) => {
  const calculate_prior = (m: PathMatcher) => {
    if (m._tag === "exact") {
      return 1;
    } else {
      const hasVariadic = m.nodes.some((x) => x._tag === "variadic_argument");
      return hasVariadic ? 3 : 2;
    }
  };

  const prior_a = calculate_prior(a);
  const prior_b = calculate_prior(b);
  return prior_a - prior_b;
};

export const PathMatcher = {
  build: path_build,
  match: path_match,
  toSorted: path_toSorted,
  compare: path_compare,
};

/**
 * URL이 /로 끝나는지 확인하는 쉬운 방법은 /도 토큰으로 취급하는거
 * GET /pets/dog/{id}
 *     -
 */
export type PathNode_Slash = {
  _tag: "slash";
};

/**
 * GET /pets/dog/{id}
 *      ----
 */
export type PathNode_Constant = {
  _tag: "constant";
  value: string;
};

/**
 * GET /pets/dog/{id}
 *               ----
 */
export type PathNode_FixedArgument = {
  _tag: "fixed_argument";
  identifier: string;
};

/**
 * GET /pets/{proxy+}
 *           --------
 */
export type PathNode_VariadicArgument = {
  _tag: "variadic_argument";
  identifier: string;
};

export type PathNode =
  | PathNode_Slash
  | PathNode_Constant
  | PathNode_FixedArgument
  | PathNode_VariadicArgument;
