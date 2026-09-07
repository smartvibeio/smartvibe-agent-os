import fs from "node:fs";
import path from "node:path";
import type { DecisionMemory, TradingTwinProfile } from "../domain/types.js";

export interface AgentStoreData {
  twins: Record<string, TradingTwinProfile>;
  memories: Record<string, DecisionMemory[]>;
  active_twin_id: string | null;
}

const DEFAULT: AgentStoreData = {
  twins: {},
  memories: {},
  active_twin_id: null,
};

function storePath(): string {
  return path.join(runtimeDataDir(), "agent-runtime-store.json");
}

export function runtimeDataDir() {
  const cwd = process.cwd();
  return path.resolve(
    process.env.SMARTVIBE_DATA_DIR ||
      (path.basename(cwd) === "web"
        ? path.join(cwd, "..", "data")
        : path.join(cwd, "data")),
  );
}

export function loadStore(): AgentStoreData {
  let p = storePath();
  // 兼容此前由 web 工作目录保存的分身；后续写入统一路径，不删除旧文件。
  if (!process.env.SMARTVIBE_DATA_DIR && !fs.existsSync(p)) {
    const legacy = path.join(
      runtimeDataDir(),
      "..",
      "web",
      "data",
      "agent-runtime-store.json",
    );
    if (fs.existsSync(legacy)) p = legacy;
  }
  try {
    if (!fs.existsSync(p)) return structuredClone(DEFAULT);
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as AgentStoreData;
    return {
      twins: raw.twins ?? {},
      memories: raw.memories ?? {},
      active_twin_id: raw.active_twin_id ?? null,
    };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function saveStore(data: AgentStoreData): void {
  const p = storePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

export function upsertTwin(twin: TradingTwinProfile): void {
  const store = loadStore();
  store.twins[twin.id] = twin;
  store.active_twin_id = twin.id;
  saveStore(store);
}

export function getTwin(id?: string | null): TradingTwinProfile | null {
  const store = loadStore();
  const twinId = id || store.active_twin_id;
  if (!twinId) return null;
  const twin = store.twins[twinId] ?? null;
  // 兼容旧建档默认注入的演示账户；不让虚构持仓参与真实陪练。
  if (
    twin?.account_context_latest?.position_summary ===
    "Demo account context (fixture)"
  )
    twin.account_context_latest = null;
  return twin;
}

export function appendMemory(twinId: string, memory: DecisionMemory): void {
  const store = loadStore();
  const list = store.memories[twinId] ?? [];
  list.unshift(memory);
  store.memories[twinId] = list.slice(0, 50);
  if (store.twins[twinId]) {
    // twin already updated by caller before save
  }
  saveStore(store);
}

export function listMemories(twinId: string): DecisionMemory[] {
  return loadStore().memories[twinId] ?? [];
}
