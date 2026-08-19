import { createHash, timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';

export const API_KEY_ENV_VAR = 'FORECAST_API_KEY';
export const API_KEY_HEADER = 'x-api-key';

// Hashing both values first keeps the comparison timing-safe even when the
// presented key has a different length than the configured key.
const sha256 = (value: string) => createHash('sha256').update(value).digest();

const matchesConfiguredKey = (presented: string, configured: string) =>
  timingSafeEqual(sha256(presented), sha256(configured));

/**
 * Shared-secret gate for compute routes (Issue #178, Finding 1).
 *
 * CORS is a browser-enforced control only, so these routes need a server-side
 * check against direct HTTP clients. The configured key is read per request so
 * the gate is testable and fails closed: when FORECAST_API_KEY is unset the
 * gated routes return 503 instead of silently opening up.
 */
export const apiKeyAuth = () =>
  createMiddleware(async (c, next) => {
    const configuredKey = process.env[API_KEY_ENV_VAR]?.trim();

    if (!configuredKey) {
      return c.json(
        {
          ok: false,
          error: `API authentication is not configured. Set ${API_KEY_ENV_VAR} on the server to enable this route.`,
        },
        503,
      );
    }

    const presentedKey = c.req.header(API_KEY_HEADER)?.trim();

    if (!presentedKey || !matchesConfiguredKey(presentedKey, configuredKey)) {
      return c.json({ ok: false, error: `Missing or invalid ${API_KEY_HEADER} header.` }, 401);
    }

    await next();
  });
