"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Temporary theme preview — verifies every brand-tinted surface derives from
 * --brand-hue in globals.css. Delete once real dashboards land.
 *
 * Class names are written out in full: Tailwind scans source text, so a
 * computed `bg-${name}` would never be generated.
 */

const STATUSES = [
  { label: "Present", className: "bg-status-present text-status-present-foreground" },
  { label: "Absent", className: "bg-status-absent text-status-absent-foreground" },
  { label: "OD", className: "bg-status-od text-status-od-foreground" },
  { label: "Excused", className: "bg-status-excused text-status-excused-foreground" },
];

const CHARTS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

export default function Home() {
  const [dark, setDark] = useState(false);

  function toggle() {
    setDark((d) => !d);
    document.documentElement.classList.toggle("dark");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Theme preview</h1>
          <p className="text-muted-foreground text-sm">
            Change <code className="text-foreground">--brand-hue</code> in globals.css — everything
            below follows, in both modes.
          </p>
        </div>
        <Button variant="outline" onClick={toggle}>
          {dark ? "Light" : "Dark"}
        </Button>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Brand — derived from --brand-hue
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Mark Attendance</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="bg-accent text-accent-foreground rounded-lg p-3 text-sm">
          Accent surface — brand-tinted, used for hovers and selected rows.
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Attendance status — fixed hues, independent of brand
        </h2>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <span
              key={s.label}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${s.className}`}
            >
              {s.label}
            </span>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Chart series — fan out from the brand hue
        </h2>
        <div className="flex gap-2">
          {CHARTS.map((c) => (
            <div key={c} className={`h-10 flex-1 rounded-md ${c}`} />
          ))}
        </div>
      </section>
    </main>
  );
}
