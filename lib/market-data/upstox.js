const BASE_URL = (process.env.UPSTOX_API_BASE_URL || "https://api.upstox.com").replace(/\/$/, "");

export function hasUpstoxToken() {
  return Boolean(process.env.UPSTOX_ACCESS_TOKEN);
}

export async function upstoxGet(path, params = {}) {
  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) {
    const error = new Error("Upstox API is not configured. Add UPSTOX_ACCESS_TOKEN in your local .env.local or Vercel Environment Variables.");
    error.status = 503;
    throw error;
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.errors?.[0]?.message || payload?.message || `Upstox request failed (${response.status})`);
    error.status = response.status === 401 ? 401 : response.status === 429 ? 429 : 502;
    throw error;
  }
  return payload;
}

export function jsonError(error) {
  const status = Number(error?.status) || 500;
  return Response.json(
    { ok: false, error: error?.message || "Market-data request failed", provider: "upstox" },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}
