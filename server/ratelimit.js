// server/ratelimit.js — Limitation de débit mémoire (anti-abus) par IP + route.
const buckets = new Map();

setInterval(() => {
  const cutoff = Date.now() - 15 * 60000;
  for (const [key, b] of buckets) {
    if (b.last < cutoff) buckets.delete(key);
  }
}, 120000).unref();

/**
 * Fabrique un middleware : `limit(n, windowMs)`.
 * Retourne 429 avec error:'RATE_LIMITED' en cas d'abus.
 */
export function limit(max, windowMs) {
  return function (req, res, next) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '?';
    const key = `${ip}:${req.path}`;
    const t = Date.now();
    let b = buckets.get(key);
    if (!b || t - b.start > windowMs) {
      b = { start: t, count: 0, last: t };
      buckets.set(key, b);
    }
    b.count += 1;
    b.last = t;
    if (b.count > max) {
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }
    next();
  };
}
