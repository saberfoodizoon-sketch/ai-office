// Per-IP fixed-window rate limits (per function instance). They stop scripted
// floods from burning the storage quota; the daily write cap in the engine is
// the global backstop across instances.
import type { NextFunction, Request, Response } from "express";

export function rateLimit(name: string, max: number, windowMs = 60_000) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?").split(",")[0].trim();
    const now = Date.now();
    let h = hits.get(ip);
    if (!h || now >= h.reset) {
      h = { n: 0, reset: now + windowMs };
      hits.set(ip, h);
      if (hits.size > 5_000) for (const [k, v] of hits) if (now >= v.reset) hits.delete(k);
    }
    if (++h.n > max) {
      res.setHeader("Retry-After", String(Math.ceil((h.reset - now) / 1000)));
      res.status(429).json({ error: "طلبات كتير ورا بعض. استنى دقيقة وجرّب تاني.", limit: name });
      return;
    }
    next();
  };
}
