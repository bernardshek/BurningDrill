import { SolverShellError } from "@/lib/solver-shell";
import { loadSolverShell } from "@/lib/solver-shell-load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET only. Returns pack mix, EV, and gradeDrillNode labels. Does not solve. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const body = await loadSolverShell(
      {
        packId: url.searchParams.get("pack"),
        drillId: url.searchParams.get("drill"),
        nodeId: url.searchParams.get("node"),
      },
      { origin: url.origin },
    );
    return Response.json(body);
  } catch (error) {
    if (error instanceof SolverShellError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Solver shell failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
