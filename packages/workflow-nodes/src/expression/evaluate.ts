import type { Expr } from "./ast";
import { ExpressionError } from "./error";
import { parseExpression } from "./parse";

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

const STRING_METHODS = new Set([
  "toLowerCase",
  "toUpperCase",
  "trim",
  "trimStart",
  "trimEnd",
  "includes",
  "startsWith",
  "endsWith",
  "indexOf",
  "lastIndexOf",
  "slice",
  "substring",
  "replace",
  "replaceAll",
  "split",
  "concat",
  "repeat",
  "padStart",
  "padEnd",
  "charAt",
  "toString",
]);

const NUMBER_METHODS = new Set(["toFixed", "toPrecision", "toString"]);

const ARRAY_METHODS = new Set(["includes", "indexOf", "join", "slice", "concat", "at", "toString"]);

type EvalEnv = Record<string, unknown>;

function mathGlobals() {
  return Object.freeze({
    abs: Math.abs,
    min: Math.min,
    max: Math.max,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    pow: Math.pow,
    sqrt: Math.sqrt,
  });
}

function jsonGlobals() {
  return Object.freeze({
    stringify: (value: unknown) => JSON.stringify(value),
    parse: (value: unknown) => JSON.parse(String(value)),
  });
}

export function buildExpressionEnv(scope: Record<string, unknown>): EvalEnv {
  const env = Object.create(null) as EvalEnv;
  const now = new Date();
  const json =
    scope.$json && typeof scope.$json === "object"
      ? scope.$json
      : scope;
  Object.assign(env, scope, {
    Number,
    String,
    Boolean,
    Math: mathGlobals(),
    JSON: jsonGlobals(),
    $json: json,
    json: scope.json ?? json,
    $now: scope.$now ?? now.toISOString(),
    $today: scope.$today ?? now.toISOString().slice(0, 10),
    $execution: scope.$execution ?? {},
    $workflow: scope.$workflow ?? {},
  });
  return env;
}

export function evaluateExpression(src: string, scope: Record<string, unknown>): unknown {
  const trimmed = src.trim();
  if (!trimmed) return undefined;
  const ast = parseExpression(trimmed);
  return evalNode(ast, buildExpressionEnv(scope), 0);
}

function evalNode(node: Expr, env: EvalEnv, depth: number): unknown {
  if (depth > 64) throw new ExpressionError("Expression is too deeply nested");
  switch (node.type) {
    case "literal":
      return node.value;
    case "ident":
      return Object.hasOwn(env, node.name) ? env[node.name] : undefined;
    case "member": {
      const object = evalNode(node.object, env, depth + 1);
      if (object == null) return undefined;
      return getProperty(object, node.property);
    }
    case "index": {
      const object = evalNode(node.object, env, depth + 1);
      if (object == null) return undefined;
      return getProperty(object, evalNode(node.index, env, depth + 1));
    }
    case "call": {
      const callee = evalNode(node.callee, env, depth + 1);
      if (callee == null) return undefined;
      if (typeof callee !== "function") throw new ExpressionError("Value is not a function");
      const args = node.args.map((arg) => evalNode(arg, env, depth + 1));
      return callee(...args);
    }
    case "unary": {
      const value = evalNode(node.argument, env, depth + 1);
      if (node.op === "!") return !value;
      if (node.op === "typeof") return typeof value;
      if (node.op === "+") return Number(value);
      return -Number(value);
    }
    case "binary":
      return evalBinary(node.op, node.left, node.right, env, depth);
    case "ternary":
      return evalNode(node.test, env, depth + 1)
        ? evalNode(node.consequent, env, depth + 1)
        : evalNode(node.alternate, env, depth + 1);
    case "array":
      return node.elements.map((el) => evalNode(el, env, depth + 1));
    default:
      throw new ExpressionError("Unsupported expression");
  }
}

function evalBinary(op: string, leftNode: Expr, rightNode: Expr, env: EvalEnv, depth: number): unknown {
  if (op === "&&") {
    const left = evalNode(leftNode, env, depth + 1);
    return left ? evalNode(rightNode, env, depth + 1) : left;
  }
  if (op === "||") {
    const left = evalNode(leftNode, env, depth + 1);
    return left ? left : evalNode(rightNode, env, depth + 1);
  }
  if (op === "??") {
    const left = evalNode(leftNode, env, depth + 1);
    return left == null ? evalNode(rightNode, env, depth + 1) : left;
  }
  const left = evalNode(leftNode, env, depth + 1);
  const right = evalNode(rightNode, env, depth + 1);
  switch (op) {
    case "===":
      return left === right;
    case "!==":
      return left !== right;
    case "==":
      return left == right;
    case "!=":
      return left != right;
    case "<":
      return (left as number) < (right as number);
    case ">":
      return (left as number) > (right as number);
    case "<=":
      return (left as number) <= (right as number);
    case ">=":
      return (left as number) >= (right as number);
    case "+":
      if (typeof left === "string" || typeof right === "string") return String(left) + String(right);
      return Number(left) + Number(right);
    case "-":
      return Number(left) - Number(right);
    case "*":
      return Number(left) * Number(right);
    case "/":
      return Number(left) / Number(right);
    case "%":
      return Number(left) % Number(right);
    default:
      throw new ExpressionError(`Unsupported operator ${op}`);
  }
}

function getProperty(target: unknown, key: unknown): unknown {
  const name = String(key);
  if (FORBIDDEN.has(name)) return undefined;
  if (target == null) return undefined;

  if (typeof target === "string") {
    if (name === "length") return target.length;
    if (STRING_METHODS.has(name)) {
      const method = (target as unknown as Record<string, unknown>)[name];
      if (typeof method === "function") return method.bind(target);
    }
    return undefined;
  }

  if (typeof target === "number") {
    if (NUMBER_METHODS.has(name)) {
      const method = (target as unknown as Record<string, unknown>)[name];
      if (typeof method === "function") return method.bind(target);
    }
    return undefined;
  }

  if (typeof target === "boolean") {
    if (name === "toString") return target.toString.bind(target);
    return undefined;
  }

  if (Array.isArray(target)) {
    if (name === "length") return target.length;
    if (ARRAY_METHODS.has(name)) {
      const method = (target as unknown as Record<string, unknown>)[name];
      if (typeof method === "function") return method.bind(target);
    }
    const index = typeof key === "number" ? key : Number(name);
    if (Number.isInteger(index) && index >= 0) return target[index];
    return undefined;
  }

  if (typeof target === "function") {
    if (Object.hasOwn(target, name)) return (target as unknown as Record<string, unknown>)[name];
    return undefined;
  }

  if (typeof target === "object") {
    if (!Object.hasOwn(target, name)) return undefined;
    return (target as Record<string, unknown>)[name];
  }

  return undefined;
}
