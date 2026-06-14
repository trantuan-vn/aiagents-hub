import type { WorkflowCredentialType } from '../domain/domain.js';

/**
 * Built-in integration presets. Each preset prefills an `http_request` node, so
 * a wide range of services is supported without bespoke per-service code. Body
 * fields use `{{ template }}` placeholders resolved against the node input.
 */
export interface IntegrationPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  docsUrl: string;
  /** Suggested credential type to attach (the token/secret lives in the vault). */
  credentialType: WorkflowCredentialType;
  node: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    jsonResponse?: boolean;
  };
}

export const WORKFLOW_INTEGRATIONS: IntegrationPreset[] = [
  {
    id: 'http',
    name: 'HTTP Request',
    category: 'Core',
    description: 'Call any REST API. Full control over method, headers and body.',
    docsUrl: 'https://developer.mozilla.org/docs/Web/HTTP',
    credentialType: 'none',
    node: { method: 'GET', url: 'https://', headers: {}, jsonResponse: true },
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'Messaging',
    description: 'Post a message to a channel via an Incoming Webhook URL.',
    docsUrl: 'https://api.slack.com/messaging/webhooks',
    credentialType: 'none',
    node: {
      method: 'POST',
      url: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
      headers: { 'Content-Type': 'application/json' },
      body: { text: '{{ text }}' },
    },
  },
  {
    id: 'discord',
    name: 'Discord',
    category: 'Messaging',
    description: 'Send a message through a Discord channel webhook.',
    docsUrl: 'https://discord.com/developers/docs/resources/webhook',
    credentialType: 'none',
    node: {
      method: 'POST',
      url: 'https://discord.com/api/webhooks/XXX/YYY',
      headers: { 'Content-Type': 'application/json' },
      body: { content: '{{ text }}' },
    },
  },
  {
    id: 'telegram',
    name: 'Telegram',
    category: 'Messaging',
    description: 'Send a message via the Telegram Bot API (bot token in the URL).',
    docsUrl: 'https://core.telegram.org/bots/api#sendmessage',
    credentialType: 'none',
    node: {
      method: 'POST',
      url: 'https://api.telegram.org/bot<BOT_TOKEN>/sendMessage',
      headers: { 'Content-Type': 'application/json' },
      body: { chat_id: '{{ variables.chatId }}', text: '{{ text }}' },
      jsonResponse: true,
    },
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'Dev',
    description: 'Create an issue in a repository. Use a bearer token credential.',
    docsUrl: 'https://docs.github.com/rest/issues/issues#create-an-issue',
    credentialType: 'bearer',
    node: {
      method: 'POST',
      url: 'https://api.github.com/repos/OWNER/REPO/issues',
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'aiagents-hub' },
      body: { title: '{{ text }}', body: '{{ data }}' },
      jsonResponse: true,
    },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'AI',
    description: 'Call the Chat Completions API. Use a bearer API key credential.',
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
    credentialType: 'bearer',
    node: {
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'Content-Type': 'application/json' },
      body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: '{{ text }}' }] },
      jsonResponse: true,
    },
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'Productivity',
    description: 'Create a page. Use a bearer integration token credential.',
    docsUrl: 'https://developers.notion.com/reference/post-page',
    credentialType: 'bearer',
    node: {
      method: 'POST',
      url: 'https://api.notion.com/v1/pages',
      headers: { 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
      body: { parent: { database_id: '{{ variables.databaseId }}' }, properties: {} },
      jsonResponse: true,
    },
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    category: 'Email',
    description: 'Send a transactional email. Use a bearer API key credential.',
    docsUrl: 'https://docs.sendgrid.com/api-reference/mail-send/mail-send',
    credentialType: 'bearer',
    node: {
      method: 'POST',
      url: 'https://api.sendgrid.com/v3/mail/send',
      headers: { 'Content-Type': 'application/json' },
      body: {
        personalizations: [{ to: [{ email: '{{ variables.to }}' }] }],
        from: { email: '{{ variables.from }}' },
        subject: '{{ variables.subject }}',
        content: [{ type: 'text/plain', value: '{{ text }}' }],
      },
    },
  },
];
