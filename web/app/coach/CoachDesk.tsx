"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type {
  CoachRecord,
  Exercise,
  coachingState,
  modes,
} from "@smartvibe/agent/coaching.js";
const CoachChart = dynamic(() => import("./CoachChart"), { ssr: false });
type Mode = (typeof modes)[number];
type State = ReturnType<typeof coachingState>;
const currentStageSummary = (state: State) => {
  const startedAt = state.阶段进展.样本范围.开始;
  if (!startedAt) return null;
  return state.记录
    .filter((record) => record.位置 === "复盘" && record.创建时间 >= startedAt)
    .at(-1) ?? null;
};
const currentAgreementExercise = (state: State) => {
  const agreement = state.练习约定;
  if (!agreement?.已确认) return null;
  return state.历史训练
    .filter((exercise) =>
      exercise.创建时间 >= agreement.已确认! &&
      exercise.目标 === agreement.回答.下次练习 &&
      JSON.stringify(exercise.检查项) === JSON.stringify(agreement.回答.检查项),
    )
    .at(-1) ?? null;
};
type SummaryScope = State["阶段进展"]["样本范围"];
const summaryScope = (record: CoachRecord | null): SummaryScope | null => {
  const content = record?.证据.find((item) => item.编号 === "stage_progress")?.内容;
  if (!content || typeof content !== "object" || !("样本范围" in content)) return null;
  const scope = (content as { 样本范围?: unknown }).样本范围;
  if (!scope || typeof scope !== "object") return null;
  const candidate = scope as Partial<SummaryScope>;
  return typeof candidate.模拟交易数 === "number" &&
    typeof candidate.专项训练数 === "number" &&
    typeof candidate.私教对话数 === "number"
    ? candidate as SummaryScope
    : null;
};
async function api(动作: string, 参数: Record<string, unknown>) {
  const response = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 动作, 参数 }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.错误 || "私教服务暂不可用");
  if (动作 !== "私教状态")
    window.dispatchEvent(new Event("smartvibe-coach-updated"));
  return result;
}
const titles: Record<Mode, string> = {
  演示: "聊聊这次分身演示",
  建档: "让私教认识我",
  盘面: "请私教解释这张图",
  点评: "生成本次交易复盘",
  训练: "请私教点评本次专项练习",
  复盘: "生成阶段复盘",
};
const cleanCoachCopy = (value: string) =>
  value
    .replace(/(?:【|\[)[a-z_]+(?:】|\])/gi, "")
    .replace(/AI\s*私教|\bAI\b|\bAgent\b/gi, "私教")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
const visibleExerciseSource = (value: string) =>
  value.replace(/币安\s*Agent OS\s*MCP/gi, "币安授权行情");
const progressConclusionCopy = (value: string) => ({
  出现改善: "这一项有进步",
  保持完成: "这一项保持得不错",
  仍需练习: "这一项还值得继续练",
  样本不足: "再积累一次会更清楚",
  本轮未要求: "本轮不是重点",
}[value] ?? value);
const checkStateCopy = (value: string) => ({
  完成: "有记录",
  未完成: "还没有记录",
  无样本: "暂无记录",
}[value] ?? value);
const naturalCoachParagraphs = (value: string) => {
  const cleaned = cleanCoachCopy(value);
  if (!cleaned) return [];
  if (/\n/.test(cleaned)) return cleaned.split(/\n+/).map((part) => part.trim()).filter(Boolean);
  const sentences = cleaned.match(/[^。！？]+[。！？]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [cleaned];
  const startsNewThought = /^(值得|需要|不过|但是|同时|结合|从盘面|从风险|从执行|从结果|这次|这说明|这提示|接下来|下一次|如果|因此|至于|建议)/;
  const paragraphs: string[] = [];
  for (const sentence of sentences) {
    if (paragraphs.length && startsNewThought.test(sentence)) paragraphs.push(sentence);
    else if (paragraphs.length) paragraphs[paragraphs.length - 1] += sentence;
    else paragraphs.push(sentence);
  }
  return paragraphs;
};
const highlightedCoachTitle = (value: string) => {
  const title = cleanCoachCopy(value);
  const prefix = title.match(/^专项训练[：:]/)?.[0];
  return prefix ? (
    <><span className="coach-highlight">{prefix}</span>{title.slice(prefix.length)}</>
  ) : title;
};
type PendingAction = "review" | "training" | "summary" | "exercise" | "coach";
const waitCopy: Record<PendingAction, { seconds: number; label: string }> = {
  review: { seconds: 90, label: "私教正在复盘" },
  training: { seconds: 90, label: "私教正在点评" },
  summary: { seconds: 90, label: "私教正在总结" },
  exercise: { seconds: 60, label: "正在准备练习" },
  coach: { seconds: 90, label: "私教正在整理" },
};
function WaitProgress({ action }: { action: PendingAction }) {
  const config = waitCopy[action];
  const [remaining, setRemaining] = useState(config.seconds);
  useEffect(() => {
    setRemaining(config.seconds);
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [config.seconds, action]);
  const tone = remaining <= config.seconds / 3
    ? "orange"
    : remaining <= config.seconds * 2 / 3 ? "gold" : "green";
  return (
    <div className="coach-wait-progress" data-tone={tone} role="status" aria-live="polite">
      <span>{remaining ? `${config.label} · 约 ${remaining} 秒` : `${config.label}，请稍候`}</span>
      <div className="coach-wait-track" aria-hidden="true">
        <span style={{ width: `${((config.seconds - remaining) / config.seconds) * 100}%` }} />
      </div>
    </div>
  );
}
const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const displayNumber = (value: unknown) => typeof value === "number"
  ? value.toLocaleString("zh-CN", { maximumFractionDigits: 6 })
  : value == null || value === "" ? "未设置" : String(value);
const displayTime = (value: unknown) => {
  if (typeof value !== "number" && typeof value !== "string") return "—";
  const date = new Date(typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN");
};
function EvidenceContent({ item }: { item: CoachRecord["证据"][number] }) {
  const content = asObject(item.内容);
  if (item.编号 === "agreements" && content) {
    const agreement = asObject(content.约定);
    const checks = Array.isArray(content.检查) ? content.检查 : [];
    return (
      <div className="coach-evidence-summary">
        <p><span>当前练习重点</span>{agreement ? cleanCoachCopy(String(agreement.下次练习 ?? "尚未确认")) : "尚未确认"}</p>
        <p><span>需要留意</span>{agreement && Array.isArray(agreement.检查项) ? agreement.检查项.join("、") : "暂无"}</p>
        <p><span>之后的执行记录</span>{checks.length ? `${checks.length} 次` : "还没有新的记录"}</p>
      </div>
    );
  }
  if (item.编号 === "training" && content) {
    const decision = asObject(content.决定);
    const candles = Array.isArray(content.决策前最近12根可见K线与指标)
      ? content.决策前最近12根可见K线与指标.map(asObject).filter(Boolean) as Record<string, unknown>[]
      : [];
    const latest = candles.at(-1);
    return (
      <div className="coach-evidence-summary">
        <p><span>练习目标</span>{cleanCoachCopy(String(content.目标 ?? "—"))}</p>
        <p><span>本次决定</span>{decision ? String(decision.方向 ?? "—") : "—"}</p>
        {decision?.理由 ? <p><span>判断依据</span>{cleanCoachCopy(String(decision.理由))}</p> : null}
        <p><span>风险计划</span>{decision ? `止损 ${displayNumber(decision.止损)} · 预算 ${displayNumber(decision.风险预算)} USDT` : "—"}</p>
        <details>
          <summary>决策前盘面</summary>
          <p><span>交易场景</span>{String(content.市场 ?? "现货")} · {String(content.交易对 ?? "—")} · {String(content.周期 ?? "—")}</p>
          <p><span>决策时间与价格</span>{displayTime(content.决策点时间)} · {displayNumber(content.决策点价格)} USDT</p>
          {latest && <>
            <p><span>最近一根K线</span>开 {displayNumber(latest.开)} · 高 {displayNumber(latest.高)} · 低 {displayNumber(latest.低)} · 收 {displayNumber(latest.收)}</p>
            <p><span>对应指标</span>RSI {displayNumber(latest.RSI)} · DIF {displayNumber(latest.DIF)} · DEA {displayNumber(latest.DEA)} · MACD柱 {displayNumber(latest.MACD柱)}</p>
          </>}
        </details>
      </div>
    );
  }
  if (item.编号 === "decision" && content) {
    const result = asObject(content.交易结果摘要);
    return result ? (
      <div className="coach-evidence-summary">
        <p><span>交易结果</span>{String(result.方向 ?? "—")} · {String(result.状态 ?? "—")} · {String(result.结束方式 ?? "—")}</p>
        <p><span>价格</span>入场 {displayNumber(result.入场价)} · 平仓 {displayNumber(result.平仓价)}</p>
        <p><span>扣费后盈亏</span>{displayNumber(result.扣除手续费后USDT)} USDT</p>
      </div>
    ) : null;
  }
  if (typeof item.内容 === "string") return <p>{cleanCoachCopy(item.内容)}</p>;
  return <p className="muted">这项记录已用于本次判断。</p>;
}
const historicalExerciseGoal = (value: string) => cleanCoachCopy(value)
  .replace(/选一根出现下影线的([^，。]*K线)[，,]\s*(?:等|等待)(?:这根|该根|当前)?(?:K线)?收线后[，,]?/g, "在当前盘面中选一根已收盘且带下影线的$1，")
  .replace(/选一根([^，。]*K线)[，,]\s*(?:等|等待)(?:这根|该根|当前)?(?:K线)?收线后[，,]?/g, "在当前盘面中选一根已收盘的$1，")
  .replace(/[，,；;]?\s*(?:再)?逐根观察后\s*\d+\s*根(?:K线)?[^。！？]*[。！？]?/g, "；提交前写明什么变化会确认或推翻判断。")
  .replace(/(?:等|等待)(?:这根|该根|当前)?(?:K线)?收线后/g, "确认所选K线已收盘后");
export default function CoachDesk({
  twinId,
  mode,
  contextId = "",
  symbol = "BTCUSDT",
  interval = "1h",
  market = "现货",
  revision = "",
}: {
  twinId: string;
  mode: Mode;
  contextId?: string;
  symbol?: string;
  interval?: string;
  market?: "现货" | "U本位合约";
  revision?: string;
}) {
  const [sceneId, setSceneId] = useState(contextId);
  const evidenceId = mode === "盘面" ? sceneId : contextId;
  const [state, setState] = useState<State | null>(null);
  const [record, setRecord] = useState<CoachRecord | null>(null);
  const [progressRecord, setProgressRecord] = useState<CoachRecord | null>(null);
  const [text, setText] = useState("");
  const [progressText, setProgressText] = useState("");
  const [trainingPanel, setTrainingPanel] = useState<"指导" | "总结">("指导");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [trainingError, setTrainingError] = useState("");
  const [progressError, setProgressError] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [remembered, setRemembered] = useState(false);
  const [direction, setDirection] = useState("观望"),
    [reason, setReason] = useState("");
  const [stop, setStop] = useState(""),
    [budget, setBudget] = useState(""),
    [capital, setCapital] = useState("10000");
  const lock = useRef(false);
  const generation = useRef(0);
  const targetedPracticeRef = useRef<HTMLDivElement>(null);
  const run = async (
    work: () => Promise<void>,
    errorArea: "global" | "training" | "progress" = "global",
    action: PendingAction | null = null,
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setPendingAction(action);
    setError("");
    if (errorArea === "training") setTrainingError("");
    if (errorArea === "progress") setProgressError("");
    try {
      await work();
    } catch (e) {
      const message = e instanceof Error ? e.message : "连接失败，请重试";
      if (errorArea === "training") setTrainingError(message);
      else if (errorArea === "progress") setProgressError(message);
      else setError(message);
    } finally {
      lock.current = false;
      setBusy(false);
      setPendingAction(null);
    }
  };
  const reload = async () => {
    const s: State = await api("私教状态", { 分身编号: twinId });
    setState(s);
    const nextExercise = currentAgreementExercise(s);
    setExercise(nextExercise);
    if (mode === "训练")
      setRecord(nextExercise?.决定
        ? s.记录.filter((item) => item.位置 === "训练" && item.关联编号 === nextExercise.编号).at(-1) ?? null
        : null);
    const summary = currentStageSummary(s);
    setProgressRecord(summary);
    return s;
  };
  useEffect(() => {
    const version = ++generation.current;
    setRecord(null);
    setText("");
    setRemembered(false);
    void api("私教状态", { 分身编号: twinId })
      .then((s: State) => {
        if (generation.current !== version) return;
        setState(s);
        const nextExercise = currentAgreementExercise(s);
        setExercise(nextExercise);
        setRecord(
          mode === "训练"
            ? nextExercise?.决定
              ? s.记录.filter((r) => r.位置 === "训练" && r.关联编号 === nextExercise.编号).at(-1) ?? null
              : null
            : s.记录.filter((r) => r.位置 === mode && r.关联编号 === evidenceId).at(-1) ?? null,
        );
        const summary = currentStageSummary(s);
        setProgressRecord(summary);
        if (mode === "训练" && summary) setTrainingPanel("总结");
      })
      .catch(() => {
        if (generation.current === version)
          setError("私教记录暂时无法载入，请稍后重试。");
      });
    return () => {
      generation.current++;
    };
  }, [twinId, mode, evidenceId, revision]);
  useEffect(() => {
    const update = () => {
      void api("私教状态", { 分身编号: twinId })
        .then((s: State) => {
          setState(s);
          const nextExercise = currentAgreementExercise(s);
          setExercise(nextExercise);
          if (mode === "训练")
            setRecord(nextExercise?.决定
              ? s.记录.filter((item) => item.位置 === "训练" && item.关联编号 === nextExercise.编号).at(-1) ?? null
              : null);
          setProgressRecord(currentStageSummary(s));
        })
        .catch(() => {});
    };
    window.addEventListener("smartvibe-coach-updated", update);
    return () => window.removeEventListener("smartvibe-coach-updated", update);
  }, [twinId, mode]);
  useEffect(() => {
    if (mode !== "训练") return;
    const openSummary = () => setTrainingPanel("总结");
    window.addEventListener("smartvibe-open-stage-summary", openSummary);
    return () => window.removeEventListener("smartvibe-open-stage-summary", openSummary);
  }, [mode]);
  const ask = (action: PendingAction = mode === "点评" ? "review" : "coach") =>
    run(async () => {
      const version = generation.current;
      const currentEvidenceId = mode === "训练" ? exercise?.编号 ?? "" : evidenceId;
      if (mode === "训练" && (!exercise?.决定 || !currentEvidenceId))
        throw new Error("先提交这次专项练习，私教才能结合当时的盘面和你的决定来点评。");
      const result = await api("AI私教", {
        分身编号: twinId,
        位置: mode,
        关联编号: currentEvidenceId,
        用户补充: text,
        上一条: record?.编号,
        请求编号: crypto.randomUUID(),
      });
      if (generation.current !== version) return;
      setRecord(result);
      setText("");
      await reload();
    }, "global", action);
  const askProgress = (followUp = "") =>
    run(async () => {
      const result = await api("AI私教", {
        分身编号: twinId,
        位置: "复盘",
        关联编号: "",
        用户补充: followUp || "请根据阶段进展报告总结这一阶段，并给出下一阶段最值得练的一项具体任务。",
        上一条: followUp ? progressRecord?.编号 : undefined,
        请求编号: crypto.randomUUID(),
      });
      setProgressRecord(result);
      setProgressText("");
      setTrainingPanel("总结");
      await reload();
    }, "progress", "summary");
  const validateTrainingDecision = () => {
    if (!exercise || exercise.决定) return "";
    const reference = exercise.可见K线.at(-1)!.close;
    const stopPrice = Number(stop);
    const shownReference = reference.toLocaleString("zh-CN", { maximumFractionDigits: 6 });
    if (!Number.isFinite(Number(capital)) || Number(capital) <= 0)
      return "训练本金需要填写大于 0 的金额。";
    if (Number(capital) > 100000)
      return "训练本金不能超过 100,000 USDT。";
    if (direction !== "观望" && stop && (!Number.isFinite(stopPrice) || stopPrice <= 0))
      return "训练止损价需要填写大于 0 的有效价格。";
    if (direction === "做多" && stop && stopPrice >= reference)
      return `做多在价格下跌时亏损，因此止损价需要低于决策点参考价 ${shownReference}。你填写的是 ${stop}，请向下调整或检查小数位。`;
    if (direction === "做空" && stop && stopPrice <= reference)
      return `做空在价格上涨时亏损，因此止损价需要高于决策点参考价 ${shownReference}。你填写的是 ${stop}，请向上调整或检查小数位。`;
    if (budget && (!Number.isFinite(Number(budget)) || Number(budget) <= 0))
      return "训练风险预算需要填写大于 0 的金额。";
    return "";
  };
  const coveredScope = summaryScope(progressRecord);
  const currentScope = state?.阶段进展.样本范围;
  const summaryHasNewRecords = !!coveredScope && !!currentScope && (
    currentScope.模拟交易数 > coveredScope.模拟交易数 ||
    currentScope.专项训练数 > coveredScope.专项训练数
  );
  const chartCandles = useMemo(() => exercise
    ? exercise.决定 ? [...exercise.可见K线, ...exercise.后续K线] : exercise.可见K线
    : [], [exercise]);
  const priorConversationRecords = useMemo(() => {
    if (!state || !record || mode !== "点评") return [];
    return state.记录
      .filter((item) =>
        item.位置 === record.位置 &&
        item.关联编号 === record.关联编号 &&
        item.编号 !== record.编号 &&
        item.创建时间 <= record.创建时间,
      )
      .sort((a, b) => a.创建时间.localeCompare(b.创建时间));
  }, [state, record, mode]);
  return (
    <section className={`card coach-desk ${mode === "训练" ? "training-desk" : ""}`} aria-label={`${mode}私教`}>
      {mode !== "训练" && <>
      <h2 className="h2">{titles[mode]}</h2>
      {mode === "盘面" && (
        <button
          className="btn"
          disabled={busy || contextId === sceneId}
          onClick={() => setSceneId(contextId)}
        >
          换用当前图表，重新解读
        </button>
      )}
      {mode === "建档" && (
        <p className="muted">
          把你的交易习惯说给私教听，也可以读取授权成交核对。建档只是初步理解；你的补充会保存，并用于后续点评。
        </p>
      )}
      {mode === "建档" && (
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api("账户校准", { 分身编号: twinId, 交易对: symbol });
              await reload();
            })
          }
        >
          读取授权成交，辅助认识我
        </button>
      )}
      {(mode === "建档" || mode === "复盘") && state?.账户 && (
        <p className="muted">
          {state.账户.范围} · {state.账户.成交笔数} 笔成交 / {state.账户.订单数}{" "}
          组订单。{state.账户.说明}
        </p>
      )}
      {!!priorConversationRecords.length && (
        <div className="coach-conversation-thread" aria-label="本次复盘交流记录">
          {priorConversationRecords.map((item) => (
            <div className="coach-conversation coach-conversation-previous" key={item.编号}>
              <p className="muted">私教 · {new Date(item.创建时间).toLocaleString("zh-CN")}</p>
              {item.用户补充 && <p className="user-statement">你的补充：{item.用户补充}</p>}
              <h3>{highlightedCoachTitle(item.回答.标题)}</h3>
              <div className="coach-prose">
                {naturalCoachParagraphs(item.回答.点评).map((paragraph, index) => (
                  <p key={`${index}:${paragraph.slice(0, 24)}`}>{paragraph}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {record && (
        <div className="coach-conversation">
          <p className="muted">
            私教 · {record.模型} ·{" "}
            {new Date(record.创建时间).toLocaleString("zh-CN")}
          </p>
          {record.用户补充 && (
            <p className="user-statement">你的补充：{record.用户补充}</p>
          )}
          <h3>{highlightedCoachTitle(record.回答.标题)}</h3>
          <div className="coach-prose">
            {naturalCoachParagraphs(record.回答.点评).map((paragraph, index) => (
              <p key={`${index}:${paragraph.slice(0, 24)}`}>{paragraph}</p>
            ))}
          </div>
          <p>
            <strong className="coach-guidance-label">教练想进一步了解：</strong>
            {cleanCoachCopy(record.回答.待核对)}
          </p>
          <p>
            <strong className="coach-guidance-label">下一次训练重点：</strong>
            {cleanCoachCopy(record.回答.下次练习)}
          </p>
          <details>
            <summary>这次判断依据什么</summary>
            {record.证据
              .filter((e) => record.回答.证据编号.includes(e.编号))
              .map((e) => (
                <details key={e.编号}>
                  <summary>{e.名称}</summary>
                  <EvidenceContent item={e} />
                </details>
              ))}
          </details>
          {mode !== "盘面" && (mode !== "点评" || !state?.练习约定 || state.练习约定.编号 === record.编号) && (
            <button
              className="btn"
              disabled={busy || !!record.已确认}
              onClick={() =>
                run(async () => {
                  const s = await api("确认练习约定", {
                    分身编号: twinId,
                    编号: record.编号,
                  });
                  setState(s);
                  setRecord(
                    s.记录.find((r: CoachRecord) => r.编号 === record.编号),
                  );
                })
              }
            >
              {record.已确认
                ? "已确认，后续练习将对照检查"
                : "认可并保存为我的练习约定"}
            </button>
          )}
          {mode === "点评" && (
            <button
              className="btn"
              disabled={busy || remembered}
              onClick={() =>
                run(async () => {
                  await api("练盘记忆", { 分身编号: twinId, 编号: contextId });
                  setRemembered(true);
                })
              }
            >
              {remembered ? "本次复盘已保存" : "保存本次复盘，供后续训练对照"}
            </button>
          )}
        </div>
      )}
      <label>
        {record
          ? "回答私教，或补充你当时的想法"
          : mode === "盘面"
            ? "你想看懂什么（可选）"
            : "补充你的目标或困惑（可选）"}
        <textarea
          rows={3}
          maxLength={1500}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            mode === "点评"
              ? "例如：我原本只接受亏损100，但提交时没有重新检查仓位……"
              : "用自己的话说就好。"
          }
        />
      </label>
      <div className="coach-action-row">
        <button
          className="btn btn-primary"
          disabled={busy || (!!record && !text.trim())}
          onClick={() => ask()}
        >
          {busy ? "请稍候…" : record ? "发送回答，继续聊" : titles[mode]}
        </button>
        {record && mode !== "盘面" && (
          <button className="btn" disabled={busy} onClick={() => ask(mode === "点评" ? "review" : "coach")}>
            {mode === "点评" ? "重新生成本次交易复盘" : "按最新记录更新"}
          </button>
        )}
        {pendingAction && <WaitProgress action={pendingAction} />}
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error} 已保存的模拟单和对话不会丢失。
        </p>
      )}
      <p className="muted">
        通过本机已登录的 Codex
        生成，会使用该账户的模型额度。每次由你点选发起；私教不会替你调用交易工具。
      </p>
      </>}
      {mode === "训练" && (
        <aside className="training-interaction" aria-label="专项训练私教互动">
          <div className="training-interaction-tabs" role="tablist" aria-label="私教内容">
            <button className={trainingPanel === "指导" ? "active" : ""} onClick={() => setTrainingPanel("指导")} role="tab" aria-selected={trainingPanel === "指导"}>本次专项点评</button>
            <button className={trainingPanel === "总结" ? "active" : ""} onClick={() => setTrainingPanel("总结")} role="tab" aria-selected={trainingPanel === "总结"}>阶段总结</button>
          </div>
          <div className="training-interaction-scroll">
            {trainingPanel === "指导" ? (
              <>
                <h2 className="h2">本次专项点评</h2>
                {!exercise ? (
                  <p className="muted">左侧的专项练习会围绕当前任务展开。完成决定后，私教会结合决策前的盘面、指标和你写下的依据陪你复盘。</p>
                ) : !exercise.决定 ? (
                  <p className="muted">先在左侧完成这次决定。后续行情揭晓后，再请私教看看你的观察依据和风险计划。</p>
                ) : record ? (
                  <div className="coach-conversation">
                    <p className="muted">私教 · {record.模型} · {new Date(record.创建时间).toLocaleString("zh-CN")}</p>
                    {record.用户补充 && <p className="user-statement">你的补充：{record.用户补充}</p>}
                    <h3>{highlightedCoachTitle(record.回答.标题)}</h3>
                    <div className="coach-prose">
                      {naturalCoachParagraphs(record.回答.点评).map((paragraph, index) => <p key={`${index}:${paragraph.slice(0, 24)}`}>{paragraph}</p>)}
                    </div>
                    <p><strong className="coach-guidance-label">教练想进一步了解：</strong>{cleanCoachCopy(record.回答.待核对)}</p>
                    <p><strong className="coach-guidance-label">下一次巩固建议：</strong>{cleanCoachCopy(record.回答.下次练习)}</p>
                    <details>
                      <summary>这次判断依据什么</summary>
                      {record.证据.filter((item) => record.回答.证据编号.includes(item.编号)).map((item) => (
                        <details key={item.编号}><summary>{item.名称}</summary><EvidenceContent item={item} /></details>
                      ))}
                    </details>
                  </div>
                ) : <p className="muted">这次决定和程序检查已经保存。现在可以请私教结合决策前的盘面，帮你看看判断依据与当前任务是否真正对上。</p>}
              </>
            ) : progressRecord ? (
              <div className="coach-conversation stage-coach-summary">
                <p className="stage-ai-label">本轮私教总结</p>
                <p className="muted">私教 · {progressRecord.模型} · {new Date(progressRecord.创建时间).toLocaleString("zh-CN")}</p>
                {coveredScope && (
                  <p className="stage-summary-scope">
                    本总结包含截至 {coveredScope.结束 ? new Date(coveredScope.结束).toLocaleString("zh-CN") : "生成时"} 的
                    {coveredScope.模拟交易数} 次模拟交易、{coveredScope.专项训练数} 次专项训练和
                    {coveredScope.私教对话数} 次补充交流。
                  </p>
                )}
                {summaryHasNewRecords && (
                  <p role="status" className="stage-summary-stale">
                    有新的模拟交易或专项训练尚未纳入这份总结，请在下方按最新记录重新总结。
                  </p>
                )}
                <h3>{cleanCoachCopy(progressRecord.回答.标题)}</h3>
                <div className="coach-prose">
                  {naturalCoachParagraphs(progressRecord.回答.点评).map((paragraph, index) => <p key={`${index}:${paragraph.slice(0, 24)}`}>{paragraph}</p>)}
                </div>
                <p><strong className="coach-guidance-label">教练想进一步了解：</strong>{cleanCoachCopy(progressRecord.回答.待核对)}</p>
                <p><strong className="coach-guidance-label">下一阶段训练重点：</strong>{cleanCoachCopy(progressRecord.回答.下次练习)}</p>
                {!progressRecord.已确认 && <p className="muted stage-choice-help">准备换一个重点就开始下一轮；还想练熟，就再做一次当前任务。</p>}
                <button
                  className="btn"
                  disabled={busy || !!progressRecord.已确认}
                  onClick={() => run(async () => {
                    const next = await api("确认练习约定", { 分身编号: twinId, 编号: progressRecord.编号 });
                    setState(next);
                    setProgressRecord(next.记录.find((item: CoachRecord) => item.编号 === progressRecord.编号) ?? progressRecord);
                    window.dispatchEvent(new Event("smartvibe-next-task-adopted"));
                  })}
                >
                  {progressRecord.已确认 ? "已开始下一轮" : "开始新任务，进行下一个练习"}
                </button>
                {!progressRecord.已确认 && (
                  <button className="btn" disabled={busy} onClick={() => run(async () => {
                    const nextExercise = await api("开始历史训练", { 分身编号: twinId, 交易对: symbol, 周期: interval, 市场: market });
                    setExercise(nextExercise);
                    setRecord(null);
                    setDirection("观望");
                    setReason("");
                    setStop("");
                    setBudget("");
                    setTrainingError("");
                    setTrainingPanel("指导");
                    window.requestAnimationFrame(() => targetedPracticeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
                  }, "training", "exercise")}>
                    继续当前练习，再巩固一次
                  </button>
                )}
                {pendingAction === "exercise" && <WaitProgress action="exercise" />}
              </div>
            ) : <p className="muted">完成练习后，可以请私教把这一轮的模拟交易、专项练习和交流串起来，帮助你决定继续巩固还是进入下一项任务。</p>}
          </div>
          <div className="training-interaction-composer">
            {trainingPanel === "指导" ? exercise?.决定 ? (
              <>
                {record && <label>回答私教，或补充你当时的想法<textarea rows={3} maxLength={1500} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} placeholder="用自己的话说就好。" /></label>}
                <div className="training-composer-actions">
                  <button className="btn btn-primary" disabled={busy || (!!record && !text.trim())} onClick={() => ask("training")}>{busy ? "请稍候…" : record ? "发送回答，继续聊" : titles[mode]}</button>
                  {record && <button className="btn" disabled={busy} onClick={() => ask("training")}>按最新记录更新</button>}
                </div>
                {pendingAction === "training" && <WaitProgress action="training" />}
              </>
            ) : <p className="muted model-usage-note">提交这次专项练习后，就可以在这里请私教点评。</p> : (
              <>
                {progressRecord && <label>回答阶段总结中的问题<textarea rows={3} maxLength={1500} value={progressText} disabled={busy} onChange={(event) => setProgressText(event.target.value)} placeholder="补充你当时看到的盘面或执行过程。" /></label>}
                <button className="btn btn-primary" disabled={busy || !state?.练习约定 || (!!progressRecord && !progressText.trim())} onClick={() => askProgress(progressText)}>
                  {busy ? "请稍候…" : progressRecord ? "发送回答，继续聊" : "请私教总结这一轮"}
                </button>
                {progressRecord && <button className="btn" disabled={busy} onClick={() => askProgress()}>按最新记录重新总结</button>}
                {pendingAction === "summary" && <WaitProgress action="summary" />}
              </>
            )}
            {(error || progressError) && <p role="alert" className="error-box">{progressError || error} 本次内容没有生成；已保存训练不受影响。</p>}
            <p className="muted model-usage-note">每次都由你主动发起，私教不会替你决定交易方向。</p>
          </div>
        </aside>
      )}
      {mode === "训练" && (
        <div ref={targetedPracticeRef} className="targeted-practice">
          <h3>{state?.练习约定 ? "围绕当前任务，再做一次专项练习" : "专项练习会在第一项正式任务确认后开启"}</h3>
          <p className="muted">
            {state?.练习约定
              ? "系统会隐藏后续 12 根已收盘 K 线，提交决定后再揭晓；重点是练习当前任务，不以猜对涨跌作为成绩。"
              : "先完成一笔模拟交易和平仓复盘，从私教建议中确认接下来最值得练的一项，再到这里巩固。"}
          </p>
          <div className="coach-action-row">
            <button
              className="btn"
              disabled={busy || !state?.练习约定}
              onClick={() =>
                run(async () => {
                    const nextExercise = await api("开始历史训练", {
                        分身编号: twinId,
                        交易对: symbol,
                        周期: interval,
                        市场: market,
                      });
                    setExercise(nextExercise);
                    setRecord(null);
                    setTrainingPanel("指导");
                }, "training", "exercise")
              }
            >
              {exercise && !exercise.决定
                ? "继续未完成的专项练习"
                : "开始一次专项练习"}
            </button>
            {pendingAction === "exercise" && <WaitProgress action="exercise" />}
          </div>
          {trainingError && !exercise && (
            <p role="alert" className="error-box training-error">
              {trainingError} 你可以直接重试，当前任务和已有记录不会受影响。
            </p>
          )}
          {exercise && (
            <div>
              <p className="training-goal">
                <strong>本次目标：</strong>
                {historicalExerciseGoal(exercise.目标)}
              </p>
              <p className="muted">
                决策点参考价{" "}
                {exercise.可见K线
                  .at(-1)!
                  .close.toLocaleString("zh-CN", {
                    maximumFractionDigits: 6,
                  })}{" "}
                USDT · {visibleExerciseSource(exercise.来源)} · {exercise.交易对} · 截止{" "}
                {new Date(exercise.可见K线.at(-1)!.time * 1000).toLocaleString(
                  "zh-CN",
                )}{" "}
                · 专项练习，与上方模拟交易账本独立
              </p>
              <CoachChart
                mainHeight={370}
                candles={chartCandles}
                overlay={exercise.决定 ? (
                  <aside className="training-check-overlay" aria-label="本次训练执行检查">
                    <strong>本次训练检查</strong>
                    <p>{exercise.决定.方向} · 已揭晓后续12根K线</p>
                    {exercise.检查?.map((item) => <p key={item.项目}><span>{item.项目}</span>{item.结果}</p>)}
                    {exercise.计划止损金额 != null && <p><span>计划止损金额</span>{exercise.计划止损金额.toFixed(2)} USDT</p>}
                    <details><summary>查看训练依据</summary><p>{exercise.决定.理由}</p></details>
                  </aside>
                ) : undefined}
              />
              {!exercise.决定 ? (
                <fieldset disabled={busy} className="ticket-fields">
                  <div className="targeted-decision-grid">
                    <label>
                      历史训练决定
                      <select
                        value={direction}
                        onChange={(e) => setDirection(e.target.value)}
                      >
                        <option>观望</option>
                        <option>做多</option>
                        <option>做空</option>
                      </select>
                    </label>
                    <label>
                      训练本金（USDT）
                      <input
                        type="number"
                        value={capital}
                        onChange={(e) => setCapital(e.target.value)}
                      />
                    </label>
                    <label>
                      训练止损价
                      <input
                        type="number"
                        value={stop}
                        onChange={(e) => setStop(e.target.value)}
                        disabled={direction === "观望"}
                      />
                    </label>
                    <label>
                      训练风险预算（USDT）
                      <input
                        type="number"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        disabled={direction === "观望"}
                      />
                    </label>
                  </div>
                  <label>
                    训练依据与失效条件
                    <textarea
                      value={reason}
                      maxLength={1000}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="写下你看到的K线或指标依据，以及出现什么变化时这次判断失效。"
                    />
                  </label>
                  {trainingError && (
                    <p role="alert" className="error-box training-error">
                      {trainingError} 你填写的其他训练内容已经保留。
                    </p>
                  )}
                  <button
                    className="btn btn-primary"
                    disabled={!reason.trim()}
                    onClick={() => {
                      const issue = validateTrainingDecision();
                      if (issue) {
                        setTrainingError(issue);
                        return;
                      }
                      void run(async () => {
                        setExercise(
                          await api("提交历史训练", {
                            分身编号: twinId,
                            编号: exercise.编号,
                            方向: direction,
                            理由: reason,
                            本金: Number(capital),
                            止损: stop ? Number(stop) : undefined,
                            风险预算: budget ? Number(budget) : undefined,
                          }),
                        );
                        await reload();
                      }, "training");
                    }}
                  >
                    提交决定，揭晓后续行情与执行检查
                  </button>
                </fieldset>
              ) : null}
            </div>
          )}
          {state && (
            <section className="stage-progress" aria-label="阶段进展">
              <div className="stage-progress-heading">
                <div>
                  <h3>当前任务的阶段进展</h3>
                  <p className="muted">
                    从你确认当前任务时开始统计。这里先整理记录中的执行情况，私教总结请看右侧“阶段总结”。
                  </p>
                </div>
              </div>
              <div className="stage-sample-strip">
                <span>模拟交易 <strong>{state.阶段进展.样本范围.模拟交易数}</strong></span>
                <span>专项训练 <strong>{state.阶段进展.样本范围.专项训练数}</strong></span>
                <span>补充交流 <strong>{state.阶段进展.样本范围.私教对话数}</strong></span>
              </div>
              <p className="muted stage-scope">
                {state.阶段进展.样本范围.开始
                  ? `${new Date(state.阶段进展.样本范围.开始).toLocaleString("zh-CN")} 至 ${new Date(state.阶段进展.样本范围.结束!).toLocaleString("zh-CN")}。`
                  : "尚未开始统计。"}
                {state.阶段进展.样本范围.说明}
              </p>
              <div className="stage-progress-grid">
                <div className="stage-progress-card">
                  <h4>专项练习是否围绕当前任务</h4>
                  <p>{state.阶段进展.目标一致性.结论}</p>
                  <small>帮助你确认专项练习没有偏离这一轮真正想改善的问题。</small>
                </div>
                {state.阶段进展.检查进展.map((item) => (
                  <div className="stage-progress-card" key={item.项目}>
                    <h4>{item.项目 === "写清依据" ? "决策依据记录" : item.项目 === "设置止损" ? "止损计划" : "风险预算匹配"}</h4>
                    <p><strong className={`progress-${item.结论}`}>{progressConclusionCopy(item.结论)}</strong> · 第一次 {checkStateCopy(item.首次)}，最近一次 {checkStateCopy(item.最近)}</p>
                    {!!item.对应记录.length && (
                      <p className="evidence-links">
                        依据：{item.对应记录.map((id, index) => (
                          <span key={id}>{index ? "、" : ""}<a href={`#progress-${id}`}>
                            {(() => {
                              const reference = state.阶段进展.可追溯记录.find((record) => record.编号 === id);
                              return reference ? `${reference.类型} ${new Date(reference.时间).toLocaleDateString("zh-CN")}` : "相关记录";
                            })()}
                          </a></span>
                        ))}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {!!state.阶段进展.场景对照.length && (
                <div className="scenario-comparisons">
                  <h4>练习场景对照</h4>
                  <p className="muted">相似场景目前按交易对和周期判断，用来观察你在同类练习中是否保持执行；不代表行情形态完全相同。</p>
                  {state.阶段进展.场景对照.map((item) => (
                    <p key={item.训练编号}>
                      <strong>{item.关系}：</strong>{item.说明}
                    </p>
                  ))}
                </div>
              )}
              <details className="progress-evidence">
                <summary>查看本报告引用的具体记录（{state.阶段进展.可追溯记录.length} 条）</summary>
                {!state.阶段进展.可追溯记录.length && <p className="muted">完成模拟交易或专项训练后，这里会列出对应记录。</p>}
                {state.阶段进展.可追溯记录.map((item) => (
                  <details id={`progress-${item.编号}`} key={item.编号} className="progress-reference">
                    <summary>{item.类型} · {cleanCoachCopy(item.标题)} · {new Date(item.时间).toLocaleString("zh-CN")}</summary>
                    <p>{cleanCoachCopy(item.摘要)}</p>
                    {item.场景关系 && <p className="muted">{item.场景关系}</p>}
                  </details>
                ))}
              </details>
            </section>
          )}
        </div>
      )}
      {mode === "复盘" && state && (
        <div>
          <h3>我确认过的约定与之后的执行</h3>
          <p>{state.练习约定?.回答.下次练习 ?? "尚未确认练习约定。"}</p>
          {!state.执行检查.length && (
            <p className="muted">
              还没有确认约定之后提交的新模拟单，先练一次再比较。
            </p>
          )}
          {state.执行检查.map((o) => (
            <details key={o.编号}>
              <summary>
                {new Date(o.时间).toLocaleString("zh-CN")} 的模拟决定
              </summary>
              {o.检查.map((c) => (
                <p key={c.项目}>
                  {c.项目}：{c.结果}
                </p>
              ))}
            </details>
          ))}
        </div>
      )}
      {(mode === "点评" || mode === "复盘") && state && (
        <details className="saved-conversations">
          <summary>已保存的私教对话（{state.记录.length} 条）</summary>
          {state.记录.map((r) => (
            <div key={r.编号} className="saved-conversation">
              <h4>
                {r.位置} · {cleanCoachCopy(r.回答.标题)}
              </h4>
              {r.用户补充 && <p className="saved-user-message">我：{r.用户补充}</p>}
              <div className="saved-agent-message">
                <strong>私教：</strong>
                {naturalCoachParagraphs(r.回答.点评).map((paragraph, index) => (
                  <p key={`${index}:${paragraph.slice(0, 24)}`}>{paragraph}</p>
                ))}
              </div>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
