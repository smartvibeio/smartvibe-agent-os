import type { InterviewScenario, DimensionImpact } from "./types.js";
import type { DecisionPattern } from "../domain/types.js";

export const COACH_BANK_VERSION = "coach-16-v1";
export const COACH_GROUPS = ["entry", "loss_exit", "sizing", "loss_streak", "win_streak", "information", "waiting", "profit_exit"] as const;
type Group = typeof COACH_GROUPS[number];
type Choice = [string, DecisionPattern, DimensionImpact];
export type CoachQuestion = InterviewScenario & { group: Group; source: string };
function question(id: number, group: Group, title: string, source: string, prompt: string, choices: Choice[]): CoachQuestion {
  return {
    scenario_id: `coach_v1_${id}`, group, source, category: "confirmation_bias", title, question: prompt,
    market_context: { symbol: "BTCUSDT", summary: "交易习惯情景题，不代表实时行情", source: "interview_scenario",
      metrics: { price_change_pct: 0, volatility_regime: null, volume_change_pct: null, open_interest_change_pct: null, funding_rate: null, funding_elevated: null } },
    options: choices.map(([label, decision_pattern, dimension_impact], i) => ({ option_id: `${id}_${i + 1}`, label, decision_pattern, dimension_impact })),
  };
}

// Heuristic initial evidence, not a validated psychological scale or a quality score.
// Each variant probes the same primary dimensions. Preserve exact answers for later coaching.
export const coachQuestionBank: CoachQuestion[] = [
  question(1, "entry", "连续上涨，还没入场", "PRISM S-11 / M-08", "你空仓几天，关注的币已经连续上涨，但还没出现你原先等待的入场条件。你通常会怎么做？", [
    ["先买入一部分，避免继续错过。", "enter_small", { fomo_tendency: 8, confirmation_need: -6 }],
    ["调整观察条件，出现新的入场依据再买。", "observe_wait", { fomo_tendency: -4, confirmation_need: 6 }],
    ["保留原来的条件，没等到就放过这次机会。", "observe_wait", { fomo_tendency: -8, confirmation_need: 8 }],
  ]),
  question(2, "entry", "卖出后迅速上涨", "PRISM S-02", "你刚卖出的币迅速上涨。再次买入前，你更可能怎么做？", [
    ["暂时不再交易这个币，等情绪平复。", "observe_wait", { fomo_tendency: -8, confirmation_need: 4 }],
    ["重新判断当前是否存在入场机会。", "observe_wait", { fomo_tendency: -4, confirmation_need: 8 }],
    ["先买回一部分，再考虑后续如何处理。", "enter_small", { fomo_tendency: 8, confirmation_need: -6 }],
  ]),
  question(3, "loss_exit", "到了止损位置", "PRISM M-01", "价格到了你开仓前设定的止损位置，但很快出现小幅反弹。你通常会怎么做？", [
    ["按原定止损退出。", "exit_bias", { holding_preference: -8, risk_tolerance: -6 }],
    ["先减掉一部分，剩余仓位继续观察。", "trim", { holding_preference: -4, risk_tolerance: -4 }],
    ["暂时保留全部仓位，看看反弹能否延续。", "hold", { holding_preference: 8, risk_tolerance: 6 }],
  ]),
  question(4, "loss_exit", "亏损超出预期", "PRISM S-08", "一笔交易的亏损已经超过你原先准备承受的范围。你通常更接近哪种处理方式？", [
    ["继续持有，等价格回到更容易接受的位置。", "hold", { holding_preference: 8, risk_tolerance: 6 }],
    ["结束这笔交易，重新安排剩余资金。", "exit_bias", { holding_preference: -8, risk_tolerance: -6 }],
    ["先缩小仓位，给剩余部分设定退出条件。", "trim", { holding_preference: -4, risk_tolerance: -4 }],
  ]),
  question(5, "sizing", "看好的机会如何投入", "PRISM M-02", "你发现一个很看好的交易机会，但入场后仍可能先经历回撤。你通常如何安排仓位？", [
    ["先投入较小仓位，观察后续表现再决定是否增加。", "enter_small", { size_aggression: -6, exposure_comfort: -4 }],
    ["根据退出位置和可承受亏损，计算这次投入多少。", "open_position", { confirmation_need: 6 }],
    ["看好程度较高，会比平时投入更多仓位。", "open_position", { size_aggression: 8, exposure_comfort: 6 }],
  ]),
  question(6, "sizing", "持仓时又有新机会", "PRISM M-02 扩展", "你已经持有一个币，又发现另一个很想参与的机会。你通常怎么处理？", [
    ["减少原有仓位，把资金转到新机会。", "trim", { exposure_comfort: -4 }],
    ["使用剩余资金新增仓位，原有仓位保持不动。", "open_position", { size_aggression: 8, exposure_comfort: 6 }],
    ["先检查两笔交易合计可能亏多少，再决定是否参与。", "observe_wait", { confirmation_need: 6 }],
  ]),
  question(7, "loss_streak", "连续三笔亏损", "PRISM M-05 / S-13", "你连续三笔交易亏损，又出现一个与你平时交易条件相符的机会。你更可能怎么做？", [
    ["暂停交易，先检查连续亏损的原因。", "observe_wait", { patience: 8, confirmation_need: 6 }],
    ["继续参与，但降低这笔交易的投入。", "enter_small", { size_aggression: -6 }],
    ["按平时的仓位参与，不因前三笔结果改变。", "open_position", {}],
  ]),
  question(8, "loss_streak", "亏损后的快速波动", "PRISM S-01 / S-13", "今天的亏损让你很不舒服，此时价格突然快速波动。你通常更接近哪种反应？", [
    ["想抓住这次波动，尽快把今天的亏损补回来。", "chase_entry", { patience: -8, confirmation_need: -6 }],
    ["先离开盘面一会儿，再决定是否继续。", "observe_wait", { patience: 8 }],
    ["继续观察，只在原定条件出现时参与。", "observe_wait", { patience: 6, confirmation_need: 6 }],
  ]),
  question(9, "win_streak", "连续三笔盈利", "PRISM S-03", "今天已经连续三笔盈利，又出现了交易机会。你通常会怎么做？", [
    ["结束今天的交易，保留已经取得的结果。", "observe_wait", { patience: 6 }],
    ["继续按原来的条件和仓位交易。", "open_position", {}],
    ["觉得状态不错，愿意增加下一笔的投入。", "open_position", { size_aggression: 8 }],
  ]),
  question(10, "win_streak", "越来越有信心", "PRISM S-03 扩展", "最近几笔交易都比较顺利，你对自己的判断越来越有信心。接下来你通常有什么变化？", [
    ["更愿意提前入场，不一定等所有条件齐全。", "chase_entry", { confirmation_need: -8 }],
    ["交易条件基本不变，但可能加大仓位。", "open_position", { size_aggression: 8 }],
    ["入场条件和仓位安排都基本不变。", "open_position", {}],
  ]),
  question(11, "information", "信任的博主推荐", "PRISM S-07 / M-07", "你信任的交易博主推荐一个你还不熟悉的币。你通常先做什么？", [
    ["先投入少量资金，再逐步了解。", "enter_small", { confirmation_need: -8 }],
    ["先了解推荐依据，再决定是否参与。", "observe_wait", { confirmation_need: 8 }],
    ["继续交易自己熟悉的标的，暂不参与。", "observe_wait", { confirmation_need: 4 }],
  ]),
  question(12, "information", "看到大额买入", "PRISM S-12 / M-03", "你看到大额账户连续买入某个币，但暂时不清楚原因。你更可能怎么做？", [
    ["把它作为关注线索，等待价格或成交量进一步确认。", "observe_wait", { confirmation_need: 8 }],
    ["跟进一部分仓位，后续再根据变化调整。", "enter_small", { confirmation_need: -8 }],
    ["这类信息不影响自己的计划，继续按原有条件交易。", "observe_wait", { confirmation_need: 4 }],
  ]),
  question(13, "waiting", "迟迟没有入场条件", "PRISM S-06", "市场横盘了很久，你关注的标的一直没有出现入场条件。你通常会怎么做？", [
    ["减少看盘，等条件出现再回来。", "observe_wait", { patience: 8, momentum_preference: -4 }],
    ["寻找其他符合自己交易条件的标的。", "observe_wait", { confirmation_need: 4 }],
    ["尝试更短周期的交易，参与眼前的小波动。", "open_position", { patience: -6, holding_preference: -6 }],
  ]),
  question(14, "waiting", "别的币更活跃", "PRISM M-04", "你持有的币走势平淡，另一个币最近明显更活跃。你通常会怎么处理？", [
    ["换到更活跃的币，把握当前机会。", "open_position", { patience: -6, momentum_preference: 6 }],
    ["原有仓位先不动，用剩余资金尝试新标的。", "open_position", { exposure_comfort: 6 }],
    ["先检查原交易的持有条件是否改变，再决定是否换仓。", "observe_wait", { patience: 8, confirmation_need: 4 }],
  ]),
  question(15, "profit_exit", "达到止盈目标", "SmartVibe 补充", "持仓已经达到你原先设定的止盈目标，但价格还在上涨。你通常会怎么做？", [
    ["按原定目标全部退出。", "exit_bias", { holding_preference: -8, momentum_preference: -4 }],
    ["先兑现一部分，剩余仓位继续跟随。", "trim", { holding_preference: 4, momentum_preference: 4 }],
    ["继续持有，等上涨明显转弱再退出。", "hold", { holding_preference: 8, momentum_preference: 6 }],
  ]),
  question(16, "profit_exit", "浮盈开始回落", "SmartVibe 补充", "一笔盈利持仓开始回落，原先的持有条件还没有失效。你通常更可能怎么做？", [
    ["先退出，避免已有利润继续减少。", "exit_bias", { holding_preference: -8, momentum_preference: -4 }],
    ["减掉一部分，剩余仓位继续观察。", "trim", { holding_preference: 4 }],
    ["继续按原先的退出条件持有。", "hold", { holding_preference: 8, momentum_preference: 4 }],
  ]),
];

export function drawCoachQuestions(previous: string[] = [], random = Math.random): CoachQuestion[] {
  return COACH_GROUPS.map(group => {
    const pool = coachQuestionBank.filter(q => q.group === group);
    const unseen = pool.filter(q => !previous.includes(q.scenario_id));
    const choices = unseen.length ? unseen : pool;
    return choices[Math.floor(random() * choices.length)];
  });
}

export function validateCoachAnswers(answers: Array<{ scenario_id: string; option_id: string }>, version: string): CoachQuestion[] {
  if (version !== COACH_BANK_VERSION) throw new Error("题库版本已更新，请重新开始建档。");
  if (answers.length !== COACH_GROUPS.length) throw new Error("请完成全部 8 道建档题。");
  const questions = answers.map(a => {
    const q = coachQuestionBank.find(q => q.scenario_id === a.scenario_id);
    if (!q || !q.options.some(o => o.option_id === a.option_id)) throw new Error("建档题目或选项无效。");
    return q;
  });
  if (new Set(questions.map(q => q.group)).size !== COACH_GROUPS.length) throw new Error("建档题目必须覆盖八类交易习惯，且不能重复。");
  return questions;
}
