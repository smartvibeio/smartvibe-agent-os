/**
 * SmartVibe 交易陪练 · 核心业务（供协议服务 / 网页调用）
 * 数字分身 + 模拟盘：记录、点评、纠偏，打磨交易体系；不是荐股机器人。
 */
import { randomUUID } from "node:crypto";
import { COACH_BANK_VERSION, drawCoachQuestions, validateCoachAnswers } from "../interview/coachQuestionBank.js";
import {
  evolve,
  snapshotFromProfile,
  computeDifference,
} from "../domain/evolve.js";
import { modelTwinResponse } from "../domain/modelResponse.js";
import type {
  DecisionPattern,
  MarketContext,
  TradingTwinProfile,
} from "../domain/types.js";
import { createTwinFromInterviewAnswers } from "../interview/createTwinFromInterview.js";
import {
  COACH_PROFILE_SCENARIO_IDS,
  getInterviewSet,
} from "../interview/scenarioLibrary.js";
import { demoLoopScenarios } from "../demo/interview.js";
import { sameMarketStimulus } from "../fixtures/demoData.js";
import { 拉取币安K线 } from "./binancePublic.js";
import { 探测币安AgentOs, 尝试调用币安Mcp工具 } from "./binanceMcp.js";
import { appendMemory, getTwin, listMemories, upsertTwin } from "./store.js";
import { 决策动作中文, 行情中文摘要, 波动中文, 解析用户意图 } from "./zh.js";

export function 获取Agent说明(mode: string) {
  return {
    名称: "SmartVibe 交易陪练",
    一句话:
      "数字分身 + 模拟盘的 AI 私教：练单、发现问题、点评纠偏，逐步打磨交易体系。",
    当前阶段: "网页提供真实行情、模拟账本和 AI 私教；本地 MCP 保留早期样本工具",
    运行模式: mode,
    币安AgentOS: {
      端点: "https://agent.binance.com/mcp/agentic",
      配置文件: "Codex MCP → binance-mcp-server；网页通过本机只读桥接",
      探测命令: "npm run agent:binance-probe",
      说明: "官方 MCP 必须 OAuth；未授权前网页练盘仍用公开 K 线回退。",
    },
    工具: [
      "get_agent_info",
      "list_cold_start_scenarios",
      "create_trading_twin",
      "get_market_context",
      "probe_binance_agent_os",
      "simulate_twin_response",
      "record_decision_memory",
      "pre_trade_coach",
      "simulate_open_lite",
    ],
    明确不做: [
      "人格测试终局报告",
      "买入/卖出推荐",
      "自动下单",
      "把分身训练成复制用户局限",
    ],
  };
}

export function 列出冷启动情景(previous?: string[]) {
  const scenarios = (previous ? drawCoachQuestions(previous) : getInterviewSet(COACH_PROFILE_SCENARIO_IDS)).map((s) => ({
    情景编号: s.scenario_id,
    类别: "group" in s ? String(s.group) : s.category,
    标题: s.title,
    问题: s.question,
    市场摘要: s.market_context.summary,
    选项: s.options.map((o) => ({
      选项编号: o.option_id,
      文案: o.label,
      决策倾向: 决策动作中文(o.decision_pattern),
    })),
  }));
  return {
    题库版本: previous ? COACH_BANK_VERSION : "legacy-8",
    说明: "建档问卷：用来建立「初始数字分身」。题量多于快速测验，仍只是起点；接入币安 Agent OS 后可用真实成交盈亏再校准。",
    情景数量: scenarios.length,
    情景列表: scenarios,
    下一步: "答完后进入练盘：看真K线、自己先模拟下单，再看分身与私教点评。",
  };
}

export function 创建交易分身(args: {
  显示名称?: string;
  题库版本?: string;
  答案: Array<{ 情景编号: string; 选项编号: string }>;
}) {
  const answers = args.答案.map((a) => ({
    scenario_id: a.情景编号,
    option_id: a.选项编号,
  }));
  const set = args.题库版本 && args.题库版本 !== "legacy-8"
    ? validateCoachAnswers(answers, args.题库版本)
    : getInterviewSet(COACH_PROFILE_SCENARIO_IDS);
  if (answers.length !== set.length || new Set(answers.map(a => a.scenario_id)).size !== set.length) {
    throw new Error(`请完成全部 ${set.length} 道建档题后再创建分身。`);
  }
  const twin = createTwinFromInterviewAnswers({
    display_name: args.显示名称 ?? "我的交易分身",
    scenarios: set,
    answers,
  });
  twin.interview_answers = answers;
  twin.interview_snapshot = {
    bank_version: args.题库版本 ?? "legacy-8",
    questions: set.map(s => ({ scenario_id: s.scenario_id, group: "group" in s ? String(s.group) : s.category,
      question: s.question, options: s.options.map(o => ({ option_id: o.option_id, label: o.label })) })),
  };
  twin.account_context_latest = null;
  upsertTwin(twin);

  const 问题初判: string[] = [];
  if (twin.decision_tendencies.fomo_tendency >= 55)
    问题初判.push("追涨/害怕踏空倾向偏高");
  if (twin.decision_tendencies.patience <= 45)
    问题初判.push("耐心不足，容易被磨出来");
  if (twin.risk_preferences.drawdown_response <= 40)
    问题初判.push("回撤时容易情绪化离场或乱动");
  if (twin.risk_preferences.size_aggression >= 60)
    问题初判.push("仓位容易偏大");
  if (twin.decision_tendencies.confirmation_need <= 40)
    问题初判.push("确认不足时仍可能动手");

  return {
    说明: "初始数字分身已建立（起点）。接下来在练盘里用真实下单行为 + 私教点评继续校准；日后可导入币安历史成交。",
    分身编号: twin.id,
    名称: twin.display_name,
    版本: twin.version,
    状态: "建档完成",
    习惯摘要: {
      动量偏好: twin.decision_tendencies.momentum_preference,
      耐心: twin.decision_tendencies.patience,
      追涨敏感: twin.decision_tendencies.fomo_tendency,
      确认需求: twin.decision_tendencies.confirmation_need,
      持有偏好: twin.decision_tendencies.holding_preference,
      风险承受: twin.risk_preferences.risk_tolerance,
      回撤忍耐: twin.risk_preferences.drawdown_response,
      仓位进攻: twin.risk_preferences.size_aggression,
    },
    初步问题清单: 问题初判.length
      ? 问题初判
      : ["暂无明显极端倾向，仍需用练盘行为验证"],
    置信度: twin.confidence.overall,
  };
}

export async function 获取实盘图表包(args: {
  交易对?: string;
  周期?: string;
  根数?: number;
  市场?: "现货" | "U本位合约";
}) {
  const pack = await 拉取币安K线(args);
  return {
    ...pack,
    币安AgentOS备注: pack.连接状态,
  };
}

export async function 探测币安连接() {
  if (process.env.SMARTVIBE_CODEX_BINARY) {
    try {
      const data = await 尝试调用币安Mcp工具("spot.klines", {
        symbol: "BTCUSDT",
        interval: "1h",
        limit: 2,
      });
      if (!Array.isArray(data) || data.length === 0)
        throw new Error("官方 MCP 未返回 K线");
      return {
        端点: "https://agent.binance.com/mcp/agentic",
        初始化: "已连接",
        初始化详情:
          "已通过 Codex 只读桥接成功读取 BTCUSDT 现货 K线；账户权限需独立查询验证。",
      };
    } catch {
      return {
        端点: "https://agent.binance.com/mcp/agentic",
        初始化: "失败",
        初始化详情:
          "网页桥接暂不可用，请检查 Codex 授权和本地代理；练盘行情会回退公开 API。",
      };
    }
  }
  return 探测币安AgentOs();
}

const 行情样本: Record<string, MarketContext> = {
  same_market: {
    ...sameMarketStimulus,
    summary: "比特币短时上涨约 8%，持仓量上升，资金费率偏高",
  },
  rapid_pump: {
    ...demoLoopScenarios[0].market_context,
    summary: "比特币两小时内急涨约 12%，量能与情绪升温，资金费率偏高",
  },
  sharp_drop: {
    ...demoLoopScenarios[1].market_context,
    summary: "比特币急跌约 9%，流动性承压，资金费率转负",
  },
  false_breakout: {
    ...demoLoopScenarios[2].market_context,
    summary: "价格疑似突破后回落区间，持仓量仍高，资金费率偏高",
  },
};

export function 获取行情上下文(args: { 样本编号?: string; 交易对?: string }) {
  const key = args.样本编号 ?? "rapid_pump";
  const market = 行情样本[key] ?? 行情样本.rapid_pump;
  const symbol = args.交易对 ?? market.symbol;
  const ctx: MarketContext = {
    ...market,
    symbol,
    source: "demo_fixture",
  };
  return {
    说明: "当前为本地样本行情（阶段3将优先改为币安 Agent OS 真实行情）。仅作分身模拟刺激，不是交易信号。",
    样本编号: key in 行情样本 ? key : "rapid_pump",
    可用样本: Object.keys(行情样本),
    行情: {
      交易对: ctx.symbol,
      摘要: ctx.summary,
      中文简述: 行情中文摘要(ctx),
      涨跌幅百分比: ctx.metrics.price_change_pct,
      波动: 波动中文(ctx.metrics.volatility_regime),
      成交量变化百分比: ctx.metrics.volume_change_pct,
      持仓量变化百分比: ctx.metrics.open_interest_change_pct,
      资金费率: ctx.metrics.funding_rate,
      资金费率是否偏高: ctx.metrics.funding_elevated,
    },
    _market: ctx,
  };
}

export function 模拟分身反应(args: { 分身编号?: string; 样本编号?: string }) {
  const twin = getTwin(args.分身编号);
  if (!twin) throw new Error("未找到交易分身，请先创建交易分身。");
  const pack = 获取行情上下文({ 样本编号: args.样本编号 ?? "rapid_pump" });
  const market = pack._market;
  const response = modelTwinResponse(twin, market);
  return {
    说明: "以下是「按你过去习惯」在该行情下更可能的处理方式，不是建议你现在必须怎么做。",
    分身编号: twin.id,
    分身版本: twin.version,
    行情简述: 行情中文摘要(market),
    分身反应: {
      决策倾向: 决策动作中文(response.decision_pattern),
      倾向代码: response.decision_pattern,
      置信度: response.confidence,
      理由: 中文化理由(response.reasoning, response.decision_pattern),
      激活习惯: response.activated_dimensions.map(习惯中文),
    },
  };
}

function 习惯中文(tag: string): string {
  const map: Record<string, string> = {
    high_exposure: "高仓位暴露",
    low_exposure: "低仓位暴露",
    high_fomo_tendency: "追涨敏感偏高",
    high_patience: "耐心偏高",
    low_drawdown_response: "回撤忍耐偏低",
    high_holding_preference: "持有偏好偏高",
    short_term_horizon: "偏短线",
    long_term_horizon: "偏长线",
    elevated_funding: "资金费率偏高环境",
    risk_management_lean: "风险收敛倾向",
  };
  return map[tag] ?? tag;
}

function 中文化理由(reasoning: string, pattern: DecisionPattern): string {
  // 模型层仍可能吐英文理由；对外统一成中文模板
  return `结合你已记录的习惯，在当前刺激下，分身判断你「昨天的自己」更可能：${决策动作中文(pattern)}。${reasoning.includes("conflicts") ? "该环境可能与你的风险承受习惯存在冲突。" : "该环境与你的持有/等待习惯未必冲突。"}请把它当作镜子，而不是指令。`;
}

export function 记录决策记忆(args: {
  分身编号?: string;
  行情快照?: MarketContext;
  样本编号?: string;
  分身倾向代码: DecisionPattern;
  用户真实选择代码: DecisionPattern;
  暴露的弱点?: string;
  盈亏原因备注?: string;
}) {
  const twin = getTwin(args.分身编号);
  if (!twin) throw new Error("未找到交易分身，请先创建交易分身。");
  const pack = 获取行情上下文({ 样本编号: args.样本编号 ?? "rapid_pump" });
  const market = args.行情快照 ?? pack._market;
  const before = snapshotFromProfile(twin);
  const draft = {
    scenario_id: args.样本编号 ?? "rapid_pump",
    market_context: market,
    account_context: twin.account_context_latest,
    twin_response: {
      decision_pattern: args.分身倾向代码,
      reasoning: "阶段2记录",
      confidence: 0.7,
      activated_dimensions: [],
    },
    user_reality: {
      actual_choice: args.用户真实选择代码,
      optional_explanation: [args.暴露的弱点, args.盈亏原因备注]
        .filter(Boolean)
        .join(" | "),
      source: args.行情快照 ? ("user_ui" as const) : ("demo" as const),
    },
  };
  const result = evolve(twin, draft);
  const memoryId = randomUUID();
  const updated: TradingTwinProfile = {
    ...result.profile,
    evolution: {
      ...result.profile.evolution,
      last_memory_id: memoryId,
      last_shift_summary:
        "已根据本次真实决策，完善对「昨天的自己」的刻画（用于复盘与提醒，不是为了复制你）。",
    },
  };
  upsertTwin(updated);

  const memory = {
    id: memoryId,
    twin_id: twin.id,
    created_at: new Date().toISOString(),
    scenario_id: args.样本编号 ?? "rapid_pump",
    demo_tag: "phase2_core",
    market_context: market,
    account_context: twin.account_context_latest,
    twin_response: draft.twin_response,
    user_reality: draft.user_reality,
    learning: {
      difference: result.difference,
      updated_pattern_deltas: result.deltas,
      confidence_change: result.confidence_change,
      applied: true,
      narrative:
        args.暴露的弱点 || args.盈亏原因备注
          ? `已记录弱点/盈亏备注：${[args.暴露的弱点, args.盈亏原因备注].filter(Boolean).join("；")}`
          : result.narrative,
    },
    twin_snapshot_before: before,
    twin_snapshot_after: snapshotFromProfile(updated),
  };
  appendMemory(twin.id, memory);

  return {
    说明: "决策记忆已写入。目的是更清楚「昨天的自己」哪里容易亏、哪里有效，而不是让分身越来越像你。",
    记忆编号: memoryId,
    是否一致: result.difference.aligned,
    差异说明: result.difference.summary,
    分身版本变化: {
      之前: before.version,
      之后: updated.version,
    },
    习惯变化摘要: result.deltas,
    暴露的弱点: args.暴露的弱点 ?? null,
    盈亏原因备注: args.盈亏原因备注 ?? null,
  };
}

export function 开仓前行为提醒(args: {
  分身编号?: string;
  样本编号?: string;
  用户准备怎么做: string;
  交易对?: string;
}) {
  const twin = getTwin(args.分身编号);
  if (!twin) throw new Error("未找到交易分身，请先创建交易分身。");
  const pack = 获取行情上下文({
    样本编号: args.样本编号 ?? "rapid_pump",
    交易对: args.交易对,
  });
  const market = pack._market;
  const modeled = modelTwinResponse(twin, market);
  const intended = 解析用户意图(args.用户准备怎么做);
  const diff = computeDifference(modeled.decision_pattern, intended);
  const memories = listMemories(twin.id);
  const weaknessNotes = memories
    .map((m) => m.user_reality.optional_explanation)
    .filter(Boolean)
    .slice(0, 3);

  const 追涨风险 =
    intended === "chase_entry" &&
    (twin.decision_tendencies.fomo_tendency >= 55 ||
      market.metrics.funding_elevated === true);

  let 提醒主句 = "";
  if (diff.aligned) {
    提醒主句 = `你现在的打算（${决策动作中文(intended)}）与「昨天的自己」在类似行情下的习惯大致一致。仍请确认：这是清醒重复有效做法，还是无意识的惯性。`;
  } else {
    提醒主句 = `按你的历史习惯，分身判断你更可能「${决策动作中文(modeled.decision_pattern)}」；但你现在准备「${决策动作中文(intended)}」。这与旧模式不一致——可能是进步，也可能是情绪驱动，请先停 10 秒问自己原因。`;
  }
  if (追涨风险) {
    提醒主句 +=
      " 当前更像高波动/费率偏高环境，若你过去在类似环境追入后出现过回撤，请优先审视仓位与时机，而不是加速下单。";
  }

  return {
    说明: "这是开仓前行为镜像提醒，不是买卖建议，不会替你下单。",
    交易对: market.symbol,
    行情简述: 行情中文摘要(market),
    你准备做的: args.用户准备怎么做,
    识别为: 决策动作中文(intended),
    昨天的自己更可能: 决策动作中文(modeled.decision_pattern),
    是否与旧习惯一致: diff.aligned,
    提醒: 提醒主句,
    可参考的历史备注: weaknessNotes,
    审视问题: [
      "这是计划内动作，还是被行情推着走？",
      "若按旧习惯开，最坏情况你是否事先接受？",
      "此刻更应该等待确认，还是你有清晰、可执行的理由可以更果断？",
    ],
  };
}

/** 轻量模拟开仓：用样本路径展示「按旧习惯开」后可能发生什么（非完整回测平台） */
export function 轻量模拟开仓(args: {
  分身编号?: string;
  交易对?: string;
  方向?: "做多试探" | "观望";
}) {
  const twin = getTwin(args.分身编号);
  if (!twin) throw new Error("未找到交易分身，请先创建交易分身。");
  const symbol = args.交易对 ?? "BTCUSDT";
  const pack = 获取行情上下文({ 样本编号: "rapid_pump", 交易对: symbol });
  const modeled = modelTwinResponse(twin, pack._market);

  // 固定样本推演：急涨后常见回撤样本（演示用）
  const 路径 = [
    { 时刻: "开仓时", 价格变化百分比: 0, 说明: "按你旧习惯可能动手的位置" },
    { 时刻: "+1小时", 价格变化百分比: 3.2, 说明: "短期延续" },
    { 时刻: "+4小时", 价格变化百分比: -2.5, 说明: "冲高回落" },
    { 时刻: "+1天", 价格变化百分比: -6.8, 说明: "费率高位后常见冷却" },
  ];

  const 会追 =
    modeled.decision_pattern === "chase_entry" ||
    modeled.decision_pattern === "enter_small" ||
    args.方向 === "做多试探";

  return {
    说明: "这是轻量模拟（本地样本路径），用来暴露「按昨天的自己开仓」可能遇到的问题，不是预测未来，更不是下单指令。",
    交易对: symbol,
    分身在类似急涨下的习惯: 决策动作中文(modeled.decision_pattern),
    是否按旧习惯更可能已经动手: 会追,
    模拟路径: 路径,
    暴露问题提示: 会追
      ? [
          "在资金费率偏高、情绪升温时追入，容易买在加速段。",
          "若你缺少事先止损/减仓规则，一天内回撤可能放大情绪错误。",
          "复盘重点：动手理由是计划还是害怕踏空。",
        ]
      : [
          "你的旧习惯偏等待/谨慎，模拟显示你可能错过一段冲高，但也避开回撤段。",
          "复盘重点：等待是否变成习惯性错过，还是有效的风险过滤。",
        ],
    如何用于提高:
      "把「路径结果」当成镜子：记下弱点与规则漏洞，下次开仓前用开仓前提醒对照——目标是成为更好的交易者，不是复制昨天的自己。",
  };
}

/** 模拟下单后的私教点评：对照分身习惯，指出问题与改进点 */
export function 点评模拟开仓(args: {
  分身编号?: string;
  交易对?: string;
  方向: "做多" | "做空" | "观望";
  订单类型: "市价" | "限价";
  仓位比例?: number;
  用户理由?: string;
  涨跌百分比?: number;
  RSI?: number | null;
}) {
  const twin = getTwin(args.分身编号);
  if (!twin) throw new Error("未找到交易分身，请先完成建档。");

  const 意图文 =
    args.方向 === "观望"
      ? "我先观望不开仓"
      : args.方向 === "做多"
        ? args.订单类型 === "市价"
          ? "我想市价追多"
          : "我想限价做多"
        : args.订单类型 === "市价"
          ? "我想市价做空"
          : "我想限价做空";

  const 提醒 = 开仓前行为提醒({
    分身编号: twin.id,
    样本编号:
      (args.涨跌百分比 ?? 0) <= -5
        ? "sharp_drop"
        : (args.涨跌百分比 ?? 0) >= 8
          ? "rapid_pump"
          : "false_breakout",
    交易对: args.交易对,
    用户准备怎么做: `${意图文}。${args.用户理由 ?? ""}`,
  });

  const 问题: string[] = [];
  const 改进: string[] = [];
  const 仓位 = args.仓位比例 ?? 10;
  const fomo = twin.decision_tendencies.fomo_tendency;
  const rsi = args.RSI;

  if (args.方向 === "做多" && (args.涨跌百分比 ?? 0) >= 8 && fomo >= 55) {
    问题.push(
      "这很像你建档里的「急涨追价」习惯：行情已经走一大段仍用市价/追入思维。",
    );
    改进.push("先写清：触发条件、最大亏损、若假突破如何处理；不满足就不开。");
  }
  if (
    args.方向 !== "观望" &&
    仓位 >= 30 &&
    twin.risk_preferences.size_aggression >= 55
  ) {
    问题.push("仓位偏大，与你偏进攻的仓位习惯叠加，单笔容错变差。");
    改进.push("练盘阶段把单笔风险先压到权益的 1%～2% 等价仓位，再谈加码。");
  }
  if (args.方向 === "做多" && rsi != null && rsi >= 70) {
    问题.push("RSI 已处高位仍做多，容易买在拥挤段。");
    改进.push("高位只允许「计划内的小仓试错」，禁止情绪加仓。");
  }
  if (args.方向 === "做空" && rsi != null && rsi <= 30) {
    问题.push("RSI 低位仍做空，需警惕发泄式追空。");
    改进.push("超卖区空单必须有更严格的失效条件，否则宁肯观望。");
  }
  if (args.方向 === "观望" && twin.decision_tendencies.patience <= 45) {
    问题.push(
      "你选择观望是好的；但建档显示你耐心偏弱——要防止过一会儿又手痒重开。",
    );
    改进.push("给自己设「最短冷静时间」：例如 30 分钟内不得改单。");
  }
  if (!问题.length) {
    问题.push(
      "这次动作与分身极端弱点不完全重合，仍要检查是否有清晰规则，而不是感觉好。",
    );
    改进.push("把本次理由写成一条可复用规则，下次同类盘面先对照规则再下单。");
  }

  return {
    说明: "私教点评：针对你刚提交的模拟单，对照数字分身指出可能问题。不是买卖建议。",
    你的模拟单: {
      交易对: args.交易对 ?? "BTCUSDT",
      方向: args.方向,
      订单类型: args.订单类型,
      仓位比例: 仓位,
      理由: args.用户理由 ?? null,
    },
    分身更可能: 提醒.昨天的自己更可能,
    是否像旧习惯: 提醒.是否与旧习惯一致,
    镜像提醒: 提醒.提醒,
    发现的问题: 问题,
    改进建议: 改进,
    审视问题: 提醒.审视问题,
  };
}

export function 获取分身摘要(分身编号?: string) {
  const twin = getTwin(分身编号);
  if (!twin) return null;
  return {
    分身编号: twin.id,
    名称: twin.display_name,
    版本: twin.version,
    记忆条数: listMemories(twin.id).length,
  };
}
