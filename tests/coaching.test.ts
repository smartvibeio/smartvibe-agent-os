import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { 创建交易分身, 列出冷启动情景 } from "../src/agent/coreTools.js";
import {
  askCoach,
  coachingState,
  confirmCoaching,
  startExercise,
  submitExercise,
  checkDecision,
  exerciseEvidenceIssues,
  tradeOutcomeOpening,
  preTradeCoach,
} from "../src/agent/coaching.js";
import { generateCoachJson } from "../src/agent/codexBridge.js";
import {
  importAccountHistory,
  loadPracticeMarket,
  submitPracticeOrder,
} from "../src/agent/practice.js";
import { 尝试调用币安Mcp工具 } from "../src/agent/binanceMcp.js";
import { 拉取币安K线 } from "../src/agent/binancePublic.js";
vi.mock("../src/agent/binanceMcp.js", () => ({ 尝试调用币安Mcp工具: vi.fn() }));
vi.mock("../src/agent/codexBridge.js", () => ({ generateCoachJson: vi.fn() }));
vi.mock("../src/agent/binancePublic.js", () => ({
  拉取币安最新价: vi.fn(async () => 101),
  拉取币安K线: vi.fn(async () => ({
    交易对: "BTCUSDT",
    市场: "现货",
    周期: "1h",
    根数: 120,
    来源: "测试 K线",
    连接状态: "测试连接",
    更新时间: new Date().toISOString(),
    最新价: 100,
    涨跌百分比: 0,
    波动百分比: 0,
    成交量变化约百分比: 0,
    指标: { MACD: { DIF: 0, DEA: 0, 柱: 0 }, RSI: 50, 布林带: { 上轨: 101, 中轨: 100, 下轨: 99 } },
    指标序列: { macd: { dif: Array(120).fill(0), dea: Array(120).fill(0), hist: Array(120).fill(0) }, rsi: Array(120).fill(50) },
    解读: "测试",
    要点: [],
    K线: Array.from({ length: 120 }, (_, i) => ({
      time: 1700000000 + i * 3600,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 10,
    })),
  })),
}));
let dir: string, oldDir: string | undefined, twinId: string;
beforeEach(() => {
  oldDir = process.env.SMARTVIBE_DATA_DIR;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "smartvibe-coaching-"));
  process.env.SMARTVIBE_DATA_DIR = dir;
  twinId = 创建交易分身({
    答案: 列出冷启动情景().情景列表.map((s) => ({
      情景编号: s.情景编号,
      选项编号: s.选项[0]!.选项编号,
    })),
  }).分身编号;
  vi.mocked(generateCoachJson).mockReset();
  vi.mocked(尝试调用币安Mcp工具).mockReset();
  vi.mocked(generateCoachJson).mockResolvedValue({
    model: "test",
    data: {
      标题: "核对预算",
      点评: "先检查自己记录的预算。",
      证据编号: ["profile"],
      待核对: "你的最大亏损是多少？",
      下次练习: "记录止损与预算并检查一致性",
      检查项: ["写清依据", "设置止损", "遵守风险预算"],
    },
  });
});
afterEach(() => {
  if (oldDir) process.env.SMARTVIBE_DATA_DIR = oldDir;
  else delete process.env.SMARTVIBE_DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});
const input = () => ({
  分身编号: twinId,
  位置: "建档",
  请求编号: randomUUID(),
  用户补充: "测试自述：风险预算100",
});
it("同一请求只推理一次，用户补充和实际建档选择会进入之后的场景", async () => {
  const args = input();
  const [a, b] = await Promise.all([askCoach(args), askCoach(args)]);
  expect(a.编号).toBe(b.编号);
  expect(generateCoachJson).toHaveBeenCalledTimes(1);
  expect(a.证据.find((e) => e.编号 === "interview")).toBeTruthy();
  await askCoach({ ...input(), 位置: "训练" });
  const evidence = vi.mocked(generateCoachJson).mock.calls[1]![1] as {
    证据: Array<{ 编号: string; 内容: unknown }>;
  };
  expect(
    JSON.stringify(evidence.证据.find((e) => e.编号 === "statements")),
  ).toContain("风险预算100");
  expect(coachingState(twinId).记录).toHaveLength(2);
  expect(JSON.stringify(evidence.证据.find(e => e.编号 === "long_term_memory"))).toContain("风险预算100");
  expect(JSON.stringify(evidence.证据.find(e => e.编号 === "long_term_memory"))).toContain(a.编号);
});
it("模型失败和不存在的证据都不会冒充成功或写入记忆", async () => {
  vi.mocked(generateCoachJson).mockRejectedValueOnce(new Error("超时"));
  await expect(askCoach(input())).rejects.toThrow("超时");
  vi.mocked(generateCoachJson).mockResolvedValueOnce({
    model: "test",
    data: {
      标题: "问题",
      点评: "未知",
      证据编号: ["fabricated"],
      待核对: "",
      下次练习: "记录",
      检查项: ["写清依据"],
    },
  });
  await expect(askCoach(input())).rejects.toThrow("不存在的证据");
  expect(coachingState(twinId).记录).toHaveLength(0);
});
it("内部证据编号只保留在结构化字段，不进入用户看到的教练正文", async () => {
  vi.mocked(generateCoachJson).mockResolvedValueOnce({
    model: "test",
    data: {
      标题: "交易复盘【profile】",
      点评: "先确认这次做得好的地方。【profile】【statements】再讨论改进。",
      证据编号: ["profile", "statements"],
      待核对: "当时关注了什么？[statements]",
      下次练习: "观察三根柱体的变化。【profile】",
      检查项: ["写清依据"],
    },
  });
  const record = await askCoach(input());
  expect(record.回答.标题).toBe("交易复盘");
  expect(record.回答.点评).toBe("先确认这次做得好的地方。再讨论改进。");
  expect(record.回答.待核对).toBe("当时关注了什么？");
  expect(record.回答.下次练习).toBe("观察三根柱体的变化。");
  expect(record.回答.证据编号).toEqual(["profile", "statements"]);
});
it("交易复盘固定先说明方向与扣费后结果", () => {
  expect(tradeOutcomeOpening({
    方向: "做空",
    状态: "已平仓",
    盈亏: 32,
    手续费: 2,
    结束原因: "手动模拟平仓",
  })).toBe("这笔做空模拟交易已经结束，扣除模拟手续费后盈利 30.00 USDT，结束方式是“手动模拟平仓”。");
});
it("开仓前私教同时读取交易计划、当前盘面和程序风险核算", async () => {
  const market = await loadPracticeMarket({});
  vi.mocked(generateCoachJson).mockResolvedValueOnce({
    model: "test",
    data: {
      标题: "先区分趋势和动能",
      计划理解: "你准备依据一小时结构做多。",
      关键提醒: "MACD柱体变化描述的是动能，仍要和价格高低点结构一起看。",
      可执行调整: "记录最近三个高低点是否同步上移，并写下一条失效条件。",
    },
  });
  const advice = await preTradeCoach({
    分身编号: twinId,
    行情编号: market.行情编号,
    方向: "做多",
    订单类型: "市价",
    杠杆倍数: 1,
    仓位比例: 10,
    止损: 95,
    风险预算: 600,
    理由: "一小时趋势和MACD走强",
  });
  expect(advice.程序核算.计划止损金额).toBeCloseTo(499.75, 1);
  expect(advice.关键提醒).toContain("价格高低点结构");
  const modelEvidence = vi.mocked(generateCoachJson).mock.calls[0]![1] as Record<string, unknown>;
  expect(modelEvidence).toHaveProperty("当前计划");
  expect(modelEvidence).toHaveProperty("当前盘面");
  expect(modelEvidence).toHaveProperty("相关长期记忆");
});
it("历史训练提交前不泄露后续K线；提交后固定原决定并保存检查", async () => {
  const r = await askCoach(input());
  confirmCoaching(twinId, r.编号);
  const exercise = await startExercise(twinId, "ake", "5m");
  expect(exercise.交易对).toBe("AKEUSDT");
  expect(exercise.周期).toBe("5m");
  expect(exercise.后续K线).toHaveLength(0);
  expect(coachingState(twinId).历史训练[0]!.后续K线).toHaveLength(0);
  await askCoach({ ...input(), 位置: "训练", 请求编号: randomUUID() });
  const pendingEvidence = vi.mocked(generateCoachJson).mock.calls.at(-1)![1] as {
    证据: Array<{ 编号: string; 内容: unknown }>;
  };
  expect(pendingEvidence.证据.find((item) => item.编号 === "training")?.内容).toEqual([]);
  const args = {
    分身编号: twinId,
    编号: exercise.编号,
    方向: "做多",
    理由: "最近K线回落到支撑附近后重新收高，如果再次跌破前低我会改变判断。",
    止损: 95,
    风险预算: 100,
    本金: 10000,
  };
  expect(() =>
    submitExercise({
      ...args,
      方向: "做空",
      止损: 95,
    }),
  ).toThrow("做空在价格上涨时亏损");
  const submitted = submitExercise(args);
  expect(submitted.后续K线).toHaveLength(12);
  expect(submitted.检查?.some((c) => c.结果 === "计划金额超出预算")).toBe(true);
  expect(submitExercise({ ...args, 理由: "看到未来后修改" }).决定?.理由).toBe(
    "最近K线回落到支撑附近后重新收高，如果再次跌破前低我会改变判断。",
  );
  expect(() => submitExercise({ ...args, 分身编号: "someone-else" })).toThrow();
});
it("新任务不会恢复旧任务的未完成专项练习", async () => {
  const firstAgreement = await askCoach(input());
  confirmCoaching(twinId, firstAgreement.编号);
  const oldExercise = await startExercise(twinId, "BTCUSDT", "1h");

  vi.mocked(generateCoachJson).mockResolvedValueOnce({
    model: "test",
    data: {
      标题: "练习等待确认",
      点评: "这一轮先把触发条件说清楚。",
      证据编号: ["profile"],
      待核对: "什么变化会让你继续等待？",
      下次练习: "连续观察三根1小时K线，只在结构确认后行动",
      检查项: ["写清依据"],
    },
  });
  const nextAgreement = await askCoach({ ...input(), 位置: "复盘", 请求编号: randomUUID() });
  confirmCoaching(twinId, nextAgreement.编号);
  const nextExercise = await startExercise(twinId, "BTCUSDT", "1h");

  expect(nextExercise.编号).not.toBe(oldExercise.编号);
  expect(nextExercise.目标).toBe(nextAgreement.回答.下次练习);
  expect(coachingState(twinId).历史训练.map((exercise) => exercise.编号)).toEqual(
    expect.arrayContaining([oldExercise.编号, nextExercise.编号]),
  );
  expect(coachingState(twinId).阶段进展.检查进展.map((item) => item.项目)).toEqual([
    "写清依据", "设置止损", "遵守风险预算",
  ]);
});
it("专项训练继承合约市场，不会把合约交易对误按现货读取", async () => {
  const agreement = await askCoach(input());
  confirmCoaching(twinId, agreement.编号);
  const exercise = await startExercise(twinId, "HYPEUSDT", "1h", "U本位合约");
  expect(exercise.市场).toBe("U本位合约");
  expect(vi.mocked(拉取币安K线)).toHaveBeenLastCalledWith(expect.objectContaining({
    交易对: "HYPEUSDT",
    周期: "1h",
    市场: "U本位合约",
  }));
});
it("后续交易复盘确认不会重置当前任务，阶段总结确认才开始下一轮", async () => {
  const market = await loadPracticeMarket({ 交易对: "BTCUSDT", 周期: "1h" });
  const firstOrder = submitPracticeOrder({
    分身编号: twinId,
    请求编号: randomUUID(),
    行情编号: market.行情编号,
    方向: "观望",
    订单类型: "市价",
    杠杆倍数: 1,
    仓位比例: 10,
    理由: "当前结构没有满足条件，继续观望",
  });
  const firstAgreement = await askCoach({ ...input(), 位置: "点评", 关联编号: firstOrder.编号, 请求编号: randomUUID() });
  confirmCoaching(twinId, firstAgreement.编号);
  const order = submitPracticeOrder({
    分身编号: twinId,
    请求编号: randomUUID(),
    行情编号: market.行情编号,
    方向: "观望",
    订单类型: "市价",
    杠杆倍数: 1,
    仓位比例: 10,
    理由: "当前结构仍未满足条件，继续记录",
  });
  const laterReview = await askCoach({ ...input(), 位置: "点评", 关联编号: order.编号, 请求编号: randomUUID() });
  confirmCoaching(twinId, laterReview.编号);
  expect(coachingState(twinId).练习约定?.编号).toBe(firstAgreement.编号);
  expect(coachingState(twinId).阶段进展.样本范围.模拟交易数).toBe(1);

  const stageSummary = await askCoach({ ...input(), 位置: "复盘", 请求编号: randomUUID() });
  confirmCoaching(twinId, stageSummary.编号);
  expect(coachingState(twinId).练习约定?.编号).toBe(stageSummary.编号);
  expect(coachingState(twinId).阶段进展.样本范围.模拟交易数).toBe(0);
});
it("本次专项点评只读取所关联练习的决策前证据", async () => {
  const agreement = await askCoach(input());
  confirmCoaching(twinId, agreement.编号);
  const exercise = await startExercise(twinId, "BTCUSDT", "1h");
  submitExercise({
    分身编号: twinId,
    编号: exercise.编号,
    方向: "做多",
    理由: "最近一小时K线低点逐步抬高，价格回到中轨上方；如果跌破前低，这次判断失效。",
    止损: 95,
    风险预算: 600,
    本金: 10000,
  });

  await askCoach({
    ...input(),
    位置: "训练",
    关联编号: exercise.编号,
    请求编号: randomUUID(),
  });
  const modelEvidence = vi.mocked(generateCoachJson).mock.calls.at(-1)![1] as {
    证据: Array<{ 编号: string; 内容: Record<string, unknown> }>;
  };
  const training = modelEvidence.证据.find((item) => item.编号 === "training")?.内容;
  expect(training?.编号).toBe(exercise.编号);
  expect(training?.决策前最近12根可见K线与指标).toHaveLength(12);
});
it("专项训练只拦截过于简单的依据，不要求用户照抄约定措辞", async () => {
  const target = "连续记录3根已收盘1小时K线的最高价、收盘价、上轨位置及对应RSI。检验：至少一次触及或越过上轨后收回通道，RSI连续两次下降。";
  expect(exerciseEvidenceIssues(target, "15m", "看到上轨和RSI后准备做空")).toEqual(expect.arrayContaining([
    expect.stringContaining("要求使用 1h"),
    expect.stringContaining("比较简略"),
  ]));
  expect(exerciseEvidenceIssues(target, "1h", "我认为应该观望")).toEqual([
    expect.stringContaining("用自己的话"),
  ]);
  expect(exerciseEvidenceIssues(
    target,
    "1h",
    "当前K线连续收阳，布林带位于中轨附近并正在收窄，MACD有死叉但DIF上升，RSI没有连续下降，所以我选择观望。",
  )).toEqual([]);
});
it("阶段进展统一追溯模拟交易和专项训练，并区分同类场景且排除演示", async () => {
  const agreement = await askCoach(input());
  confirmCoaching(twinId, agreement.编号);
  const market = await loadPracticeMarket({ 交易对: "BTCUSDT", 周期: "1h" });
  const order = submitPracticeOrder({
    分身编号: twinId,
    请求编号: randomUUID(),
    行情编号: market.行情编号,
    方向: "做多",
    订单类型: "市价",
    杠杆倍数: 1,
    仓位比例: 10,
    止损: 95,
    风险预算: 600,
    理由: "观察一小时高低点结构，跌回前低则失效",
  });
  const exercise = await startExercise(twinId, "BTCUSDT", "1h");
  submitExercise({
    分身编号: twinId,
    编号: exercise.编号,
    方向: "做多",
    理由: "一小时高低点抬高；跌破前低则判断失效",
    止损: 95,
    风险预算: 600,
    本金: 10000,
  });
  const differentExercise = await startExercise(twinId, "AKEUSDT", "5m");
  submitExercise({
    分身编号: twinId,
    编号: differentExercise.编号,
    方向: "观望",
    理由: "5分钟K线仍在窄幅通道内运行，目前没有突破高点，所以继续观望。",
    本金: 10000,
  });
  await askCoach({ ...input(), 位置: "训练", 请求编号: randomUUID() });
  const trainingEvidence = vi.mocked(generateCoachJson).mock.calls.at(-1)![1] as {
    证据: Array<{ 编号: string; 内容: Array<Record<string, unknown>> }>;
  };
  const submittedTraining = trainingEvidence.证据.find((item) => item.编号 === "training")?.内容 ?? [];
  expect(submittedTraining).toHaveLength(2);
  expect(submittedTraining.every((item) => Array.isArray(item.决策前最近12根可见K线与指标))).toBe(true);
  const coachingFile = path.join(dir, "coaching.json");
  const saved = JSON.parse(fs.readFileSync(coachingFile, "utf8"));
  saved.records.push({
    ...agreement,
    编号: randomUUID(),
    位置: "演示",
    创建时间: new Date(Date.now() + 1000).toISOString(),
    已确认: undefined,
  });
  fs.writeFileSync(coachingFile, JSON.stringify(saved), "utf8");
  const progress = coachingState(twinId).阶段进展;
  expect(progress.样本范围.模拟交易数).toBe(1);
  expect(progress.样本范围.专项训练数).toBe(2);
  expect(progress.样本范围.私教对话数).toBe(0);
  expect(progress.目标一致性.结论).toContain("2/2");
  expect(progress.场景对照.find((item) => item.训练编号 === exercise.编号)?.关系).toBe("相似场景复练");
  expect(progress.场景对照.find((item) => item.训练编号 === exercise.编号)?.对应记录).toContain(order.编号);
  expect(progress.场景对照.find((item) => item.训练编号 === differentExercise.编号)?.关系).toBe("不同场景验证");
  expect(progress.可追溯记录.some((item) => item.类型 === "模拟交易")).toBe(true);
  expect(progress.可追溯记录.some((item) => item.类型 === "专项训练")).toBe(true);
  expect(progress.可追溯记录.some((item) => item.类型 === "私教对话")).toBe(true);
  expect(progress.可追溯记录.some((item) => item.类型 === "练习约定")).toBe(true);
  expect(progress.可追溯记录.some((item) => item.标题.includes("演示"))).toBe(false);
  await askCoach({
    ...input(),
    位置: "复盘",
    请求编号: randomUUID(),
    用户补充: "请总结这一阶段",
  });
  const reviewEvidence = vi.mocked(generateCoachJson).mock.calls.at(-1)![1] as {
    证据: Array<{ 编号: string; 内容: unknown }>;
  };
  const stageEvidence = reviewEvidence.证据.find((item) => item.编号 === "stage_progress");
  expect(stageEvidence).toBeTruthy();
  expect(JSON.stringify(stageEvidence)).not.toContain('"位置":"演示"');
});
it("风险核算使用杠杆后的名义价值与止损距离；观望不假装完成止损训练", () => {
  const r = checkDecision(
    { 方向: "做多", 理由: "条件", 本金: 10000, 止损: 95, 风险预算: 100 },
    100,
    ["遵守风险预算"],
  );
  expect(r.计划止损金额).toBe(500);
  expect(r.检查[0]!.结果).toBe("计划金额超出预算");
  expect(checkDecision(
    { 方向: "做多", 理由: "条件", 本金: 1000, 杠杆倍数: 5, 止损: 95, 风险预算: 300 },
    100,
    ["遵守风险预算"],
  ).计划止损金额).toBeCloseTo(250);
  expect(
    checkDecision({ 方向: "观望", 理由: "等待", 本金: 10000 }, 100, [
      "设置止损",
    ]).检查[0]!.结果,
  ).toContain("不适用");
});
it("盘面提问会向陪练提供连续布林带宽度证据", async () => {
  const market = await loadPracticeMarket({});
  await askCoach({
    分身编号: twinId,
    位置: "盘面",
    关联编号: market.行情编号,
    请求编号: randomUUID(),
    用户补充: "布林带是不是正在收口？",
  });
  const modelInput = vi.mocked(generateCoachJson).mock.calls[0]![1] as {
    证据: Array<{ 编号: string; 内容: unknown }>;
  };
  const evidence = JSON.stringify(modelInput.证据.find((item) => item.编号 === "market"));
  expect(evidence).toContain("最近12根布林带");
  expect(evidence).toContain("带宽百分比");
  expect(evidence).toContain("布林带宽度变化");
});
it("账户分批成交按订单合并，空数据保持真实范围且不产生行为标签", async () => {
  vi.mocked(尝试调用币安Mcp工具)
    .mockResolvedValueOnce({ uid: 12345080, balances: [] })
    .mockResolvedValueOnce([
      { id: 1, orderId: 11, time: 1000 },
      { id: 2, orderId: 11, time: 1100 },
      { id: 3, orderId: 12, time: 2000 },
    ]);
  const account = await importAccountHistory(twinId, "BTCUSDT");
  expect(account.成交笔数).toBe(3);
  expect(account.订单数).toBe(2);
  expect(account.观察[0]).toContain("相邻订单 1 次");
  vi.mocked(尝试调用币安Mcp工具)
    .mockResolvedValueOnce({ uid: 12345080, balances: [] })
    .mockResolvedValueOnce([]);
  const empty = await importAccountHistory(twinId, "BTCUSDT");
  expect(empty.说明).toContain("不代表主账户没有成交");
  expect(coachingState(twinId).账户?.成交笔数).toBe(0);
});
