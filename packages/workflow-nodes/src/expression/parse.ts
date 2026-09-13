import type { Expr } from "./ast";
import { ExpressionError } from "./error";
import { tokenize, type Token, type TokenKind } from "./tokenize";

const UNARY_OPS = new Set(["!", "+", "-"]);

export function parseExpression(src: string): Expr {
  const tokens = tokenize(src);
  const parser = new Parser(tokens);
  const expr = parser.parseTernary();
  parser.expect("eof");
  return expr;
}

class Parser {
  private i = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.i] ?? this.tokens[this.tokens.length - 1]!;
  }

  private eat(kind?: TokenKind): Token {
    const token = this.peek();
    if (kind && token.kind !== kind) {
      throw new ExpressionError(`Expected ${kind} but found ${token.kind}`, token.start);
    }
    this.i += 1;
    return token;
  }

  parseTernary(): Expr {
    const test = this.parseNullishOr();
    if (this.peek().kind !== "?") return test;
    this.eat("?");
    const consequent = this.parseTernary();
    this.expect(":");
    const alternate = this.parseTernary();
    return { type: "ternary", test, consequent, alternate };
  }

  private parseNullishOr(): Expr {
    let left = this.parseAnd();
    let seen: "||" | "??" | null = null;
    while (this.peek().kind === "||" || this.peek().kind === "??") {
      const op = this.peek().kind as "||" | "??";
      if (seen && seen !== op) {
        throw new ExpressionError("Mix || and ?? only with parentheses", this.peek().start);
      }
      seen = op;
      this.eat();
      left = { type: "binary", op, left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseEquality();
    while (this.peek().kind === "&&") {
      this.eat();
      left = { type: "binary", op: "&&", left, right: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): Expr {
    let left = this.parseRelational();
    while (
      this.peek().kind === "===" ||
      this.peek().kind === "!==" ||
      this.peek().kind === "==" ||
      this.peek().kind === "!="
    ) {
      const op = this.eat().kind;
      left = { type: "binary", op, left, right: this.parseRelational() };
    }
    return left;
  }

  private parseRelational(): Expr {
    let left = this.parseAdd();
    while (
      this.peek().kind === "<" ||
      this.peek().kind === ">" ||
      this.peek().kind === "<=" ||
      this.peek().kind === ">="
    ) {
      const op = this.eat().kind;
      left = { type: "binary", op, left, right: this.parseAdd() };
    }
    return left;
  }

  private parseAdd(): Expr {
    let left = this.parseMul();
    while (this.peek().kind === "+" || this.peek().kind === "-") {
      const op = this.eat().kind;
      left = { type: "binary", op, left, right: this.parseMul() };
    }
    return left;
  }

  private parseMul(): Expr {
    let left = this.parseUnary();
    while (this.peek().kind === "*" || this.peek().kind === "/" || this.peek().kind === "%") {
      const op = this.eat().kind;
      left = { type: "binary", op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Expr {
    const token = this.peek();
    if (UNARY_OPS.has(token.kind)) {
      const op = this.eat().kind as "!" | "+" | "-";
      return { type: "unary", op, argument: this.parseUnary() };
    }
    if (token.kind === "ident" && token.value === "typeof") {
      this.eat();
      return { type: "unary", op: "typeof", argument: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let node = this.parsePrimary();
    for (;;) {
      const token = this.peek();
      if (token.kind === "." || token.kind === "?.") {
        const optional = token.kind === "?.";
        this.eat();
        if (optional && this.peek().kind === "[") {
          this.eat();
          const index = this.parseTernary();
          this.expect("]");
          node = { type: "index", object: node, index, optional: true };
          continue;
        }
        const name = this.eat("ident");
        node = { type: "member", object: node, property: String(name.value ?? ""), optional };
        continue;
      }
      if (token.kind === "[") {
        this.eat();
        const index = this.parseTernary();
        this.expect("]");
        node = { type: "index", object: node, index, optional: false };
        continue;
      }
      if (token.kind === "(") {
        this.eat();
        const args: Expr[] = [];
        if (this.peek().kind !== ")") {
          args.push(this.parseTernary());
          while (this.peek().kind === ",") {
            this.eat();
            if (this.peek().kind === ")") break;
            args.push(this.parseTernary());
          }
        }
        if (args.length > 8) throw new ExpressionError("Too many arguments", token.start);
        this.expect(")");
        node = { type: "call", callee: node, args };
        continue;
      }
      break;
    }
    return node;
  }

  private parsePrimary(): Expr {
    const token = this.peek();
    if (token.kind === "number") {
      this.eat();
      return { type: "literal", value: token.value };
    }
    if (token.kind === "string") {
      this.eat();
      return { type: "literal", value: token.value };
    }
    if (token.kind === "ident") {
      this.eat();
      const name = String(token.value ?? "");
      if (name === "true") return { type: "literal", value: true };
      if (name === "false") return { type: "literal", value: false };
      if (name === "null") return { type: "literal", value: null };
      if (name === "undefined") return { type: "literal", value: undefined };
      return { type: "ident", name };
    }
    if (token.kind === "(") {
      this.eat();
      const expr = this.parseTernary();
      this.expect(")");
      return expr;
    }
    if (token.kind === "[") {
      this.eat();
      const elements: Expr[] = [];
      if (this.peek().kind !== "]") {
        elements.push(this.parseTernary());
        while (this.peek().kind === ",") {
          this.eat();
          if (this.peek().kind === "]") break;
          elements.push(this.parseTernary());
        }
      }
      this.expect("]");
      return { type: "array", elements };
    }
    throw new ExpressionError(`Unexpected token ${token.kind}`, token.start);
  }

  expect(kind: TokenKind): Token {
    return this.eat(kind);
  }
}
