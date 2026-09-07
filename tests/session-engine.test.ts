import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyWebAction,
  createWebSession,
} from "../src/demo/sessionEngine.js";

const created: string[] = [];

afterEach(() => {
  // session DBs under cwd/data — clean matching temp if any
  for (const p of created) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
  created.length = 0;
});

describe("Web session engine", () => {
  it("runs full fixture loop without rewriting core evolve logic", () => {
    const prevCwd = process.cwd();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sv-web-"));
    process.chdir(tmp);
    try {
      let view = createWebSession();
      expect(view.demo_mode).toBe("fixtures");
      expect(view.state).toBe("STATE_SAME_MARKET_COMPARE");
      expect(view.same_market?.trader_a.response?.decision_pattern).not.toBe(
        view.same_market?.trader_b.response?.decision_pattern,
      );

      view = applyWebAction(view.session_id, {
        type: "continue_from_same_market",
      });
      expect(view.state).toBe("STATE_INITIALIZE_TWIN");

      // 3 core interview answers
      const opts = ["wait", "hold", "wait_reaccept"];
      for (const option_id of opts) {
        view = applyWebAction(view.session_id, {
          type: "submit_interview_option",
          option_id,
        });
      }
      expect(view.interview.complete).toBe(true);
      expect(view.user_twin?.version).toBe(0);
      expect(view.user_twin?.display_name).toBe("Momentum Explorer");
      expect(view.state).toBe("STATE_MARKET_CONTEXT");

      view = applyWebAction(view.session_id, {
        type: "continue_to_twin_response",
      });
      expect(view.state).toBe("STATE_USER_CHOICE");
      expect(view.loop.twin_response).toBeTruthy();

      view = applyWebAction(view.session_id, {
        type: "submit_user_choice",
        choice: "observe_wait",
      });
      expect(view.state).toBe("STATE_REFLECTION");

      view = applyWebAction(view.session_id, {
        type: "continue_after_reflection",
      });
      expect(view.state).toBe("STATE_DEMO_END");
      expect(view.memories.length).toBe(1);
      expect(view.evolution.before).toBeTruthy();
      expect(view.evolution.after).toBeTruthy();
      expect(view.user_twin?.version).toBeGreaterThanOrEqual(1);
      expect(view.closing_lines.join(" ")).toContain(
        "does not predict the market",
      );

      const dbPath = path.join(tmp, "data", `web-session-${view.session_id}.db`);
      created.push(dbPath);
    } finally {
      process.chdir(prevCwd);
    }
  });
});
