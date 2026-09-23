import { describe, expect, it } from 'vitest';

import { isScannerProbePath } from './scanner-paths';

describe('isScannerProbePath', () => {
  it('flags common scanner paths', () => {
    expect(isScannerProbePath('/phpinfo.php')).toBe(true);
    expect(isScannerProbePath('/PHPINFO.PHP')).toBe(true);
    expect(isScannerProbePath('/wp-admin/setup-config.php')).toBe(true);
    expect(isScannerProbePath('/wp-login.php')).toBe(true);
    expect(isScannerProbePath('/.env')).toBe(true);
    expect(isScannerProbePath('/.git/config')).toBe(true);
    expect(isScannerProbePath('//phpinfo.php')).toBe(true);
    // Joomla SP Page Builder exploit scan (apex site /index.php)
    expect(isScannerProbePath('/index.php')).toBe(true);
    expect(
      isScannerProbePath('/index.php?option=com_sppagebuilder&task=asset.uploadCustomIcon'),
    ).toBe(true);
  });

  it('never matches live Hub routes', () => {
    expect(isScannerProbePath('/dashboard/auth/otp/request')).toBe(false);
    expect(isScannerProbePath('/dashboard/admin/cloudflare-logs')).toBe(false);
    expect(isScannerProbePath('/api/ws')).toBe(false);
    expect(isScannerProbePath('/hooks/run')).toBe(false);
    expect(isScannerProbePath('/public/plans')).toBe(false);
    expect(isScannerProbePath('/form/12/contact')).toBe(false);
    expect(isScannerProbePath('/form-test/12/contact')).toBe(false);
    expect(isScannerProbePath('/chat/9/bot')).toBe(false);
    expect(isScannerProbePath('/chat-test/9/bot')).toBe(false);
  });
});
