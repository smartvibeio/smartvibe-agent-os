"use client";
import dynamic from "next/dynamic";
import CoachDesk from "./CoachDesk";
import TwinDemo from "./TwinDemo";
import ProfileSetup from "./ProfileSetup";
import styles from "./profile.module.css";
type Stage = "profile" | "demo" | "practice";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MarketPack } from "@smartvibe/agent/binancePublic.js";
import type {
  PracticeOrder,
  practiceState,
} from "@smartvibe/agent/practice.js";
import type { PreTradeAdvice } from "@smartvibe/agent/coaching.js";
import type { ChartActionTag } from "./CoachChart";
const CoachChart = dynamic(() => import("./CoachChart"), { ssr: false });
type Scenario = {
  情景编号: string;
  标题: string;
  问题: string;
  市场摘要: string;
  选项: { 选项编号: string; 文案: string }[];
};
type Twin = { 分身编号: string; 名称: string; 版本: number };
type State = ReturnType<typeof practiceState>;
type Pack = MarketPack & { 行情编号: string };
type PracticeContext = {
  练习约定: {
    编号: string;
    位置: string;
    创建时间: string;
    已确认?: string;
    用户补充?: string;
    回答: { 下次练习: string; 检查项: string[] };
  } | null;
  阶段进展: {
    样本范围: {
      开始: string | null;
      模拟交易数: number;
      专项训练数: number;
      私教对话数: number;
    };
  };
};
const money = (v: number) =>
  v.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const visibleMarketSource = (value: string) =>
  value.replace(/币安\s*Agent OS\s*MCP/gi, "币安授权行情");
const visibleMarketStatus = (value: string) =>
  value
    .replace(/官方\s*MCP\s*已连接/gi, "币安行情已连接")
    .replace(/官方\s*MCP\s*暂不可用，已回退公开行情/gi, "授权行情暂不可用，已切换到币安公开行情");
const visiblePracticeCopy = (value: string) =>
  value.replace(/AI\s*私教|\bAI\b|\bAgent\b/gi, "私教");
async function api(action: string, params: Record<string, unknown> = {}) {
  const r = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 动作: action, 参数: params }),
  });
  const data = await r.json().catch(() => {
    throw new Error("网页服务暂不可用，请稍后刷新重试。");
  });
  if (!r.ok) throw new Error(data.错误 || "请求失败");
  if (!["练盘状态", "行情图", "建档列表"].includes(action))
    window.dispatchEvent(new Event("smartvibe-coach-updated"));
  return data;
}
export default function CoachClient() {
  const [stage, setStage] = useState<Stage>("profile"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [restored, setRestored] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [bankVersion, setBankVersion] = useState("legacy-8");
  const [scenarios, setScenarios] = useState<Scenario[]>([]),
    [answers, setAnswers] = useState<{ 情景编号: string; 选项编号: string }[]>(
      [],
    );
  const [twin, setTwin] = useState<Twin | null>(null),
    [state, setState] = useState<State | null>(null);
  const [symbol, setSymbol] = useState("BTCUSDT"),
    [marketType, setMarketType] = useState<"现货" | "U本位合约">("现货"),
    [interval, setIntervalValue] = useState("1h"),
    [count, setCount] = useState(120);
  const [market, setMarket] = useState<Pack | null>(null),
    [selected, setSelected] = useState<PracticeOrder | null>(null);
  const [side, setSide] = useState("做多"),
    [kind, setKind] = useState("市价"),
    [size, setSize] = useState(10),
    [leverage, setLeverage] = useState(1);
  const [limit, setLimit] = useState(""),
    [quantity, setQuantity] = useState(""),
    [stop, setStop] = useState(""),
    [target, setTarget] = useState(""),
    [reason, setReason] = useState("");
  const [riskBudget, setRiskBudget] = useState("");
  const [practiceFocus, setPracticeFocus] = useState("");
  const [practiceContext, setPracticeContext] = useState<PracticeContext | null>(null);
  const [showPreflight, setShowPreflight] = useState(false);
  const [preTrade, setPreTrade] = useState<{ fingerprint: string; advice: PreTradeAdvice } | null>(null);
  const [preTradeCountdown, setPreTradeCountdown] = useState<number | null>(null);
  const [taskSwitchCountdown, setTaskSwitchCountdown] = useState<number | null>(null);
  const [marketSwitching, setMarketSwitching] = useState(false);
  const [liveStatus, setLiveStatus] = useState("正在连接币安实时行情…");
  const lock = useRef(false),
    requestId = useRef<string | null>(null),
    backgroundRefresh = useRef(false),
    marketRequestVersion = useRef(0),
    marketRefreshDelay = useRef(0),
    practiceDetails = useRef<HTMLDetailsElement>(null),
    practiceFocusSection = useRef<HTMLElement>(null);
  const run = async (fn: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败，请重试");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const sync = async (id = twin?.分身编号) => {
    if (!id) return;
    const s: State = await api("练盘状态", { 分身编号: id });
    setState(s);
    setTwin(s.分身);
    return s;
  };
  useEffect(() => {
    const update = () => {
      if (!twin?.分身编号) return;
      void sync(twin.分身编号).then((next) => {
        if (next)
          setSelected((currentSelected) => currentSelected
            ? next.订单.find((order) => order.编号 === currentSelected.编号) ?? currentSelected
            : currentSelected);
      }).catch(() => {});
      void loadPracticeContext(twin.分身编号).catch(() => {});
    };
    window.addEventListener("smartvibe-coach-updated", update);
    return () => window.removeEventListener("smartvibe-coach-updated", update);
  }, [twin?.分身编号, selected?.编号]);
  useEffect(() => {
    if (preTradeCountdown == null) return;
    const timer = window.setInterval(
      () => setPreTradeCountdown((seconds) => seconds == null ? null : Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [preTradeCountdown == null]);
  useEffect(() => {
    if (taskSwitchCountdown == null) return;
    const timer = window.setInterval(
      () => setTaskSwitchCountdown((seconds) => seconds == null ? null : Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [taskSwitchCountdown == null]);
  useEffect(() => {
    const id = localStorage.getItem("smartvibe-twin");
    if (!id) {
      try {
        const draft = JSON.parse(localStorage.getItem("smartvibe-interview-draft") || "null");
        if (draft && Array.isArray(draft.scenarios) && draft.scenarios.length === 8 &&
          draft.scenarios.every((q: Scenario) => typeof q.问题 === "string" && Array.isArray(q.选项) && q.选项.length === 3) &&
          Array.isArray(draft.answers) && draft.answers.length <= 8 &&
          Number.isInteger(draft.questionIndex) && draft.questionIndex >= 0 && draft.questionIndex < 8 &&
          draft.questionIndex <= draft.answers.length && typeof draft.bankVersion === "string") {
          setScenarios(draft.scenarios);
          setAnswers(draft.answers);
          setQuestionIndex(draft.questionIndex);
          setBankVersion(draft.bankVersion);
        }
      } catch { /* A damaged draft does not affect saved profiles. */ }
    }
    if (id)
      void run(async () => {
        try {
          const s = await sync(id);
          if (s) {
            setTwin(s.分身);
            const saved = localStorage.getItem(`smartvibe-stage:${id}`);
            const resume: Stage = saved === "demo" || saved === "practice"
              ? saved : saved === "profile" ? "profile" : s.订单.length ? "practice" : "profile";
            if (resume === "practice") {
              const order = s.订单.find((o) => ["持仓中", "待成交"].includes(o.状态)) ?? s.订单[0];
              setMarket(await api("行情图", {
                交易对: order?.行情.交易对 ?? "BTCUSDT",
                市场: order?.行情.市场 ?? "现货",
                周期: order?.行情.周期 ?? "1h",
                根数: order?.行情.根数 ?? 120,
                分身编号: id,
              }));
               await loadPracticeContext(id);
            }
            setStage(resume);
            const active = s.订单.find((o) =>
              ["持仓中", "待成交"].includes(o.状态),
            );
            const latestOrder = active ?? s.订单[0];
            if (latestOrder) {
              setSelected(latestOrder);
              setSymbol(latestOrder.行情.交易对);
              setMarketType(latestOrder.行情.市场 ?? "现货");
              setLeverage(latestOrder.杠杆倍数 ?? 1);
              setIntervalValue(latestOrder.行情.周期);
              setCount(latestOrder.行情.根数);
            }
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "恢复记录失败，请刷新重试。原记录已保留。");
        } finally {
          setRestored(true);
        }
      });
    else setRestored(true);
  }, []);
  useEffect(() => {
    if (restored && !twin && scenarios.length) {
      localStorage.setItem("smartvibe-interview-draft", JSON.stringify({ scenarios, answers, questionIndex, bankVersion }));
    }
  }, [restored, twin, scenarios, answers, questionIndex, bankVersion]);
  useEffect(() => {
    if (restored && twin) localStorage.setItem(`smartvibe-stage:${twin.分身编号}`, stage);
  }, [restored, twin, stage]);
  useEffect(() => {
    const showNextTask = () => {
      if (practiceDetails.current) practiceDetails.current.open = false;
      setSelected(null);
      practiceFocusSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("smartvibe-next-task-adopted", showNextTask);
    return () => window.removeEventListener("smartvibe-next-task-adopted", showNextTask);
  }, []);
  const enterPractice = async () => {
    await Promise.all([refresh(), loadPracticeContext()]);
    setStage("practice");
  };
  const loadPracticeContext = async (id = twin?.分身编号) => {
    if (!id) return;
    const context: PracticeContext = await api("私教状态", { 分身编号: id });
    setPracticeContext(context);
    setPracticeFocus(context.练习约定?.回答.下次练习 ?? "");
    return context;
  };
  const refresh = async ({ automatic = false } = {}) => {
    const requestVersion = ++marketRequestVersion.current;
    if (automatic) {
      setMarketSwitching(true);
      setError("");
    }
    try {
      const requestedSymbol = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!requestedSymbol) throw new Error("请输入交易标的，例如 EDGE 或 EDGEUSDT");
      const m: Pack = await api("行情图", {
        交易对: requestedSymbol,
        市场: marketType,
        周期: interval,
        根数: count,
        分身编号: twin?.分身编号,
      });
      if (requestVersion !== marketRequestVersion.current) return m;
      setMarket(m);
      setSymbol(m.交易对);
      setMarketType(m.市场 ?? "现货");
      const s = await sync();
      if (requestVersion !== marketRequestVersion.current) return m;
      if (s)
        setSelected((currentSelected) => currentSelected
          ? s.订单.find((o) => o.编号 === currentSelected.编号) ?? currentSelected
          : currentSelected);
      return m;
    } finally {
      if (automatic && requestVersion === marketRequestVersion.current)
        setMarketSwitching(false);
    }
  };
  useEffect(() => {
    if (stage !== "practice" || !market) return;
    const filtersMatch =
      symbol === market.交易对 &&
      marketType === (market.市场 ?? "现货") &&
      interval === market.周期 &&
      count === market.根数;
    if (filtersMatch) {
      setMarketSwitching(false);
      return;
    }
    const delay = marketRefreshDelay.current;
    const timer = window.setTimeout(() => {
      void refresh({ automatic: true }).catch((e) => {
        setError(e instanceof Error ? e.message : "行情自动刷新失败，请重试");
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [stage, symbol, marketType, interval, count, market?.行情编号]);
  useEffect(() => {
    if (
      stage !== "practice" ||
      !market ||
      symbol !== market.交易对 ||
      marketType !== (market.市场 ?? "现货") ||
      interval !== market.周期 ||
      count !== market.根数
    )
      return;
    const timer = window.setInterval(() => {
      if (lock.current || backgroundRefresh.current) return;
      backgroundRefresh.current = true;
      void refresh()
        .catch(() =>
          setLiveStatus("实时行情仍在继续，完整指标暂时未能同步。"),
        )
        .finally(() => {
          backgroundRefresh.current = false;
        });
    }, 30000);
    return () => window.clearInterval(timer);
  }, [stage, market?.行情编号, symbol, marketType, interval, count]);
  useEffect(() => {
    if (
      stage !== "practice" ||
      !market ||
      symbol !== market.交易对 ||
      marketType !== (market.市场 ?? "现货") ||
      interval !== market.周期
    )
      return;
    let intentionalClose = false;
    const socket = new WebSocket(
      `${marketType === "U本位合约" ? "wss://fstream.binance.com/ws" : "wss://stream.binance.com:9443/ws"}/${symbol.toLowerCase()}@kline_${interval}`,
    );
    setLiveStatus("正在连接币安实时行情…");
    socket.onopen = () => setLiveStatus("币安实时K线已连接");
    socket.onerror = () =>
      setLiveStatus("实时连接暂不可用，仍会每30秒静默同步行情。" );
    socket.onclose = () => {
      if (!intentionalClose)
        setLiveStatus("实时连接已中断，仍会每30秒静默同步行情。" );
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as {
          s?: string;
          k?: {
            t?: number;
            i?: string;
            o?: string;
            h?: string;
            l?: string;
            c?: string;
            v?: string;
          };
        };
        const candle = message.k;
        if (
          message.s !== symbol ||
          candle?.i !== interval ||
          !Number.isFinite(Number(candle.t)) ||
          ![candle.o, candle.h, candle.l, candle.c, candle.v].every((value) =>
            Number.isFinite(Number(value)),
          )
        )
          return;
        const next = {
          time: Math.floor(Number(candle.t) / 1000),
          open: Number(candle.o),
          high: Number(candle.h),
          low: Number(candle.l),
          close: Number(candle.c),
          volume: Number(candle.v),
        };
        setMarket((current) => {
          if (!current || current.交易对 !== symbol || current.周期 !== interval || (current.市场 ?? "现货") !== marketType)
            return current;
          const candles = current.K线.slice();
          const last = candles.at(-1);
          if (last?.time === next.time) candles[candles.length - 1] = next;
          else if (!last || next.time > last.time) {
            candles.push(next);
            if (candles.length > current.根数) candles.shift();
          }
          return {
            ...current,
            K线: candles,
            最新价: next.close,
            更新时间: new Date().toISOString(),
          };
        });
      } catch {
        // Ignore malformed stream messages; the periodic snapshot remains active.
      }
    };
    return () => {
      intentionalClose = true;
      socket.close();
    };
  }, [stage, market?.行情编号, symbol, marketType, interval]);
  const current = scenarios[questionIndex];
  const active = state?.订单.find(
    (o) => o.状态 === "持仓中" || o.状态 === "待成交",
  );
  const reviewOrder = selected && selected.状态 === "已平仓" ? selected : null;
  const chartActionTags = useMemo<ChartActionTag[]>(() => {
    if (!market) return [];
    const matchesMarket = (order: PracticeOrder | undefined | null) => !!order &&
      order.行情.交易对 === market.交易对 &&
      (order.行情.市场 ?? "现货") === (market.市场 ?? "现货");
    const order = matchesMarket(selected) ? selected : matchesMarket(active) ? active : null;
    const taskStartedAt = practiceContext?.练习约定?.已确认
      ? Date.parse(practiceContext.练习约定.已确认)
      : null;
    if (!order || order.方向 === "观望" || !order.成交价 ||
      (taskStartedAt != null && Date.parse(order.创建时间) < taskStartedAt))
      return [];
    const candleSeconds: Record<string, number> = {
      "5m": 300,
      "15m": 900,
      "1h": 3600,
      "4h": 14400,
      "1d": 86400,
    };
    const nearestCandleTime = (iso: string) => {
      const target = Date.parse(iso) / 1000;
      const nearest = market.K线.reduce(
        (nearest, candle) =>
          Math.abs(candle.time - target) < Math.abs(nearest - target)
            ? candle.time
            : nearest,
        market.K线[0]?.time ?? target,
      );
      return Math.abs(nearest - target) <= (candleSeconds[market.周期] ?? 3600)
        ? nearest
        : null;
    };
    const openingSide = order.方向 === "做空" ? "short" : "long";
    const openingTime = nearestCandleTime(order.成交时间 ?? order.创建时间);
    if (openingTime == null) return [];
    const tags: ChartActionTag[] = [{
      time: openingTime,
      side: openingSide,
      title: order.方向 === "做空" ? "空单开仓" : "多单开仓",
      price: order.成交价,
      priceLabel: "开仓价",
    }];
    if (order.状态 === "已平仓" && order.平仓价 && order.结束时间) {
      const closingTime = nearestCandleTime(order.结束时间);
      if (closingTime != null) tags.push({
        time: closingTime,
        side: openingSide === "short" ? "long" : "short",
        title: order.方向 === "做空" ? "空单平仓" : "多单平仓",
        price: order.平仓价,
        priceLabel: "平仓价",
      });
    }
    return tags;
  }, [market, selected, active, practiceContext?.练习约定?.已确认]);
  const mismatched =
    !market ||
    market.交易对 !== symbol ||
    (market.市场 ?? "现货") !== marketType ||
    market.周期 !== interval ||
    market.根数 !== count;
  const expectedEntry =
    kind === "限价" && limit ? Number(limit) : market?.最新价;
  const explicitQuantity = quantity ? Number(quantity) : null;
  const leverageFactor = marketType === "U本位合约" ? leverage : 1;
  const expectedPrincipal =
    side === "观望"
      ? 0
      : explicitQuantity && explicitQuantity > 0 && expectedEntry
        ? (explicitQuantity * expectedEntry) / leverageFactor
        : ((state?.资金.可用 ?? 100000) * size) / 100 / (1 + leverageFactor * 0.0005);
  const expectedRisk =
    side !== "观望" && expectedEntry && stop
      ? (Math.abs(expectedEntry - Number(stop)) / expectedEntry) * expectedPrincipal * leverageFactor
      : null;
  const budgetConflict =
    expectedRisk != null &&
    !!riskBudget &&
    expectedRisk > Number(riskBudget);
  const draftFingerprint = JSON.stringify([
    marketType, symbol, interval, side, kind, leverage, size, quantity, limit,
    stop, target, riskBudget, reason,
  ]);
  const currentPreTrade = preTrade?.fingerprint === draftFingerprint ? preTrade.advice : null;
  const agreement = practiceContext?.练习约定;
  const stageScope = practiceContext?.阶段进展.样本范围;
  const hasCurrentPractice = !!stageScope && (stageScope.模拟交易数 > 0 || stageScope.专项训练数 > 0);
  const agreementSource = agreement?.位置 === "点评"
    ? "来自最近一次交易复盘"
    : agreement?.位置 === "复盘"
      ? agreement.用户补充?.startsWith("当前任务还没有开始练习")
        ? "按你的选择更换"
        : "来自上一阶段总结"
      : agreement
        ? "来自你确认的私教建议"
        : "完成第一次复盘后，私教会陪你确定下一项重点";
  const openStageSummary = () => {
    if (practiceDetails.current) {
      practiceDetails.current.open = true;
      practiceDetails.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.dispatchEvent(new Event("smartvibe-open-stage-summary"));
  };
  const switchUnusedTask = () => run(async () => {
    if (!twin || active) return;
    setTaskSwitchCountdown(90);
    try {
      const suggestion = await api("AI私教", {
        分身编号: twin.分身编号,
        位置: "复盘",
        关联编号: "",
        用户补充: "当前任务还没有开始练习，请结合已有记录换一项不同、具体且可检验的练习任务。",
        请求编号: crypto.randomUUID(),
      });
      const next: PracticeContext = await api("确认练习约定", {
        分身编号: twin.分身编号,
        编号: suggestion.编号,
      });
      setPracticeContext(next);
      setPracticeFocus(next.练习约定?.回答.下次练习 ?? "");
      setSelected(null);
    } finally {
      setTaskSwitchCountdown(null);
    }
  });
  const draftParams = (marketId: string) => ({
    分身编号: twin!.分身编号,
    行情编号: marketId,
    方向: side,
    订单类型: kind,
    杠杆倍数: marketType === "U本位合约" ? leverage : 1,
    仓位比例: size,
    开仓数量: quantity ? Number(quantity) : undefined,
    限价: limit ? Number(limit) : undefined,
    止损: stop ? Number(stop) : undefined,
    止盈: target ? Number(target) : undefined,
    理由: reason,
    风险预算: riskBudget ? Number(riskBudget) : undefined,
  });
  const requestPreTradeCoach = async () => {
    const fingerprint = draftFingerprint;
    setPreTradeCountdown(90);
    try {
      const confirmedMarket: Pack = await api("同步练盘行情", {
        分身编号: twin!.分身编号,
        行情编号: market!.行情编号,
      });
      setMarket(confirmedMarket);
      const advice: PreTradeAdvice = await api("开仓前私教", draftParams(confirmedMarket.行情编号));
      setPreTrade({ fingerprint, advice });
      setShowPreflight(false);
    } finally {
      setPreTradeCountdown(null);
    }
  };
  const submitDraft = async () => {
    const confirmedMarket: Pack = await api("同步练盘行情", {
      分身编号: twin!.分身编号,
      行情编号: market!.行情编号,
    });
    setMarket(confirmedMarket);
    requestId.current ??= crypto.randomUUID();
    const o = await api("提交模拟单", {
      请求编号: requestId.current,
      ...draftParams(confirmedMarket.行情编号),
    });
    setSelected(o);
    setPreTrade(null);
    setShowPreflight(false);
    requestId.current = null;
    await sync();
  };
  const orderAction = (action: string, order: PracticeOrder) =>
    run(async () => {
      const data = await api(action, {
        分身编号: twin!.分身编号,
        编号: order.编号,
      });
      if (action === "练盘记忆") {
        setState(data);
        setTwin(data.分身);
        setSelected(
          data.订单.find((o: PracticeOrder) => o.编号 === order.编号),
        );
      } else {
        setSelected(data);
        if (action === "结束模拟单") {
          setReason("");
          setLimit("");
          setStop("");
          setTarget("");
          setQuantity("");
          setRiskBudget("");
          setShowPreflight(false);
          setPreTrade(null);
          requestId.current = null;
        }
        await sync();
      }

    });
  return (
    <main className={`coach-shell ${stage === "profile" ? styles.profile : ""}`}>
      <div className="brand"><span>SmartVibe</span></div>
      <div className={`phase-tabs ${styles.flow}`} aria-label="陪练流程">
        {([
          ["profile", "建立分身"],
          ["demo", "分身演示"],
          ["practice", "自主练习"],
        ] as const).map(([id, name], i) => (
          <div key={id} className={"phase " + (stage === id ? "active" : "")}
            aria-current={stage === id ? "step" : undefined}>
            <span className="phase-num">{i + 1}</span>{name}
          </div>
        ))}
      </div>
      {stage === "demo" && twin && (
        <TwinDemo twinId={twin.分身编号} busy={busy} onBack={() => setStage("profile")}
          onPractice={() => void run(enterPractice)} />
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {stage === "profile" && twin && (
        <ProfileSetup key={twin.分身编号} twinId={twin.分身编号} onNext={() => setStage("demo")} />
      )}
      {busy && stage !== "practice" && (
        <p className="muted" role="status">
          处理中…首次连接官方行情可能需要约一分钟。
        </p>
      )}
      {stage === "profile" && !twin && !current && (
        <section className={`card coach-hero ${styles.panel}`}>
          <p className={styles.eyebrow}>建立分身 · 开始认识你</p>
          <h1 className="h1">先建立你的数字分身</h1>
          <p className="muted">
            从你的真实选择开始，让 Agent 初步了解你的交易习惯。
          </p>
          <ol className={styles.overview}>
            <li><strong>回答 8 道情景题</strong><span>按平时的交易思维做选择题，建立初步画像</span></li>
            <li><strong>提交你的历史交易记录（可选），进一步校准</strong><span>Agent将从你的交易记录中分析你的交易行为和习惯，发现更真实的你。</span></li>
            <li><strong>观察你的分身如何决策</strong><span>看看分身在历史行情中如何做出模拟交易决策，判断它是否像平时的你。</span></li>
          </ol>
          <div className={styles.start}>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                let previous: string[] = [];
                try {
                  const saved = JSON.parse(localStorage.getItem("smartvibe-last-questions") || "[]");
                  if (Array.isArray(saved)) previous = saved.filter((id: unknown) => typeof id === "string");
                } catch { /* Begin normally if local history is unavailable. */ }
                const s = await api("建档列表", { 上次题目: previous });
                setScenarios(s.情景列表);
                setBankVersion(s.题库版本);
                localStorage.setItem("smartvibe-last-questions", JSON.stringify(s.情景列表.map((q: Scenario) => q.情景编号)));
                setAnswers([]);
                setQuestionIndex(0);
              })
            }
          >
            开始答题（共8题）
          </button>
          <p className="muted">分身从初步理解开始，在你的反馈和练习中逐步校准。</p>
          </div>
        </section>
      )}
      {stage === "profile" && !twin && current && (
        <section className={`card ${styles.panel}`}>
          <div className={styles.questionHeader}>
            <div className="panel-title">
              建立分身 · 第 {questionIndex + 1} / {scenarios.length} 题
            </div>
            <button
              type="button"
              className="btn"
              disabled={busy || questionIndex === 0}
              onClick={() => {
                setError("");
                setQuestionIndex((index) => Math.max(0, index - 1));
              }}
            >上一题</button>
          </div>
          <progress className={styles.progress} value={answers.length} max={scenarios.length} aria-label="已完成题数" />
          <h1 className={styles.question}>
            {current.问题.includes("。") ? (
              <>
                {current.问题.slice(0, current.问题.indexOf("。") + 1)}
                <br />
                {current.问题.slice(current.问题.indexOf("。") + 1)}
              </>
            ) : current.问题}
          </h1>
          <p className="muted">没有标准答案，选最接近平时的你；没遇到过时，选你最可能采取的做法。</p>
          {current.选项.map((o) => (
            <button
              className={"option" + (answers[questionIndex]?.选项编号 === o.选项编号 ? " selected" : "")}
              aria-pressed={answers[questionIndex]?.选项编号 === o.选项编号}
              key={o.选项编号}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const next = [...answers];
                  next[questionIndex] = { 情景编号: current.情景编号, 选项编号: o.选项编号 };
                  if (questionIndex === scenarios.length - 1) {
                    const t = await api("创建分身", { 答案: next, 题库版本: bankVersion });
                    localStorage.setItem("smartvibe-twin", t.分身编号);
                    localStorage.removeItem("smartvibe-interview-draft");
                    setTwin(t);
                    await sync(t.分身编号);
                  }
                  setAnswers(next);
                  if (questionIndex < scenarios.length - 1) setQuestionIndex(questionIndex + 1);
                })
              }
            >
              {o.文案}
            </button>
          ))}
        </section>
      )}
      {stage === "practice" && market && (
        <>
          <section ref={practiceFocusSection} className="practice-focus" aria-label="本次练习任务">
            <div className="practice-focus-heading">
              <span>{agreement ? "当前练习任务" : "首次练习"}</span>
              <strong>{practiceFocus ? visiblePracticeCopy(practiceFocus) : "完成一笔有计划的模拟交易"}</strong>
              <small className="practice-focus-source">
                {agreementSource}
                {agreement?.已确认 ? ` · ${new Date(agreement.已确认).toLocaleString("zh-CN")} 开始` : ""}
              </small>
            </div>
            <div className="practice-focus-steps">
              <p><b>这一步怎么做</b>选择做多、做空或观望，写下盘面依据，再请私教帮你检查计划。</p>
              <p><b>完成后会得到什么</b>平仓后和私教一起复盘，看看计划、风险和实际执行是否一致。</p>
              <p><b>{agreement ? "怎样进入下一轮" : "第一次练完以后"}</b>{agreement ? "你可以继续巩固，也可以总结这一轮并选择下一项练习任务。" : "从复盘建议中确认第一项正式练习任务，再进入下一轮。"}</p>
            </div>
            {agreement && (
              <div className="practice-focus-progress">
                <span>本轮模拟交易 <strong>{stageScope?.模拟交易数 ?? 0}</strong></span>
                <span>本轮专项练习 <strong>{stageScope?.专项训练数 ?? 0}</strong></span>
                <span>本轮补充交流 <strong>{stageScope?.私教对话数 ?? 0}</strong></span>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !!active}
                  onClick={hasCurrentPractice ? openStageSummary : switchUnusedTask}
                >
                  {active
                    ? "完成这笔交易后再换任务"
                    : hasCurrentPractice
                      ? "完成本轮，选择下个练习"
                      : "换一个练习任务"}
                </button>
                {taskSwitchCountdown != null && (
                  <div
                    className="coach-wait-progress"
                    data-tone={taskSwitchCountdown <= 30 ? "orange" : taskSwitchCountdown <= 60 ? "gold" : "green"}
                    role="status"
                    aria-live="polite"
                  >
                    <span>{taskSwitchCountdown ? `私教正在准备 · 约 ${taskSwitchCountdown} 秒` : "正在返回新任务，请稍候"}</span>
                    <div className="coach-wait-track" aria-hidden="true">
                      <span style={{ width: `${((90 - taskSwitchCountdown) / 90) * 100}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
          <div className="practice-account-row">
            <div className="fund-strip">
              {state &&
                Object.entries({
                  虚拟权益: state.资金.权益,
                  可用资金: state.资金.可用,
                  占用资金: state.资金.占用,
                  浮动盈亏: state.资金.浮盈亏,
                  已实现盈亏: state.资金.已实现,
                  模拟手续费: state.资金.费用,
                }).map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <b>
                      {money(v)} <small>USDT</small>
                    </b>
                  </div>
                ))}
            </div>
            <div className="practice-nav-actions">
              <button className="btn" disabled={busy} onClick={() => setStage("profile")}>
                校准分身
              </button>
              <button className="btn" disabled={busy} onClick={() => setStage("demo")}>
                查看分身演示
              </button>
            </div>
          </div>
          <div className="coach-terminal">
            <section className="card chart-card">
              <div className="trade-toolbar">
                <label>
                  交易类型
                  <select
                    value={marketType}
                    disabled={busy || !!active}
                    onChange={(e) => {
                      marketRequestVersion.current++;
                      marketRefreshDelay.current = 0;
                      const value = e.target.value as "现货" | "U本位合约";
                      setMarketType(value);
                      if (value === "现货" && side === "做空") setSide("做多");
                    }}
                  >
                    <option value="U本位合约">合约</option>
                    <option value="现货">现货</option>
                  </select>
                </label>
                <label>
                  交易标的
                  <input
                    value={symbol}
                    maxLength={20}
                    placeholder="例如 AKE 或 AKEUSDT"
                    disabled={busy || !!active}
                    onChange={(e) => {
                      marketRequestVersion.current++;
                      marketRefreshDelay.current = 650;
                      setSymbol(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                      )
                    }}
                  />
                </label>
                <label>
                  周期
                  <select
                    value={interval}
                    disabled={busy}
                    onChange={(e) => {
                      marketRequestVersion.current++;
                      marketRefreshDelay.current = 0;
                      setIntervalValue(e.target.value);
                    }}
                  >
                    {[
                      ["5m", "5分钟"],
                      ["15m", "15分钟"],
                      ["1h", "1小时"],
                      ["4h", "4小时"],
                      ["1d", "日线"],
                    ].map(([v, n]) => (
                      <option value={v} key={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  显示根数
                  <select
                    value={count}
                    disabled={busy}
                    onChange={(e) => {
                      marketRequestVersion.current++;
                      marketRefreshDelay.current = 0;
                      setCount(Number(e.target.value));
                    }}
                  >
                    {[80, 120, 200].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn"
                  disabled={busy || marketSwitching}
                  onClick={() => run(refresh)}
                >
                  {marketSwitching ? "正在切换…" : "刷新行情"}
                </button>
              </div>
              <div className="indicator-strip">
                <strong>
                  {market.市场 === "U本位合约" ? "合约" : "现货"} · {market.交易对} · {money(market.最新价)}
                </strong>
                <span>区间涨跌 {market.涨跌百分比}%</span>
                <span>RSI {market.指标.RSI?.toFixed(1) ?? "—"}</span>
              </div>
              {marketSwitching && (
                <p className="market-switching" role="status">正在加载新的行情，当前图表会在数据返回后自动更新…</p>
              )}
              {mismatched && (
                <p className="error-box">
                  筛选已改变，请刷新行情后提交模拟单。
                </p>
              )}
              <CoachChart
                candles={market.K线}
                actionTags={chartActionTags}
                entryLine={active?.状态 === "持仓中" && active.成交价
                  ? {
                      price: active.成交价,
                      title: `当前持仓 · ${active.方向}`,
                      side: active.方向 === "做空" ? "short" : "long",
                    }
                  : null}
              />
              <p className="chart-caption muted">
                {visibleMarketSource(market.来源)} · {visibleMarketStatus(market.连接状态)} · {liveStatus}
                <br />
                更新时间 {new Date(market.更新时间).toLocaleString("zh-CN")} ·
                当前K线实时更新，完整指标每30秒静默同步
              </p>
              <details className="ai-readout">
                <summary>查看盘面事实</summary>
                <p>{market.解读}</p>
              </details>
              {currentPreTrade && (
                <div className="pretrade-overlay">
                  <section
                    className="pretrade-coach"
                    role="dialog"
                    aria-labelledby="pretrade-coach-title"
                  >
                    <h3 id="pretrade-coach-title">{currentPreTrade.标题}</h3>
                    <div className="pretrade-coach-body">
                      <p>{currentPreTrade.计划理解}</p>
                      <p><strong>开仓前提醒：</strong>{currentPreTrade.关键提醒}</p>
                      <p><strong>可以怎样调整：</strong>{currentPreTrade.可执行调整}</p>
                      <p className="pretrade-facts">
                        入场参考 {currentPreTrade.程序核算.入场参考价 == null ? "—" : money(currentPreTrade.程序核算.入场参考价)} ·
                        名义价值 {money(currentPreTrade.程序核算.名义价值)} USDT ·
                        计划止损 {currentPreTrade.程序核算.计划止损金额 == null ? "—" : `${money(currentPreTrade.程序核算.计划止损金额)} USDT`}
                      </p>
                    </div>
                    <div className="actions pretrade-coach-actions">
                      <button type="button" className="btn" disabled={busy} onClick={() => setPreTrade(null)}>
                        返回修改计划
                      </button>
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(submitDraft)}>
                        已考虑清楚，提交订单
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </section>
            <aside className="card order-ticket">
              <h2 className="h2">模拟下单</h2>
              <p className="muted">
                {marketType === "现货"
                  ? "现货按 1 倍资金练习做多或观望。每次只持有一笔模拟单。"
                  : `U 本位合约按 ${leverage} 倍杠杆练习多空。每次只持有一笔模拟单。`}
              </p>
              <fieldset
                disabled={busy || !!active}
                className="ticket-fields"
              >
                <div className="ticket-row">
                  {["做多", "做空", "观望"].map((s, i) => (
                    <button
                      type="button"
                      key={s}
                      className={
                        "side " +
                        ["long", "short", "flat"][i] +
                        (side === s ? " on" : "")
                      }
                      disabled={s === "做空" && marketType === "现货"}
                      onClick={() => setSide(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <label>
                  订单类型
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                    disabled={side === "观望"}
                  >
                    <option>市价</option>
                    <option>限价</option>
                  </select>
                </label>
                {marketType === "U本位合约" && (
                  <label>
                    杠杆倍数
                    <select
                      value={leverage}
                      onChange={(e) => setLeverage(Number(e.target.value))}
                      disabled={side === "观望"}
                    >
                      {[1, 2, 3, 5, 10, 20, 50, 100, 125].map((value) => (
                        <option key={value} value={value}>{value}x</option>
                      ))}
                    </select>
                  </label>
                )}
                {kind === "限价" && (
                  <label>
                    限价（USDT）
                    <input
                      type="number"
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      disabled={side === "观望"}
                    />
                  </label>
                )}
                <label>
                  开仓量（{market.交易对.replace(/(USDT|USDC|FDUSD|BTC|ETH|BNB)$/, "")}）
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    disabled={side === "观望"}
                    placeholder="可选；填写后按具体数量下单"
                  />
                </label>
                <label>
                  资金占比 {size}%（未填写开仓量时生效）
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={size}
                    onChange={(e) => setSize(Number(e.target.value))}
                    disabled={side === "观望"}
                  />
                </label>
                <div className="ticket-row">
                  {[10, 25, 50, 100].map((n) => (
                    <button className="btn" key={n} onClick={() => setSize(n)}>
                      {n}%
                    </button>
                  ))}
                </div>
                <label>
                  止损价（可选）
                  <input
                    type="number"
                    value={stop}
                    disabled={side === "观望"}
                    onChange={(e) => setStop(e.target.value)}
                  />
                </label>
                <label>
                  止盈价（可选）
                  <input
                    type="number"
                    value={target}
                    disabled={side === "观望"}
                    onChange={(e) => setTarget(e.target.value)}
                  />
                </label>
                <label>
                  这次交易的理由
                  <textarea
                    maxLength={500}
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="写下触发条件、失效条件或观望理由"
                  />
                </label>
                <label>
                  这次最多愿意亏损（USDT，可选）
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={riskBudget}
                    disabled={side === "观望"}
                    onChange={(e) => setRiskBudget(e.target.value)}
                    placeholder="填写自己的风险预算，供复盘核对"
                  />
                </label>
                <p className="muted">
                  {marketType === "U本位合约"
                    ? active ? "占用保证金" : "预计占用保证金"
                    : active ? "本单本金" : "预计占用"}{" "}
                  {money(
                    active?.本金 ??
                      expectedPrincipal,
                  )}{" "}
                  USDT
                </p>
                {expectedRisk != null && (
                  <div className={budgetConflict ? "risk-preview warning" : "risk-preview"}>
                    <span>按当前设置，计划止损约</span>
                    <strong>{money(expectedRisk)} USDT</strong>
                    <small>未计费用、滑点与跳价</small>
                  </div>
                )}
                {!currentPreTrade && (
                  <button
                    className="btn btn-primary"
                    disabled={mismatched}
                    onClick={() =>
                      run(async () => {
                        if (budgetConflict) {
                          setShowPreflight(true);
                          return;
                        }
                        await requestPreTradeCoach();
                      })
                    }
                  >
                    请私教帮我检查计划
                  </button>
                )}
                {showPreflight && budgetConflict && (
                  <div className="preflight-dialog" role="alert">
                    <strong>这次设置和你的风险预算不一致</strong>
                    <p>
                      你写的最多愿意亏损是 {money(Number(riskBudget))} USDT，
                      按当前仓位和止损计算约为 {money(expectedRisk!)} USDT。
                    </p>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setShowPreflight(false)}
                      >
                        返回调整
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => run(requestPreTradeCoach)}
                      >
                        保留当前设置，继续请私教检查
                      </button>
                    </div>
                  </div>
                )}
              </fieldset>
              {preTradeCountdown != null && (
                <div
                  className={`pretrade-wait wait-tone-${preTradeCountdown <= 30 ? "orange" : preTradeCountdown <= 60 ? "gold" : "green"}`}
                  role="status"
                  aria-live="polite"
                >
                  <div className="pretrade-wait-heading">
                    <strong>私教正在认真看看你的交易计划</strong>
                    <span>{preTradeCountdown > 0 ? `预计最长还需 ${preTradeCountdown} 秒` : "正在接收检查结果…"}</span>
                  </div>
                  <div
                    className="pretrade-wait-track"
                    role="progressbar"
                    aria-label="开仓前检查进度"
                    aria-valuemin={0}
                    aria-valuemax={90}
                    aria-valuenow={90 - preTradeCountdown}
                  >
                    <div style={{ width: `${((90 - preTradeCountdown) / 90) * 100}%` }} />
                  </div>
                  <p>检查完成后会自动显示私教反馈，不需要重复点击。</p>
                </div>
              )}
              <p className="muted">
                撮合按刷新时价格执行，不追溯两次刷新之间的触价。单边模拟手续费
                0.05%，暂不计资金费率与盘口滑点。
              </p>
              {active && (
                <div className="submitted-order">
                  <h3>已提交 · {active.状态}</h3>
                  <p>
                    {active.方向} · {active.订单类型} ·{" "}
                    {active.行情.市场 === "U本位合约" && <>{active.杠杆倍数 ?? 1}x · </>}
                    {active.仓位比例}%
                  </p>
                  <p>理由：{active.理由 || "未填写"}</p>
                </div>
              )}
            </aside>
          <section className="card history-panel">
            <h2 className="h2">模拟持仓与练盘记录</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "时间 / 币种",
                      "方向 / 状态",
                      "成交价",
                      "数量",
                      "盈亏 / 费用",
                      "操作",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state?.订单.map((o) => (
                    <tr key={o.编号}>
                      <td>
                        {new Date(o.创建时间).toLocaleTimeString("zh-CN")}
                        <br />
                        {o.行情.交易对}
                      </td>
                      <td>
                        {o.方向} · {o.状态}
                        {o.行情.市场 === "U本位合约" ? ` · ${o.杠杆倍数 ?? 1}x` : ""}
                      </td>
                      <td>{o.成交价 ? money(o.成交价) : "—"}</td>
                      <td>{o.数量.toFixed(6)}</td>
                      <td>
                        {money(o.盈亏)} / {money(o.手续费)}
                      </td>
                      <td>
                        {["持仓中", "待成交"].includes(o.状态) && (
                          <button
                            className={`btn${o.状态 === "持仓中" ? " close-position-btn" : ""}`}
                            disabled={busy}
                            onClick={() => orderAction("结束模拟单", o)}
                          >
                            {o.状态 === "待成交" ? "撤单" : "平仓"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!state?.订单.length && (
              <p className="muted">尚无模拟单，先看图，再提交第一笔模拟交易。</p>
            )}
            <p>
              已复盘 {state?.已复盘 ?? 0} 次 · 分身版本 {twin?.版本}
            </p>
            {state?.重复问题.map((p) => (
              <p key={p.问题}>
                反复出现：{p.问题}（{p.次数} 次）
              </p>
            ))}
            {state?.改善观察.map((issue) => (
              <p className="ok-msg" key={issue}>
                最近一次开仓未再出现：{issue}。继续练习验证是否稳定改善。
              </p>
            ))}
          </section>
          <section className="practice-coach-zone">
            <div className="panel-title">
              {reviewOrder ? "私教 · 本次交易复盘" : active ? "平仓后，私教陪你复盘这笔交易" : "私教在这里，随时聊这张图"}
            </div>
            <CoachDesk
              twinId={twin!.分身编号}
              mode={reviewOrder ? "点评" : "盘面"}
              contextId={reviewOrder ? reviewOrder.编号 : market.行情编号}
              symbol={symbol}
              interval={interval}
            />
          </section>
          <details ref={practiceDetails} className="card practice-secondary">
            <summary>
              <strong>专项练习</strong>
              <span>{agreement ? "围绕当前任务，再做一次不提前知道结果的历史练习" : "完成首次复盘并确认练习任务后开启"}</span>
            </summary>
            <CoachDesk
              twinId={twin!.分身编号}
              mode="训练"
              symbol={symbol}
              interval={interval}
              market={marketType}
              revision={String(state?.订单.length)}
            />
          </details>
          <p className="practice-status muted" role="status" aria-live="polite">
            {busy ? "正在处理本次操作…" : "\u00a0"}
          </p>
          </div>
        </>
      )}
    </main>
  );
}
