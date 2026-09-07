import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { emptyReplayLedger, executeReplayDecision, replayEquity, runScenarioPolicy, type ReplayDecision } from "../src/agent/twinReplayEngine.js";
import { createReplay, advanceReplay, replayState, replayReviewEvidence } from "../src/agent/twinReplay.js";
import { 拉取币安K线 } from "../src/agent/binancePublic.js";
import { generateCoachJson } from "../src/agent/codexBridge.js";
vi.mock("../src/agent/binancePublic.js", () => ({ 拉取币安K线: vi.fn() }));
vi.mock("../src/agent/codexBridge.js", () => ({ generateCoachJson: vi.fn() }));
vi.mock("../src/agent/coaching.js", () => ({ getCoachingRecords: () => [] }));
vi.mock("../src/agent/practice.js", () => ({ practiceState: () => ({ 订单: [] }) }));
vi.mock("../src/agent/store.js", () => ({ runtimeDataDir: () => process.env.SMARTVIBE_DATA_DIR!, getTwin: (id: string) => id === "twin" ? { id, version: 1, onboarding: { completedAt: "now", goal: "改善追涨" } } : null }));
let dir: string, previous: string | undefined;
const start = Date.UTC(2026, 0, 1) / 1000;
const base: ReplayDecision = { 动作: "观望", 仓位百分比: 0, 止损百分比: null, 止盈百分比: null, 理由: "目前继续观察", 习惯依据: "更倾向等待" };
beforeEach(() => {
  previous = process.env.SMARTVIBE_DATA_DIR;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "smartvibe-replay-")); process.env.SMARTVIBE_DATA_DIR = dir;
  vi.mocked(拉取币安K线).mockReset(); vi.mocked(generateCoachJson).mockReset();
  vi.mocked(拉取币安K线).mockResolvedValue({ 来源: "测试行情", 连接状态: "测试", K线: Array.from({ length: 86 }, (_, i) => ({ time: start + (i - 80) * 900, open: 100, close: 100, high: i === 85 ? 999999 : 102, low: 98, volume: 1 })) } as Awaited<ReturnType<typeof 拉取币安K线>>);
  vi.mocked(generateCoachJson).mockResolvedValue({ model: "test", data: base });
});
afterEach(() => {
  if (previous === undefined) delete process.env.SMARTVIBE_DATA_DIR; else process.env.SMARTVIBE_DATA_DIR = previous;
  if (path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(dir, { recursive: true, force: true });
});
const config = () => ({ 分身编号: "twin", 请求编号: randomUUID(), 交易对: "BTCUSDT", 周期: "15m", 开始时间: new Date(start * 1000).toISOString(), 根数: 6, 本金: 1000 });
const candle = { time: 1, open: 100, high: 112, low: 99, close: 110, volume: 1 };
it("多空本金和双边手续费由引擎计算，结束结算标明不是主动决定", () => {
  const long = executeReplayDecision(emptyReplayLedger(1000), { ...base, 动作: "开多", 仓位百分比: 100 }, candle, true);
  const amount = 1000 / 1.0005;
  expect(long.fees).toBeCloseTo(amount * .0005 + amount * 1.1 * .0005);
  expect(long.cash).toBeCloseTo(1000 + amount * .1 - long.fees);
  expect(long.position).toBeNull(); expect(long.fills[1].reason).toContain("非分身主动");
  const short = executeReplayDecision(emptyReplayLedger(1000), { ...base, 动作: "开空", 仓位百分比: 100 }, { ...candle, close: 90, low: 89 }, true);
  expect(short.cash).toBeCloseTo(1000 + amount * .1 - short.fees);
  expect(replayEquity(short, 90).equity).toBe(short.cash);
});
it("同根触及双线先止损，跳空则按开盘价，不能加仓或空仓平仓", () => {
  const both = executeReplayDecision(emptyReplayLedger(1000), { ...base, 动作: "开多", 仓位百分比: 50, 止损百分比: 5, 止盈百分比: 5 }, { ...candle, low: 90 }, false);
  expect(both.fills[1].price).toBe(95); expect(both.fills[1].reason).toContain("止损先");
  const open = executeReplayDecision(emptyReplayLedger(1000), { ...base, 动作: "开多", 仓位百分比: 50, 止损百分比: 5, 止盈百分比: 20 }, { ...candle, high: 102, close: 100 }, false);
  expect(() => executeReplayDecision(open, { ...base, 动作: "开多", 仓位百分比: 10 }, candle, false)).toThrow("已有持仓");
  const gap = executeReplayDecision(open, base, { ...candle, open: 90, low: 85 }, false);
  expect(gap.fills[1].price).toBe(90);
  expect(() => executeReplayDecision(emptyReplayLedger(1000), { ...base, 动作: "平仓" }, candle, false)).toThrow("空仓");
});
it("按历史范围取数，未展开K线与指标不送浏览器或模型", async () => {
  const c = config(), s = await createReplay(c);
  expect(s.warmup).toHaveLength(80); expect(s.candles).toHaveLength(0);
  expect(JSON.stringify(s)).not.toContain("999999");
  expect(拉取币安K线).toHaveBeenCalledWith(expect.objectContaining({ 历史范围: { startTime: (start - 80 * 900) * 1000, endTime: (start + 6 * 900) * 1000 - 1 } }));
  await advanceReplay({ 分身编号: "twin", 演示编号: s.id, 已展开: 0 });
  const modelInput = vi.mocked(generateCoachJson).mock.calls[0][1];
  expect(JSON.stringify(modelInput)).not.toContain("999999");
  expect(modelInput).not.toHaveProperty("future");
  expect((modelInput as { 已收盘K线: unknown[] }).已收盘K线).toHaveLength(80);
  expect(replayState("twin", s.id).replay?.candles).toHaveLength(1);
  expect(() => replayReviewEvidence("twin", s.id)).toThrow("先完成");
});
it("重复创建与并发推进不会重复推理或成交，模型失败不推进", async () => {
  const c = config(), s = await createReplay(c);
  await createReplay(c); expect(replayState("twin").sessions).toHaveLength(1);
  vi.mocked(generateCoachJson).mockResolvedValueOnce({ model: "test", data: { ...base, 动作: "开多", 仓位百分比: 50 } });
  const args = { 分身编号: "twin", 演示编号: s.id, 已展开: 0 };
  const [a, b] = await Promise.all([advanceReplay(args), advanceReplay(args)]);
  expect(a).toEqual(b); expect(generateCoachJson).toHaveBeenCalledTimes(1); expect(a.steps[0].ledger.fills).toHaveLength(1);
  await advanceReplay(args); expect(generateCoachJson).toHaveBeenCalledTimes(1);
  vi.mocked(generateCoachJson).mockRejectedValueOnce(new Error("模型离线"));
  await expect(advanceReplay({ ...args, 已展开: 1 })).rejects.toThrow("离线");
  expect(replayState("twin", s.id).replay?.revealed).toBe(1);
});
it("全部观望也能完成，重新读取保留结果，不触碰自主练习账本", async () => {
  const s = await createReplay(config());
  for (let i = 0; i < 6; i++) await advanceReplay({ 分身编号: "twin", 演示编号: s.id, 已展开: i });
  const stored = replayState("twin", s.id).replay!;
  expect(stored.done).toBe(true); expect(stored.steps[5].equity.equity).toBe(1000);
  expect(stored.steps[5].ledger.fills).toEqual([]);
  expect(replayReviewEvidence("twin", s.id).最终资金.equity).toBe(1000);
  expect(fs.readdirSync(dir)).toEqual(["twin-replays.json"]);
});
it("拒绝其他分身、未来区间及缺失K线", async () => {
  await expect(createReplay({ ...config(), 分身编号: "other" })).rejects.toThrow("建立分身");
  await expect(createReplay({ ...config(), 开始时间: "2099-01-01T00:00:00Z" })).rejects.toThrow("历史区间");
  vi.mocked(拉取币安K线).mockResolvedValueOnce({ K线: [] } as unknown as Awaited<ReturnType<typeof 拉取币安K线>>);
  await expect(createReplay(config())).rejects.toThrow("不完整");
});
it("第二代引擎在前四分之一开仓，全仓余额让仓位承受更大逆向波动", () => {
  const candles = Array.from({ length: 12 }, (_, i) => ({ time: i + 1, open: 100 + i * 2, close: 102 + i * 2, high: 104 + i * 2, low: 99 + i * 2, volume: 1 }));
  const frames = runScenarioPolicy(candles, 1000, 20, { direction: "做空", entryAfter: 2, initialMarginPct: 20, addAtLossPct: null, addMarginPct: 0, maxAdds: 0, stopLossPct: null, takeProfitPct: null, rationale: "高位做空", habitBasis: "画像偏好" });
  expect(frames[2].ledger.fills[0].action).toBe("做空");
  expect(frames.some(f => f.action === "强平")).toBe(false);
  expect(frames.at(-1)!.ledger.liquidated).toBe(false);
});
it("指定参考价时等待真实触价，全仓余额可以支持空单到达0.02后加仓", () => {
  const candles = [
    { time: 1, open: .014, high: .015, low: .013, close: .0145, volume: 1 },
    { time: 2, open: .015, high: .0162, low: .0148, close: .016, volume: 1 },
    { time: 3, open: .0161, high: .018, low: .016, close: .0178, volume: 1 },
    { time: 4, open: .018, high: .021, low: .0178, close: .0205, volume: 1 },
  ];
  const frames = runScenarioPolicy(candles, 10000, 20, { direction: "做空", entryAfter: 0, initialMarginPct: 20, addAtLossPct: null, addMarginPct: 20, maxAdds: 1, stopLossPct: null, takeProfitPct: null, rationale: "等待0.016", habitBasis: "用户记忆", entryPrice: .016, addPrice: .02, entryQuantity: 20000, addQuantity: 20000 });
  expect(frames[0].ledger.fills).toHaveLength(0);
  expect(frames[1].ledger.fills[0]).toMatchObject({ action: "做空", price: .016, quantity: 20000 });
  expect(frames[2].ledger.fills.at(-1)?.action).toBe("做空");
  expect(frames.flatMap(f => f.ledger.fills).some(fill => fill.action === "加空")).toBe(true);
  expect(frames.flatMap(f => f.ledger.fills).some(fill => fill.action === "强平")).toBe(false);
});
it("10倍杠杆投入10%保证金的全仓空单约在0.03183强平", () => {
  const candles = [
    { time: 1, open: .015, high: .0162, low: .0148, close: .016, volume: 1 },
    { time: 2, open: .016, high: .03, low: .0159, close: .029, volume: 1 },
    { time: 3, open: .029, high: .032, low: .028, close: .031, volume: 1 },
  ];
  const frames = runScenarioPolicy(candles, 10000, 10, { direction: "做空", entryAfter: 0, initialMarginPct: 10, addAtLossPct: null, addMarginPct: 0, maxAdds: 0, stopLossPct: null, takeProfitPct: null, rationale: "等待0.016", habitBasis: "用户记忆", entryPrice: .016 });
  expect(frames[0].ledger.position?.liquidation).toBeCloseTo(.03183284, 7);
  expect(frames[1].ledger.liquidated).toBe(false);
  expect(frames[2].ledger.fills.at(-1)?.action).toBe("强平");
});
it("相同仓位选择逐仓时约在0.01752强平", () => {
  const candles = [
    { time: 1, open: .015, high: .0162, low: .0148, close: .016, volume: 1 },
    { time: 2, open: .016, high: .018, low: .0159, close: .0178, volume: 1 },
  ];
  const frames = runScenarioPolicy(candles, 10000, 10, { direction: "做空", entryAfter: 0, initialMarginPct: 10, addAtLossPct: null, addMarginPct: 0, maxAdds: 0, stopLossPct: null, takeProfitPct: null, rationale: "等待0.016", habitBasis: "用户记忆", entryPrice: .016 }, "逐仓");
  expect(frames[0].ledger.position?.liquidation).toBeCloseTo(.01752, 7);
  expect(frames[1].ledger.fills.at(-1)?.action).toBe("强平");
});
it("第二代创建只调用一次模型形成策略，播放推进不再等待模型", async () => {
  const c = { ...config(), 根数: 6, 市场: "U本位合约", 方向: "做空", 杠杆: 20, 投入比例: 20, 情境描述: "高RSI做空" };
  vi.mocked(拉取币安K线).mockResolvedValueOnce({ 来源: "测试合约行情", 连接状态: "测试", K线: Array.from({ length: 204 }, (_, i) => ({ time: start + (i - 84) * 900, open: 100, close: 100, high: i === 100 ? 150 : 102, low: 98, volume: 1 })) } as Awaited<ReturnType<typeof 拉取币安K线>>);
  vi.mocked(generateCoachJson).mockResolvedValueOnce({ model: "test", data: { entryAfter: 1, initialMarginPct: 20, addAtLossPct: null, addMarginPct: 0, maxAdds: 0, stopLossPct: null, takeProfitPct: null, rationale: "等待后做空", habitBasis: "用户偏好" } });
  const created = await createReplay(c);
  expect(created.engineVersion).toBe("replay-v2"); expect(created.candles).toHaveLength(0); expect(created.frames).toHaveLength(0);
  expect(created.focusTime).toBe(new Date((start + 16 * 900) * 1000).toISOString());
  expect(created.locatedStart).toBe(new Date((start + 12 * 900) * 1000).toISOString());
  expect(created.warmup.every(candle => candle.high !== 150)).toBe(true);
  expect(generateCoachJson).toHaveBeenCalledTimes(1);
  const strategyInput = vi.mocked(generateCoachJson).mock.calls[0][1];
  expect(JSON.stringify(strategyInput)).not.toContain(c.开始时间);
  expect(strategyInput).not.toHaveProperty("future");
  await advanceReplay({ 分身编号: "twin", 演示编号: created.id, 已展开: 0 });
  expect(generateCoachJson).toHaveBeenCalledTimes(1); expect(replayState("twin", created.id).replay?.revealed).toBe(1);
});
