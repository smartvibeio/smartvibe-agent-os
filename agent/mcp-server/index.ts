/**
 * SmartVibe 交易分身 · 本地模型上下文协议（MCP）服务
 * 阶段2：核心能力工具
 */
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  获取Agent说明,
  列出冷启动情景,
  创建交易分身,
  获取行情上下文,
  模拟分身反应,
  记录决策记忆,
  开仓前行为提醒,
  轻量模拟开仓,
  探测币安连接,
} from "../../src/agent/coreTools.js";
import type { DecisionPattern } from "../../src/domain/types.js";

const MODE = process.env.SMARTVIBE_MODE ?? "fixtures";

const 决策代码 = z.enum([
  "chase_entry",
  "enter_small",
  "hold",
  "observe_wait",
  "trim",
  "reduce_risk",
  "exit_bias",
]);

const server = new McpServer({
  name: "smartvibe-trading-coach",
  version: "0.3.0",
});

function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

server.registerTool(
  "get_agent_info",
  {
    title: "获取 Agent 说明",
    description:
      "获取 SmartVibe 交易陪练的中文说明、能力边界与币安 Agent OS 接入说明。",
  },
  async () => textResult(获取Agent说明(MODE)),
);

server.registerTool(
  "probe_binance_agent_os",
  {
    title: "探测币安 Agent OS",
    description:
      "探测币安官方 MCP 连通性与 OAuth 要求。未授权时返回「需要授权」属正常。",
  },
  async () => textResult(await 探测币安连接()),
);

server.registerTool(
  "list_cold_start_scenarios",
  {
    title: "冷启动情景列表",
    description:
      "获取冷启动情景列表（中文）。用于快速认识用户习惯，不是人格测试。",
  },
  async () => textResult(列出冷启动情景()),
);

server.registerTool(
  "create_trading_twin",
  {
    title: "创建交易分身",
    description:
      "根据冷启动答题结果创建初始交易分身。答案格式：情景编号 + 选项编号。",
    inputSchema: {
      显示名称: z.string().optional().describe("分身显示名，默认「我的交易分身」"),
      答案: z
        .array(
          z.object({
            情景编号: z.string(),
            选项编号: z.string(),
          }),
        )
        .min(8)
        .describe("完成全部建档题的选择（当前为 8 道）"),
    },
  },
  async (args) => textResult(创建交易分身(args)),
);

server.registerTool(
  "get_market_context",
  {
    title: "获取行情上下文",
    description:
      "获取行情刺激上下文。阶段2为本地样本；可选样本：rapid_pump / sharp_drop / false_breakout / same_market。",
    inputSchema: {
      样本编号: z
        .string()
        .optional()
        .describe("rapid_pump | sharp_drop | false_breakout | same_market"),
      交易对: z.string().optional().describe("如 BTCUSDT"),
    },
  },
  async (args) => {
    const pack = 获取行情上下文(args);
    const { _market: _, ...publicPack } = pack;
    return textResult(publicPack);
  },
);

server.registerTool(
  "simulate_twin_response",
  {
    title: "模拟分身反应",
    description:
      "在给定行情样本下，模拟「昨天的自己」更可能如何处理。不是买卖建议。",
    inputSchema: {
      分身编号: z.string().optional().describe("默认使用当前活跃分身"),
      样本编号: z.string().optional(),
    },
  },
  async (args) => textResult(模拟分身反应(args)),
);

server.registerTool(
  "record_decision_memory",
  {
    title: "记录决策记忆",
    description:
      "记录分身倾向、用户真实选择，以及可选的弱点/盈亏原因，完善对昨天自己的刻画。",
    inputSchema: {
      分身编号: z.string().optional(),
      样本编号: z.string().optional(),
      分身倾向代码: 决策代码,
      用户真实选择代码: 决策代码,
      暴露的弱点: z.string().optional(),
      盈亏原因备注: z.string().optional(),
    },
  },
  async (args) =>
    textResult(
      记录决策记忆({
        ...args,
        分身倾向代码: args.分身倾向代码 as DecisionPattern,
        用户真实选择代码: args.用户真实选择代码 as DecisionPattern,
      }),
    ),
);

server.registerTool(
  "pre_trade_coach",
  {
    title: "开仓前行为提醒",
    description:
      "用户准备开仓时，对照「昨天的自己」给出行为镜像提醒。不是买卖指令。",
    inputSchema: {
      分身编号: z.string().optional(),
      样本编号: z.string().optional(),
      交易对: z.string().optional(),
      用户准备怎么做: z
        .string()
        .describe("用自然语言描述，如：我想追多、我先小仓、我再等等"),
    },
  },
  async (args) => textResult(开仓前行为提醒(args)),
);

server.registerTool(
  "simulate_open_lite",
  {
    title: "轻量模拟开仓",
    description:
      "按旧习惯做轻量模拟开仓路径推演，用于暴露问题。不是完整回测，不是预测。",
    inputSchema: {
      分身编号: z.string().optional(),
      交易对: z.string().optional(),
      方向: z.enum(["做多试探", "观望"]).optional(),
    },
  },
  async (args) => textResult(轻量模拟开仓(args)),
);

async function main() {
  process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("SmartVibe 协议服务启动失败:", err);
  process.exit(1);
});
