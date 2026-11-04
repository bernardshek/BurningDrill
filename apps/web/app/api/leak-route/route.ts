import { routeHhLeak, type HhLeakHints } from "@/lib/hh-leak-router";

export const runtime = "nodejs";

/** Accepts structured leak hints only; no hand-history file is stored. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON object of leak hints." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Expected a JSON object of leak hints." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  for (const key of ["streets", "positions", "actions", "tags"] as const) {
    if (input[key] !== undefined && (!Array.isArray(input[key]) || !input[key].every((value) => typeof value === "string"))) {
      return Response.json({ error: `${key} must be an array of strings.` }, { status: 400 });
    }
  }
  if (input.notes !== undefined && typeof input.notes !== "string") {
    return Response.json({ error: "notes must be a string." }, { status: 400 });
  }

  return Response.json(routeHhLeak(input as HhLeakHints));
}
