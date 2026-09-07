import type {
  AccountContext,
  DecisionMemoryDraft,
  DecisionPattern,
  Difference,
  DimensionKey,
  EvolveResult,
  GapType,
  RiskPreferences,
  TradingTwinProfile,
  DecisionTendencies,
} from "./types.js";

export const EVOLVE_CONSTANTS = {
  BASE_ALIGNED: 1.0,
  BASE_MISALIGNED: 2.5,
  MAX_PER_DIM: 4.0,
  MAX_L1_TOTAL: 12.0,
  CONF_ALIGNED: 0.02,
  CONF_MISALIGNED: 0.03,
  CONF_DIM_UP: 0.03,
  CONF_DIM_DOWN: 0.02,
  CONF_DIM_RECOVER: 0.01,
  CONF_MIN: 0.15,
  CONF_MAX: 0.95,
  STABILITY_MIN: 0.2,
  STABILITY_MAX: 0.85,
  STABILITY_ALIGNED_BUMP: 0.04,
  STABILITY_MISALIGNED_BUMP: 0.02,
  SCENARIO_BONUS: 2.0,
  SCENARIO_PENALTY: 0.5,
} as const;

const AGGRESSIVE: ReadonlySet<DecisionPattern> = new Set([
  "open_position",
  "chase_entry",
  "enter_small",
]);
const PASSIVE: ReadonlySet<DecisionPattern> = new Set(["hold", "observe_wait"]);
const DEFENSIVE: ReadonlySet<DecisionPattern> = new Set([
  "trim",
  "reduce_risk",
  "exit_bias",
]);

type DirectionMap = Partial<Record<DimensionKey, 1 | -1>>;

/** User choice → which dimensions rise / fall */
export const CHOICE_DIRECTION: Record<DecisionPattern, DirectionMap> = {
  open_position: {}, // 单次开仓本身不足以判定追涨或耐心，保留证据，不推断习惯。
  chase_entry: {
    momentum_preference: 1,
    fomo_tendency: 1,
    size_aggression: 1,
    risk_tolerance: 1,
    patience: -1,
    confirmation_need: -1,
  },
  enter_small: {
    momentum_preference: 1,
    confirmation_need: 1,
    fomo_tendency: -1,
  },
  hold: {
    holding_preference: 1,
    patience: 1,
    drawdown_response: 1,
    fomo_tendency: -1,
    size_aggression: -1,
  },
  observe_wait: {
    patience: 1,
    confirmation_need: 1,
    momentum_preference: -1,
    fomo_tendency: -1,
  },
  trim: {
    confirmation_need: 1,
    risk_tolerance: -1,
    exposure_comfort: -1,
    size_aggression: -1,
  },
  reduce_risk: {
    patience: 1,
    risk_tolerance: -1,
    drawdown_response: -1,
    exposure_comfort: -1,
    fomo_tendency: -1,
  },
  exit_bias: {
    confirmation_need: 1,
    risk_tolerance: -1,
    drawdown_response: -1,
    holding_preference: -1,
    momentum_preference: -1,
  },
};

function familyOf(
  pattern: DecisionPattern,
): "aggressive" | "passive" | "defensive" {
  if (AGGRESSIVE.has(pattern)) return "aggressive";
  if (PASSIVE.has(pattern)) return "passive";
  return "defensive";
}

export function computeDifference(
  modeled: DecisionPattern,
  actual: DecisionPattern,
): Difference {
  if (modeled === actual) {
    return {
      aligned: true,
      gap_type: "none",
      summary: `User choice matched modeled pattern (${actual}).`,
    };
  }

  const sameFamily = familyOf(modeled) === familyOf(actual);
  if (sameFamily) {
    return {
      aligned: true,
      gap_type: "none",
      summary: `User choice ${actual} is in the same family as modeled ${modeled}.`,
    };
  }

  const modeledFamily = familyOf(modeled);
  const actualFamily = familyOf(actual);
  let gap_type: GapType = "other";
  if (actualFamily === "defensive" || actualFamily === "passive") {
    if (modeledFamily === "aggressive") gap_type = "more_cautious_than_model";
  }
  if (actualFamily === "aggressive") {
    if (modeledFamily === "defensive" || modeledFamily === "passive") {
      gap_type = "more_aggressive_than_model";
    }
  }

  return {
    aligned: false,
    gap_type,
    summary: `User chose ${actual} while twin modeled ${modeled}.`,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function stepScale(stability: number): number {
  const s = clamp(
    stability,
    EVOLVE_CONSTANTS.STABILITY_MIN,
    EVOLVE_CONSTANTS.STABILITY_MAX,
  );
  return 1.0 - 0.6 * s;
}

function applyScenarioExtras(
  scenarioId: string | null | undefined,
  choice: DecisionPattern,
  deltas: Partial<Record<DimensionKey, number>>,
  scale: number,
): void {
  const extra = 0.5 * scale;
  if (scenarioId === "rapid_pump") {
    if (choice === "observe_wait" || choice === "reduce_risk") {
      deltas.fomo_tendency = (deltas.fomo_tendency ?? 0) - extra;
      deltas.patience = (deltas.patience ?? 0) + extra;
    }
    if (choice === "chase_entry") {
      deltas.fomo_tendency = (deltas.fomo_tendency ?? 0) + extra;
    }
  }
  if (scenarioId === "sharp_drop") {
    if (choice === "reduce_risk" || choice === "exit_bias") {
      deltas.drawdown_response = (deltas.drawdown_response ?? 0) - extra;
    }
    if (choice === "hold") {
      deltas.holding_preference = (deltas.holding_preference ?? 0) + extra;
    }
  }
  if (scenarioId === "false_breakout") {
    if (choice === "observe_wait" || choice === "trim") {
      deltas.confirmation_need = (deltas.confirmation_need ?? 0) + extra;
      deltas.momentum_preference = (deltas.momentum_preference ?? 0) - extra;
    }
  }
}

function applyAccountExtras(
  account: AccountContext | null | undefined,
  choice: DecisionPattern,
  deltas: Partial<Record<DimensionKey, number>>,
  scale: number,
): void {
  if (!account) return;
  const extra = 0.5 * scale;
  const defensive =
    choice === "reduce_risk" || choice === "trim" || choice === "exit_bias";
  if (account.exposure === "high" && defensive) {
    deltas.risk_tolerance = (deltas.risk_tolerance ?? 0) - extra;
    deltas.exposure_comfort = (deltas.exposure_comfort ?? 0) - extra;
  }
}

function enforceBudgets(deltas: Partial<Record<DimensionKey, number>>): {
  capped: Partial<Record<DimensionKey, number>>;
  l1: number;
} {
  const capped: Partial<Record<DimensionKey, number>> = {};
  for (const [k, v] of Object.entries(deltas) as [DimensionKey, number][]) {
    if (v === 0 || Number.isNaN(v)) continue;
    capped[k] = clamp(
      v,
      -EVOLVE_CONSTANTS.MAX_PER_DIM,
      EVOLVE_CONSTANTS.MAX_PER_DIM,
    );
  }

  const normalize = () => {
    let l1 = Object.values(capped).reduce((s, v) => s + Math.abs(v ?? 0), 0);
    if (l1 > EVOLVE_CONSTANTS.MAX_L1_TOTAL && l1 > 0) {
      const factor = EVOLVE_CONSTANTS.MAX_L1_TOTAL / l1;
      for (const k of Object.keys(capped) as DimensionKey[]) {
        capped[k] = (capped[k] ?? 0) * factor;
      }
    }
    for (const k of Object.keys(capped) as DimensionKey[]) {
      capped[k] = round2(capped[k] ?? 0);
      if (capped[k] === 0) delete capped[k];
    }
    return Object.values(capped).reduce((s, v) => s + Math.abs(v ?? 0), 0);
  };

  let l1 = normalize();
  // Second pass removes residual float overshoot after rounding.
  if (l1 > EVOLVE_CONSTANTS.MAX_L1_TOTAL) {
    l1 = normalize();
  }
  if (l1 > EVOLVE_CONSTANTS.MAX_L1_TOTAL) {
    const keys = Object.keys(capped) as DimensionKey[];
    keys.sort((a, b) => Math.abs(capped[b] ?? 0) - Math.abs(capped[a] ?? 0));
    const top = keys[0];
    if (top) {
      const overshoot = round2(l1 - EVOLVE_CONSTANTS.MAX_L1_TOTAL);
      const sign = Math.sign(capped[top] ?? 0) || 1;
      capped[top] = round2((capped[top] ?? 0) - sign * overshoot);
      if (capped[top] === 0) delete capped[top];
    }
    l1 = Object.values(capped).reduce((s, v) => s + Math.abs(v ?? 0), 0);
  }

  return { capped, l1: round2(l1) };
}

function readDim(profile: TradingTwinProfile, key: DimensionKey): number {
  if (key in profile.decision_tendencies) {
    return profile.decision_tendencies[key as keyof DecisionTendencies];
  }
  return profile.risk_preferences[key as keyof RiskPreferences];
}

function writeDim(
  tendencies: DecisionTendencies,
  risks: RiskPreferences,
  key: DimensionKey,
  value: number,
): void {
  const v = clamp(value, 0, 100);
  if (key in tendencies) {
    (tendencies as unknown as Record<string, number>)[key] = round2(v);
  } else {
    (risks as unknown as Record<string, number>)[key] = round2(v);
  }
}

function updateScenarioPatterns(
  profile: TradingTwinProfile,
  scenarioId: string | null | undefined,
  choice: DecisionPattern,
  scale: number,
): TradingTwinProfile["scenario_response_patterns"] {
  const patterns = structuredClone(profile.scenario_response_patterns);
  if (!scenarioId) return patterns;

  const lean = { ...(patterns[scenarioId] ?? {}) };
  lean[choice] = clamp(
    (lean[choice] ?? 0) + EVOLVE_CONSTANTS.SCENARIO_BONUS * scale,
    0,
    100,
  );
  for (const key of Object.keys(lean) as DecisionPattern[]) {
    if (key === choice) continue;
    lean[key] = clamp(
      (lean[key] ?? 0) - EVOLVE_CONSTANTS.SCENARIO_PENALTY * scale,
      0,
      100,
    );
  }
  patterns[scenarioId] = lean;
  return patterns;
}

function buildNarrative(
  difference: Difference,
  deltas: Partial<Record<DimensionKey, number>>,
): string {
  const moved = Object.entries(deltas)
    .filter(([, v]) => Math.abs(v ?? 0) >= 0.5)
    .map(([k, v]) => `${k} ${(v ?? 0) > 0 ? "↑" : "↓"}`)
    .slice(0, 3)
    .join(", ");
  if (difference.aligned) {
    return `Your AI twin reinforced its pattern (${moved || "minor shifts"}). It is changing because of your real choices.`;
  }
  return `Your AI twin adjusted after a mismatch (${moved || "bounded update"}). It is changing because of your real choices.`;
}

/**
 * Pure Evolve(): no I/O, no LLM.
 * Old twin + decision feedback → updated twin state.
 */
export function evolve(
  old: TradingTwinProfile,
  draft: DecisionMemoryDraft,
): EvolveResult {
  const difference =
    draft.difference ??
    computeDifference(
      draft.twin_response.decision_pattern,
      draft.user_reality.actual_choice,
    );

  const scale = stepScale(old.evolution.stability);
  const base = difference.aligned
    ? EVOLVE_CONSTANTS.BASE_ALIGNED
    : EVOLVE_CONSTANTS.BASE_MISALIGNED;

  const directions = CHOICE_DIRECTION[draft.user_reality.actual_choice];
  const raw: Partial<Record<DimensionKey, number>> = {};
  for (const [dim, dir] of Object.entries(directions) as [
    DimensionKey,
    1 | -1,
  ][]) {
    // enter_small uses smaller momentum step
    let magnitude = base * scale;
    if (
      draft.user_reality.actual_choice === "enter_small" &&
      (dim === "momentum_preference" || dim === "confirmation_need")
    ) {
      magnitude *= 0.6;
    }
    if (
      draft.user_reality.actual_choice === "enter_small" &&
      dim === "fomo_tendency"
    ) {
      magnitude *= 0.4;
    }
    raw[dim] = (raw[dim] ?? 0) + dir * magnitude;
  }

  applyScenarioExtras(
    draft.scenario_id,
    draft.user_reality.actual_choice,
    raw,
    scale,
  );
  applyAccountExtras(
    draft.account_context ?? old.account_context_latest,
    draft.user_reality.actual_choice,
    raw,
    scale,
  );

  const { capped: deltas, l1 } = enforceBudgets(raw);

  const tendencies = { ...old.decision_tendencies };
  const risks = { ...old.risk_preferences };
  for (const [key, delta] of Object.entries(deltas) as [
    DimensionKey,
    number,
  ][]) {
    writeDim(tendencies, risks, key, readDim(old, key) + delta);
  }

  const byDim: Partial<Record<DimensionKey, number>> = {
    ...old.confidence.by_dimension,
  };
  const confDimDelta: Partial<Record<DimensionKey, number>> = {};

  for (const key of Object.keys(deltas) as DimensionKey[]) {
    const prev = byDim[key] ?? old.confidence.overall;
    if (difference.aligned) {
      const next = clamp(
        prev + EVOLVE_CONSTANTS.CONF_DIM_UP,
        EVOLVE_CONSTANTS.CONF_MIN,
        EVOLVE_CONSTANTS.CONF_MAX,
      );
      confDimDelta[key] = round2(next - prev);
      byDim[key] = round2(next);
    } else {
      const dipped = clamp(
        prev -
          EVOLVE_CONSTANTS.CONF_DIM_DOWN +
          EVOLVE_CONSTANTS.CONF_DIM_RECOVER,
        EVOLVE_CONSTANTS.CONF_MIN,
        EVOLVE_CONSTANTS.CONF_MAX,
      );
      confDimDelta[key] = round2(dipped - prev);
      byDim[key] = round2(dipped);
    }
  }

  const overallDelta = difference.aligned
    ? EVOLVE_CONSTANTS.CONF_ALIGNED
    : EVOLVE_CONSTANTS.CONF_MISALIGNED;
  const newOverall = round2(
    clamp(
      old.confidence.overall +
        (draft.user_reality.actual_choice === "open_position"
          ? 0
          : overallDelta),
      EVOLVE_CONSTANTS.CONF_MIN,
      EVOLVE_CONSTANTS.CONF_MAX,
    ),
  );

  const stabilityBump = difference.aligned
    ? EVOLVE_CONSTANTS.STABILITY_ALIGNED_BUMP
    : EVOLVE_CONSTANTS.STABILITY_MISALIGNED_BUMP;
  const newStability = round2(
    clamp(
      old.evolution.stability + stabilityBump,
      EVOLVE_CONSTANTS.STABILITY_MIN,
      EVOLVE_CONSTANTS.STABILITY_MAX,
    ),
  );

  const now = new Date().toISOString();
  const newVersion = old.version + 1;
  const narrative = buildNarrative(difference, deltas);
  const recent = [...old.evolution.recent_delta_magnitudes, l1].slice(-10);

  const profile: TradingTwinProfile = {
    ...old,
    version: newVersion,
    updated_at: now,
    status: old.status === "cold_start" ? "active" : old.status,
    decision_tendencies: tendencies,
    risk_preferences: risks,
    scenario_response_patterns: updateScenarioPatterns(
      old,
      draft.scenario_id,
      draft.user_reality.actual_choice,
      scale,
    ),
    confidence: {
      overall: newOverall,
      by_dimension: byDim,
    },
    memory_count: old.memory_count + 1,
    evolution: {
      version: newVersion,
      memory_count: old.memory_count + 1,
      last_memory_id: old.evolution.last_memory_id,
      last_shift_summary: narrative,
      stability: newStability,
      recent_delta_magnitudes: recent,
    },
  };

  return {
    profile,
    deltas,
    difference,
    confidence_change: {
      overall_delta: round2(newOverall - old.confidence.overall),
      by_dimension: confDimDelta,
    },
    narrative,
    l1_total: l1,
  };
}

export function snapshotFromProfile(profile: TradingTwinProfile) {
  return {
    version: profile.version,
    label: `Trading Twin v${profile.version}`,
    decision_tendencies: { ...profile.decision_tendencies },
    risk_preferences: { ...profile.risk_preferences },
    confidence_overall: profile.confidence.overall,
  };
}
