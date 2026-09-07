import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  列出冷启动情景,
  创建交易分身,
  模拟分身反应,
  开仓前行为提醒,
  记录决策记忆,
  轻量模拟开仓,
} from "../src/agent/coreTools.js";

let testDir: string;
let previousDir: string | undefined;
beforeEach(() => {
  previousDir = process.env.SMARTVIBE_DATA_DIR;
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "smartvibe-core-test-"));
  process.env.SMARTVIBE_DATA_DIR = testDir;
});

afterEach(() => {
  if (previousDir) process.env.SMARTVIBE_DATA_DIR = previousDir;
  else delete process.env.SMARTVIBE_DATA_DIR;
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("阶段2 · 核心能力工具", () => {
  it("完整主链路：分身→模拟→提醒→记忆→轻量模拟", () => {
    const list = 列出冷启动情景();
    const twin = 创建交易分身({
      显示名称: "测试分身",
      答案: list.情景列表.map((s) => ({
        情景编号: s.情景编号,
        选项编号: s.选项[0].选项编号,
      })),
    });
    expect(twin.版本).toBe(0);

    const sim = 模拟分身反应({
      分身编号: twin.分身编号,
      样本编号: "rapid_pump",
    });
    expect(sim.分身反应.决策倾向).toBeTruthy();

    const coach = 开仓前行为提醒({
      分身编号: twin.分身编号,
      用户准备怎么做: "我想追涨开多",
      样本编号: "rapid_pump",
    });
    expect(coach.提醒).toContain("不是");
    expect(coach.审视问题.length).toBeGreaterThan(0);

    const mem = 记录决策记忆({
      分身编号: twin.分身编号,
      样本编号: "rapid_pump",
      分身倾向代码: sim.分身反应.倾向代码 as never,
      用户真实选择代码: "chase_entry",
      暴露的弱点: "踏空恐惧",
    });
    expect(mem.分身版本变化.之后).toBeGreaterThan(mem.分身版本变化.之前);

    const lite = 轻量模拟开仓({ 分身编号: twin.分身编号 });
    expect(lite.模拟路径.length).toBeGreaterThanOrEqual(3);
    expect(lite.如何用于提高).toContain("镜子");
  });
});
