import { describe, expect, it } from "vitest";
import { evolve, EVOLVE_CONSTANTS, computeDifference } from "../src/domain/evolve.js";
import type { DecisionMemoryDraft, TradingTwinProfile } from "../src/domain/types.js";
import { twinAFixture, sameMarketStimulus } from "../src/fixtures/demoData.js";

function baseTwin(overrides?: Partial<TradingTwinProfile>): TradingTwinProfile {
  return {
    ...structuredClone(twinAFixture),
    version: 0,
    confidence: { overall: 0.5, by_dimension: {} },
    evolution: {
      version: 0,
      memory_count: 0,
      last_memory_id: null,
      last_shift_summary: null,
      stability: 0.3,
      recent_delta_magnitudes: [],
    },
    memory_count: 0,
    ...overrides,
  };
}

function draft(partial: Partial<DecisionMemoryDraft> & {
  modeled: DecisionMemoryDraft["twin_response"]["decision_pattern"];
  actual: DecisionMemoryDraft["user_reality"]["actual_choice"];
}): DecisionMemoryDraft {
  return {
    scenario_id: partial.scenario_id ?? "same_market_demo",
    market_context: partial.market_context ?? sameMarketStimulus,
    account_context: partial.account_context,
    twin_response: {
      decision_pattern: partial.modeled,
      reasoning: "test",
      confidence: 0.7,
      activated_dimensions: ["test"],
    },
    user_reality: {
      actual_choice: partial.actual,
      source: "demo",
    },
  };
}

describe("Evolve()", () => {
  it("Case 1: aligned feedback raises confidence", () => {
    const old = baseTwin();
    const result = evolve(
      old,
      draft({ modeled: "reduce_risk", actual: "reduce_risk" }),
    );
    expect(result.difference.aligned).toBe(true);
    expect(result.profile.confidence.overall).toBeGreaterThan(old.confidence.overall);
    expect(result.confidence_change.overall_delta).toBeCloseTo(
      EVOLVE_CONSTANTS.CONF_ALIGNED,
      5,
    );
    expect(result.profile.version).toBe(old.version + 1);
  });

  it("Case 2: mismatched feedback adjusts patterns toward user choice", () => {
    const old = baseTwin({
      decision_tendencies: {
        momentum_preference: 70,
        patience: 30,
        fomo_tendency: 65,
        confirmation_need: 30,
        holding_preference: 30,
      },
    });
    // Twin modeled chase; user waited → patience up, fomo/momentum down
    const result = evolve(
      old,
      draft({
        modeled: "chase_entry",
        actual: "observe_wait",
        scenario_id: "rapid_pump",
      }),
    );
    expect(result.difference.aligned).toBe(false);
    expect(result.profile.decision_tendencies.patience).toBeGreaterThan(
      old.decision_tendencies.patience,
    );
    expect(result.profile.decision_tendencies.fomo_tendency).toBeLessThan(
      old.decision_tendencies.fomo_tendency,
    );
    expect(result.profile.decision_tendencies.momentum_preference).toBeLessThan(
      old.decision_tendencies.momentum_preference,
    );
  });

  it("Case 3: repeated same feedback evolves gradually", () => {
    let twin = baseTwin({
      decision_tendencies: {
        momentum_preference: 50,
        patience: 50,
        fomo_tendency: 50,
        confirmation_need: 50,
        holding_preference: 50,
      },
      risk_preferences: {
        risk_tolerance: 50,
        drawdown_response: 50,
        size_aggression: 50,
        exposure_comfort: 50,
      },
    });
    const patienceSeries: number[] = [twin.decision_tendencies.patience];
    for (let i = 0; i < 5; i++) {
      twin = evolve(
        twin,
        draft({ modeled: "observe_wait", actual: "observe_wait" }),
      ).profile;
      patienceSeries.push(twin.decision_tendencies.patience);
    }
    // Monotonic non-decreasing and bounded
    for (let i = 1; i < patienceSeries.length; i++) {
      expect(patienceSeries[i]).toBeGreaterThanOrEqual(patienceSeries[i - 1] - 0.01);
    }
    const totalGain = patienceSeries.at(-1)! - patienceSeries[0];
    expect(totalGain).toBeGreaterThan(2);
    expect(totalGain).toBeLessThan(5 * EVOLVE_CONSTANTS.MAX_PER_DIM);
    // Later steps shrink as stability rises
    const step1 = patienceSeries[1] - patienceSeries[0];
    const step5 = patienceSeries[5] - patienceSeries[4];
    expect(step5).toBeLessThanOrEqual(step1 + 0.01);
  });

  it("Case 4: single anomalous action cannot rewrite the model", () => {
    const old = baseTwin({
      evolution: {
        version: 0,
        memory_count: 0,
        last_memory_id: null,
        last_shift_summary: null,
        stability: 0.2, // low stability → larger but still capped steps
        recent_delta_magnitudes: [],
      },
    });
    const result = evolve(
      old,
      draft({
        modeled: "hold",
        actual: "chase_entry",
        scenario_id: "rapid_pump",
      }),
    );

    expect(result.l1_total).toBeLessThanOrEqual(EVOLVE_CONSTANTS.MAX_L1_TOTAL);
    for (const delta of Object.values(result.deltas)) {
      expect(Math.abs(delta ?? 0)).toBeLessThanOrEqual(
        EVOLVE_CONSTANTS.MAX_PER_DIM + 0.01,
      );
    }

    const absMoves = (
      Object.keys(old.decision_tendencies) as (keyof typeof old.decision_tendencies)[]
    ).map((k) =>
      Math.abs(
        result.profile.decision_tendencies[k] - old.decision_tendencies[k],
      ),
    );
    expect(Math.max(...absMoves)).toBeLessThanOrEqual(
      EVOLVE_CONSTANTS.MAX_PER_DIM + 0.01,
    );
  });
});

describe("computeDifference", () => {
  it("treats same-family choices as aligned", () => {
    const d = computeDifference("reduce_risk", "trim");
    expect(d.aligned).toBe(true);
  });
});
