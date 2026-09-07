/**
 * 阶段2 冒烟：创建分身 → 行情 → 模拟 → 提醒 → 记忆 → 轻量模拟
 */
import fs from "node:fs";
import path from "node:path";
import {
  列出冷启动情景,
  创建交易分身,
  获取行情上下文,
  模拟分身反应,
  开仓前行为提醒,
  记录决策记忆,
  轻量模拟开仓,
} from "../src/agent/coreTools.js";

function resetStore() {
  const p = path.resolve(process.cwd(), "data", "agent-runtime-store.json");
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function main() {
  resetStore();
  const list = 列出冷启动情景();
  console.log(`冷启动情景: ${list.情景数量}`);

  const created = 创建交易分身({
    显示名称: "演示分身",
    答案: list.情景列表.map((s) => ({
      情景编号: s.情景编号,
      选项编号: s.选项[s.选项.length - 1].选项编号,
    })),
  });
  console.log(`已创建分身: ${created.名称} v${created.版本}`);

  const market = 获取行情上下文({ 样本编号: "rapid_pump" });
  console.log(`行情: ${market.行情.中文简述}`);

  const sim = 模拟分身反应({
    分身编号: created.分身编号,
    样本编号: "rapid_pump",
  });
  console.log(`分身反应: ${sim.分身反应.决策倾向}`);

  const coach = 开仓前行为提醒({
    分身编号: created.分身编号,
    样本编号: "rapid_pump",
    用户准备怎么做: "我想直接追进去开多",
  });
  console.log(`开仓前提醒: ${coach.提醒.slice(0, 60)}...`);

  const mem = 记录决策记忆({
    分身编号: created.分身编号,
    样本编号: "rapid_pump",
    分身倾向代码: sim.分身反应.倾向代码 as never,
    用户真实选择代码: "chase_entry",
    暴露的弱点: "害怕踏空而加速追入",
    盈亏原因备注: "历史上类似追入后常遇回撤",
  });
  console.log(
    `记忆已写: 版本 ${mem.分身版本变化.之前} → ${mem.分身版本变化.之后}`,
  );

  const lite = 轻量模拟开仓({
    分身编号: created.分身编号,
    交易对: "BTCUSDT",
  });
  console.log(`轻量模拟路径点数: ${lite.模拟路径.length}`);
  console.log("");
  console.log("冒烟通过：阶段2 核心能力主链路正常。");
}

main();
