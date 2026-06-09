import type { N8nNodeParameters, N8nNodeProperty } from "./types";

function paramValue(parameters: N8nNodeParameters, name: string): unknown {
  if (name.startsWith("@")) return undefined;
  return parameters[name];
}

function matchesCondition(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    return expected.some((v) => matchesCondition(v, actual));
  }
  if (typeof actual === "boolean") return actual === expected;
  return String(actual) === String(expected);
}

/** Subset of n8n `displayParameter` — supports displayOptions.show / hide used in our node schemas. */
export function displayParameter(
  parameters: N8nNodeParameters,
  property: N8nNodeProperty,
): boolean {
  const displayOptions = property.displayOptions;
  if (!displayOptions) return true;

  if (displayOptions.show) {
    for (const [field, allowed] of Object.entries(displayOptions.show)) {
      const actual = paramValue(parameters, field);
      const ok = allowed.some((v) => matchesCondition(v, actual));
      if (!ok) return false;
    }
  }

  if (displayOptions.hide) {
    for (const [field, blocked] of Object.entries(displayOptions.hide)) {
      const actual = paramValue(parameters, field);
      if (blocked.some((v) => matchesCondition(v, actual))) return false;
    }
  }

  return true;
}
