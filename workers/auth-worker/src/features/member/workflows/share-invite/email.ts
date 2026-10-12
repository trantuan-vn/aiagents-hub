import type { PublicTriggerKind } from '../domain/public-trigger-kinds.js';

export type ShareInviteLocale = 'vi' | 'en';

export interface ShareInviteLink {
  kind: 'chat' | 'form';
  label: string;
  url: string;
}

export interface ShareInviteEmailInput {
  locale: ShareInviteLocale;
  firstTime: boolean;
  workflowName: string;
  workflowDescription: string;
  ownerEmail: string;
  recipientEmail: string;
  triggerKinds: PublicTriggerKind[];
  loginUrl: string;
  links: ShareInviteLink[];
}

export interface ShareInviteEmail {
  subject: string;
  html: string;
  text: string;
}

const TRIGGER_ORDER: PublicTriggerKind[] = ['manual', 'chat', 'form', 'webhook'];

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plain(value: string, max: number): string {
  const text = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function subjectName(name: string): string {
  const text = plain(name, 48);
  return text || 'Workflow';
}

const COPY = {
  vi: {
    product: 'aiagents-hub',
    firstEyebrow: 'Lời mời bắt đầu',
    memberEyebrow: 'Quyền truy cập mới',
    firstPreheader: 'Tạo tài khoản bằng email này, rồi chạy workflow theo cách bạn được cấp.',
    memberPreheader: 'Đăng nhập bằng email này và mở workflow vừa được chia sẻ cho bạn.',
    firstSubject: (name: string) => `${name} đang chờ bạn — bắt đầu trong vài phút`,
    memberSubject: (name: string) => `Bạn được dùng ${name}`,
    firstLead: 'Đây là lần đầu của bạn trên aiagents-hub. Ba bước dưới đây là đủ để chạy được workflow — không cần cài đặt thêm.',
    memberLead: (owner: string) => `${owner} vừa cấp cho bạn quyền dùng workflow này. Tài khoản của bạn đã sẵn sàng.`,
    stepsTitle: 'Cách bắt đầu',
    steps: (email: string) => [
      `Mở liên kết bên dưới và tạo tài khoản bằng đúng ${email}. Nếu bạn chưa từng đăng ký, trang đăng nhập sẽ tạo tài khoản giúp bạn.`,
      'Sau khi đăng nhập, bạn vào thẳng trang workflow này.',
      'Chạy theo những cách được liệt kê phía dưới. Mỗi cách là một cửa vào đã được chủ workflow mở cho bạn.',
    ],
    firstCta: 'Tạo tài khoản và mở workflow',
    memberCta: 'Đăng nhập và mở workflow',
    triggersTitle: 'Bạn được dùng những cách này',
    sameEmail: (email: string) => `Hãy đăng nhập bằng ${email}. Email khác sẽ không thấy workflow này.`,
    openLink: 'Mở trang',
    footer: (owner: string) =>
      `Bạn nhận thư này vì ${owner} cấp quyền dùng workflow trên aiagents-hub. Nếu bạn không mong đợi thư, cứ bỏ qua — không có gì được kích hoạt cho đến khi bạn tự mở liên kết.`,
    triggers: {
      manual: {
        title: 'Chạy trên ứng dụng',
        body: 'Trên trang workflow, bấm Chạy. Nhập dữ liệu nếu được hỏi, rồi xem kết quả từng bước ngay trên màn hình.',
      },
      chat: {
        title: 'Chat',
        body: 'Mở trang chat và gửi tin nhắn như một cuộc trò chuyện. Agent trả lời trong cùng hội thoại, mỗi lượt là một lần chạy.',
      },
      form: {
        title: 'Form',
        body: 'Mở form, điền các trường và gửi. Mỗi lần gửi chạy workflow một lần và trả kết quả trên trang form.',
      },
      webhook: {
        title: 'Webhook',
        body: 'Trong ứng dụng, lấy API key của chính bạn rồi gọi webhook của workflow. Mỗi request hợp lệ là một lượt chạy. Dùng key của bạn, không dùng key của người khác.',
      },
    },
  },
  en: {
    product: 'aiagents-hub',
    firstEyebrow: 'You are invited',
    memberEyebrow: 'New access',
    firstPreheader: 'Create an account with this email, then run the workflow the way you were granted.',
    memberPreheader: 'Sign in with this email and open the workflow that was just shared with you.',
    firstSubject: (name: string) => `${name} is ready — start in a few minutes`,
    memberSubject: (name: string) => `You can use ${name}`,
    firstLead:
      'This is your first time on aiagents-hub. Three short steps are enough to run the workflow — nothing to install.',
    memberLead: (owner: string) =>
      `${owner} just gave you access to this workflow. Your account is ready.`,
    stepsTitle: 'How to start',
    steps: (email: string) => [
      `Open the link below and create an account with ${email}. If you have never signed up, the sign-in page creates the account for you.`,
      'After you sign in, you land directly on this workflow.',
      'Run it using the options listed below. Each one is an entry the workflow owner opened for you.',
    ],
    firstCta: 'Create an account and open the workflow',
    memberCta: 'Sign in and open the workflow',
    triggersTitle: 'Ways you can run it',
    sameEmail: (email: string) => `Sign in with ${email}. A different email will not see this workflow.`,
    openLink: 'Open',
    footer: (owner: string) =>
      `You received this because ${owner} granted you access to a workflow on aiagents-hub. If you were not expecting it, you can ignore this email — nothing runs until you open the link yourself.`,
    triggers: {
      manual: {
        title: 'Run in the app',
        body: 'On the workflow page, press Run. Enter any details you are asked for, then read the result of each step on the page.',
      },
      chat: {
        title: 'Chat',
        body: 'Open the chat page and send a message, the same way you would in a conversation. The agent replies in that thread, and each turn runs the workflow.',
      },
      form: {
        title: 'Form',
        body: 'Open the form, fill in the fields, and submit. Each submission runs the workflow once and shows the result on the form page.',
      },
      webhook: {
        title: 'Webhook',
        body: 'In the app, copy your own API key and call the workflow webhook. Each valid request is one run. Use your key, not someone else\'s.',
      },
    },
  },
} as const;

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
    <tr><td style="border-radius:10px;background:#312e81;">
      <a href="${esc(href)}" style="display:inline-block;padding:14px 22px;font-family:Georgia, 'Times New Roman', serif;font-size:16px;line-height:1.2;color:#ffffff;text-decoration:none;">${esc(label)}</a>
    </td></tr>
  </table>`;
}

function triggerBlocks(input: ShareInviteEmailInput, copy: (typeof COPY)[ShareInviteLocale]): string {
  const kinds = TRIGGER_ORDER.filter((kind) => input.triggerKinds.includes(kind));
  return kinds
    .map((kind) => {
      const item = copy.triggers[kind];
      const links = input.links.filter((link) => link.kind === kind && safeHttpUrl(link.url));
      const linkHtml = links
        .map((link) => {
          const href = safeHttpUrl(link.url);
          if (!href) return '';
          const label = kind === 'form' ? link.label : item.title;
          return `<div style="margin-top:8px;"><a href="${esc(href)}" style="color:#312e81;font-weight:600;text-decoration:underline;">${esc(copy.openLink)} · ${esc(label)}</a></div>`;
        })
        .join('');
      return `<tr><td style="padding:0 0 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;">
          <tr><td style="padding:14px 16px;font-family:Georgia, 'Times New Roman', serif;">
            <div style="font-size:15px;font-weight:700;color:#18181b;">${esc(item.title)}</div>
            <div style="margin-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#3f3f46;">${esc(item.body)}</div>
            ${linkHtml}
          </td></tr>
        </table>
      </td></tr>`;
    })
    .join('');
}

export function buildShareInviteEmail(input: ShareInviteEmailInput): ShareInviteEmail {
  const copy = COPY[input.locale];
  const name = plain(input.workflowName, 120) || 'Workflow';
  const description = plain(input.workflowDescription, 360);
  const owner = plain(input.ownerEmail, 120);
  const recipient = plain(input.recipientEmail, 120);
  const loginUrl = safeHttpUrl(input.loginUrl) ?? input.loginUrl;
  const first = input.firstTime;
  const subject = first ? copy.firstSubject(subjectName(name)) : copy.memberSubject(subjectName(name));
  const lead = first ? copy.firstLead : copy.memberLead(owner);
  const cta = first ? copy.firstCta : copy.memberCta;
  const preheader = first ? copy.firstPreheader : copy.memberPreheader;
  const eyebrow = first ? copy.firstEyebrow : copy.memberEyebrow;

  const steps = first
    ? `<tr><td style="padding:8px 32px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:14px;">
          <tr><td style="padding:18px 18px 8px;font-family:Georgia, 'Times New Roman', serif;font-size:16px;font-weight:700;color:#1e1b4b;">${esc(copy.stepsTitle)}</td></tr>
          ${copy.steps(recipient)
            .map(
              (step, index) => `<tr><td style="padding:0 18px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.55;color:#312e81;">
                <strong style="display:inline-block;width:22px;">${index + 1}</strong>${esc(step)}
              </td></tr>`,
            )
            .join('')}
        </table>
      </td></tr>`
    : '';

  const descriptionHtml = description
    ? `<tr><td style="padding:8px 32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#3f3f46;">${esc(description)}</td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="${input.locale}">
<body style="margin:0;padding:0;background:#f4f4f5;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:18px;">
        <tr><td style="height:6px;background:#312e81;border-radius:18px 18px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;">${esc(copy.product)}</td></tr>
        <tr><td style="padding:10px 32px 0;font-family:Georgia, 'Times New Roman', serif;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#71717a;">${esc(eyebrow)}</td></tr>
        <tr><td style="padding:8px 32px 0;font-family:Georgia, 'Times New Roman', serif;font-size:30px;line-height:1.2;color:#18181b;">${esc(name)}</td></tr>
        <tr><td style="padding:14px 32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;line-height:1.6;color:#18181b;">${esc(lead)}</td></tr>
        ${descriptionHtml}
        ${steps}
        <tr><td style="padding:8px 32px 0;">${button(loginUrl, cta)}</td></tr>
        <tr><td style="padding:4px 32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.5;color:#71717a;">${esc(copy.sameEmail(recipient))}</td></tr>
        <tr><td style="padding:28px 32px 8px;font-family:Georgia, 'Times New Roman', serif;font-size:18px;color:#18181b;">${esc(copy.triggersTitle)}</td></tr>
        <tr><td style="padding:8px 32px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${triggerBlocks(input, copy)}</table></td></tr>
        <tr><td style="padding:8px 32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;line-height:1.5;color:#a1a1aa;">${esc(copy.footer(owner))}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const triggerText = TRIGGER_ORDER.filter((kind) => input.triggerKinds.includes(kind))
    .map((kind) => {
      const item = copy.triggers[kind];
      const links = input.links
        .filter((link) => link.kind === kind && safeHttpUrl(link.url))
        .map((link) => `${copy.openLink}: ${safeHttpUrl(link.url)}`)
        .join('\n');
      return `${item.title}\n${item.body}${links ? `\n${links}` : ''}`;
    })
    .join('\n\n');

  const stepText = first
    ? `${copy.stepsTitle}\n${copy.steps(recipient).map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\n`
    : '';

  const text = [
    `${eyebrow}\n${name}`,
    lead,
    description,
    stepText.trim(),
    `${cta}\n${loginUrl}`,
    copy.sameEmail(recipient),
    `${copy.triggersTitle}\n\n${triggerText}`,
    copy.footer(owner),
  ]
    .filter((section) => section.trim())
    .join('\n\n');

  return { subject, html, text };
}
