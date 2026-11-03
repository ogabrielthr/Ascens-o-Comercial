function normalizedOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

const allowedOrigins = new Set(
  [
    normalizedOrigin(Deno.env.get("APP_URL")),
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ].filter((value): value is string => Boolean(value)),
);

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

export function assertAllowedOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    throw new HttpError(403, "Origem nao autorizada.");
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
