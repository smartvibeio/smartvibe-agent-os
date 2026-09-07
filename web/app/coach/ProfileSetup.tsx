"use client";
import { useEffect, useRef, useState } from "react";
import type { onboardingState } from "@smartvibe/agent/onboarding.js";
import styles from "./profile.module.css";
import { friendlyCoachText } from "@smartvibe/agent/coachTone.js";
type State = ReturnType<typeof onboardingState>;
// Older saved replies retain complete sentences; never cut a claim mid-sentence.
function sentences(text = "") {
  return text.match(/[^。！？\n]+[。！？]?/g)?.map(s => s.trim()).filter(Boolean) ?? [];
}
function ReadablePoints({ text, points, limit }: { text?: string; points?: string[]; limit: number }) {
  const items = (points ?? sentences(text)).map(friendlyCoachText).filter(s => s.trim());
  return <>
    <ul className={styles.summaryList}>{items.slice(0, limit).map((item, i) => <li key={i}>{item}</li>)}</ul>
    {items.length > limit && <details className={styles.more}><summary>展开其余内容</summary>
      <ul className={styles.summaryList}>{items.slice(limit).map((item, i) => <li key={i}>{item}</li>)}</ul>
    </details>}
  </>;
}
async function api(动作: string, 参数: Record<string, unknown>) {
  const response = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ 动作, 参数 }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.错误 || "暂时无法处理，请重试。");
  return result as State;
}
export default function ProfileSetup({ twinId, onNext }: { twinId: string; onNext: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [goal, setGoal] = useState("");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const requestId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const key = `smartvibe-profile-goal:${twinId}`;
  const run = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "处理失败，请重试。"); }
    finally { lock.current = false; setBusy(false); }
  };
  const load = async () => {
    const s = await api("建档补充状态", { 分身编号: twinId });
    setState(s);
    setMessage(localStorage.getItem(`smartvibe-profile-chat:${twinId}`) ?? "");
    setGoal(localStorage.getItem(key) ?? s.goal ?? "");
  };
  useEffect(() => { void run(load); }, [twinId]);
  const complete = state?.complete && !editing;
  return <section className={`card ${styles.panel}`}>
    {complete ? <>
      <h1 className="h1">你的初始分身已建立</h1>
      <p className="muted">这是对你的初步理解，后续会通过模拟交易继续校准。</p>
      <div className={styles.summaryBlocks}>
        <section className={styles.summaryBlock}>
          <h2>你的交易习惯</h2>
          <ReadablePoints text={state.reply?.点评} points={state.reply?.建档摘要?.习惯} limit={3} />
        </section>
        <section className={styles.summaryBlock}>
          <h2>你想优先改善</h2>
          {state.reply?.建档摘要 ? <>
            <p className={styles.prose}>{friendlyCoachText(state.reply.建档摘要.目标)}</p>
            <details className={styles.more}><summary>查看我的原始输入</summary><p className={styles.prose}>{state.goal}</p></details>
          </> : <ReadablePoints text={state.goal} limit={1} />}
        </section>
      </div>
      <section className={styles.profileChat} aria-label="和陪练聊聊">
        <h2>和陪练聊聊</h2>
        <p className="muted">可以回答下面的问题，也可以纠正我的理解。不必聊完才能继续模拟交易。</p>
        <div className={styles.chatHistory}>
          <div className={styles.agentMessage}><strong>陪练</strong><p className={styles.prose}>{friendlyCoachText(state.conversation[0]?.回答.待核对 || state.reply?.待核对 || "你想先聊聊哪一次交易经历？")}</p></div>
          {state.conversation.slice(1).map(r => <div key={r.编号}>
            <div className={styles.userMessage}><strong>你</strong><p className={styles.prose}>{r.用户补充}</p></div>
            <div className={styles.agentMessage}><strong>陪练</strong><p className={styles.prose}>{friendlyCoachText(r.回答.点评)}</p>
              {r.回答.待核对 && !r.回答.点评.includes(r.回答.待核对) && <p className={styles.prose}>{friendlyCoachText(r.回答.待核对)}</p>}
            </div>
          </div>)}
        </div>
        <label htmlFor="profile-chat">说说你的想法</label>
        <textarea id="profile-chat" className={styles.chatInput} rows={3} maxLength={1500} disabled={busy} value={message} placeholder="用自己的话说就好，也可以纠正陪练对你的理解。" onChange={e => { setMessage(e.target.value); requestId.current = null; localStorage.setItem(`smartvibe-profile-chat:${twinId}`, e.target.value); }} />
        <div className="actions">
          <button className="btn btn-primary" disabled={busy || !message.trim()} onClick={() => void run(async () => {
            requestId.current ??= crypto.randomUUID();
            const s = await api("建档对话", { 分身编号: twinId, 内容: message, 请求编号: requestId.current });
            setState(s); setMessage(""); requestId.current = null; localStorage.removeItem(`smartvibe-profile-chat:${twinId}`);
          })}>{busy ? "正在处理…" : "发送给陪练"}</button>
        </div>
      </section>
      <div className={styles.completionActions}>
        <button className="btn btn-primary" disabled={busy} onClick={onNext}>让分身模拟交易</button>
        <p className="muted">在历史行情中观察分身如何买卖，看看它是否像你。</p>
        <button className={styles.textButton} disabled={busy} onClick={() => setEditing(true)}>返回补充信息</button>
      </div>
    </> : <>
      <p className={styles.eyebrow}>八题已完成 · 补充建档信息</p>
      <h1 className="h1">再补充一点，让分身更了解你</h1>
      <p className="muted">你的八题答案已保存。说说你平时怎么交易、最想改善什么，Agent会结合这些信息建立你的初始分身。</p>
      <fieldset disabled={busy || !state} className={styles.profileFields}>
        <label htmlFor="profile-goal">介绍你的交易情况与目标（必填）</label>
        <p id="goal-help" className="muted">可以说说：你主要交易什么、通常持仓多久、最近反复遇到什么问题，以及最想改善哪一点。不需要专业术语，也不用每项都写。</p>
        <textarea id="profile-goal" required rows={5} maxLength={1500} aria-describedby="goal-help" value={goal} onChange={e => { setGoal(e.target.value); localStorage.setItem(key, e.target.value); }} placeholder="例如：我主要做BTC和ETH短线，通常当天平仓。经常看到上涨就追进去，亏损后又舍不得止损。我想先改善追涨和拖延止损的问题。" />
        <p className="muted">如果还没有交易经验，可以直接说明，并写下你想学习什么。</p>
        <label htmlFor="trade-file">上传历史交易记录（可选）</label>
        <p className="muted">从币安或其他交易所导出成交记录，Agent会结合实际成交核对交易习惯。没有记录也可以继续，之后通过模拟交易逐步完善分身。</p>
        <p className="muted">支持 UTF-8 CSV，最大 2 MB / 5000 笔。Excel 请另存为 CSV。需要时间、交易对、方向、成交价、成交数量五列；无时区时间按 UTC 处理。</p>
        <a download="成交记录模板.csv" href={"data:text/csv;charset=utf-8," + encodeURIComponent("\uFEFF时间,交易对,方向,成交价,成交数量\n2026-01-01T12:00:00Z,BTCUSDT,买入,90000,0.01\n")}>下载 CSV 模板（请替换示例数据）</a>
        <input id="trade-file" type="file" accept=".csv,text/csv" onChange={e => {
          const file = e.target.files?.[0]; e.target.value = "";
          if (!file) return;
          void run(async () => {
            if (!file.name.toLowerCase().endsWith(".csv") || file.size > 2_000_000) throw new Error("请选择不超过 2 MB 的 CSV 文件。");
            const csv = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
            setState(await api("保存建档补充", { 分身编号: twinId, 目标: goal, CSV: csv }));
          });
        }} />
        {state?.history && <div className={styles.importSummary}>
          <p>已识别 {state.history.count} 笔成交 · {state.history.symbols.join("、")}</p>
          <p className="muted">{state.history.start} 至 {state.history.end}（UTC）</p>
          <p className="muted">未识别 {state.history.rejected} 行{state.history.rejectedRows.length ? `（行号：${state.history.rejectedRows.join("、")}）` : ""}；相同成交行 {state.history.duplicates} 行，已保留。</p>
          <button className="btn" onClick={() => void run(async () => { setState(await api("保存建档补充", { 分身编号: twinId, 目标: goal, 移除记录: true })); })}>移除本次上传，暂不使用记录</button>
        </div>}
        <div className={styles.start}><button className="btn btn-primary" disabled={!goal.trim()} onClick={() => void run(async () => {
          const s = await api("完成建档", { 分身编号: twinId, 目标: goal, 请求编号: crypto.randomUUID() });
          setState(s); setEditing(false); localStorage.removeItem(key);
        })}>{busy ? "Agent正在建立分身…" : "建立我的分身"}</button>
          <p className="muted">Agent会结合你的答案与补充信息，整理交易习惯和需要进一步核对的问题。</p>
        </div>
      </fieldset>
      <details className="muted"><summary>处理说明</summary><p>记录在本地保存。点击建立分身后，答案、自述、成交汇总及最近100笔已识别成交会交给当前登录的 Codex 模型分析，使用该账户额度。未识别的列和原始文件不会保存或发送。上传文件本身不会触发模型分析。</p></details>
    </>}
    {busy && <p role="status" className="muted">正在处理，请稍候…</p>}
    {error && <p role="alert" className="error-box">{error} 你的答题与补充内容会保留。{!state && <button className="btn" onClick={() => void run(load)}>重新加载</button>}</p>}
  </section>;
}
