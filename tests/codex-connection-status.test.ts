import { describe, expect, it } from "vitest";
import {
  isMcpConnectionUsable,
  shouldReconnectBridge,
  type McpRuntimeStatus,
} from "../src/agent/codexBridge.js";

describe("Codex MCP 连接状态", () => {
  it("只有协议定义的 connected 且存在工具时才算可用", () => {
    expect(isMcpConnectionUsable("connected", ["tool_execute"])).toBe(true);
    expect(isMcpConnectionUsable("connected", [])).toBe(false);
  });

  it.each<McpRuntimeStatus>([
    "notStarted",
    "starting",
    "authenticationRequired",
    "failed",
    "cancelled",
    "disabled",
  ])("%s 不能被显示成已连接", (status) => {
    expect(isMcpConnectionUsable(status, ["tool_execute"])).toBe(false);
  });

  it("只为连接层故障自动重建桥接，不重复协议或业务错误", () => {
    expect(shouldReconnectBridge("BRIDGE_CLOSED")).toBe(true);
    expect(shouldReconnectBridge("BRIDGE_TIMEOUT")).toBe(true);
    expect(shouldReconnectBridge("BRIDGE_WRITE_FAILED")).toBe(true);
    expect(shouldReconnectBridge(undefined)).toBe(false);
    expect(shouldReconnectBridge("MODEL_ERROR")).toBe(false);
  });
});
