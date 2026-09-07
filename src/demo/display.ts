import type {
  DecisionMemory,
  DecisionPattern,
  EvolutionSnapshot,
  TradingTwinProfile,
  TwinResponse,
} from "../domain/types.js";
import type { InterviewOption } from "./interview.js";

const LINE = "─".repeat(56);
const DOUBLE = "═".repeat(56);

export function banner(title: string): string {
  return `\n${DOUBLE}\n ${title}\n${DOUBLE}`;
}

export function section(title: string): string {
  return `\n${LINE}\n ${title}\n${LINE}`;
}

export function formatSameMarketDifferentMinds(args: {
  marketSummary: string;
  traderA: { name: string; profileHints: string[]; response: TwinResponse };
  traderB: { name: string; profileHints: string[]; response: TwinResponse };
}): string {
  const lines = [
    banner("SAME MARKET. DIFFERENT MINDS."),
    "",
    `Market: ${args.marketSummary}`,
    "BTC +8% · OI rising · Funding elevated",
    "",
    `▶ ${args.traderA.name}`,
    `  Profile: ${args.traderA.profileHints.join(" · ")}`,
    `  Twin Response: ${labelPattern(args.traderA.response.decision_pattern)}`,
    `  Reason: ${args.traderA.response.reasoning}`,
    "",
    `▶ ${args.traderB.name}`,
    `  Profile: ${args.traderB.profileHints.join(" · ")}`,
    `  Twin Response: ${labelPattern(args.traderB.response.decision_pattern)}`,
    `  Reason: ${args.traderB.response.reasoning}`,
    "",
    "Same market.",
    "Different minds.",
  ];
  return lines.join("\n");
}

export function formatTwinSnapshot(twin: TradingTwinProfile): string {
  const t = twin.decision_tendencies;
  const r = twin.risk_preferences;
  return [
    section(`Trading Twin v${twin.version} — ${twin.display_name}`),
    `Status: ${twin.status} · Confidence: ${(twin.confidence.overall * 100).toFixed(0)}% · Memories: ${twin.memory_count}`,
    "",
    "Decision tendencies",
    `  momentum     ${bar(t.momentum_preference)} ${t.momentum_preference}`,
    `  patience     ${bar(t.patience)} ${t.patience}`,
    `  fomo         ${bar(t.fomo_tendency)} ${t.fomo_tendency}`,
    `  confirmation ${bar(t.confirmation_need)} ${t.confirmation_need}`,
    `  holding      ${bar(t.holding_preference)} ${t.holding_preference}`,
    "",
    "Risk preferences",
    `  risk tol.    ${bar(r.risk_tolerance)} ${r.risk_tolerance}`,
    `  drawdown     ${bar(r.drawdown_response)} ${r.drawdown_response}`,
    `  size aggr.   ${bar(r.size_aggression)} ${r.size_aggression}`,
    `  exposure     ${bar(r.exposure_comfort)} ${r.exposure_comfort}`,
    "",
    `Account: BTC ${twin.account_context_latest?.btc_allocation_pct ?? "n/a"}% · ${twin.account_context_latest?.horizon_hint ?? "n/a"}`,
    twin.style_tags.length ? `Tags: ${twin.style_tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatTwinResponse(response: TwinResponse): string {
  return [
    section("Twin Response — Decision Pattern Modeling"),
    `Pattern: ${labelPattern(response.decision_pattern)}`,
    response.ui_headline ? `Headline: ${response.ui_headline}` : "",
    `Confidence: ${(response.confidence * 100).toFixed(0)}%`,
    `Reasoning: ${response.reasoning}`,
    `Activated: ${response.activated_dimensions.join(", ") || "—"}`,
    "",
    "This models how you usually lean in similar setups.",
    "It is not a trade recommendation.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatOptions(options: InterviewOption[]): string {
  return options
    .map((o, i) => `  [${i + 1}] ${o.label}  (${o.id})`)
    .join("\n");
}

export function formatReflection(args: {
  modeled: DecisionPattern;
  actual: DecisionPattern;
  aligned: boolean;
  gapType: string;
  summary: string;
}): string {
  return [
    section("Reflection — Twin vs You"),
    `Twin modeled: ${labelPattern(args.modeled)}`,
    `You chose:    ${labelPattern(args.actual)}`,
    args.aligned
      ? "Result: aligned with your twin's current pattern."
      : `Result: differs (${args.gapType}).`,
    args.summary,
  ].join("\n");
}

export function formatDecisionMemory(memory: DecisionMemory): string {
  const m = memory.market_context.metrics;
  return [
    section("Decision Memory — Twin Evolution Evidence"),
    `Memory ID: ${memory.id.slice(0, 8)}…`,
    `Scenario: ${memory.scenario_id ?? "n/a"}`,
    "",
    "Market Context",
    `  ${memory.market_context.symbol} · ${memory.market_context.summary}`,
    `  Δprice ${m.price_change_pct}% · vol ${m.volatility_regime} · OI ${m.open_interest_change_pct ?? "n/a"}% · funding elevated=${m.funding_elevated}`,
    "",
    "Account Context",
    `  exposure=${memory.account_context?.exposure ?? "n/a"} · BTC ${memory.account_context?.btc_allocation_pct ?? "n/a"}%`,
    "",
    "Twin Response",
    `  ${labelPattern(memory.twin_response.decision_pattern)} · conf ${(memory.twin_response.confidence * 100).toFixed(0)}%`,
    "",
    "User Reality",
    `  ${labelPattern(memory.user_reality.actual_choice)}`,
    "",
    "Learning",
    `  aligned=${memory.learning.difference.aligned} · ${memory.learning.difference.gap_type}`,
    `  deltas: ${formatDeltas(memory.learning.updated_pattern_deltas)}`,
    `  confidence Δ: ${memory.learning.confidence_change.overall_delta}`,
    `  ${memory.learning.narrative}`,
  ].join("\n");
}

export function formatEvolutionEvidence(args: {
  before: EvolutionSnapshot;
  after: EvolutionSnapshot;
}): string {
  const keys = [
    "momentum_preference",
    "patience",
    "fomo_tendency",
    "confirmation_need",
    "holding_preference",
  ] as const;

  const rows = keys.map((k) => {
    const a = args.before.decision_tendencies[k];
    const b = args.after.decision_tendencies[k];
    const d = Math.round((b - a) * 10) / 10;
    const arrow = d > 0 ? `↑${d}` : d < 0 ? `↓${Math.abs(d)}` : "·";
    return `  ${k.padEnd(22)} ${String(a).padStart(5)} → ${String(b).padStart(5)}  ${arrow}`;
  });

  return [
    section("Evolution Evidence"),
    `Before: ${args.before.label} (confidence ${(args.before.confidence_overall * 100).toFixed(0)}%)`,
    `After:  ${args.after.label} (confidence ${(args.after.confidence_overall * 100).toFixed(0)}%)`,
    "",
    ...rows,
    "",
    "Your AI twin is changing because of your real choices.",
  ].join("\n");
}

export function formatClosing(): string {
  return [
    banner("DEMO CLOSE"),
    "",
    "SmartVibe creates a personal decision twin",
    "that learns how you respond to the market.",
    "",
    "Your AI twin does not predict the market.",
    "It learns how you respond to the market.",
    "",
  ].join("\n");
}

function labelPattern(p: DecisionPattern): string {
  return p.replaceAll("_", " ");
}

function bar(value: number): string {
  const filled = Math.round(value / 10);
  return `[${"#".repeat(filled)}${".".repeat(10 - filled)}]`;
}

function formatDeltas(deltas: Record<string, number>): string {
  const parts = Object.entries(deltas)
    .filter(([, v]) => Math.abs(v) >= 0.05)
    .map(([k, v]) => `${k}${v > 0 ? "+" : ""}${v}`);
  return parts.length ? parts.join(", ") : "(none)";
}
