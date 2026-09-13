import { ExpressionError } from "./error";

export type TokenKind =
  | "number"
  | "string"
  | "ident"
  | "("
  | ")"
  | "["
  | "]"
  | ","
  | "?"
  | ":"
  | "."
  | "?."
  | "??"
  | "||"
  | "&&"
  | "!"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "==="
  | "!=="
  | "=="
  | "!="
  | "<="
  | ">="
  | "<"
  | ">"
  | "eof";

export type Token = {
  kind: TokenKind;
  start: number;
  value?: string | number;
};

const THREE: Array<[string, TokenKind]> = [
  ["===", "==="],
  ["!==", "!=="],
];

const TWO: Array<[string, TokenKind]> = [
  ["?.", "?."],
  ["??", "??"],
  ["||", "||"],
  ["&&", "&&"],
  ["==", "=="],
  ["!=", "!="],
  ["<=", "<="],
  [">=", ">="],
];

const ONE = new Set(["(", ")", "[", "]", ",", "?", ":", ".", "!", "+", "-", "*", "/", "%", "<", ">"]);

function isIdentStart(ch: string): boolean {
  return ch === "$" || /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function readString(src: string, start: number): { token: Token; next: number } {
  const quote = src[start];
  let i = start + 1;
  let out = "";
  while (i < src.length) {
    const ch = src[i];
    if (ch === quote) {
      return { token: { kind: "string", start, value: out }, next: i + 1 };
    }
    if (ch === "\\") {
      const next = src[i + 1];
      if (next == null) break;
      const escaped =
        next === "n" ? "\n" : next === "t" ? "\t" : next === "r" ? "\r" : next === "\\" || next === quote ? next : next;
      out += escaped;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  throw new ExpressionError("Unterminated string", start);
}

function readNumber(src: string, start: number): { token: Token; next: number } {
  let i = start;
  if (src[i] === ".") {
    i += 1;
    if (!/\d/.test(src[i] ?? "")) throw new ExpressionError("Invalid number", start);
  }
  while (/\d/.test(src[i] ?? "")) i += 1;
  if (src[i] === "." && /\d/.test(src[i + 1] ?? "")) {
    i += 1;
    while (/\d/.test(src[i] ?? "")) i += 1;
  }
  if (src[i] === "e" || src[i] === "E") {
    i += 1;
    if (src[i] === "+" || src[i] === "-") i += 1;
    if (!/\d/.test(src[i] ?? "")) throw new ExpressionError("Invalid number exponent", start);
    while (/\d/.test(src[i] ?? "")) i += 1;
  }
  const raw = src.slice(start, i);
  return { token: { kind: "number", start, value: Number(raw) }, next: i };
}

export function tokenize(src: string): Token[] {
  if (src.length > 8_000) throw new ExpressionError("Expression is too long");
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const read = readString(src, i);
      tokens.push(read.token);
      i = read.next;
      continue;
    }
    if (/\d/.test(ch) || (ch === "." && /\d/.test(src[i + 1] ?? ""))) {
      const read = readNumber(src, i);
      tokens.push(read.token);
      i = read.next;
      continue;
    }
    if (isIdentStart(ch)) {
      let end = i + 1;
      while (isIdentPart(src[end] ?? "")) end += 1;
      tokens.push({ kind: "ident", start: i, value: src.slice(i, end) });
      i = end;
      continue;
    }
    const three = THREE.find(([op]) => src.startsWith(op, i));
    if (three) {
      tokens.push({ kind: three[1], start: i });
      i += 3;
      continue;
    }
    const two = TWO.find(([op]) => src.startsWith(op, i));
    if (two) {
      tokens.push({ kind: two[1], start: i });
      i += 2;
      continue;
    }
    if (ONE.has(ch)) {
      tokens.push({ kind: ch as TokenKind, start: i });
      i += 1;
      continue;
    }
    throw new ExpressionError(`Unexpected character ${JSON.stringify(ch)}`, i);
  }
  tokens.push({ kind: "eof", start: src.length });
  if (tokens.length > 500) throw new ExpressionError("Expression has too many tokens");
  return tokens;
}
