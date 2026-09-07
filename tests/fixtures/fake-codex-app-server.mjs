import fs from "node:fs";
import readline from "node:readline";

const state = process.env.SMARTVIBE_FAKE_BRIDGE_STATE;
const firstBoot = state && !fs.existsSync(state);
if (firstBoot) fs.writeFileSync(state, "started");

const input = readline.createInterface({ input: process.stdin });
const reply = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
input.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    if (firstBoot) return process.exit(23);
    return reply(message.id, { codexHome: "fake" });
  }
  if (message.method === "thread/start") return reply(message.id, { thread: { id: `fake-${message.id}` }, model: "fake" });
  if (message.method === "account/read") return reply(message.id, { account: { id: "fake" } });
  if (message.method === "mcpServerStatus/list") {
    reply(message.id, { data: [{ name: "binance-mcp-server", authStatus: "oAuth", runtimeStatus: "connected", tools: { tool_execute: {} } }] });
    return setTimeout(() => process.exit(0), 25);
  }
  return reply(message.id, {});
});

