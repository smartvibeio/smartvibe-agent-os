import { z } from "zod";
import { getTwin, upsertTwin } from "./store.js";
import { askCoach, coachingState, profileConversations } from "./coaching.js";
import { parseTradeCsv } from "./tradeImport.js";
function twin(id: string) {
  const value = getTwin(id);
  if (!value) throw new Error("未找到答题记录，请先完成八题。");
  return value;
}
export function onboardingState(id: string) {
  const t = twin(id);
  const record = t.onboarding?.recordId ? coachingState(id).记录.find(r => r.编号 === t.onboarding!.recordId) : undefined;
  const root = profileConversations(id).find(r => r.编号 === t.onboarding?.conversationRootId);
  const reply = root?.回答 ?? t.onboarding?.reply ?? record?.回答;
  const records = profileConversations(id);
  const rootId = t.onboarding?.conversationRootId ?? t.onboarding?.recordId;
  const ids = new Set(rootId ? [rootId] : []);
  const conversation = records.filter(r => {
    if (r.编号 === rootId || (r.上一条 && ids.has(r.上一条))) { ids.add(r.编号); return true; }
    return false;
  });
  return { ...t.onboarding, reply, conversation, complete: !!t.onboarding?.completedAt && !!reply };
}
export function saveOnboarding(raw: unknown) {
  const args = z.object({ 分身编号: z.string(), 目标: z.string().max(1500), CSV: z.string().max(2_000_000).optional(), 移除记录: z.boolean().optional() }).parse(raw);
  const t = twin(args.分身编号);
  const history = args.移除记录 ? undefined : args.CSV !== undefined ? parseTradeCsv(args.CSV) : t.onboarding?.history;
  const changed = t.onboarding?.goal !== args.目标 || args.CSV !== undefined || args.移除记录;
  t.onboarding = { ...t.onboarding, goal: args.目标, history,
    ...(changed ? { completedAt: undefined, recordId: undefined, conversationRootId: undefined, reply: undefined } : {}) };
  upsertTwin(t);
  return onboardingState(t.id);
}
export async function completeOnboarding(raw: unknown) {
  const args = z.object({ 分身编号: z.string(), 目标: z.string().trim().min(1, "请先介绍你的交易情况与目标。").max(1500), 请求编号: z.string().uuid() }).parse(raw);
  saveOnboarding({ 分身编号: args.分身编号, 目标: args.目标 });
  const before = twin(args.分身编号).onboarding;
  const record = await askCoach({ 分身编号: args.分身编号, 位置: "建档", 用户补充: args.目标, 请求编号: args.请求编号 });
  const t = twin(args.分身编号);
  if (JSON.stringify(t.onboarding) !== JSON.stringify(before)) throw new Error("资料已发生变化，请按最新资料重新建立分身。");
  t.onboarding = { ...before!, completedAt: new Date().toISOString(), recordId: record.编号, conversationRootId: record.编号, reply: record.回答 };
  upsertTwin(t);
  return onboardingState(t.id);
}
export async function talkToProfile(raw: unknown) {
  const args = z.object({ 分身编号: z.string(), 内容: z.string().trim().min(1).max(1500), 请求编号: z.string().uuid() }).parse(raw);
  const s = onboardingState(args.分身编号);
  if (!s.complete) throw new Error("请先完成分身建立。");
  await askCoach({ 分身编号: args.分身编号, 位置: "建档", 用户补充: args.内容, 上一条: s.conversation.at(-1)?.编号 ?? s.recordId, 请求编号: args.请求编号 });
  return onboardingState(args.分身编号);
}
