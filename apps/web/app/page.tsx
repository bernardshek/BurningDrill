import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <h1>Poker Trainer</h1>
      <p className="lead">
        Personal NLHE cash drills from static strategy packs. First slice: 6-max
        toy pack, BTN vs BB SRP, HU-after-folds postflop. No live solving.
      </p>
      <div className="card">
        <h2>Start a drill</h2>
        <p className="meta" style={{ marginBottom: "1rem" }}>
          Load the toy pack, pick an action, see Best / Correct / Wrong + EV loss
          (bb). Best is the highest-EV action. Correct if EV loss is at most
          0.03bb or the mix is at least 15%.
        </p>
        <Link href="/drill">
          <button type="button">Open Drill →</button>
        </Link>
      </div>
      <div className="card">
        <h2>What this is not</h2>
        <ul className="meta">
          <li>No solver binaries in the deployable web app</li>
          <li>No GTO Wizard data, no RTA, no live solving</li>
          <li>Packs are versioned JSON assets only</li>
        </ul>
      </div>
    </>
  );
}
