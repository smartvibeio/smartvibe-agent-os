import type {
  DecisionPattern,
  DimensionKey,
  MarketContext,
} from "../domain/types.js";

/** Primary behavioral axis this scenario is designed to probe */
export type InterviewCategory =
  | "fomo"
  | "panic_selling"
  | "patience"
  | "risk_tolerance"
  | "confirmation_bias";

export type DimensionImpact = Partial<Record<DimensionKey, number>>;

export interface InterviewOption {
  option_id: string;
  label: string;
  decision_pattern: DecisionPattern;
  /** Explicit Twin dimension deltas for cold-start aggregation */
  dimension_impact: DimensionImpact;
}

export interface InterviewScenario {
  scenario_id: string;
  category: InterviewCategory;
  title?: string;
  market_context: MarketContext;
  question: string;
  options: InterviewOption[];
}

export interface InterviewAnswer {
  scenario_id: string;
  option_id: string;
}

/**
 * Cold-start impact design rules (MVP, no ML):
 *
 * 1. BASE score for every Twin dimension = 50.
 * 2. Each selected option applies its `dimension_impact` deltas (already signed).
 * 3. Per-option |delta| per dimension should stay in [4, 12] for MVP readability.
 * 4. After all answers: clamp each dimension to [0, 100].
 * 5. Impacts are scenario-authored (explicit), not inferred only from DecisionPattern —
 *    so the library stays extensible without changing Evolve().
 * 6. Interview never writes DecisionMemory; it only builds TradingTwinProfile v0.
 *
 * Category → typical dimensions nudged:
 * - fomo              → fomo_tendency, momentum_preference, patience
 * - panic_selling     → drawdown_response, risk_tolerance, holding_preference
 * - patience          → patience, confirmation_need, momentum_preference
 * - risk_tolerance    → risk_tolerance, size_aggression, exposure_comfort
 * - confirmation_bias → confirmation_need, momentum_preference, fomo_tendency
 */
export const INTERVIEW_IMPACT_RULES = {
  base_score: 50,
  recommended_abs_delta_min: 4,
  recommended_abs_delta_max: 12,
  clamp_min: 0,
  clamp_max: 100,
  writes_decision_memory: false,
  produces: "TradingTwinProfile v0",
} as const;
