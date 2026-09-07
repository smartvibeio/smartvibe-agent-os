import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "smartvibe-bridge-"));
const state = path.join(temporary, "state");
process.env.SMARTVIBE_CODEX_BINARY = fileURLToPath(new URL("./fixtures/fake-codex-app-server.mjs", import.meta.url));
process.env.SMARTVIBE_FAKE_BRIDGE_STATE = state;

const { connectionStatus } = await import("../src/agent/codexBridge.js");

describe("Codex桥接恢复", () => {
  it("首次子进程退出后自动建立新一代连接", async () => {
    const status = await connectionStatus();
    expect(status).toMatchObject({ codex: true, binanceConnected: true, binanceRuntime: "connected" });
    expect(fs.readFileSync(state, "utf8")).toBe("started");
  }, 10000);
});

afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }));
