"use client";
import { useEffect, useRef, useState } from "react";
import type { CoachRecord } from "@smartvibe/agent/coaching.js";
import { friendlyCoachText } from "@smartvibe/agent/coachTone.js";
import styles from "./profile.module.css";
async function api(动作: string, 参数: Record<string, unknown>) {
  const r = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ 动作, 参数 }) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.错误 || "陪练暂时无法回应，请重试。");
  return data;
}
export default function ReplayDiscussion({ twinId, replayId, className = "" }: { twinId: string; replayId: string; className?: string }) {
  const [records, setRecords] = useState<CoachRecord[]>([]), [text, setText] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), request = useRef<string | null>(null), scroll = useRef<HTMLDivElement>(null);
  const key = `smartvibe-replay-chat:${replayId}`;
  const run = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "请重试"); }
    finally { lock.current = false; setBusy(false); }
  };
  const load = async () => {
    const s = await api("私教状态", { 分身编号: twinId });
    const list = (s.记录 as CoachRecord[]).filter(r => r.位置 === "演示" && r.关联编号 === replayId);
    if (!list.length) setRecords([await api("AI私教", { 分身编号: twinId, 位置: "演示", 关联编号: replayId, 请求编号: replayId })]);
    else setRecords(list);
  };
  useEffect(() => { setText(localStorage.getItem(key) ?? ""); void run(load); }, [replayId]);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [records, busy]);
  return <section className={`${styles.profileChat} ${className}`} aria-label="分身演示点评">
    <h2>这次的分身像你吗？</h2><p className="muted">陪练会结合这次模拟和你的习惯，陪你找出值得观察的决定。你的补充会留在陪练记忆里。</p>
    <div className={styles.chatHistory} ref={scroll}>{records.map(r => <div key={r.编号}>
      {r.用户补充 && <div className={styles.userMessage}><strong>你</strong><p className={styles.prose}>{r.用户补充}</p></div>}
      <div className={styles.agentMessage}><strong>陪练</strong><p className={styles.prose}>{friendlyCoachText(r.回答.点评)}</p>{r.回答.待核对 && !r.回答.点评.includes(r.回答.待核对) && <p className={styles.prose}>{friendlyCoachText(r.回答.待核对)}</p>}</div>
    </div>)}</div>
    {busy && <p role="status" className="muted">陪练正在整理这次演示…</p>}{error && <p role="alert" className="error-box">{error}</p>}
    {!records.length ? <button className="btn" disabled={busy} onClick={() => void run(load)}>重新获取点评</button> : <>
      <label htmlFor="replay-reply">说说哪些决定像你，哪些与你的习惯不同</label>
      <textarea id="replay-reply" rows={3} maxLength={1500} className={styles.chatInput} disabled={busy} value={text} placeholder="例如：这次追进去很像我，但我通常不会这么早平仓……" onChange={e => { setText(e.target.value); request.current = null; localStorage.setItem(key, e.target.value); }} />
      <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void run(async () => {
        request.current ??= crypto.randomUUID();
        const r = await api("AI私教", { 分身编号: twinId, 位置: "演示", 关联编号: replayId, 请求编号: request.current, 上一条: records.at(-1)!.编号, 用户补充: text });
        setRecords(old => old.some(p => p.编号 === r.编号) ? old : [...old, r]); setText(""); request.current = null; localStorage.removeItem(key);
      })}>发送给陪练</button>
    </>}
  </section>;
}
