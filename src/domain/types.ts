/** Shared domain types for SmartVibe Phase 1 */

export type TwinStatus = "cold_start" | "active" | "demo_preset";
export type ColdStartMethod =
  "trading_interview" | "account_context" | "demo_preset" | "mixed";
export type ExposureLevel = "low" | "medium" | "high";
export type HorizonHint = "short_term" | "swing" | "long_term";
export type VolatilityRegime = "low" | "medium" | "high" | "extreme";
export type MarketSource =
  "binance_mcp" | "binance_public" | "demo_fixture" | "interview_scenario";
export type UserChoiceSource = "user_ui" | "interview" | "demo";

export type DecisionPattern =
  | "open_position"
  | "chase_entry"
  | "enter_small"
  | "hold"
  | "observe_wait"
  | "trim"
  | "reduce_risk"
  | "exit_bias";

export type GapType =
  | "none"
  | "more_cautious_than_model"
  | "more_aggressive_than_model"
  | "horizon_mismatch"
  | "risk_mismatch"
  | "other";

export type ScenarioId =
  "same_market_demo" | "rapid_pump" | "sharp_drop" | "false_breakout" | string;

export type TendencyKey =
  | "momentum_preference"
  | "patience"
  | "fomo_tendency"
  | "confirmation_need"
  | "holding_preference";

export type RiskKey =
  | "risk_tolerance"
  | "drawdown_response"
  | "size_aggression"
  | "exposure_comfort";

export type DimensionKey = TendencyKey | RiskKey;

export interface DecisionTendencies {
  momentum_preference: number;
  patience: number;
  fomo_tendency: number;
  confirmation_need: number;
  holding_preference: number;
}

export interface RiskPreferences {
  risk_tolerance: number;
  drawdown_response: number;
  size_aggression: number;
  exposure_comfort: number;
}

export type ScenarioLeanMap = Partial<Record<DecisionPattern, number>>;

export interface ScenarioPatterns {
  rapid_pump?: ScenarioLeanMap;
  sharp_drop?: ScenarioLeanMap;
  false_breakout?: ScenarioLeanMap;
  same_market_demo?: ScenarioLeanMap;
  [scenarioId: string]: ScenarioLeanMap | undefined;
}

export interface AccountContext {
  exposure: ExposureLevel | null;
  concentration: ExposureLevel | null;
  btc_allocation_pct: number | null;
  position_summary: string | null;
  horizon_hint: HorizonHint | null;
  captured_at?: string | null;
}

export interface TradingTwinProfile {
  id: string;
  user_id: string | null;
  display_name: string;
  version: number;
  status: TwinStatus;
  created_at: string;
  updated_at: string;
  cold_start: {
    method: ColdStartMethod;
    completed: boolean;
    interview_turns: number;
  };
  decision_tendencies: DecisionTendencies;
  risk_preferences: RiskPreferences;
  scenario_response_patterns: ScenarioPatterns;
  confidence: {
    overall: number;
    by_dimension: Partial<Record<DimensionKey, number>>;
  };
  style_tags: string[];
  account_context_latest: AccountContext | null;
  evolution: {
    version: number;
    memory_count: number;
    last_memory_id: string | null;
    last_shift_summary: string | null;
    stability: number;
    recent_delta_magnitudes: number[];
  };
  memory_count: number;
  interview_answers?: Array<{ scenario_id: string; option_id: string }>;
  onboarding?: { goal: string; completedAt?: string; recordId?: string; conversationRootId?: string; reply?: import("../agent/coaching.js").CoachReply; history?: import("../agent/tradeImport.js").ReturnTradeImport };
  interview_snapshot?: {
    bank_version: string;
    questions: Array<{ scenario_id: string; group: string; question: string; options: Array<{ option_id: string; label: string }> }>;
  };
}

export interface MarketContext {
  symbol: string;
  summary: string;
  metrics: {
    price_change_pct: number;
    volatility_regime: VolatilityRegime | null;
    volume_change_pct: number | null;
    open_interest_change_pct: number | null;
    funding_rate: number | null;
    funding_elevated: boolean | null;
  };
  source: MarketSource;
}

export interface TwinResponse {
  decision_pattern: DecisionPattern;
  reasoning: string;
  confidence: number;
  activated_dimensions: string[];
  ui_headline?: string;
}

export interface UserReality {
  actual_choice: DecisionPattern;
  optional_explanation?: string | null;
  source: UserChoiceSource;
}

export interface Difference {
  aligned: boolean;
  gap_type: GapType;
  summary: string;
}

export interface EvolutionSnapshot {
  version: number;
  label: string;
  decision_tendencies: DecisionTendencies;
  risk_preferences: RiskPreferences;
  confidence_overall: number;
}

export interface DecisionMemory {
  id: string;
  twin_id: string;
  created_at: string;
  scenario_id: ScenarioId | null;
  demo_tag: string | null;
  market_context: MarketContext;
  account_context: AccountContext | null;
  twin_response: TwinResponse;
  user_reality: UserReality;
  learning: {
    difference: Difference;
    updated_pattern_deltas: Partial<Record<DimensionKey, number>>;
    confidence_change: {
      overall_delta: number;
      by_dimension?: Partial<Record<DimensionKey, number>>;
    };
    applied: boolean;
    narrative: string;
  };
  twin_snapshot_before: EvolutionSnapshot;
  twin_snapshot_after: EvolutionSnapshot;
}

/** Draft used by Evolve before ids/snapshots are finalized */
export interface DecisionMemoryDraft {
  scenario_id?: ScenarioId | null;
  market_context: MarketContext;
  account_context?: AccountContext | null;
  twin_response: TwinResponse;
  user_reality: UserReality;
  difference?: Difference;
}

export interface EvolveResult {
  profile: TradingTwinProfile;
  deltas: Partial<Record<DimensionKey, number>>;
  difference: Difference;
  confidence_change: {
    overall_delta: number;
    by_dimension: Partial<Record<DimensionKey, number>>;
  };
  narrative: string;
  l1_total: number;
}
