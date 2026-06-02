export function parseWorkflowTags(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t) => String(t).trim())
      .filter((t) => t.length > 0)
      .slice(0, 20);
  } catch {
    return [];
  }
}

export function serializeWorkflowTags(tags: string[]): string {
  const unique = [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
  return JSON.stringify(unique);
}
