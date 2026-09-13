export class ExpressionError extends Error {
  readonly position?: number;

  constructor(message: string, position?: number) {
    super(position != null ? `${message} (column ${position + 1})` : message);
    this.name = "ExpressionError";
    this.position = position;
  }
}
