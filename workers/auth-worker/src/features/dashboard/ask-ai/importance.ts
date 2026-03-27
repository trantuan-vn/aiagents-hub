/** Đánh giá importance 0–1 cho lưu bộ nhớ ngữ nghĩa (semantic). */
export async function scoreMessageImportance(ai: Ai, userMessage: string): Promise<number> {
  const r = await ai.run(
    '@cf/meta/llama-3.1-8b-instruct-fp8',
    {
      messages: [
        {
          role: 'system',
          content:
            'Chỉ trả về JSON: {"importance": number} — importance từ 0.0 (không cần nhớ lâu) đến 1.0 (preference, số liệu, mục tiêu, cấu hình, thông tin lặp lại hữu ích).',
        },
        { role: 'user', content: userMessage.slice(0, 4000) },
      ],
      max_tokens: 80,
    },
    { gateway: { id: 'unitoken' } },
  );
  const raw = (r as { response?: string })?.response ?? '';
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return 0.35;
  try {
    const j = JSON.parse(m[0]) as { importance?: number };
    return Math.min(1, Math.max(0, Number(j.importance ?? 0.35)));
  } catch {
    return 0.35;
  }
}
