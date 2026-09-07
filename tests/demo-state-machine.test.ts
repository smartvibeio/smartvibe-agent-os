import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb, migrate } from "../src/db/client.js";
import { listMemoriesForTwin } from "../src/db/memoriesRepo.js";
import { DEMO_FLOW, nextState } from "../src/demo/states.js";
import { runDemo, type DemoIO } from "../src/demo/stateMachine.js";
import { createTwinFromInterview } from "../src/demo/createTwinFromInterview.js";
import { tradingInterviewTurns } from "../src/demo/interview.js";
import {
  CORE_THREE_SCENARIO_IDS,
  getInterviewSet,
  interviewScenarioLibrary,
  MVP_INTERVIEW_SCENARIO_IDS,
} from "../src/interview/scenarioLibrary.js";
import { createTwinFromInterviewAnswers } from "../src/interview/createTwinFromInterview.js";
import { INTERVIEW_IMPACT_RULES } from "../src/interview/types.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const core3Json = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/fixtures/interviewScenarios.core3.json",
    ),
    "utf8",
  ),
) as Array<{ scenario_id: string }>;

const tempDbs: string[] = [];

function tempDbPath() {
  const p = path.join(
    os.tmpdir(),
    `smartvibe-phase2-${Date.now()}-${Math.random().toString(16).slice(2)}.db`,
  );
  tempDbs.push(p);
  return p;
}

afterEach(() => {
  while (tempDbs.length) {
    const p = tempDbs.pop()!;
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
});

function captureIO(): DemoIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print: (text) => {
      output.push(text);
    },
    choose: async () => 1,
  };
}

describe("Demo state machine", () => {
  it("defines the expected demo flow order", () => {
    expect(DEMO_FLOW[0]).toBe("STATE_SAME_MARKET_COMPARE");
    expect(DEMO_FLOW.includes("STATE_EVOLUTION_EVIDENCE")).toBe(true);
    expect(nextState("STATE_BOOT")).toBe("STATE_SAME_MARKET_COMPARE");
    expect(nextState("STATE_EVOLUTION_EVIDENCE")).toBe("STATE_DEMO_END");
  });

  it("runs full auto demo with Same Market + Evolution Evidence", async () => {
    const dbPath = tempDbPath();
    const db = openDb(dbPath);
    migrate(db);
    const io = captureIO();

    const ctx = await runDemo({
      db,
      io,
      loopScenarioId: "rapid_pump",
      presetInterviewChoices: [
        "observe_wait",
        "hold",
        "observe_wait",
        "observe_wait",
        "observe_wait",
      ],
      presetLoopChoice: "observe_wait",
    });

    expect(ctx.history[0]).toBe("STATE_SAME_MARKET_COMPARE");
    expect(ctx.history).toContain("STATE_INITIALIZE_TWIN");
    expect(ctx.history).toContain("STATE_TWIN_RESPONSE");
    expect(ctx.history).toContain("STATE_MEMORY_WRITE");
    expect(ctx.history).toContain("STATE_EVOLUTION_EVIDENCE");
    expect(ctx.history.at(-1)).toBe("STATE_DEMO_END");

    expect(ctx.twinAResponse?.decision_pattern).toBeDefined();
    expect(ctx.twinBResponse?.decision_pattern).toBeDefined();
    expect(ctx.twinAResponse?.decision_pattern).not.toBe(
      ctx.twinBResponse?.decision_pattern,
    );

    expect(ctx.userTwin).not.toBeNull();
    expect(ctx.lastMemory).not.toBeNull();
    expect(ctx.userTwin!.version).toBeGreaterThanOrEqual(1);

    const all = io.output.join("\n");
    expect(all).toContain("Same market.");
    expect(all).toContain("Different minds.");
    expect(all).toContain("Decision Memory");
    expect(all).toContain("Evolution Evidence");
    expect(all).toContain("Your AI twin does not predict the market.");
    expect(all).toContain("It learns how you respond to the market.");

    const memories = listMemoriesForTwin(db, ctx.userTwin!.id);
    expect(memories.length).toBe(1);
    db.close();
  });

  it("Trading Interview builds a cold-start twin (not a quiz label dump)", () => {
    expect(tradingInterviewTurns.length).toBe(
      MVP_INTERVIEW_SCENARIO_IDS.length,
    );
    const twin = createTwinFromInterview({
      choices: [
        "chase_entry",
        "reduce_risk",
        "observe_wait",
        "observe_wait",
        "observe_wait",
      ],
    });
    expect(twin.version).toBe(0);
    expect(twin.cold_start.method).toBe("trading_interview");
    expect(twin.confidence.overall).toBeLessThan(0.5);
    expect(twin.decision_tendencies.patience).not.toBe(50);
  });
});

describe("Interview Scenario Library", () => {
  it("covers the eight coach profiling scenarios and required categories", () => {
    expect(interviewScenarioLibrary.length).toBeGreaterThanOrEqual(8);
    const cats = new Set(interviewScenarioLibrary.map((s) => s.category));
    for (const required of [
      "fomo",
      "panic_selling",
      "patience",
      "risk_tolerance",
      "confirmation_bias",
    ]) {
      expect(cats.has(required as never)).toBe(true);
    }
  });

  it("keeps core-3 fixtures aligned with library ids", () => {
    expect(CORE_THREE_SCENARIO_IDS).toHaveLength(3);
    for (const id of CORE_THREE_SCENARIO_IDS) {
      expect(interviewScenarioLibrary.some((s) => s.scenario_id === id)).toBe(
        true,
      );
    }
    expect(core3Json).toHaveLength(3);
    expect(core3Json.map((s) => s.scenario_id)).toEqual([
      ...CORE_THREE_SCENARIO_IDS,
    ]);
  });

  it("maps option impacts directly into TradingTwinProfile v0", () => {
    const scenarios = getInterviewSet(CORE_THREE_SCENARIO_IDS);
    const twin = createTwinFromInterviewAnswers({
      scenarios,
      answers: [
        { scenario_id: "iv_fomo_chase_pump", option_id: "wait" },
        { scenario_id: "iv_panic_drawdown", option_id: "hold" },
        {
          scenario_id: "iv_confirmation_false_break",
          option_id: "wait_reaccept",
        },
      ],
    });

    expect(twin.version).toBe(0);
    expect(twin.status).toBe("cold_start");
    // wait + hold + wait_reaccept should lift patience / confirmation / holding
    expect(twin.decision_tendencies.patience).toBeGreaterThan(
      INTERVIEW_IMPACT_RULES.base_score,
    );
    expect(twin.decision_tendencies.confirmation_need).toBeGreaterThan(
      INTERVIEW_IMPACT_RULES.base_score,
    );
    expect(twin.decision_tendencies.fomo_tendency).toBeLessThan(
      INTERVIEW_IMPACT_RULES.base_score,
    );
    expect(twin.risk_preferences.drawdown_response).toBeGreaterThan(
      INTERVIEW_IMPACT_RULES.base_score,
    );
  });

  it("every option declares dimension_impact (extensible contract)", () => {
    for (const scenario of interviewScenarioLibrary) {
      expect(scenario.options.length).toBeGreaterThanOrEqual(2);
      for (const option of scenario.options) {
        expect(Object.keys(option.dimension_impact).length).toBeGreaterThan(0);
        for (const delta of Object.values(option.dimension_impact)) {
          // 推荐幅度不是硬性下限；扩展题允许较小的辅助维度变化。
          expect(Number.isFinite(delta)).toBe(true);
          expect(Math.abs(delta)).toBeGreaterThan(0);
          expect(Math.abs(delta)).toBeLessThanOrEqual(
            INTERVIEW_IMPACT_RULES.recommended_abs_delta_max,
          );
        }
      }
    }
  });
});
