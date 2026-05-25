/**
 * Structured JSON logger for Cloudflare Workers.
 * One line per event — compatible with Logpush / Workers Logs filtering.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(event: string, ctx?: LogContext): void;
  info(event: string, ctx?: LogContext): void;
  warn(event: string, ctx?: LogContext): void;
  error(event: string, ctx?: LogContext | Error): void;
}

const SENSITIVE_KEY = /password|secret|token|api[_-]?key|authorization|cookie|credential|sessionid|private/i;

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return redactContext(value as Record<string, unknown>);
  }
  return value;
}

function redactContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

function serializeError(err: Error): Record<string, unknown> {
  return {
    errorName: err.name,
    errorMessage: err.message,
    ...(err.stack ? { stack: err.stack.split('\n').slice(0, 8).join('\n') } : {}),
  };
}

function emit(
  level: LogLevel,
  service: string,
  component: string | undefined,
  event: string,
  ctx?: LogContext | Error,
): void {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    service,
    event,
  };
  if (component) payload.component = component;

  if (ctx instanceof Error) {
    Object.assign(payload, serializeError(ctx));
  } else if (ctx) {
    Object.assign(payload, redactContext(ctx));
  }

  const line = JSON.stringify(payload);
  switch (level) {
    case 'debug':
      console.debug(line);
      break;
    case 'info':
      console.log(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
  }
}

/** Create a scoped logger. Pass component for subsystems (e.g. "auth", "queue"). */
export function createLogger(service: string, component?: string): Logger {
  return {
    debug: (event, ctx) => emit('debug', service, component, event, ctx),
    info: (event, ctx) => emit('info', service, component, event, ctx),
    warn: (event, ctx) => emit('warn', service, component, event, ctx),
    error: (event, ctx) => emit('error', service, component, event, ctx),
  };
}
