/**
 * Cheap reject for internet-noise probes (phpinfo, WordPress, .env, …).
 * Must never match live Hub prefixes: dashboard, api, hooks, public, form, chat.
 */

const PRODUCT_PREFIXES = [
  '/dashboard',
  '/api',
  '/hooks',
  '/public',
  '/form',
  '/form-test',
  '/chat',
  '/chat-test',
] as const;

const SCANNER_EXACT = new Set([
  '/phpinfo',
  '/phpinfo.php',
  '/info.php',
  '/test.php',
  '/xmlrpc.php',
  '/wp-login.php',
  '/wp-config.php',
  '/config.php',
  '/adminer.php',
  '/administrator',
  '/admin',
  '/console',
  '/shell',
]);

const SCANNER_PREFIXES = [
  '/wp-admin',
  '/wp-content',
  '/wp-includes',
  '/wordpress',
  '/phpmyadmin',
  '/pma/',
  '/cgi-bin',
  '/vendor/phpunit',
  '/actuator',
  '/server-status',
  '/server-info',
  '/.env',
  '/.git',
  '/.svn',
  '/.aws',
  '/.vscode',
  '/.idea',
  '/manager/html',
  '/solr',
  '/hudson',
  '/jenkins',
  '/debug/default',
] as const;

const SCANNER_EXT = /\.(?:php\d*|phtml|asp|aspx|jsp|cgi|bak|sql)(?:\/|$)/i;

function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split('?')[0]?.split('#')[0] ?? '/';
  let decoded = withoutQuery;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    decoded = withoutQuery;
  }
  const collapsed = decoded.toLowerCase().replace(/\/{2,}/g, '/');
  if (!collapsed) return '/';
  return collapsed.startsWith('/') ? collapsed : `/${collapsed}`;
}

function isProductPath(path: string): boolean {
  return PRODUCT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** True for known scanner/junk paths that this Worker never serves. */
export function isScannerProbePath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (isProductPath(path)) return false;
  if (SCANNER_EXACT.has(path)) return true;
  if (SCANNER_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))) return true;
  return SCANNER_EXT.test(path);
}
