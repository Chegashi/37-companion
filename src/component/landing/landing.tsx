"use client";
import { useState } from "react";
import { FiAward, FiCalendar, FiCompass, FiMap } from "react-icons/fi";
import { Logo } from "@/component/shell/AppShell";

const FEATURES = [
  { icon: FiCompass, title: "Holy graph & tracks", text: "Every project, its prerequisites and your live intra status, by career track." },
  { icon: FiAward, title: "RNCP planner", text: "Every block, your marks, and the level your plan gets you to." },
  { icon: FiCalendar, title: "Calculator & calendar", text: "The level after each project, and a week calendar for your own plans." },
  { icon: FiMap, title: "Campus", text: "Live clusters, rank, alumni and peer finder." },
];

export function LandingComponent() {
  const [busy, setBusy] = useState(false);
  return (
    <main className="c-landing">
      <section className="c-landing-hero">
        <div className="c-landing-brand"><Logo size={44} /><span>37<em>Companion</em></span></div>
        <h1>Your 42 cursus,<br /><span>mapped to the finish line.</span></h1>
        <p>An open-source tracker for students of the 42 network and 1337: holy graph, RNCP titles, level calculator, eval sheets and campus tools.</p>
        <button className="c-btn c-btn--primary c-btn--lg" disabled={busy} onClick={() => { setBusy(true); window.location.href = "/api/auth/login"; }}>
          {busy ? "Redirecting to 42…" : "Sign in with 42"}
        </button>
        <small>Signs in with your 42 intra account · your progress is read live from the 42 API</small>
      </section>
      <section className="c-landing-grid">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <article key={title} className="c-card c-landing-card">
            <Icon />
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
