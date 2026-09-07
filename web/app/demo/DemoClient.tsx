"use client";

import { useCallback, useMemo, useState } from "react";
import type { SessionPublicView } from "@smartvibe/demo/sessionEngine.js";

type View = SessionPublicView;

const STEPS = [
  { id: "STATE_SAME_MARKET_COMPARE", label: "Same Market" },
  { id: "STATE_INITIALIZE_TWIN", label: "Interview" },
  { id: "STATE_MARKET_CONTEXT", label: "Market" },
  { id: "STATE_TWIN_RESPONSE", label: "Twin Response" },
  { id: "STATE_USER_CHOICE", label: "Your Choice" },
  { id: "STATE_REFLECTION", label: "Reflection" },
  { id: "STATE_EVOLUTION_EVIDENCE", label: "Evolution" },
  { id: "STATE_DEMO_END", label: "Close" },
] as const;

function patternLabel(view: View, pattern: string | null | undefined) {
  if (!pattern) return "—";
  return view.ui_labels.pattern_display[pattern] ?? pattern.replaceAll("_", " ");
}

function DimBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="muted" style={{ fontSize: 12 }}>
        {label}: {value}
      </div>
      <div className="bar">
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export default function DemoClient() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const start = () =>
    run(async () => {
      const res = await fetch("/api/demo/session", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start");
      setView(data);
    });

  const act = (action: Record<string, unknown>) =>
    run(async () => {
      if (!view) return;
      const res = await fetch("/api/demo/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: view.session_id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setView(data);
    });

  const activeStep = useMemo(() => {
    if (!view) return "";
    if (
      view.state === "STATE_MEMORY_WRITE" ||
      view.state === "STATE_TWIN_UPDATE" ||
      view.state === "STATE_EVOLUTION_EVIDENCE"
    ) {
      return "STATE_EVOLUTION_EVIDENCE";
    }
    if (view.state === "STATE_TWIN_RESPONSE") return "STATE_TWIN_RESPONSE";
    return view.state;
  }, [view]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">
            <span>SmartVibe</span> AI Trading Doppelgänger
          </div>
          <p className="tagline">
            Your AI twin learns how you respond to the market.
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="badge">DEMO_MODE=fixtures</div>
          {view?.dashboard.twin_name ? (
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Current Twin: <strong style={{ color: "var(--text)" }}>{view.dashboard.twin_name}</strong>
              <br />
              Status: {view.dashboard.twin_status} · v{view.dashboard.twin_version}
            </div>
          ) : null}
        </div>
      </header>

      <div className="steps">
        {STEPS.map((s) => {
          const idx = STEPS.findIndex((x) => x.id === activeStep);
          const my = STEPS.findIndex((x) => x.id === s.id);
          const cls =
            s.id === activeStep
              ? "step-pill active"
              : my < idx
                ? "step-pill done"
                : "step-pill";
          return (
            <span key={s.id} className={cls}>
              {s.label}
            </span>
          );
        })}
      </div>

      {!view ? (
        <section className="card">
          <div className="panel-title">Trading Twin Dashboard</div>
          <h1 className="h1">Ready to run fixture demo</h1>
          <p className="muted">
            No login. No live exchange. Session auto-seeds Trader A / B fixtures
            and opens the Decision Evolution Loop.
          </p>
          <div className="actions">
            <button className="btn btn-primary" disabled={loading} onClick={start}>
              {loading ? "Starting…" : "Launch Demo"}
            </button>
          </div>
        </section>
      ) : null}

      {view && view.state === "STATE_SAME_MARKET_COMPARE" ? (
        <SameMarketPanel view={view} loading={loading} onContinue={() => act({ type: "continue_from_same_market" })} />
      ) : null}

      {view && view.state === "STATE_INITIALIZE_TWIN" ? (
        <InterviewPanel
          view={view}
          loading={loading}
          onPick={(option_id) => act({ type: "submit_interview_option", option_id })}
        />
      ) : null}

      {view && view.state === "STATE_MARKET_CONTEXT" ? (
        <MarketPanel
          view={view}
          loading={loading}
          onSelect={(scenario_id) => act({ type: "select_loop_scenario", scenario_id })}
          onContinue={() => act({ type: "continue_to_twin_response" })}
        />
      ) : null}

      {view &&
      (view.state === "STATE_TWIN_RESPONSE" ||
        view.state === "STATE_USER_CHOICE") ? (
        <TwinResponsePanel
          view={view}
          loading={loading}
          onChoose={(choice) => act({ type: "submit_user_choice", choice })}
        />
      ) : null}

      {view && view.state === "STATE_REFLECTION" ? (
        <ReflectionPanel
          view={view}
          loading={loading}
          onContinue={() => act({ type: "continue_after_reflection" })}
        />
      ) : null}

      {view &&
      (view.state === "STATE_EVOLUTION_EVIDENCE" ||
        view.state === "STATE_DEMO_END" ||
        view.state === "STATE_MEMORY_WRITE" ||
        view.state === "STATE_TWIN_UPDATE") ? (
        <EvolutionPanel view={view} onRestart={start} />
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}

function SameMarketPanel({
  view,
  loading,
  onContinue,
}: {
  view: View;
  loading: boolean;
  onContinue: () => void;
}) {
  const sm = view.same_market!;
  const m = sm.stimulus.metrics;
  return (
    <>
      <section className="card">
        <div className="panel-title">Core exhibit</div>
        <div className="hero-line">
          Same market.
          <br />
          <em>Different minds.</em>
        </div>
        <p className="muted">{sm.stimulus.summary}</p>
        <div className="metric-row">
          <div className="metric">
            BTC <strong>+{m.price_change_pct}%</strong>
          </div>
          <div className="metric">
            OI <strong>Increasing ({m.open_interest_change_pct}%)</strong>
          </div>
          <div className="metric">
            Funding <strong>Elevated</strong>
          </div>
        </div>
      </section>
      <div className="grid-2" style={{ marginTop: 12 }}>
        <TwinMindCard
          name={sm.trader_a.name}
          hints={sm.trader_a.hints}
          pattern={patternLabel(view, sm.trader_a.response?.decision_pattern)}
          reason={sm.trader_a.response?.reasoning ?? ""}
        />
        <TwinMindCard
          name={sm.trader_b.name}
          hints={sm.trader_b.hints}
          pattern={patternLabel(view, sm.trader_b.response?.decision_pattern)}
          reason={sm.trader_b.response?.reasoning ?? ""}
        />
      </div>
      <div className="actions">
        <button className="btn btn-primary" disabled={loading} onClick={onContinue}>
          Initialize Your Trading Twin
        </button>
      </div>
    </>
  );
}

function TwinMindCard({
  name,
  hints,
  pattern,
  reason,
}: {
  name: string;
  hints: string[];
  pattern: string;
  reason: string;
}) {
  return (
    <section className="card">
      <div className="panel-title">{name}</div>
      <div className="muted" style={{ marginBottom: 10 }}>
        {hints.join(" · ")}
      </div>
      <div className="h2">Twin Response</div>
      <div style={{ color: "var(--accent)", fontWeight: 700, marginBottom: 8 }}>
        {pattern}
      </div>
      <p className="muted">{reason}</p>
    </section>
  );
}

function InterviewPanel({
  view,
  loading,
  onPick,
}: {
  view: View;
  loading: boolean;
  onPick: (optionId: string) => void;
}) {
  const scenario = view.interview.scenarios[view.interview.current_index];
  if (!scenario) return null;
  return (
    <section className="card">
      <div className="panel-title">
        Initialize Your Trading Twin · {view.interview.current_index + 1}/
        {view.interview.scenarios.length}
      </div>
      <div className="badge" style={{ marginBottom: 12 }}>
        {scenario.category}
      </div>
      <h1 className="h1">{scenario.title ?? scenario.scenario_id}</h1>
      <p className="muted">{scenario.market_context.summary}</p>
      <div className="metric-row">
        <div className="metric">
          Δprice{" "}
          <strong>{scenario.market_context.metrics.price_change_pct}%</strong>
        </div>
        <div className="metric">
          Vol <strong>{scenario.market_context.metrics.volatility_regime}</strong>
        </div>
      </div>
      <h2 className="h2">{scenario.question}</h2>
      {scenario.options.map((o) => (
        <button
          key={o.option_id}
          className="option"
          disabled={loading}
          onClick={() => onPick(o.option_id)}
        >
          {o.label}
          <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            pattern: {patternLabel(view, o.decision_pattern)}
          </div>
        </button>
      ))}
      <p className="muted" style={{ marginTop: 14 }}>
        Cold start only — not a personality quiz. Twin v0 is built from option
        dimension impacts in the Scenario Library.
      </p>
    </section>
  );
}

function MarketPanel({
  view,
  loading,
  onSelect,
  onContinue,
}: {
  view: View;
  loading: boolean;
  onSelect: (id: string) => void;
  onContinue: () => void;
}) {
  const m = view.loop.market_context?.metrics;
  return (
    <section className="card">
      <div className="panel-title">Market Context</div>
      <h1 className="h1">Choose a fixture scenario</h1>
      <div className="grid-2">
        {view.loop.scenarios.map((s) => (
          <button
            key={s.scenario_id}
            className={
              "option" +
              (view.loop.active_scenario_id === s.scenario_id ? " selected" : "")
            }
            disabled={loading}
            onClick={() => onSelect(s.scenario_id)}
          >
            <strong>{s.title}</strong>
            <div className="muted" style={{ marginTop: 6 }}>
              {s.market_context.summary}
            </div>
          </button>
        ))}
      </div>
      {m ? (
        <div className="metric-row">
          <div className="metric">
            Δprice <strong>{m.price_change_pct}%</strong>
          </div>
          <div className="metric">
            OI <strong>{m.open_interest_change_pct ?? "n/a"}%</strong>
          </div>
          <div className="metric">
            Funding elevated <strong>{String(m.funding_elevated)}</strong>
          </div>
        </div>
      ) : null}
      {view.user_twin ? (
        <div className="card" style={{ marginTop: 12, background: "var(--bg-elevated)" }}>
          <div className="panel-title">Current Twin</div>
          <div className="kv">
            <div className="k">Name</div>
            <div>{view.user_twin.display_name}</div>
            <div className="k">Status</div>
            <div>{view.dashboard.twin_status}</div>
            <div className="k">Version</div>
            <div>v{view.user_twin.version}</div>
          </div>
        </div>
      ) : null}
      <div className="actions">
        <button className="btn btn-primary" disabled={loading} onClick={onContinue}>
          Model Twin Response
        </button>
      </div>
    </section>
  );
}

function TwinResponsePanel({
  view,
  loading,
  onChoose,
}: {
  view: View;
  loading: boolean;
  onChoose: (choice: string) => void;
}) {
  const tr = view.loop.twin_response;
  const scenario = view.loop.scenarios.find(
    (s) => s.scenario_id === view.loop.active_scenario_id,
  );
  return (
    <>
      <section className="card">
        <div className="panel-title">Twin Response · Decision Pattern Modeling</div>
        <h1 className="h1">{patternLabel(view, tr?.decision_pattern)}</h1>
        <p className="muted">{tr?.reasoning}</p>
        <div className="metric-row">
          <div className="metric">
            Confidence <strong>{Math.round((tr?.confidence ?? 0) * 100)}%</strong>
          </div>
        </div>
        <div className="muted">
          Activated: {(tr?.activated_dimensions ?? []).join(", ") || "—"}
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          This models how you usually lean in similar setups. Not a BUY/SELL
          recommendation.
        </p>
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <div className="panel-title">Your Real Choice</div>
        <h2 className="h2">What would you actually lean toward?</h2>
        {(scenario?.options ?? []).map((o) => (
          <button
            key={o.id}
            className="option"
            disabled={loading}
            onClick={() => onChoose(o.id)}
          >
            {o.label}
            <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
              {patternLabel(view, o.id)}
            </div>
          </button>
        ))}
      </section>
    </>
  );
}

function ReflectionPanel({
  view,
  loading,
  onContinue,
}: {
  view: View;
  loading: boolean;
  onContinue: () => void;
}) {
  const d = view.loop.difference;
  return (
    <section className="card">
      <div className="panel-title">Reflection · Twin vs You</div>
      <div className="kv">
        <div className="k">Twin modeled</div>
        <div>{patternLabel(view, view.loop.twin_response?.decision_pattern)}</div>
        <div className="k">You chose</div>
        <div>{patternLabel(view, view.loop.user_choice)}</div>
        <div className="k">Aligned</div>
        <div>{d?.aligned ? "Yes" : "No"} · {d?.gap_type}</div>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        {d?.summary}
      </p>
      <div className="actions">
        <button className="btn btn-primary" disabled={loading} onClick={onContinue}>
          Write Decision Memory & Evolve Twin
        </button>
      </div>
    </section>
  );
}

function EvolutionPanel({
  view,
  onRestart,
}: {
  view: View;
  onRestart: () => void;
}) {
  const before = view.evolution.before;
  const after = view.evolution.after;
  const keys = [
    "momentum_preference",
    "patience",
    "fomo_tendency",
    "confirmation_need",
    "holding_preference",
  ] as const;

  return (
    <>
      <section className="card">
        <div className="panel-title">Decision Memory</div>
        {view.memories.length === 0 ? (
          <p className="muted">No memories yet.</p>
        ) : (
          view.memories.map((m) => (
            <div
              key={m.id}
              className="card"
              style={{ background: "var(--bg-elevated)", marginTop: 8 }}
            >
              <div className="kv">
                <div className="k">Market</div>
                <div>{m.market_context.summary}</div>
                <div className="k">Twin</div>
                <div>{patternLabel(view, m.twin_response.decision_pattern)}</div>
                <div className="k">You</div>
                <div>{patternLabel(view, m.user_reality.actual_choice)}</div>
                <div className="k">Difference</div>
                <div>
                  {m.learning.difference.aligned ? "aligned" : m.learning.difference.gap_type}
                </div>
                <div className="k">Learning</div>
                <div>{m.learning.narrative}</div>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="panel-title">Twin Evolution</div>
        <h1 className="h1">
          {before?.label ?? "Twin v0"} → {after?.label ?? "Twin v1"}
        </h1>
        <p className="muted">Updated from Decision Memory</p>
        {before && after
          ? keys.map((k) => {
              const a = before.decision_tendencies[k];
              const b = after.decision_tendencies[k];
              return (
                <div key={k} style={{ marginTop: 10 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {k}: {a} → {b}
                  </div>
                  <DimBar label="after" value={b} />
                </div>
              );
            })
          : null}
        {view.user_twin ? (
          <div style={{ marginTop: 16 }}>
            <div className="panel-title">Current Twin snapshot</div>
            <DimBar
              label="momentum"
              value={view.user_twin.decision_tendencies.momentum_preference}
            />
            <DimBar label="patience" value={view.user_twin.decision_tendencies.patience} />
            <DimBar label="fomo" value={view.user_twin.decision_tendencies.fomo_tendency} />
          </div>
        ) : null}
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="hero-line" style={{ fontSize: 22 }}>
          Your AI twin does not predict the market.
          <br />
          <em>It learns how you respond to the market.</em>
        </div>
        {view.closing_lines.map((line) => (
          <p key={line} className="muted">
            {line}
          </p>
        ))}
        <div className="actions">
          <button className="btn btn-primary" onClick={onRestart}>
            Run Demo Again
          </button>
        </div>
      </section>
    </>
  );
}
