import type { DecisionMemory } from "../domain/types.js";
import type { AppDatabase } from "./client.js";

interface MemoryRow {
  id: string;
  twin_id: string;
  created_at: string;
  scenario_id: string | null;
  demo_tag: string | null;
  symbol: string;
  market_summary: string;
  price_change_pct: number;
  volatility_regime: string | null;
  volume_change_pct: number | null;
  oi_change_pct: number | null;
  funding_rate: number | null;
  funding_elevated: number | null;
  market_source: string;
  acct_exposure: string | null;
  acct_concentration: string | null;
  acct_btc_allocation_pct: number | null;
  acct_position_summary: string | null;
  acct_horizon_hint: string | null;
  twin_decision_pattern: string;
  twin_reasoning: string;
  twin_confidence: number;
  twin_activated_dimensions: string;
  twin_ui_headline: string | null;
  user_actual_choice: string;
  user_explanation: string | null;
  user_choice_source: string;
  diff_aligned: number;
  diff_gap_type: string;
  diff_summary: string;
  learning_applied: number;
  learning_deltas: string;
  confidence_change: string;
  learning_narrative: string;
  snapshot_before: string;
  snapshot_after: string;
}

function rowToMemory(row: MemoryRow): DecisionMemory {
  return {
    id: row.id,
    twin_id: row.twin_id,
    created_at: row.created_at,
    scenario_id: row.scenario_id,
    demo_tag: row.demo_tag,
    market_context: {
      symbol: row.symbol,
      summary: row.market_summary,
      metrics: {
        price_change_pct: row.price_change_pct,
        volatility_regime: row.volatility_regime as DecisionMemory["market_context"]["metrics"]["volatility_regime"],
        volume_change_pct: row.volume_change_pct,
        open_interest_change_pct: row.oi_change_pct,
        funding_rate: row.funding_rate,
        funding_elevated:
          row.funding_elevated == null ? null : Boolean(row.funding_elevated),
      },
      source: row.market_source as DecisionMemory["market_context"]["source"],
    },
    account_context:
      row.acct_exposure ||
      row.acct_concentration ||
      row.acct_btc_allocation_pct != null ||
      row.acct_position_summary ||
      row.acct_horizon_hint
        ? {
            exposure: row.acct_exposure as DecisionMemory["account_context"] extends null
              ? never
              : NonNullable<DecisionMemory["account_context"]>["exposure"],
            concentration: row.acct_concentration as NonNullable<
              DecisionMemory["account_context"]
            >["concentration"],
            btc_allocation_pct: row.acct_btc_allocation_pct,
            position_summary: row.acct_position_summary,
            horizon_hint: row.acct_horizon_hint as NonNullable<
              DecisionMemory["account_context"]
            >["horizon_hint"],
          }
        : null,
    twin_response: {
      decision_pattern: row.twin_decision_pattern as DecisionMemory["twin_response"]["decision_pattern"],
      reasoning: row.twin_reasoning,
      confidence: row.twin_confidence,
      activated_dimensions: JSON.parse(row.twin_activated_dimensions) as string[],
      ui_headline: row.twin_ui_headline ?? undefined,
    },
    user_reality: {
      actual_choice: row.user_actual_choice as DecisionMemory["user_reality"]["actual_choice"],
      optional_explanation: row.user_explanation,
      source: row.user_choice_source as DecisionMemory["user_reality"]["source"],
    },
    learning: {
      difference: {
        aligned: Boolean(row.diff_aligned),
        gap_type: row.diff_gap_type as DecisionMemory["learning"]["difference"]["gap_type"],
        summary: row.diff_summary,
      },
      updated_pattern_deltas: JSON.parse(row.learning_deltas),
      confidence_change: JSON.parse(row.confidence_change),
      applied: Boolean(row.learning_applied),
      narrative: row.learning_narrative,
    },
    twin_snapshot_before: JSON.parse(row.snapshot_before),
    twin_snapshot_after: JSON.parse(row.snapshot_after),
  };
}

export function insertMemory(db: AppDatabase, memory: DecisionMemory): void {
  const acct = memory.account_context;
  db.prepare(
    `INSERT INTO decision_memories (
      id, twin_id, created_at, scenario_id, demo_tag,
      symbol, market_summary, price_change_pct, volatility_regime,
      volume_change_pct, oi_change_pct, funding_rate, funding_elevated, market_source,
      acct_exposure, acct_concentration, acct_btc_allocation_pct, acct_position_summary, acct_horizon_hint,
      twin_decision_pattern, twin_reasoning, twin_confidence, twin_activated_dimensions, twin_ui_headline,
      user_actual_choice, user_explanation, user_choice_source,
      diff_aligned, diff_gap_type, diff_summary,
      learning_applied, learning_deltas, confidence_change, learning_narrative,
      snapshot_before, snapshot_after
    ) VALUES (
      @id, @twin_id, @created_at, @scenario_id, @demo_tag,
      @symbol, @market_summary, @price_change_pct, @volatility_regime,
      @volume_change_pct, @oi_change_pct, @funding_rate, @funding_elevated, @market_source,
      @acct_exposure, @acct_concentration, @acct_btc_allocation_pct, @acct_position_summary, @acct_horizon_hint,
      @twin_decision_pattern, @twin_reasoning, @twin_confidence, @twin_activated_dimensions, @twin_ui_headline,
      @user_actual_choice, @user_explanation, @user_choice_source,
      @diff_aligned, @diff_gap_type, @diff_summary,
      @learning_applied, @learning_deltas, @confidence_change, @learning_narrative,
      @snapshot_before, @snapshot_after
    )`,
  ).run({
    id: memory.id,
    twin_id: memory.twin_id,
    created_at: memory.created_at,
    scenario_id: memory.scenario_id,
    demo_tag: memory.demo_tag,
    symbol: memory.market_context.symbol,
    market_summary: memory.market_context.summary,
    price_change_pct: memory.market_context.metrics.price_change_pct,
    volatility_regime: memory.market_context.metrics.volatility_regime,
    volume_change_pct: memory.market_context.metrics.volume_change_pct,
    oi_change_pct: memory.market_context.metrics.open_interest_change_pct,
    funding_rate: memory.market_context.metrics.funding_rate,
    funding_elevated:
      memory.market_context.metrics.funding_elevated == null
        ? null
        : memory.market_context.metrics.funding_elevated
          ? 1
          : 0,
    market_source: memory.market_context.source,
    acct_exposure: acct?.exposure ?? null,
    acct_concentration: acct?.concentration ?? null,
    acct_btc_allocation_pct: acct?.btc_allocation_pct ?? null,
    acct_position_summary: acct?.position_summary ?? null,
    acct_horizon_hint: acct?.horizon_hint ?? null,
    twin_decision_pattern: memory.twin_response.decision_pattern,
    twin_reasoning: memory.twin_response.reasoning,
    twin_confidence: memory.twin_response.confidence,
    twin_activated_dimensions: JSON.stringify(
      memory.twin_response.activated_dimensions,
    ),
    twin_ui_headline: memory.twin_response.ui_headline ?? null,
    user_actual_choice: memory.user_reality.actual_choice,
    user_explanation: memory.user_reality.optional_explanation ?? null,
    user_choice_source: memory.user_reality.source,
    diff_aligned: memory.learning.difference.aligned ? 1 : 0,
    diff_gap_type: memory.learning.difference.gap_type,
    diff_summary: memory.learning.difference.summary,
    learning_applied: memory.learning.applied ? 1 : 0,
    learning_deltas: JSON.stringify(memory.learning.updated_pattern_deltas),
    confidence_change: JSON.stringify(memory.learning.confidence_change),
    learning_narrative: memory.learning.narrative,
    snapshot_before: JSON.stringify(memory.twin_snapshot_before),
    snapshot_after: JSON.stringify(memory.twin_snapshot_after),
  });
}

export function listMemoriesForTwin(
  db: AppDatabase,
  twinId: string,
): DecisionMemory[] {
  const rows = db
    .prepare(
      `SELECT * FROM decision_memories WHERE twin_id = ? ORDER BY created_at DESC`,
    )
    .all(twinId) as unknown as MemoryRow[];
  return rows.map(rowToMemory);
}
