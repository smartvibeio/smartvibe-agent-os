import { randomUUID } from "node:crypto";
import type {
  DecisionTendencies,
  DimensionKey,
  RiskPreferences,
  TradingTwinProfile,
} from "../domain/types.js";
import {
  getInterviewSet,
  MVP_INTERVIEW_SCENARIO_IDS,
  resolveOption,
} from "./scenarioLibrary.js";
import type { InterviewAnswer, InterviewScenario } from "./types.js";
import { INTERVIEW_IMPACT_RULES } from "./types.js";

function clamp(n: number): number {
  return Math.min(
    INTERVIEW_IMPACT_RULES.clamp_max,
    Math.max(INTERVIEW_IMPACT_RULES.clamp_min, Math.round(n * 10) / 10),
  );
}

function emptyDims(base: number): {
  tendencies: DecisionTendencies;
  risks: RiskPreferences;
} {
  return {
    tendencies: {
      momentum_preference: base,
      patience: base,
      fomo_tendency: base,
      confirmation_need: base,
      holding_preference: base,
    },
    risks: {
      risk_tolerance: base,
      drawdown_response: base,
      size_aggression: base,
      exposure_comfort: base,
    },
  };
}

function applyImpact(
  tendencies: DecisionTendencies,
  risks: RiskPreferences,
  impact: Partial<Record<DimensionKey, number>>,
): void {
  for (const [key, delta] of Object.entries(impact) as [DimensionKey, number][]) {
    if (key in tendencies) {
      tendencies[key as keyof DecisionTendencies] = clamp(
        tendencies[key as keyof DecisionTendencies] + delta,
      );
    } else if (key in risks) {
      risks[key as keyof RiskPreferences] = clamp(
        risks[key as keyof RiskPreferences] + delta,
      );
    }
  }
}

/**
 * Build TradingTwinProfile v0 from Interview Scenario Library answers.
 * Uses each option's explicit `dimension_impact` (extensible, no Evolve/LLM).
 */
export function createTwinFromInterviewAnswers(args: {
  display_name?: string;
  scenarios?: InterviewScenario[];
  answers: InterviewAnswer[];
  account?: TradingTwinProfile["account_context_latest"];
}): TradingTwinProfile {
  const scenarios = args.scenarios ?? getInterviewSet(MVP_INTERVIEW_SCENARIO_IDS);
  const byId = new Map(scenarios.map((s) => [s.scenario_id, s]));
  const { tendencies, risks } = emptyDims(INTERVIEW_IMPACT_RULES.base_score);

  for (const answer of args.answers) {
    const scenario = byId.get(answer.scenario_id);
    if (!scenario) {
      throw new Error(`Answer references unknown scenario: ${answer.scenario_id}`);
    }
    const option = resolveOption(scenario, answer.option_id);
    if (!option) {
      throw new Error(
        `Unknown option '${answer.option_id}' for scenario ${answer.scenario_id}`,
      );
    }
    applyImpact(tendencies, risks, option.dimension_impact);
  }

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    user_id: null,
    display_name: args.display_name ?? "Your Trading Twin",
    version: 0,
    status: "cold_start",
    created_at: now,
    updated_at: now,
    cold_start: {
      method: "trading_interview",
      completed: true,
      interview_turns: args.answers.length,
    },
    decision_tendencies: tendencies,
    risk_preferences: risks,
    scenario_response_patterns: {},
    confidence: {
      overall: 0.35,
      by_dimension: {},
    },
    style_tags: deriveTags(tendencies, risks, args.account),
    account_context_latest: args.account ?? {
      exposure: "medium",
      concentration: "medium",
      btc_allocation_pct: 25,
      position_summary: "Demo account context (fixture)",
      horizon_hint: "swing",
      captured_at: now,
    },
    evolution: {
      version: 0,
      memory_count: 0,
      last_memory_id: null,
      last_shift_summary: null,
      stability: 0.25,
      recent_delta_magnitudes: [],
    },
    memory_count: 0,
  };
}

/**
 * @deprecated Prefer createTwinFromInterviewAnswers with scenario_id + option_id.
 * Kept for short demos that only pass decision_pattern sequence against MVP set order.
 */
export function createTwinFromInterview(args: {
  display_name?: string;
  choices: string[];
  account?: TradingTwinProfile["account_context_latest"];
  scenarioIds?: readonly string[];
}): TradingTwinProfile {
  const ids = args.scenarioIds ?? MVP_INTERVIEW_SCENARIO_IDS;
  const scenarios = getInterviewSet(ids.slice(0, args.choices.length));
  const answers = scenarios.map((scenario, i) => {
    const choice = args.choices[i];
    const option = resolveOption(scenario, choice);
    if (!option) {
      throw new Error(`No option matching '${choice}' in ${scenario.scenario_id}`);
    }
    return { scenario_id: scenario.scenario_id, option_id: option.option_id };
  });
  return createTwinFromInterviewAnswers({
    display_name: args.display_name,
    scenarios,
    answers,
    account: args.account,
  });
}

function deriveTags(
  t: DecisionTendencies,
  r: RiskPreferences,
  account: TradingTwinProfile["account_context_latest"] | undefined,
): string[] {
  const tags: string[] = [];
  if (t.fomo_tendency >= 60) tags.push("momentum_sensitive");
  if (t.patience >= 60) tags.push("patient");
  if (r.drawdown_response <= 40) tags.push("drawdown_sensitive");
  if (t.holding_preference >= 60) tags.push("holder_lean");
  if (r.risk_tolerance >= 60) tags.push("risk_tolerant");
  if (t.confirmation_need >= 60) tags.push("confirmation_seeking");
  if ((account?.btc_allocation_pct ?? 0) >= 60) tags.push("high_exposure");
  if ((account?.btc_allocation_pct ?? 100) <= 20) tags.push("low_exposure");
  return tags;
}
