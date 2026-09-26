// Minimal Jev client. Jev answers typed questions (choice, yes/no) with
// probabilities in well under a second. It never writes free text.

const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const OPENROUTER_URL = 'https://openrouter.ai/api/alpha/decisions';
const OPENROUTER_MODEL = '~typesafe/jev-latest';

export function resolveKey(env = process.env) {
  return env.JEV_WATCH_API_KEY || env.OPENROUTER_API_KEY || env.TYPESAFE_API_KEY || '';
}

// OpenRouter keys start with "sk-or-" and get zero-data-retention routing.
export function buildRequest({ state, questions }, { key, env = process.env }) {
  const openrouter = key.startsWith('sk-or-');
  const body = { model: env.JEV_WATCH_MODEL || (openrouter ? OPENROUTER_MODEL : 'jev-latest'), state, questions };
  if (openrouter) body.provider = { zdr: true, data_collection: 'deny' };
  const url = env.JEV_WATCH_API_URL || (openrouter ? OPENROUTER_URL : TYPESAFE_URL);
  return { url, body };
}

// Never throws: failures come back as { error } so callers can skip the check.
export async function decide(request, { key = resolveKey(), fetchFn = fetch, timeoutMs = 8000, env } = {}) {
  if (!key) return { error: 'missing_api_key' };
  const { url, body } = buildRequest(request, { key, env });
  const started = Date.now();
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { error: `http_${res.status}`, ms: Date.now() - started };
    return { answers: (await res.json()).answers || {}, ms: Date.now() - started };
  } catch (err) {
    return { error: err.name || 'request_failed', ms: Date.now() - started };
  }
}
