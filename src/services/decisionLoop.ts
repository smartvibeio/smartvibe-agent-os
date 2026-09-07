import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/client.js";
import { evolve, snapshotFromProfile } from "../domain/evolve.js";
import type {
  DecisionMemory,
  DecisionMemoryDraft,
  DecisionPattern,
  TradingTwinProfile,
} from "../domain/types.js";
import { insertMemory } from "../db/memoriesRepo.js";
import { updateTwin } from "../db/twinsRepo.js";

/**
 * Apply one closed loop: Evolve → persist Memory → update Twin.
 */
export function applyDecisionLoop(
  db: AppDatabase,
  twin: TradingTwinProfile,
  draft: DecisionMemoryDraft,
  opts?: { demo_tag?: string | null; memory_id?: string },
): { profile: TradingTwinProfile; memory: DecisionMemory } {
  const before = snapshotFromProfile(twin);
  const result = evolve(twin, draft);
  const memoryId = opts?.memory_id ?? randomUUID();
  const createdAt = new Date().toISOString();

  const profile: TradingTwinProfile = {
    ...result.profile,
    evolution: {
      ...result.profile.evolution,
      last_memory_id: memoryId,
    },
  };

  const memory: DecisionMemory = {
    id: memoryId,
    twin_id: twin.id,
    created_at: createdAt,
    scenario_id: draft.scenario_id ?? null,
    demo_tag: opts?.demo_tag ?? null,
    market_context: draft.market_context,
    account_context: draft.account_context ?? twin.account_context_latest,
    twin_response: draft.twin_response,
    user_reality: draft.user_reality,
    learning: {
      difference: result.difference,
      updated_pattern_deltas: result.deltas,
      confidence_change: result.confidence_change,
      applied: true,
      narrative: result.narrative,
    },
    twin_snapshot_before: before,
    twin_snapshot_after: snapshotFromProfile(profile),
  };

  insertMemory(db, memory);
  updateTwin(db, profile);
  return { profile, memory };
}

export function makeDraft(args: {
  scenario_id?: string;
  market: DecisionMemoryDraft["market_context"];
  account?: DecisionMemoryDraft["account_context"];
  modeled: DecisionPattern;
  actual: DecisionPattern;
  reasoning?: string;
}): DecisionMemoryDraft {
  return {
    scenario_id: args.scenario_id,
    market_context: args.market,
    account_context: args.account,
    twin_response: {
      decision_pattern: args.modeled,
      reasoning: args.reasoning ?? `Modeled pattern ${args.modeled}`,
      confidence: 0.7,
      activated_dimensions: [],
      ui_headline: `Lean toward ${args.modeled}`,
    },
    user_reality: {
      actual_choice: args.actual,
      source: "demo",
    },
  };
}
