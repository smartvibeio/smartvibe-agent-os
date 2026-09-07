import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb, migrate } from "../src/db/client.js";
import { createTwin, getTwin } from "../src/db/twinsRepo.js";
import { listMemoriesForTwin, insertMemory } from "../src/db/memoriesRepo.js";
import { modelTwinResponse } from "../src/domain/modelResponse.js";
import { applyDecisionLoop } from "../src/services/decisionLoop.js";
import {
  sameMarketStimulus,
  twinAFixture,
  twinBFixture,
} from "../src/fixtures/demoData.js";
import { snapshotFromProfile } from "../src/domain/evolve.js";

const tempDbs: string[] = [];

function tempDb() {
  const p = path.join(
    os.tmpdir(),
    `smartvibe-phase1-${Date.now()}-${Math.random().toString(16).slice(2)}.db`,
  );
  tempDbs.push(p);
  const db = openDb(p);
  migrate(db);
  return db;
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

describe("DB + same market fixtures", () => {
  it("creates twins, writes memory, lists history", () => {
    const db = tempDb();
    createTwin(db, twinAFixture);
    const loaded = getTwin(db, twinAFixture.id);
    expect(loaded?.display_name).toBe("Trader A");

    const { profile, memory } = applyDecisionLoop(
      db,
      loaded!,
      {
        scenario_id: "same_market_demo",
        market_context: sameMarketStimulus,
        twin_response: modelTwinResponse(loaded!, sameMarketStimulus),
        user_reality: {
          actual_choice: "observe_wait",
          source: "demo",
        },
      },
      { demo_tag: "phase1_db_test" },
    );

    expect(profile.version).toBe(twinAFixture.version + 1);
    expect(profile.memory_count).toBe(1);
    const history = listMemoriesForTwin(db, twinAFixture.id);
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(memory.id);
    expect(history[0].learning.applied).toBe(true);
    db.close();
  });

  it("Same Market, Different Minds: A and B diverge", () => {
    const db = tempDb();
    createTwin(db, twinAFixture);
    createTwin(db, twinBFixture);
    const a = getTwin(db, twinAFixture.id)!;
    const b = getTwin(db, twinBFixture.id)!;
    const ra = modelTwinResponse(a, sameMarketStimulus);
    const rb = modelTwinResponse(b, sameMarketStimulus);
    expect(ra.decision_pattern).not.toBe(rb.decision_pattern);
    expect(["reduce_risk", "trim", "exit_bias"]).toContain(ra.decision_pattern);
    expect(["hold", "observe_wait"]).toContain(rb.decision_pattern);
    db.close();
  });

  it("insertMemory stores before/after snapshots", () => {
    const db = tempDb();
    createTwin(db, twinBFixture);
    const twin = getTwin(db, twinBFixture.id)!;
    const before = snapshotFromProfile(twin);
    insertMemory(db, {
      id: "00000000-0000-4000-8000-00000000m001",
      twin_id: twin.id,
      created_at: new Date().toISOString(),
      scenario_id: "same_market_demo",
      demo_tag: "manual",
      market_context: sameMarketStimulus,
      account_context: twin.account_context_latest,
      twin_response: {
        decision_pattern: "hold",
        reasoning: "test",
        confidence: 0.7,
        activated_dimensions: ["low_exposure"],
      },
      user_reality: {
        actual_choice: "hold",
        source: "demo",
      },
      learning: {
        difference: {
          aligned: true,
          gap_type: "none",
          summary: "aligned",
        },
        updated_pattern_deltas: { patience: 1 },
        confidence_change: { overall_delta: 0.02 },
        applied: true,
        narrative: "test narrative",
      },
      twin_snapshot_before: before,
      twin_snapshot_after: { ...before, version: before.version + 1 },
    });
    const history = listMemoriesForTwin(db, twin.id);
    expect(history[0].twin_snapshot_before.version).toBe(twin.version);
    db.close();
  });
});
