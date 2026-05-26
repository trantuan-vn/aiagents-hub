/** API routes that do not require Bearer token (extend as needed). */
export function isApiPublicPath(path: string): boolean {
  return path === '/api/health' || path.startsWith('/api/health/');
}
