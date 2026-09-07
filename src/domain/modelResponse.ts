import type {
  AccountContext,
  DecisionPattern,
  MarketContext,
  TradingTwinProfile,
  TwinResponse,
} from "./types.js";

/**
 * Deterministic Decision Pattern Modeling for fixtures/demo.
 * No LLM. Uses twin state + market + account heuristics.
 */
export function modelTwinResponse(
  twin: TradingTwinProfile,
  market: MarketContext,
  account?: AccountContext | null,
): TwinResponse {
  const acct = account ?? twin.account_context_latest;
  const t = twin.decision_tendencies;
  const r = twin.risk_preferences;
  const price = market.metrics.price_change_pct;
  const fundingElevated = market.metrics.funding_elevated === true;
  const highExposure =
    acct?.exposure === "high" || (acct?.btc_allocation_pct ?? 0) >= 60;
  const lowExposure =
    acct?.exposure === "low" || (acct?.btc_allocation_pct ?? 100) <= 20;

  const scores: Record<DecisionPattern, number> = {
    open_position: -Infinity,
    chase_entry: 0,
    enter_small: 0,
    hold: 0,
    observe_wait: 0,
    trim: 0,
    reduce_risk: 0,
    exit_bias: 0,
  };

  // Scenario lean priors
  const scenarioKey = inferScenarioKey(market);
  const lean = twin.scenario_response_patterns[scenarioKey] ?? {};
  for (const [k, v] of Object.entries(lean)) {
    scores[k as DecisionPattern] += (v ?? 0) * 0.35;
  }

  if (price >= 6) {
    scores.chase_entry += t.fomo_tendency * 0.35 + t.momentum_preference * 0.25;
    scores.observe_wait += t.patience * 0.3 + t.confirmation_need * 0.25;
    scores.enter_small +=
      t.momentum_preference * 0.15 + t.confirmation_need * 0.1;
    if (highExposure || r.drawdown_response < 35) {
      scores.reduce_risk +=
        (100 - r.drawdown_response) * 0.4 +
        (highExposure ? 35 : 0) +
        (fundingElevated ? 15 : 0);
      scores.trim += 20;
    }
    if (lowExposure && t.holding_preference > 60) {
      scores.hold += t.holding_preference * 0.45 + t.patience * 0.2;
      scores.observe_wait += 10;
    }
  } else if (price <= -6) {
    scores.reduce_risk += (100 - r.drawdown_response) * 0.4;
    scores.exit_bias += (100 - r.risk_tolerance) * 0.25;
    scores.hold += t.holding_preference * 0.4 + r.drawdown_response * 0.25;
    scores.enter_small += r.risk_tolerance * 0.2 + t.momentum_preference * 0.1;
  } else {
    // chop / failed break style
    scores.observe_wait += t.confirmation_need * 0.4 + t.patience * 0.2;
    scores.chase_entry +=
      t.momentum_preference * 0.25 + (100 - t.confirmation_need) * 0.2;
    scores.trim += highExposure ? 25 : 10;
    scores.reduce_risk += fundingElevated && highExposure ? 20 : 5;
  }

  const ranked = (Object.entries(scores) as [DecisionPattern, number][]).sort(
    (a, b) => b[1] - a[1],
  );
  const decision_pattern = ranked[0][0];
  const top = ranked[0][1];
  const second = ranked[1]?.[1] ?? 0;
  const confidence = Math.min(
    0.92,
    Math.max(0.45, twin.confidence.overall * 0.5 + (top - second) / 200 + 0.25),
  );

  const activated = buildActivated(twin, acct, market, decision_pattern);
  const reasoning = buildReasoning(decision_pattern, activated, market, acct);
  const ui_headline = `Lean toward ${decision_pattern.replaceAll("_", " ")} in this setup`;

  return {
    decision_pattern,
    reasoning,
    confidence: Math.round(confidence * 1000) / 1000,
    activated_dimensions: activated,
    ui_headline,
  };
}

function inferScenarioKey(market: MarketContext): string {
  const p = market.metrics.price_change_pct;
  if (p >= 10) return "rapid_pump";
  if (p <= -6) return "sharp_drop";
  if (Math.abs(p) < 3 && market.metrics.funding_elevated)
    return "false_breakout";
  if (p >= 6) return "same_market_demo";
  return "same_market_demo";
}

function buildActivated(
  twin: TradingTwinProfile,
  acct: AccountContext | null | undefined,
  market: MarketContext,
  pattern: DecisionPattern,
): string[] {
  const out: string[] = [];
  if ((acct?.btc_allocation_pct ?? 0) >= 60) out.push("high_exposure");
  if ((acct?.btc_allocation_pct ?? 100) <= 20) out.push("low_exposure");
  if (twin.decision_tendencies.fomo_tendency >= 60)
    out.push("high_fomo_tendency");
  if (twin.decision_tendencies.patience >= 60) out.push("high_patience");
  if (twin.risk_preferences.drawdown_response <= 35)
    out.push("low_drawdown_response");
  if (twin.decision_tendencies.holding_preference >= 65)
    out.push("high_holding_preference");
  if (acct?.horizon_hint === "short_term") out.push("short_term_horizon");
  if (acct?.horizon_hint === "long_term") out.push("long_term_horizon");
  if (market.metrics.funding_elevated) out.push("elevated_funding");
  if (pattern === "reduce_risk") out.push("risk_management_lean");
  return out;
}

function buildReasoning(
  pattern: DecisionPattern,
  activated: string[],
  market: MarketContext,
  acct: AccountContext | null | undefined,
): string {
  const bits = activated.slice(0, 4).join(", ");
  if (pattern === "reduce_risk") {
    return `Current market (+${market.metrics.price_change_pct}% / funding elevated=${market.metrics.funding_elevated}) conflicts with this user's risk pattern (${bits || "defensive lean"}).`;
  }
  if (pattern === "hold" || pattern === "observe_wait") {
    return `Current volatility does not conflict with this user's longer-horizon pattern (${bits || "patient lean"}; alloc=${acct?.btc_allocation_pct ?? "n/a"}%).`;
  }
  return `Modeled decision pattern "${pattern}" from twin state (${bits || "balanced signals"}).`;
}
