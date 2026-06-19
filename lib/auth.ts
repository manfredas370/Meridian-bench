// Shared-secret guard for the cron/step/dev routes. Vercel Cron sends
// `Authorization: Bearer $CRON_SECRET` automatically; we also accept an
// `x-cron-secret` header or `?secret=` query for manual/local invocation.
// When CRON_SECRET is unset (local dev), requests are allowed for convenience.

export function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  try {
    if (new URL(req.url).searchParams.get("secret") === secret) return true;
  } catch {
    // ignore malformed URL
  }
  return false;
}
