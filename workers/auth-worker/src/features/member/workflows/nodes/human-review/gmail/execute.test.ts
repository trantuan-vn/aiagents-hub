import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext } from '../../types.js';
import { executeGmailHumanReview } from './execute.js';

const credMock = vi.hoisted(() => ({
  resolveCredential: vi.fn(),
  updateCredentialSecret: vi.fn(),
}));

const smtpMock = vi.hoisted(() => ({
  GMAIL_SMTP_HOST: 'smtp.gmail.com',
  GMAIL_SMTP_PORT: 465,
  isGmailSmtpCredential: (cred: { type: string; meta: { authMethod?: string; provider?: string } }) =>
    cred.meta.authMethod === 'smtp' || (cred.type === 'basic' && cred.meta.provider === 'gmail'),
  sendMailViaSmtp: vi.fn(),
}));

const platformMock = vi.hoisted(() => ({
  sendViaPlatformEmail: vi.fn(),
}));

vi.mock('../../../storage/credentials.js', () => credMock);
vi.mock('./smtp.js', () => smtpMock);
vi.mock('./platform-email.js', () => platformMock);

const definition: WorkflowDefinition = { nodes: [], edges: [] };

function ctx(data: Record<string, unknown>): NodeContext {
  return {
    node: { id: 'gmail', type: 'human_review', position: { x: 0, y: 0 }, data },
    nodeInput: {},
    definition,
    outputs: {},
    runContext: {},
    c: { env: { FRONTEND_URL: 'https://aiagents-hub.vn' } },
    bindingName: 'USER_DO',
    user: { identifier: 'owner@example.com' },
    userDO: {} as NodeContext['userDO'],
    meta: {
      ownerId: 'owner@example.com',
      workflowId: 42,
      isOwnedByUser: true,
      workflowName: 'Review',
    },
  };
}

describe('executeGmailHumanReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('sends via SMTP when a Gmail email/password credential is selected', async () => {
    credMock.resolveCredential.mockResolvedValue({
      type: 'basic',
      secret: 'abcd efgh ijkl mnop',
      meta: {
        provider: 'gmail',
        authMethod: 'smtp',
        username: 'from@gmail.com',
      },
    });
    smtpMock.sendMailViaSmtp.mockResolvedValue({ messageId: 'smtp-1' });

    const result = await executeGmailHumanReview(
      ctx({
        credentialKey: 'cred-smtp',
        to: 'reviewer@example.com',
        subject: 'Approve please',
        message: 'Looks good?',
        responseType: 'approval',
        channel: 'gmail',
      }),
    );

    expect(result).toMatchObject({
      channel: 'gmail',
      sent: true,
      via: 'smtp',
      to: 'reviewer@example.com',
      messageId: 'smtp-1',
    });
    expect(platformMock.sendViaPlatformEmail).not.toHaveBeenCalled();
  });

  it('sends via noreply platform email when no credential is set', async () => {
    platformMock.sendViaPlatformEmail.mockResolvedValue({ messageId: 'brevo-1' });

    const result = await executeGmailHumanReview(
      ctx({
        to: 'reviewer@example.com',
        subject: 'Approve please',
        message: 'Looks good?',
        responseType: 'approval',
        channel: 'gmail',
      }),
    );

    expect(result).toMatchObject({
      channel: 'gmail',
      sent: true,
      via: 'platform',
      to: 'reviewer@example.com',
      messageId: 'brevo-1',
    });
    expect(credMock.resolveCredential).not.toHaveBeenCalled();
    expect(platformMock.sendViaPlatformEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        to: 'reviewer@example.com',
        subject: 'Approve please',
      }),
    );
  });
});
