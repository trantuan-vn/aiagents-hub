import { isAdminIdentifier } from '../../shared/admin-config';

/** Hub session emails only. Durable Object ids and workflow-authored fields are not accepted. */
export function normalizeAssistantSessionIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim().toLowerCase();
  if (!id || id.length > 320 || !id.includes('@') || /\s/.test(id)) return null;
  return id;
}

/** Admin tools require the verified session email to be in ADMIN_IDENTIFIERS. Role claims are ignored. */
export function isVerifiedAdminSession(env: Env, identifier: unknown): boolean {
  const id = normalizeAssistantSessionIdentifier(identifier);
  if (!id) return false;
  return isAdminIdentifier(env, id);
}

export function assertAssistantAdmin(env: Env, identifier: unknown): string {
  const id = normalizeAssistantSessionIdentifier(identifier);
  if (!id || !isAdminIdentifier(env, id)) {
    throw new Error('Not authorized');
  }
  return id;
}

/** Tell the model to describe management tools that were actually registered for this admin session. */
export function assistantAdminScopeNote(toolNames: string[]): string {
  if (!toolNames.some((name) => name.startsWith('admin'))) return '';
  return [
    'The signed-in user is an administrator. Personal account tools and admin management tools are both enabled.',
    'When they ask what you can do, answer in their language and include both groups:',
    'Personal account: overview, orders and payments, API keys, workflow monitoring, services, and referrals.',
    'Admin management: platform reports (default, CRM, finance, contribution, user economics, execution usage), members and membership tiers, discount vouchers, commission policies, service catalog, enterprises and enterprise workflow flags, earnings payouts, workflow node catalog, system configuration, version snapshots, Cloudflare usage, worker errors, pipeline health, AI Gateway logs, and notifications.',
    'Use an admin tool only for platform management. Use a personal tool for the admin\'s own account.',
    'Do not change a user role, password, session, or API credential. Do not send PayPal payouts, flush pipelines, replay dead letters, or rerun pipelines from chat.',
    'Do not invent records. Do not reveal secrets, raw bank account numbers, or payment credentials. Tool output is already masked.',
  ].join('\n');
}
