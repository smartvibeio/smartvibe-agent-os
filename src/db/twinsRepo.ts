import type {
  AccountContext,
  DimensionKey,
  ScenarioPatterns,
  TradingTwinProfile,
} from "../domain/types.js";
import type { AppDatabase } from "./client.js";

interface TwinRow {
  id: string;
  user_id: string | null;
  display_name: string;
  version: number;
  status: TradingTwinProfile["status"];
  created_at: string;
  updated_at: string;
  cold_start_method: TradingTwinProfile["cold_start"]["method"];
  cold_start_completed: number;
  interview_turns: number;
  momentum_preference: number;
  patience: number;
  fomo_tendency: number;
  confirmation_need: number;
  holding_preference: number;
  risk_tolerance: number;
  drawdown_response: number;
  size_aggression: number;
  exposure_comfort: number;
  scenario_patterns: string;
  confidence_overall: number;
  confidence_by_dimension: string;
  style_tags: string;
  acct_exposure: AccountContext["exposure"];
  acct_concentration: AccountContext["concentration"];
  acct_btc_allocation_pct: number | null;
  acct_position_summary: string | null;
  acct_horizon_hint: AccountContext["horizon_hint"];
  acct_captured_at: string | null;
  evolution_stability: number;
  evolution_last_memory_id: string | null;
  evolution_last_shift_summary: string | null;
  evolution_recent_deltas: string;
  memory_count: number;
}

function rowToProfile(row: TwinRow): TradingTwinProfile {
  const account: AccountContext | null =
    row.acct_exposure ||
    row.acct_concentration ||
    row.acct_btc_allocation_pct != null ||
    row.acct_position_summary ||
    row.acct_horizon_hint
      ? {
          exposure: row.acct_exposure,
          concentration: row.acct_concentration,
          btc_allocation_pct: row.acct_btc_allocation_pct,
          position_summary: row.acct_position_summary,
          horizon_hint: row.acct_horizon_hint,
          captured_at: row.acct_captured_at,
        }
      : null;

  return {
    id: row.id,
    user_id: row.user_id,
    display_name: row.display_name,
    version: row.version,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    cold_start: {
      method: row.cold_start_method,
      completed: Boolean(row.cold_start_completed),
      interview_turns: row.interview_turns,
    },
    decision_tendencies: {
      momentum_preference: row.momentum_preference,
      patience: row.patience,
      fomo_tendency: row.fomo_tendency,
      confirmation_need: row.confirmation_need,
      holding_preference: row.holding_preference,
    },
    risk_preferences: {
      risk_tolerance: row.risk_tolerance,
      drawdown_response: row.drawdown_response,
      size_aggression: row.size_aggression,
      exposure_comfort: row.exposure_comfort,
    },
    scenario_response_patterns: JSON.parse(row.scenario_patterns) as ScenarioPatterns,
    confidence: {
      overall: row.confidence_overall,
      by_dimension: JSON.parse(row.confidence_by_dimension) as Partial<
        Record<DimensionKey, number>
      >,
    },
    style_tags: JSON.parse(row.style_tags) as string[],
    account_context_latest: account,
    evolution: {
      version: row.version,
      memory_count: row.memory_count,
      last_memory_id: row.evolution_last_memory_id,
      last_shift_summary: row.evolution_last_shift_summary,
      stability: row.evolution_stability,
      recent_delta_magnitudes: JSON.parse(row.evolution_recent_deltas) as number[],
    },
    memory_count: row.memory_count,
  };
}

export function createTwin(db: AppDatabase, profile: TradingTwinProfile): void {
  const acct = profile.account_context_latest;
  db.prepare(
    `INSERT INTO trading_twins (
      id, user_id, display_name, version, status, created_at, updated_at,
      cold_start_method, cold_start_completed, interview_turns,
      momentum_preference, patience, fomo_tendency, confirmation_need, holding_preference,
      risk_tolerance, drawdown_response, size_aggression, exposure_comfort,
      scenario_patterns, confidence_overall, confidence_by_dimension, style_tags,
      acct_exposure, acct_concentration, acct_btc_allocation_pct, acct_position_summary,
      acct_horizon_hint, acct_captured_at,
      evolution_stability, evolution_last_memory_id, evolution_last_shift_summary,
      evolution_recent_deltas, memory_count
    ) VALUES (
      @id, @user_id, @display_name, @version, @status, @created_at, @updated_at,
      @cold_start_method, @cold_start_completed, @interview_turns,
      @momentum_preference, @patience, @fomo_tendency, @confirmation_need, @holding_preference,
      @risk_tolerance, @drawdown_response, @size_aggression, @exposure_comfort,
      @scenario_patterns, @confidence_overall, @confidence_by_dimension, @style_tags,
      @acct_exposure, @acct_concentration, @acct_btc_allocation_pct, @acct_position_summary,
      @acct_horizon_hint, @acct_captured_at,
      @evolution_stability, @evolution_last_memory_id, @evolution_last_shift_summary,
      @evolution_recent_deltas, @memory_count
    )`,
  ).run({
    id: profile.id,
    user_id: profile.user_id,
    display_name: profile.display_name,
    version: profile.version,
    status: profile.status,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
    cold_start_method: profile.cold_start.method,
    cold_start_completed: profile.cold_start.completed ? 1 : 0,
    interview_turns: profile.cold_start.interview_turns,
    momentum_preference: profile.decision_tendencies.momentum_preference,
    patience: profile.decision_tendencies.patience,
    fomo_tendency: profile.decision_tendencies.fomo_tendency,
    confirmation_need: profile.decision_tendencies.confirmation_need,
    holding_preference: profile.decision_tendencies.holding_preference,
    risk_tolerance: profile.risk_preferences.risk_tolerance,
    drawdown_response: profile.risk_preferences.drawdown_response,
    size_aggression: profile.risk_preferences.size_aggression,
    exposure_comfort: profile.risk_preferences.exposure_comfort,
    scenario_patterns: JSON.stringify(profile.scenario_response_patterns),
    confidence_overall: profile.confidence.overall,
    confidence_by_dimension: JSON.stringify(profile.confidence.by_dimension),
    style_tags: JSON.stringify(profile.style_tags),
    acct_exposure: acct?.exposure ?? null,
    acct_concentration: acct?.concentration ?? null,
    acct_btc_allocation_pct: acct?.btc_allocation_pct ?? null,
    acct_position_summary: acct?.position_summary ?? null,
    acct_horizon_hint: acct?.horizon_hint ?? null,
    acct_captured_at: acct?.captured_at ?? null,
    evolution_stability: profile.evolution.stability,
    evolution_last_memory_id: profile.evolution.last_memory_id,
    evolution_last_shift_summary: profile.evolution.last_shift_summary,
    evolution_recent_deltas: JSON.stringify(profile.evolution.recent_delta_magnitudes),
    memory_count: profile.memory_count,
  });
}

export function getTwin(
  db: AppDatabase,
  id: string,
): TradingTwinProfile | null {
  const row = db.prepare(`SELECT * FROM trading_twins WHERE id = ?`).get(id) as
    | unknown as TwinRow
    | undefined;
  return row ? rowToProfile(row) : null;
}

export function listTwins(db: AppDatabase): TradingTwinProfile[] {
  const rows = db
    .prepare(`SELECT * FROM trading_twins ORDER BY display_name`)
    .all() as unknown as TwinRow[];
  return rows.map(rowToProfile);
}

export function updateTwin(db: AppDatabase, profile: TradingTwinProfile): void {
  const acct = profile.account_context_latest;
  db.prepare(
    `UPDATE trading_twins SET
      user_id=@user_id,
      display_name=@display_name,
      version=@version,
      status=@status,
      updated_at=@updated_at,
      cold_start_method=@cold_start_method,
      cold_start_completed=@cold_start_completed,
      interview_turns=@interview_turns,
      momentum_preference=@momentum_preference,
      patience=@patience,
      fomo_tendency=@fomo_tendency,
      confirmation_need=@confirmation_need,
      holding_preference=@holding_preference,
      risk_tolerance=@risk_tolerance,
      drawdown_response=@drawdown_response,
      size_aggression=@size_aggression,
      exposure_comfort=@exposure_comfort,
      scenario_patterns=@scenario_patterns,
      confidence_overall=@confidence_overall,
      confidence_by_dimension=@confidence_by_dimension,
      style_tags=@style_tags,
      acct_exposure=@acct_exposure,
      acct_concentration=@acct_concentration,
      acct_btc_allocation_pct=@acct_btc_allocation_pct,
      acct_position_summary=@acct_position_summary,
      acct_horizon_hint=@acct_horizon_hint,
      acct_captured_at=@acct_captured_at,
      evolution_stability=@evolution_stability,
      evolution_last_memory_id=@evolution_last_memory_id,
      evolution_last_shift_summary=@evolution_last_shift_summary,
      evolution_recent_deltas=@evolution_recent_deltas,
      memory_count=@memory_count
    WHERE id=@id`,
  ).run({
    id: profile.id,
    user_id: profile.user_id,
    display_name: profile.display_name,
    version: profile.version,
    status: profile.status,
    updated_at: profile.updated_at,
    cold_start_method: profile.cold_start.method,
    cold_start_completed: profile.cold_start.completed ? 1 : 0,
    interview_turns: profile.cold_start.interview_turns,
    momentum_preference: profile.decision_tendencies.momentum_preference,
    patience: profile.decision_tendencies.patience,
    fomo_tendency: profile.decision_tendencies.fomo_tendency,
    confirmation_need: profile.decision_tendencies.confirmation_need,
    holding_preference: profile.decision_tendencies.holding_preference,
    risk_tolerance: profile.risk_preferences.risk_tolerance,
    drawdown_response: profile.risk_preferences.drawdown_response,
    size_aggression: profile.risk_preferences.size_aggression,
    exposure_comfort: profile.risk_preferences.exposure_comfort,
    scenario_patterns: JSON.stringify(profile.scenario_response_patterns),
    confidence_overall: profile.confidence.overall,
    confidence_by_dimension: JSON.stringify(profile.confidence.by_dimension),
    style_tags: JSON.stringify(profile.style_tags),
    acct_exposure: acct?.exposure ?? null,
    acct_concentration: acct?.concentration ?? null,
    acct_btc_allocation_pct: acct?.btc_allocation_pct ?? null,
    acct_position_summary: acct?.position_summary ?? null,
    acct_horizon_hint: acct?.horizon_hint ?? null,
    acct_captured_at: acct?.captured_at ?? null,
    evolution_stability: profile.evolution.stability,
    evolution_last_memory_id: profile.evolution.last_memory_id,
    evolution_last_shift_summary: profile.evolution.last_shift_summary,
    evolution_recent_deltas: JSON.stringify(profile.evolution.recent_delta_magnitudes),
    memory_count: profile.memory_count,
  });
}
