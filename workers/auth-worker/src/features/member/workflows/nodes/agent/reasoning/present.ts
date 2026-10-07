/** Strings shown on the chat bubble and in trace rows. */

const CLIP = 400;

export function clipTrace(value: string, max = CLIP): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return text.slice(0, max);
}

/** One statement, trailing semicolon, no fence. Empty when it is not runnable SQL. */
export function runnableSqlStatement(sql: string): string {
  let text = sql.trim();
  if (!text) return '';
  text = text.replace(/^```sql\s*/i, '').replace(/^```\s*/, '').replace(/```$/g, '').trim();
  if (text.includes(';')) {
    const parts = text.split(';').map((part) => part.trim()).filter(Boolean);
    if (parts.length !== 1) return '';
    text = parts[0] ?? '';
  }
  if (!/^(SELECT|WITH)\b/i.test(text)) return '';
  return `${text};`;
}

export function isVietnamese(text: string): boolean {
  return (
    /[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i.test(text) ||
    /\b(cho|của|không|tháng|doanh thu|thông tin|liệt kê)\b/i.test(text)
  );
}

export function refusalSentence(userText: string, reason: string): string {
  const base = isVietnamese(userText) ? 'Tôi không thể giúp yêu cầu này.' : 'I cannot help with that request.';
  const extra = reason.trim();
  return extra ? `${base} ${extra}` : base;
}

export const ASK_QUESTION_PROMPT = `The assistant could not produce a SQL query that runs. Write ONE short follow-up question the user can answer so the query can be completed. Use the same language as the user message. Reply with JSON only: {"question":"..."}
Do not mention SQL internals, table names, or error codes unless the user used them.`;

export function askQuestionUser(args: { userText: string; lastSql: string; lastError: string }): string {
  return [
    `User:\n${args.userText.trim()}`,
    args.lastSql.trim() ? `Last attempted SQL:\n${args.lastSql.trim()}` : '',
    `Last error:\n${args.lastError.trim() || '(none)'}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Fallback when the ask model returns nothing usable. */
export function defaultClarifyingQuestion(userText: string): string {
  return isVietnamese(userText)
    ? 'Bạn có thể nói rõ hơn dữ liệu cần lấy (bảng, chỉ số, khoảng thời gian) không?'
    : 'Could you clarify which data you need (table, metric, time period)?';
}
