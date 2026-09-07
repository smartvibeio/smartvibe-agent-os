import { beforeEach, expect, it, vi } from "vitest";
import { parseTradeCsv } from "../src/agent/tradeImport.js";
import { saveOnboarding, completeOnboarding, onboardingState, talkToProfile } from "../src/agent/onboarding.js";
import { askCoach, profileConversations } from "../src/agent/coaching.js";
import { getTwin, upsertTwin } from "../src/agent/store.js";
import type { TradingTwinProfile } from "../src/domain/types.js";
vi.mock("../src/agent/store.js", () => ({ getTwin: vi.fn(), upsertTwin: vi.fn() }));
vi.mock("../src/agent/coaching.js", () => ({ askCoach: vi.fn(), coachingState: () => ({ 记录: [] }), profileConversations: vi.fn(() => []) }));
let saved: TradingTwinProfile;
beforeEach(() => {
  vi.clearAllMocks(); saved = { id: "test" } as TradingTwinProfile;
  vi.mocked(getTwin).mockImplementation(() => structuredClone(saved));
  vi.mocked(upsertTwin).mockImplementation(t => { saved = structuredClone(t); });
});
const csv = '时间,交易对,方向,成交价,成交数量,私人字段\n2026-01-01 12:00:00,BTCUSDT,买入,90000,0.1,secret\n无效,ETHUSDT,卖出,1,1,secret';
it("CSV识别有效笔数、失败行、时区并丢弃额外列", () => {
  const report = parseTradeCsv(csv);
  expect(report.count).toBe(1); expect(report.rejectedRows).toEqual([3]);
  expect(report.start).toBe("2026-01-01T12:00:00.000Z");
  expect(JSON.stringify(report)).not.toContain("secret");
  expect(() => parseTradeCsv("abc,def\n1,2")).toThrow("必要列");
});
it("相同成交不擅自删除，标准英文表头和引号可以识别", () => {
  const row = '2026-01-01T12:00:00Z,"BTCUSDT",BUY,90000,0.1';
  const report = parseTradeCsv(`Date(UTC),Pair,Side,Price,Executed\n${row}\n${row}`);
  expect(report.count).toBe(2); expect(report.duplicates).toBe(1);
});
it("必填校验在模型调用之前，模型失败保留草稿但不能完成", async () => {
  await expect(completeOnboarding({ 分身编号: "test", 目标: " ", 请求编号: crypto.randomUUID() })).rejects.toThrow();
  expect(askCoach).not.toHaveBeenCalled();
  saveOnboarding({ 分身编号: "test", 目标: "经常追涨", CSV: csv });
  vi.mocked(askCoach).mockRejectedValueOnce(new Error("模型不可用"));
  await expect(completeOnboarding({ 分身编号: "test", 目标: "经常追涨", 请求编号: crypto.randomUUID() })).rejects.toThrow("模型不可用");
  expect(onboardingState("test").complete).toBe(false);
  expect(onboardingState("test").history?.count).toBe(1);
});
it("分析成功才保存完成状态，重新编辑使状态失效，移除上传仍可建档", async () => {
  const reply = { 标题: "初始分身", 点评: "自述容易追涨", 待核对: "需要观察", 下次练习: "记录理由", 证据编号: ["profile"], 检查项: ["写清依据"] };
  vi.mocked(askCoach).mockResolvedValue({ 编号: "record", 回答: reply } as Awaited<ReturnType<typeof askCoach>>);
  const state = await completeOnboarding({ 分身编号: "test", 目标: "改善追涨", 请求编号: crypto.randomUUID() });
  expect(state.complete).toBe(true); expect(onboardingState("test").reply?.点评).toBe(reply.点评);
  saveOnboarding({ 分身编号: "test", 目标: "改善止损", 移除记录: true });
  expect(onboardingState("test").complete).toBe(false);
});

it("建档对话承接最近消息，持续交流不会覆盖初始摘要", async () => {
  const reply = { 标题: "初始分身", 点评: "我们先聊止损", 待核对: "当时怎么安排止损？", 下次练习: "记录理由", 证据编号: ["profile"], 检查项: ["写清依据"] };
  const root = { 编号: "root", 回答: reply, 用户补充: "改善止损" } as Awaited<ReturnType<typeof askCoach>>;
  const next = { ...root, 编号: "next", 上一条: "root", 用户补充: "我设置后取消了", 回答: { ...reply, 点评: "我们可以先关注取消止损时的想法" } };
  saved.onboarding = { goal: "改善止损", completedAt: "today", recordId: "root", reply: root.回答 };
  vi.mocked(profileConversations).mockReturnValue([root]);
  vi.mocked(askCoach).mockImplementationOnce(async () => { vi.mocked(profileConversations).mockReturnValue([root, next]); return next; });
  const state = await talkToProfile({ 分身编号: "test", 内容: "我设置后取消了", 请求编号: crypto.randomUUID() });
  expect(askCoach).toHaveBeenLastCalledWith(expect.objectContaining({ 上一条: "root", 用户补充: "我设置后取消了" }));
  expect(state.conversation).toHaveLength(2);
  expect(state.reply?.点评).toBe(reply.点评);
  expect(saved.onboarding?.reply?.点评).toBe(reply.点评);
});
