import type { Metadata } from "next";
import { SolverShellClient } from "@/components/SolverShellClient";

export const metadata: Metadata = {
  title: "Solver shell · Poker Trainer",
  description:
    "Read-only view of pack mix and EV. gradeDrillNode labels actions. No live solve.",
};

export default function SolverShellPage() {
  return (
    <>
      <h1>Solver shell</h1>
      <p className="lead">
        Read-only view of the actions, mix, and EV stored on our pack nodes.
        Best, Correct, and Wrong come from gradeDrillNode. Nothing is solved
        in the browser or on Vercel.
      </p>
      <SolverShellClient />
    </>
  );
}
