import assert from "node:assert/strict";
import test from "node:test";

import {
  cannedSupportKey,
  parseSupportReply,
  postSiteSupportChat,
  replyWithinSecondsFromBody,
  siteSupportChatUrl,
  SupportChatError,
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

test("replyWithinSecondsFromBody keeps a positive whole number", () => {
  assert.equal(replyWithinSecondsFromBody({ replyWithinSeconds: 30 }), 30);
  assert.equal(replyWithinSecondsFromBody({ replyWithinSeconds: null }), null);
  assert.equal(replyWithinSecondsFromBody({}), null);
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

test("postSiteSupportChat sends the turnstile token and surfaces a captcha challenge", async () => {
  const original = globalThis.fetch;
  let sent = "";
  globalThis.fetch = async (_input, init) => {
    sent = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        error: "Captcha verification required",
        requiresCaptcha: true,
        siteKey: "0x4AAAAAADXOWPMRtW0XIcLk",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    await assert.rejects(
      () =>
        postSiteSupportChat({
          endpointUrl: "https://api.example/chat/34/trigger-support",
          sessionId: "session-12345678",
          chatInput: "hello",
          turnstileToken: "fresh-token",
        }),
      (error: unknown) => {
        assert.ok(error instanceof SupportChatError);
        assert.equal(error.requiresCaptcha, true);
        assert.equal(error.status, 400);
        assert.equal(error.siteKey, "0x4AAAAAADXOWPMRtW0XIcLk");
        return true;
      },
    );
    assert.equal(JSON.parse(sent).turnstileToken, "fresh-token");
  } finally {
    globalThis.fetch = original;
  }
});

test("postSiteSupportChat reads the account gate without treating it as an error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        output: "Open a free account.\n__support_cta__ signup",
        accountGate: true,
        status: "ok",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  try {
    const result = await postSiteSupportChat({
      endpointUrl: "https://api.example/chat/34/trigger-support",
      sessionId: "session-12345678",
      chatInput: "hello",
    });
    assert.equal(result.accountGate, true);
    assert.equal(parseSupportReply(result.output).cta, "signup");
  } finally {
    globalThis.fetch = original;
  }
});

test("postSiteSupportChat keeps the daily limit code on 429", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Too many chat messages", retryAfter: 3600, code: "site_support_daily" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  try {
    await assert.rejects(
      () =>
        postSiteSupportChat({
          endpointUrl: "https://api.example/chat/34/trigger-support",
          sessionId: "session-12345678",
          chatInput: "hello",
        }),
      (error: unknown) => {
        assert.ok(error instanceof SupportChatError);
        assert.equal(error.status, 429);
        assert.equal(error.code, "site_support_daily");
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("canned fallback still recognizes plan and credit questions", () => {
  assert.equal(cannedSupportKey("Làm sao xây agent đầu tiên?"), "recommend");
  assert.equal(cannedSupportKey("Credit của tôi"), "credits");
  assert.equal(cannedSupportKey("Nâng cấp gói"), "upgrade");
  assert.equal(cannedSupportKey("hello"), "default");
});
