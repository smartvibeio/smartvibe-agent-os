import { describe, expect, it, vi } from "vitest";
import { COACH_BANK_VERSION, COACH_GROUPS, coachQuestionBank, drawCoachQuestions, validateCoachAnswers } from "../src/interview/coachQuestionBank.js";
import { createTwinFromInterviewAnswers } from "../src/interview/createTwinFromInterview.js";
import { 创建交易分身, 列出冷启动情景 } from "../src/agent/coreTools.js";
import { upsertTwin } from "../src/agent/store.js";
vi.mock("../src/agent/store.js", () => ({ upsertTwin: vi.fn(), appendMemory: vi.fn(), getTwin: vi.fn(), listMemories: vi.fn() }));
const answer = (questions = drawCoachQuestions([], () => 0)) => questions.map(q => ({ scenario_id: q.scenario_id, option_id: q.options[0].option_id }));

describe("随机建档题库", () => {
  it("16题各三个选项，每轮覆盖八类，连续两轮不重复", () => {
    expect(coachQuestionBank).toHaveLength(16);
    expect(new Set(coachQuestionBank.map(q => q.scenario_id)).size).toBe(16);
    for (const q of coachQuestionBank) expect(q.options).toHaveLength(3);
    for (const random of [() => 0, () => 0.999]) {
      const first = drawCoachQuestions([], random);
      const second = drawCoachQuestions(first.map(q => q.scenario_id), random);
      expect(first.map(q => q.group)).toEqual([...COACH_GROUPS]);
      expect(second.map(q => q.group)).toEqual([...COACH_GROUPS]);
      expect(second.every(q => !first.some(p => p.scenario_id === q.scenario_id))).toBe(true);
    }
  });
  it("拒绝漏答、同类重复、跨题选项和过期版本", () => {
    const answers = answer();
    expect(() => validateCoachAnswers(answers.slice(1), COACH_BANK_VERSION)).toThrow();
    expect(() => validateCoachAnswers([answers[0], ...answers.slice(0, 7)], COACH_BANK_VERSION)).toThrow();
    expect(() => validateCoachAnswers([{ ...answers[0], option_id: answers[1].option_id }, ...answers.slice(1)], COACH_BANK_VERSION)).toThrow();
    expect(() => validateCoachAnswers(answers, "unknown")).toThrow();
    expect(validateCoachAnswers(answers, COACH_BANK_VERSION)).toHaveLength(8);
  });
  it("修改答案参与画像计算，不叠加被替换答案", () => {
    const questions = drawCoachQuestions([], () => 0);
    const before = answer(questions);
    const after = before.map((a, i) => i ? a : { ...a, option_id: questions[0].options[2].option_id });
    const one = createTwinFromInterviewAnswers({ scenarios: questions, answers: before });
    const two = createTwinFromInterviewAnswers({ scenarios: questions, answers: after });
    expect(one.decision_tendencies.fomo_tendency - two.decision_tendencies.fomo_tendency).toBe(16);
  });
  it("网页抽题可创建分身并保存版本、完整题面和实际答案", () => {
    const round = 列出冷启动情景([]);
    const answers = round.情景列表.map(q => ({ 情景编号: q.情景编号, 选项编号: q.选项[1].选项编号 }));
    创建交易分身({ 题库版本: round.题库版本, 答案: answers });
    const saved = vi.mocked(upsertTwin).mock.calls.at(-1)![0];
    expect(saved.interview_snapshot?.bank_version).toBe(COACH_BANK_VERSION);
    expect(saved.interview_snapshot?.questions.map(q => q.question)).toEqual(round.情景列表.map(q => q.问题));
    expect(saved.interview_answers).toEqual(answers.map(a => ({ scenario_id: a.情景编号, option_id: a.选项编号 })));
    expect(saved.account_context_latest).toBeNull();
  });
  it("保留旧八题接入方式", () => {
    const round = 列出冷启动情景();
    expect(round.题库版本).toBe("legacy-8");
    expect(() => 创建交易分身({ 答案: round.情景列表.map(q => ({ 情景编号: q.情景编号, 选项编号: q.选项[0].选项编号 })) })).not.toThrow();
  });
});
