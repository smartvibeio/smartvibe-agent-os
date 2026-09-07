import { beforeEach, describe, expect, it, vi } from "vitest";
import { 拉取币安K线 } from "../src/agent/binancePublic.js";
const mocks = vi.hoisted(() => ({ mcp: vi.fn(), http: vi.fn() }));
vi.mock("../src/agent/binanceMcp.js", () => ({
  尝试调用币安Mcp工具: mocks.mcp,
}));
vi.mock("../src/agent/binanceHttp.js", () => ({ binanceFetch: mocks.http }));
const rows = Array.from({ length: 80 }, (_, i) => [
  1700000000000 + i * 3600000,
  "100",
  "102",
  "99",
  String(100 + i / 100),
  "10",
]);
beforeEach(() => {
  mocks.mcp.mockReset();
  mocks.http.mockReset();
  mocks.http.mockResolvedValue({ ok: true, json: async () => rows });
});
describe("行情来源选择", () => {
  it("官方 MCP 成功时不访问公开 API", async () => {
    mocks.mcp.mockResolvedValue(rows);
    const pack = await 拉取币安K线({ 根数: 80 });
    expect(pack.来源).toContain("MCP");
    expect(pack.K线).toHaveLength(80);
    expect(mocks.http).not.toHaveBeenCalled();
  });
  it("官方超时或拒绝授权后使用同一现货市场的公开行情", async () => {
    mocks.mcp.mockRejectedValue(new Error("timeout"));
    const pack = await 拉取币安K线({ 根数: 80 });
    expect(pack.连接状态).toContain("回退");
    expect(pack.来源).toContain("现货");
    expect(mocks.http).toHaveBeenCalledOnce();
  });
  it("官方返回损坏的数据时也回退，不能把错误包标为已连接", async () => {
    mocks.mcp.mockResolvedValue({ error: "denied" });
    const pack = await 拉取币安K线({ 根数: 80 });
    expect(pack.来源).toContain("公开 API");
  });
});
