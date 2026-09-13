export type Expr =
  | { type: "literal"; value: unknown }
  | { type: "ident"; name: string }
  | { type: "member"; object: Expr; property: string; optional: boolean }
  | { type: "index"; object: Expr; index: Expr; optional: boolean }
  | { type: "call"; callee: Expr; args: Expr[] }
  | { type: "unary"; op: "!" | "+" | "-" | "typeof"; argument: Expr }
  | { type: "binary"; op: string; left: Expr; right: Expr }
  | { type: "ternary"; test: Expr; consequent: Expr; alternate: Expr }
  | { type: "array"; elements: Expr[] };
