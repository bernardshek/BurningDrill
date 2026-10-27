"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getOrCreateLocalUser } from "@/lib/user";

export function SiteNav() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    setUserId(getOrCreateLocalUser().id);
  }, []);

  return (
    <nav className="nav">
      <Link href="/" className="brand">
        Poker Trainer
      </Link>
      <Link href="/">Home</Link>
      <Link href="/drill">Drill</Link>
      {userId ? (
        <span className="user-chip" title="Local user_id stub (localStorage)">
          user:{userId.slice(0, 8)}…
        </span>
      ) : null}
    </nav>
  );
}
