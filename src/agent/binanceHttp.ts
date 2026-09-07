/**
 * 本机访问币安 Agent OS 时的 HTTP 封装。
 * Windows和macOS可使用用户启用的系统代理或显式代理。
 */
import { ProxyAgent, fetch as undiciFetch, type RequestInit } from "undici";
import { execFileSync, execSync } from "node:child_process";

function detectWindowsIeProxy(): string | null {
  if (process.platform !== "win32") return null;
  try {
    const out = execSync(
      "powershell -NoProfile -Command \"$p=Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; if ($p.ProxyEnable -eq 1) { $p.ProxyServer }\"",
      { encoding: "utf8", timeout: 8000 },
    ).trim();
    if (!out) return null;
    const httpsMatch = out.match(/https?=([^;]+)/i);
    const host = (httpsMatch?.[1] || out).trim();
    if (!host) return null;
    return host.startsWith("http") ? host : `http://${host}`;
  } catch {
    return null;
  }
}

export function parseMacSystemProxy(output: string): string | null {
  const value = (name: string) => output.match(new RegExp(`(?:^|\\n)\\s*${name}\\s*:\\s*([^\\n]+)`, "i"))?.[1]?.trim();
  for (const protocol of ["HTTPS", "HTTP"]) {
    if (value(`${protocol}Enable`) !== "1") continue;
    const host = value(`${protocol}Proxy`);
    const port = value(`${protocol}Port`);
    if (host && port && /^\d+$/.test(port)) return `http://${host}:${port}`;
  }
  return null;
}

function detectMacSystemProxy(): string | null {
  if (process.platform !== "darwin") return null;
  try {
    return parseMacSystemProxy(execFileSync("/usr/sbin/scutil", ["--proxy"], { encoding: "utf8", timeout: 8000 }));
  } catch {
    return null;
  }
}

function candidateProxies(): Array<string | null> {
  const list: Array<string | null> = [];
  if (process.env.SMARTVIBE_PROXY) list.push(process.env.SMARTVIBE_PROXY);
  const env = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "").trim();
  if (env) list.push(env);
  const ie = detectWindowsIeProxy();
  if (ie) list.push(ie);
  const mac = detectMacSystemProxy();
  if (mac) list.push(mac);
  list.push(null); // 最后尝试直连
  return [...new Set(list)];
}

let lastWorkingProxy: string | null | undefined;

export function resolveOutboundProxy(): string | null {
  if (lastWorkingProxy !== undefined) return lastWorkingProxy;
  const env = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "").trim();
  if (env) return env;
  return detectWindowsIeProxy() ?? detectMacSystemProxy();
}

export async function binanceFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const errors: string[] = [];
  const order =
    lastWorkingProxy !== undefined
      ? [
          lastWorkingProxy,
          ...candidateProxies().filter((p) => p !== lastWorkingProxy),
        ]
      : candidateProxies();

  for (const proxy of order) {
    try {
      const res = await undiciFetch(url, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(10000),
        dispatcher: proxy ? new ProxyAgent(proxy) : undefined,
      });
      // 401 对 MCP 也算“连通成功”
      if (res.status === 401 || (res.status >= 200 && res.status < 500)) {
        lastWorkingProxy = proxy;
        return res as unknown as Response;
      }
      errors.push(`${proxy ?? "直连"} → HTTP ${res.status}`);
    } catch (err) {
      errors.push(
        `${proxy ?? "直连"} → ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  throw new Error(`访问币安 Agent OS 失败：${errors.join("；")}`);
}

export const BINANCE_MCP_URL = "https://agent.binance.com/mcp/agentic";
export const BINANCE_OAUTH_AS =
  "https://agent.binance.com/.well-known/oauth-authorization-server";
export const BINANCE_OAUTH_RESOURCE =
  "https://agent.binance.com/.well-known/oauth-protected-resource/gateway-mcp";
