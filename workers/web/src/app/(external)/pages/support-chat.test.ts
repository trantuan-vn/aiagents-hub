import assert from "node:assert/strict";
import test from "node:test";

import {
  cannedSupportKey,
  parseSupportReply,
  siteSupportChatUrl,
  supportCtaHref,
} from "./support-chat.ts";

test("parseSupportReply lifts a single allowed CTA off the last line", () => {
  const parsed = parseSupportReply("Free does not need a card.\n\n__support_cta__ signup");
  assert.equal(parsed.text, "Free does not need a card.");
  assert.equal(parsed.cta, "signup");
  assert.equal(
    supportCtaHref("signup"),
    "/auth/v3/login?redirect=https%3A%2F%2Faiagents-hub.vn%2Fdocs%2Fquickstart",
  );
});

test("parseSupportReply leaves unknown markers in the bubble", () => {
  const parsed = parseSupportReply("See /packages.\n__support_cta__ discount");
  assert.equal(parsed.cta, null);
  assert.match(parsed.text, /discount/);
});

test("support CTA paths stay on first-party pages", () => {
  assert.equal(supportCtaHref("packages"), "/packages");
  assert.equal(supportCtaHref("quickstart"), "/docs/quickstart");
  assert.equal(supportCtaHref("plans"), "/docs/plans");
  assert.equal(supportCtaHref("credits"), "/docs/credits");
  assert.equal(supportCtaHref("contact"), "/contact");
});

test("siteSupportChatUrl is absent until a workflow id is set", () => {
  const previousId = process.env.NEXT_PUBLIC_SITE_SUPPORT_WORKFLOW_ID;
  const previousOwner = process.env.NEXT_PUBLIC_SITE_SUPPORT_OWNER_ID;
  const previousPath = process.env.NEXT_PUBLIC_SITE_SUPPORT_CHAT_PATH;
  delete process.env.NEXT_PUBLIC_SITE_SUPPORT_WORKFLOW_ID;
  assert.equal(siteSupportChatUrl(), null);

  process.env.NEXT_PUBLIC_SITE_SUPPORT_WORKFLOW_ID = "42";
  process.env.NEXT_PUBLIC_SITE_SUPPORT_OWNER_ID = "abc";
  process.env.NEXT_PUBLIC_SITE_SUPPORT_CHAT_PATH = "site-support";
  const url = new URL(siteSupportChatUrl() ?? "");
  assert.equal(url.pathname, "/chat/42/site-support");
  assert.equal(url.searchParams.get("owner_id"), "abc");
  assert.equal(url.searchParams.get("format"), "json");

  if (previousId === undefined) delete process.env.NEXT_PUBLIC_SITE_SUPPORT_WORKFLOW_ID;
  else process.env.NEXT_PUBLIC_SITE_SUPPORT_WORKFLOW_ID = previousId;
  if (previousOwner === undefined) delete process.env.NEXT_PUBLIC_SITE_SUPPORT_OWNER_ID;
  else process.env.NEXT_PUBLIC_SITE_SUPPORT_OWNER_ID = previousOwner;
  if (previousPath === undefined) delete process.env.NEXT_PUBLIC_SITE_SUPPORT_CHAT_PATH;
  else process.env.NEXT_PUBLIC_SITE_SUPPORT_CHAT_PATH = previousPath;
});

test("canned fallback still recognizes plan and credit questions", () => {
  assert.equal(cannedSupportKey("Làm sao xây agent đầu tiên?"), "recommend");
  assert.equal(cannedSupportKey("Credit của tôi"), "credits");
  assert.equal(cannedSupportKey("Nâng cấp gói"), "upgrade");
  assert.equal(cannedSupportKey("hello"), "default");
});
