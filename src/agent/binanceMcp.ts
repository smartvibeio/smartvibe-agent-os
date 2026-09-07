/**
 * 币安官方 Agent OS · MCP 客户端（Streamable HTTP + OAuth Bearer）
 * 无令牌时只能做元数据探测；有 BINANCE_MCP_ACCESS_TOKEN 时可 tools/list、tools/call。
 */
import {
  BINANCE_MCP_URL,
  BINANCE_OAUTH_AS,
  BINANCE_OAUTH_RESOURCE,
  binanceFetch,
  resolveOutboundProxy,
} from "./binanceHttp.js";
import { callCodexBinance } from "./codexBridge.js";

type JsonRpcResult = {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type BinanceMcpStatus = {
  端点: string;
  代理: string | null;
  oauth元数据: unknown | null;
  资源元数据: unknown | null;
  初始化: "需要授权" | "已连接" | "失败";
  初始化详情: string;
  工具数量: number | null;
  工具名摘录: string[];
  能力边界_官方: {
    行情: string;
    账户: string;
    交易: string;
    划转: string;
    提现: string;
  };
  对交易陪练的含义: string[];
  下一步: string[];
};

function authHeaders(): Record<string, string> {
  const token = process.env.BINANCE_MCP_ACCESS_TOKEN?.trim();
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function mcpRpc(
  method: string,
  params?: Record<string, unknown>,
  sessionId?: string | null,
): Promise<{
  status: number;
  wwwAuth: string | null;
  sessionId: string | null;
  body: JsonRpcResult | string;
}> {
  const headers = authHeaders();
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await binanceFetch(BINANCE_MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      ...(method.startsWith("notifications/") ? {} : { id: Date.now() % 1_000_000 }),
      method,
      params: params ?? {},
    }),
  });
  const text = await res.text();
  let body: JsonRpcResult | string = text;
  try {
    body = JSON.parse(text) as JsonRpcResult;
  } catch {
    const messages = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"));
    for (const message of messages) {
      try {
        const parsed = JSON.parse(message.slice(5));
        if (parsed.result || parsed.error) body = parsed;
      } catch {
        /* keep parsing */
      }
    }
  }
  return {
    status: res.status,
    wwwAuth: res.headers.get("www-authenticate"),
    sessionId: res.headers.get("mcp-session-id"),
    body,
  };
}

export async function 探测币安AgentOs(): Promise<BinanceMcpStatus> {
  const 能力边界_官方 = {
    行情: "公开范围：行情、盘口、K线、资金费率（连接后按授权范围）",
    账户: "Agentic 子账户余额/持仓/流水；可选主账户只读组合信息（官方措辞）",
    交易: "现货/杠杆/闪兑/合约（视授权与账户资格）",
    划转: "仅同一 Agentic 子账户内钱包互转",
    提现: "不支持提现到外部地址",
  };

  let oauth元数据: unknown | null = null;
  let 资源元数据: unknown | null = null;
  try {
    const r = await binanceFetch(BINANCE_OAUTH_AS);
    oauth元数据 = await r.json();
  } catch (e) {
    oauth元数据 = { 错误: e instanceof Error ? e.message : String(e) };
  }
  try {
    const r = await binanceFetch(BINANCE_OAUTH_RESOURCE);
    资源元数据 = await r.json();
  } catch (e) {
    资源元数据 = { 错误: e instanceof Error ? e.message : String(e) };
  }

  const init = await mcpRpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smartvibe-trading-coach", version: "0.3.0" },
  });

  let 初始化: BinanceMcpStatus["初始化"] = "失败";
  let 初始化详情 = "";
  let 工具数量: number | null = null;
  let 工具名摘录: string[] = [];

  if (init.status === 401) {
    初始化 = "需要授权";
    初始化详情 =
      "官方 MCP 端点可达，但必须完成币安 Agentic OAuth 授权后才能 initialize / 调工具。";
  } else if (init.status >= 200 && init.status < 300) {
    初始化 = "已连接";
    初始化详情 = "initialize 成功（已带访问令牌或会话）。";
    // notify initialized
    await mcpRpc("notifications/initialized", {}, init.sessionId).catch(
      () => null,
    );
    const listed = await mcpRpc("tools/list", {}, init.sessionId);
    if (
      typeof listed.body === "object" &&
      listed.body &&
      "result" in listed.body &&
      listed.body.result &&
      typeof listed.body.result === "object" &&
      listed.body.result !== null &&
      "tools" in (listed.body.result as object)
    ) {
      const tools = (listed.body.result as { tools: Array<{ name: string }> })
        .tools;
      工具数量 = tools.length;
      工具名摘录 = tools.slice(0, 40).map((t) => t.name);
    } else {
      初始化详情 += ` tools/list 原始：${JSON.stringify(listed.body).slice(0, 400)}`;
    }
  } else {
    初始化详情 = `HTTP ${init.status} ${JSON.stringify(init.body).slice(0, 300)}`;
  }

  return {
    端点: BINANCE_MCP_URL,
    代理: resolveOutboundProxy(),
    oauth元数据,
    资源元数据,
    初始化,
    初始化详情,
    工具数量,
    工具名摘录,
    能力边界_官方,
    对交易陪练的含义: [
      "建档校准：授权 Account 后，才可能拉子账户成交/流水做行为画像",
      "练盘行情：授权后应用官方 MCP 行情工具，替代纯公开 REST（仍可回退）",
      "模拟盘下单：Trade 权限会碰真资金风险——陪练默认只用只读+本地模拟单",
      "Cursor 侧配置官方 MCP 后，需在浏览器完成一次币安登录授权",
    ],
    下一步: [
      "在 Cursor 设置 → MCP 中启用 binance-mcp-server，完成 OAuth",
      "授权时优先勾选行情 + 账户只读，不要先开交易",
      "授权成功后设置环境变量 BINANCE_MCP_ACCESS_TOKEN（若客户端导出令牌）或直接在 Cursor 对话里用官方工具验证",
      "再跑 npm run agent:binance-probe 查看工具列表",
    ],
  };
}

/** 若已配置令牌，尝试调用 MCP 工具；否则返回 null */
export async function 尝试调用币安Mcp工具(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  if (!["spot.klines", "spot.getAccount", "spot.myTrades"].includes(name))
    throw new Error("只允许账户只读和行情工具");
  if (process.env.SMARTVIBE_CODEX_BINARY)
    return 解包Mcp结果(await callCodexBinance(name, args));
  if (!process.env.BINANCE_MCP_ACCESS_TOKEN?.trim()) return null;
  const init = await mcpRpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smartvibe-trading-coach", version: "0.3.0" },
  });
  if (init.status === 401 || init.status >= 400) return null;
  await mcpRpc("notifications/initialized", {}, init.sessionId).catch(
    () => null,
  );
  const call = await mcpRpc(
    "tools/call",
    { name, arguments: args },
    init.sessionId,
  );
  if (typeof call.body === "object" && call.body && "result" in call.body) {
    return 解包Mcp结果(call.body.result);
  }
  throw new Error("官方 MCP 未返回有效结果");
}

export function 解包Mcp结果(value: unknown): unknown {
  const result = value as {
    isError?: boolean;
    structuredContent?: unknown;
    content?: Array<{ type: string; text?: string }>;
  };
  if (!result || result.isError)
    throw new Error("币安 MCP 请求失败，请检查只读授权");
  if (result.structuredContent != null) return result.structuredContent;
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("币安 MCP 返回空数据");
  return JSON.parse(text);
}
