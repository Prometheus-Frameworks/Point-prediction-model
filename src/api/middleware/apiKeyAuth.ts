import { createHash, timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';

export const API_KEY_ENV_VAR = 'FORECAST_API_KEY';
export const API_KEY_HEADER = 'x-api-key';

// Hashing both values first keeps the comparison timing-safe even when the
// presented key has a different length than the configured key.
const sha256 = (value: string) => createHash('sha256').update(value).digest();

const matchesConfiguredKey = (presented: string, configured: string) =>
  timingSafeEqual(sha256(presented), sha256(configured));

// FORECAST_API_KEY accepts a comma-separated list so a new key can be added
// and the old one retired without a flag-day swap (zero-downtime rotation),
// and so individual consumers can be given revocable keys.
const parseConfiguredKeys = () =>
  process.env[API_KEY_ENV_VAR]
    ?.split(',')
    .map((key) => key.trim())
    .filter(Boolean) ?? [];

/**
 * Shared-secret gate for compute routes (Issue #178, Finding 1).
 *
 * CORS is a browser-enforced control only, so these routes need a server-side
 * check against direct HTTP clients. The configured keys are read per request
 * so the gate is testable and fails closed: when FORECAST_API_KEY is unset the
 * gated routes return 503 instead of silently opening up.
 */
export const apiKeyAuth = () =>
  createMiddleware(async (c, next) => {
    const configuredKeys = parseConfiguredKeys();

    if (configuredKeys.length === 0) {
      return c.json(
        {
          ok: false,
          error: `API authentication is not configured. Set ${API_KEY_ENV_VAR} on the server to enable this route.`,
        },
        503,
      );
    }

    const presentedKey = c.req.header(API_KEY_HEADER)?.trim();

    if (!presentedKey || !configuredKeys.some((key) => matchesConfiguredKey(presentedKey, key))) {
      return c.json({ ok: false, error: `Missing or invalid ${API_KEY_HEADER} header.` }, 401);
    }

    await next();
  });
