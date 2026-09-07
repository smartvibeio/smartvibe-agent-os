import { describe, expect, it } from "vitest";
import { parseMacSystemProxy } from "../src/agent/binanceHttp.js";

describe("跨平台网络设置", () => {
  it("读取macOS HTTPS系统代理", () => {
    expect(parseMacSystemProxy(`
<dictionary> {
  HTTPEnable : 0
  HTTPPort : 8080
  HTTPProxy : old.local
  HTTPSEnable : 1
  HTTPSPort : 7890
  HTTPSProxy : 127.0.0.1
}`)).toBe("http://127.0.0.1:7890");
  });

  it("没有启用代理时保持直连", () => {
    expect(parseMacSystemProxy("HTTPEnable : 0\nHTTPSEnable : 0")).toBeNull();
  });
});
