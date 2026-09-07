import { expect, it } from "vitest";
import { retrieveLongTermMemory } from "../src/agent/longTermMemory.js";
import type { CoachRecord } from "../src/agent/coaching.js";
import type { PracticeOrder } from "../src/agent/practice.js";
const record = (id: string, text: string, day: number, previous?: string): CoachRecord => ({
  编号: id, 分身编号: "one", 创建时间: new Date(Date.UTC(2026, 0, day)).toISOString(),
  位置: "建档", 关联编号: "", 模型: "test", 证据: [], 用户补充: text, 上一条: previous,
  回答: { 标题: "测试", 点评: "这是当时的理解", 待核对: "止损当时是怎么设置的？", 下次练习: "记录触发条件", 检查项: ["设置止损"], 证据编号: ["profile"] },
});
it("超过最近40轮的交易主题仍可取出，不串用其他分身记录", () => {
  const old = record("old", "亏损时我经常取消止损", 1);
  const unrelated = Array.from({ length: 60 }, (_, i) => record(`other${i}`, "今天继续学习", i + 2));
  const foreign = { ...record("foreign", "止损", 70), 分身编号: "two" };
  const result = retrieveLongTermMemory("one", [old, ...unrelated, foreign], [], "聊聊止损");
  expect(result.已保存条数).toBe(61);
  expect(result.相关记忆.some(e => e.id === "old")).toBe(true);
  expect(result.相关记忆.some(e => e.id === "foreign")).toBe(false);
  expect(result.相关记忆.length).toBeLessThan(20);
});
it("纠正保留原话、时间与前文，不把旧经历直接覆盖成新事实", () => {
  const old = record("old", "我没设止损", 1);
  const correction = record("correction", "更正一下，是设置后取消了", 2, "old");
  const result = retrieveLongTermMemory("one", [old, correction], [], "止损");
  expect(result.相关记忆.map(e => e.id)).toEqual(["old", "correction"]);
  expect(result.相关记忆[1].previous).toBe("old");
  expect(result.相关记忆[1].topics).toContain("止损");
  expect(result.规则).toContain("不同情境");
});
it("模拟行为与自述分开，重建索引不会依赖内存会话", () => {
  const r = record("claim", "我总会设置止损", 1);
  const o = { 编号: "trade", 分身编号: "one", 创建时间: "2026-01-02", 理由: "追涨", 行情: { 交易对: "BTCUSDT" }, 方向: "做多", 状态: "已平仓", 仓位比例: 50 } as PracticeOrder;
  const input = JSON.parse(JSON.stringify({ records: [r], orders: [o] }));
  const result = retrieveLongTermMemory("one", input.records, input.orders, "止损");
  expect(result.相关记忆.map(e => e.kind)).toEqual(["用户补充", "模拟行为"]);
  expect(JSON.stringify(result)).not.toContain("后续K线");
  expect(result).toEqual(retrieveLongTermMemory("one", [r], [o], "止损"));
});
