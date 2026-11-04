"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CardRow } from "@/components/CardRow";
import { parseCards } from "@/lib/parse-cards";
import {
  SOLVER_SHELL_PACKS,
  drillLabel,
  isSolverShellCatalog,
  isSolverShellNodeBody,
  type SolverShellCatalog,
  type SolverShellNodeSummary,
  type SolverShellNodeView,
} from "@/lib/solver-shell";

function nodeOptionLabel(node: SolverShellNodeSummary): string {
  const board = node.board.length > 0 ? node.board.join(" ") : "preflop";
  const drill = node.drillId ? drillLabel(node.drillId) : node.street;
  return `${board} · ${node.hero} vs ${node.villain} · ${drill}`;
}

function formatBb(value: number): string {
  return value.toFixed(3);
}

export function SolverShellClient() {
  const [packId, setPackId] = useState<string>(SOLVER_SHELL_PACKS[0].id);
  const [drillId, setDrillId] = useState("all");
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<SolverShellCatalog | null>(null);
  const [detail, setDetail] = useState<SolverShellNodeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    const token = ++request.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setCatalog(null);
    setDetail(null);
    const pack = packId;
    fetch(`/api/solver-shell?pack=${encodeURIComponent(pack)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body: unknown = await res.json();
        if (!res.ok || !isSolverShellCatalog(body)) {
          const message =
            body && typeof body === "object" && "error" in body
              ? String((body as { error: unknown }).error)
              : "Could not read that pack";
          throw new Error(message);
        }
        return body;
      })
      .then((body) => {
        if (token !== request.current) return;
        setCatalog(body);
        setDrillId("all");
        setNodeId(body.node?.id ?? null);
        setDetail(body.node);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || token !== request.current) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (token === request.current) setLoading(false);
      });
    return () => controller.abort();
  }, [packId]);

  const visible = useMemo(() => {
    if (!catalog) return [];
    if (drillId === "all") return catalog.nodes;
    return catalog.nodes.filter((node) => node.drillId === drillId);
  }, [catalog, drillId]);

  async function openNode(id: string) {
    const token = ++request.current;
    setNodeId(id);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/solver-shell?pack=${encodeURIComponent(packId)}&node=${encodeURIComponent(id)}`,
      );
      const body: unknown = await res.json();
      if (token !== request.current) return;
      if (!res.ok || !isSolverShellNodeBody(body)) {
        const message =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : "Could not read that node";
        setError(message);
        setDetail(null);
        return;
      }
      setDetail(body.node);
    } catch (cause) {
      if (token !== request.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (token === request.current) setLoading(false);
    }
  }

  function onDrill(next: string) {
    setDrillId(next);
    if (!catalog) return;
    const list =
      next === "all"
        ? catalog.nodes
        : catalog.nodes.filter((node) => node.drillId === next);
    const first = list[0];
    if (!first) {
      setNodeId(null);
      setDetail(null);
      return;
    }
    if (first.id !== nodeId) void openNode(first.id);
  }

  function openKid(id: string) {
    const summary = catalog?.nodes.find((node) => node.id === id);
    if (summary?.drillId && drillId !== "all" && summary.drillId !== drillId) {
      setDrillId("all");
    }
    void openNode(id);
  }

  const board = detail ? parseCards(detail.board.join("")) : [];

  return (
    <>
      <div className="card">
        <div className="row">
          <label className="field">
            Pack
            <select
              value={packId}
              onChange={(event) => setPackId(event.target.value)}
            >
              {SOLVER_SHELL_PACKS.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Drill
            <select
              value={drillId}
              onChange={(event) => onDrill(event.target.value)}
              disabled={!catalog}
            >
              <option value="all">All nodes in this pack</option>
              {catalog?.drills.map((drill) => (
                <option key={drill.id} value={drill.id}>
                  {drill.label} ({drill.count})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Node
            <select
              value={nodeId ?? ""}
              onChange={(event) => void openNode(event.target.value)}
              disabled={visible.length === 0}
            >
              {visible.length === 0 ? <option value="">No nodes</option> : null}
              {visible.map((node) => (
                <option key={node.id} value={node.id}>
                  {nodeOptionLabel(node)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {catalog ? (
          <p className="meta" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
            {catalog.pack.name} v{catalog.pack.version}
            {" · "}ships_solver_code=false
            {" · "}live solve off
            {" · "}graded by gradeDrillNode
            {catalog.pack.kind ? ` · ${catalog.pack.kind}` : ""}
          </p>
        ) : null}
        {catalog?.pack.note ? (
          <p className="meta" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
            {catalog.pack.note}
          </p>
        ) : null}
        {error ? (
          <p style={{ color: "var(--bad)", marginTop: "0.75rem" }}>{error}</p>
        ) : null}
      </div>

      {detail ? (
        <div className="card" aria-busy={loading} aria-label="Pack node">
          <h2
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            <span>{detail.drillId ? drillLabel(detail.drillId) : "Pack node"}</span>
            {catalog?.pack.practice ? (
              <span className="badge practice">Practice / toy</span>
            ) : null}
          </h2>
          <div className="action-line">{detail.line}</div>
          <div className="poker-table" aria-label="Board">
            <div className="poker-table__board">
              {board.length > 0 ? (
                <CardRow cards={board} size="medium" label="Board" />
              ) : (
                <span className="card-row-label poker-table__empty">
                  Board — preflop
                </span>
              )}
            </div>
            <div className="poker-table__meta">
              <span>{detail.street.toUpperCase()}</span>
              <span>
                Hero {detail.hero} vs {detail.villain}
              </span>
              <span>{detail.inPosition ? "IP" : "OOP"}</span>
              <span>pot {formatBb(detail.potBb)}bb</span>
              <span>stack {formatBb(detail.stackBb)}bb</span>
              <span>ΔEV {formatBb(detail.deltaEvBb)}bb</span>
              {detail.texture ? <span>{detail.texture}</span> : null}
            </div>
          </div>

          <table className="shell-table">
            <caption className="sr-only">
              Pack strategy for {detail.id}. Mix and EV are stored on the node.
            </caption>
            <thead>
              <tr>
                <th>Action</th>
                <th>Mix</th>
                <th>EV</th>
                <th>EV loss</th>
                <th>Grade</th>
                <th>Pack child</th>
              </tr>
            </thead>
            <tbody>
              {detail.actions.map((action) => {
                const kid = action.kid;
                return (
                  <tr key={action.id}>
                    <td>{action.label}</td>
                    <td className="shell-mix">
                      <span title={String(action.mix)}>
                        {(action.mix * 100).toFixed(1)}%
                      </span>
                      <div className="freq-bar" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, action.mix * 100)}%` }} />
                      </div>
                    </td>
                    <td title={String(action.evBb)}>{formatBb(action.evBb)}bb</td>
                    <td>{formatBb(action.evLossBb)}bb</td>
                    <td>
                      <span className={`badge ${action.grade.toLowerCase()}`}>
                        {action.grade}
                      </span>
                    </td>
                    <td>
                      {kid ? (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => openKid(kid)}
                        >
                          Open
                        </button>
                      ) : (
                        <span className="meta">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="meta" style={{ marginTop: "0.75rem" }}>
            {detail.rangeCount} combos stored on this node. Weights are the pack
            range, not a per-hand solve.
          </p>
          <ul className="shell-range">
            {detail.range.map((combo) => (
              <li key={combo.hand}>
                {combo.hand}
                {combo.weight !== 1 ? ` ${combo.weight}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : loading ? (
        <p className="meta">Loading pack…</p>
      ) : null}
    </>
  );
}
