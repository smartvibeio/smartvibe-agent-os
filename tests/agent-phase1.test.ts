import { describe, expect, it } from "vitest";
import {
  CORE_THREE_SCENARIO_IDS,
  getInterviewSet,
} from "../src/interview/scenarioLibrary.js";

describe("阶段1 · 可安装 Agent 骨架", () => {
  it("冷启动核心情景可被协议工具复用且为中文题面", () => {
    const list = getInterviewSet(CORE_THREE_SCENARIO_IDS);
    expect(list).toHaveLength(3);
    for (const s of list) {
      expect(s.question.length).toBeGreaterThan(8);
      expect(/[一-龥]/.test(s.question)).toBe(true);
      expect(s.options.length).toBeGreaterThanOrEqual(2);
    }
  });
});
