import { FunctionEvent_ApiGatewayProxyV2 } from "../types.js";

export type MethodMatcher_Exact = {
  _tag: "exact";
  method: string;
};

export type MethodMatcher_Any = {
  _tag: "any";
};

export type MethodMatcher = MethodMatcher_Exact | MethodMatcher_Any;

const method_build = (
  method: FunctionEvent_ApiGatewayProxyV2["method"],
): MethodMatcher => {
  switch (method) {
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

const method_match = (
  self: MethodMatcher,
  method: FunctionEvent_ApiGatewayProxyV2["method"],
): boolean => {
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
    return {
      _tag: "exact",
      path,
    };
  }

  // TODO: parse path
  return {
    _tag: "exact",
    path,
  };
};

const path_match = (
  self: PathMatcher,
  path: string,
): { [key: string]: string } | null => {
  if (self._tag === "exact") {
    if (self.path === path) {
      return {};
    }
  } else if (self._tag === "node") {
    return null;
  }
  // else...
  return null;
};

const path_toSorted = (list: PathMatcher[]): PathMatcher[] => {
  const calculate_prior = (m: PathMatcher) => {
    if (m._tag === "exact") {
      return 1;
    } else {
      const hasVariadic = m.nodes.some((x) => x._tag === "variadic_argument");
      return hasVariadic ? 3 : 2;
    }
  };

  return [...list].sort((a, b) => {
    const prior_a = calculate_prior(a);
    const prior_b = calculate_prior(b);
    return prior_a - prior_b;
  });
};

export const PathMatcher = {
  build: path_build,
  match: path_match,
  toSorted: path_toSorted,
};

/**
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
