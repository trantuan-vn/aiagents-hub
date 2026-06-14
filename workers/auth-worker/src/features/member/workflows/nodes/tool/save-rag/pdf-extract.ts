/** Extract plain text from PDF bytes (Workers AI toMarkdown when available). */

export type PdfFileInput = {
  filename: string;
  mimeType: string;
  data: string;
};

export async function extractTextFromPdfFiles(
  env: Env,
  files: PdfFileInput[],
): Promise<Array<{ filename: string; text: string }>> {
  const results: Array<{ filename: string; text: string }> = [];

  for (const file of files) {
    if (!file.mimeType.includes('pdf') && !file.filename.toLowerCase().endsWith('.pdf')) {
      continue;
    }

    const bytes = decodeBinaryPayload(file.data);
    if (!bytes.length) continue;

    let text = '';

    if (env.AI) {
      try {
        const response = await env.AI.toMarkdown([
          { name: file.filename, blob: new Blob([bytes], { type: 'application/pdf' }) },
        ]);
        const chunks = Array.isArray(response) ? response : [response];
        text = chunks
          .map((c) => (typeof c === 'object' && c && 'data' in c ? String((c as { data?: string }).data ?? '') : String(c ?? '')))
          .join('\n')
          .trim();
      } catch (e) {
        console.warn('[pdf-extract] toMarkdown failed:', e);
      }
    }

    if (!text) {
      text = fallbackPdfTextExtract(bytes);
    }

    if (text.trim()) {
      results.push({ filename: file.filename, text: text.trim() });
    }
  }

  return results;
}

function decodeBinaryPayload(data: string): Uint8Array {
  if (!data) return new Uint8Array();
  if (data.startsWith('data:')) {
    const base64 = data.split(',')[1] ?? '';
    return base64ToBytes(base64);
  }
  try {
    return base64ToBytes(data);
  } catch {
    return new TextEncoder().encode(data);
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Minimal text extraction from PDF stream operators — fallback when AI unavailable. */
function fallbackPdfTextExtract(bytes: Uint8Array): string {
  const raw = new TextDecoder('latin1').decode(bytes);
  const matches = raw.match(/\(([^\\)]*)\)/g) ?? [];
  const parts = matches
    .map((m) => m.slice(1, -1))
    .filter((s) => s.length > 2 && /[a-zA-Z]/.test(s));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function filesFromWebhookBody(body: unknown): PdfFileInput[] {
  if (!body || typeof body !== 'object') return [];
  const obj = body as Record<string, unknown>;
  const files = obj.files;
  if (!Array.isArray(files)) return [];

  return files
    .map((f) => {
      if (!f || typeof f !== 'object') return null;
      const file = f as Record<string, unknown>;
      return {
        filename: String(file.filename ?? file.name ?? 'document.pdf'),
        mimeType: String(file.mimeType ?? file.type ?? 'application/pdf'),
        data: String(file.data ?? file.content ?? ''),
      };
    })
    .filter((f): f is PdfFileInput => !!f && !!f.data);
}
