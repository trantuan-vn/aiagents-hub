export function gmailHumanReviewDefaults(): Record<string, unknown> {
  return {
    label: "Gmail",
    channel: "gmail",
    reviewMode: "send_and_wait",
    resource: "message",
    operation: "sendAndWait",
    to: "",
    subject: "",
    message: "",
    responseType: "approval",
    credentialKey: "",
    approvalOptions: [] as Array<{ id: string; label: string; value: string }>,
    options: [] as Array<{ id: string; name: string; value: string }>,
  };
}
