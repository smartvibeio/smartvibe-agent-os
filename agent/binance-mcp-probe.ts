/**
 * 币安 Agent OS / MCP 连通探测
 * 用法：npm run agent:binance-probe
 */
import fs from "node:fs";
import path from "node:path";
import { 探测币安AgentOs } from "../src/agent/binanceMcp.js";

async function main() {
  console.log("正在探测币安官方 MCP：https://agent.binance.com/mcp/agentic …");
  const status = await 探测币安AgentOs();
  const outDir = path.resolve(process.cwd(), "agent", "binance-agent-os");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "探测结果.json");
  fs.writeFileSync(outFile, JSON.stringify(status, null, 2), "utf8");

  console.log("");
  console.log(`端点: ${status.端点}`);
  console.log(`代理: ${status.代理 ?? "无"}`);
  console.log(`初始化: ${status.初始化}`);
  console.log(`详情: ${status.初始化详情}`);
  if (status.工具数量 != null) {
    console.log(`工具数: ${status.工具数量}`);
    console.log(`工具摘录: ${status.工具名摘录.join(", ")}`);
  }
  console.log("");
  console.log("官方能力边界:");
  for (const [k, v] of Object.entries(status.能力边界_官方)) {
    console.log(`  - ${k}: ${v}`);
  }
  console.log("");
  console.log(`结果已写入: ${outFile}`);
  if (status.初始化 === "需要授权") {
    console.log("");
    console.log(
      "请在 Cursor → Settings → MCP 启用 binance-mcp-server，浏览器完成币安授权后再测。",
    );
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
