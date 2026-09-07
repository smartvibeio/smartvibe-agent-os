import { NextResponse } from "next/server";
import { replayState, createReplay, advanceReplay } from "@smartvibe/agent/twinReplay.js";
import { onboardingState, saveOnboarding, completeOnboarding, talkToProfile } from "@smartvibe/agent/onboarding.js";
import { ZodError } from "zod";
import {
  askCoach,
  coachingState,
  confirmCoaching,
  startExercise,
  submitExercise,
  preTradeCoach,
} from "@smartvibe/agent/coaching.js";
import {
  loadPracticeMarket,
  practiceState,
  syncPracticeQuote,
  submitPracticeOrder,
  finishPracticeOrder,
  reviewPracticeOrder,
  rememberPracticeOrder,
  importAccountHistory,
} from "@smartvibe/agent/practice.js";
import {
  获取Agent说明,
  列出冷启动情景,
  创建交易分身,
  获取实盘图表包,
  模拟分身反应,
  开仓前行为提醒,
  点评模拟开仓,
  记录决策记忆,
  探测币安连接,
} from "@smartvibe/agent/coreTools.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  动作: string;
  参数?: Record<string, unknown>;
};

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      (origin && origin !== url.origin)
    ) {
      return NextResponse.json(
        { 错误: "陪练账户接口仅允许本机同源访问" },
        { status: 403 },
      );
    }
    const body = (await request.json()) as Body;
    const 参数 = body.参数 ?? {};

    switch (body.动作) {
      case "分身演示状态":
        return NextResponse.json(replayState(String(参数.分身编号), typeof 参数.演示编号 === "string" ? 参数.演示编号 : undefined));
      case "创建分身演示":
        return NextResponse.json(await createReplay(参数));
      case "推进分身演示":
        return NextResponse.json(await advanceReplay(参数));
      case "建档对话":
        return NextResponse.json(await talkToProfile(参数));
      case "建档补充状态":
        return NextResponse.json(onboardingState(String(参数.分身编号)));
      case "保存建档补充":
        return NextResponse.json(saveOnboarding(参数));
      case "完成建档":
        return NextResponse.json(await completeOnboarding(参数));
      case "私教状态":
        return NextResponse.json(coachingState(String(参数.分身编号)));
      case "AI私教":
        return NextResponse.json(await askCoach(参数));
      case "确认练习约定":
        return NextResponse.json(
          confirmCoaching(String(参数.分身编号), String(参数.编号)),
        );
      case "开始历史训练":
        return NextResponse.json(
          await startExercise(
            String(参数.分身编号),
            String(参数.交易对),
            typeof 参数.周期 === "string" ? 参数.周期 : "1h",
            参数.市场 === "U本位合约" ? "U本位合约" : "现货",
          ),
        );
      case "提交历史训练":
        return NextResponse.json(submitExercise(参数));
      case "练盘状态":
        return NextResponse.json(practiceState(String(参数.分身编号)));
      case "同步练盘行情":
        return NextResponse.json(
          await syncPracticeQuote(
            String(参数.分身编号),
            String(参数.行情编号),
          ),
        );
      case "提交模拟单":
        return NextResponse.json(submitPracticeOrder(参数));
      case "开仓前私教":
        return NextResponse.json(await preTradeCoach(参数));
      case "结束模拟单":
        return NextResponse.json(
          await finishPracticeOrder(String(参数.分身编号), String(参数.编号)),
        );
      case "练盘点评":
        return NextResponse.json(
          reviewPracticeOrder(String(参数.分身编号), String(参数.编号)),
        );
      case "练盘记忆":
        return NextResponse.json(
          rememberPracticeOrder(String(参数.分身编号), String(参数.编号)),
        );
      case "账户校准":
        return NextResponse.json(
          await importAccountHistory(
            String(参数.分身编号),
            String(参数.交易对),
          ),
        );
      case "说明":
        return NextResponse.json(获取Agent说明("coach_web"));
      case "建档列表":
        return NextResponse.json(列出冷启动情景(Array.isArray(参数.上次题目) ? 参数.上次题目.filter((id: unknown) => typeof id === "string").slice(0, 16) : []));
      case "创建分身":
        return NextResponse.json(
          创建交易分身({
            题库版本: typeof 参数.题库版本 === "string" ? 参数.题库版本 : undefined,
            显示名称: (参数.显示名称 as string) || "我的交易分身",
            答案: 参数.答案 as Array<{ 情景编号: string; 选项编号: string }>,
          }),
        );
      case "行情图":
        return NextResponse.json(
          await loadPracticeMarket(
            {
              交易对: 参数.交易对 as string | undefined,
              市场: 参数.市场 as "现货" | "U本位合约" | undefined,
              周期: 参数.周期 as string | undefined,
              根数: 参数.根数 as number | undefined,
            },
            参数.分身编号 as string | undefined,
          ),
        );
      case "币安状态":
      case "binance_status":
        try {
          return NextResponse.json(await 探测币安连接());
        } catch (err) {
          return NextResponse.json({
            端点: "https://agent.binance.com/mcp/agentic",
            初始化: "失败",
            初始化详情: err instanceof Error ? err.message : String(err),
            说明: "探测异常。请在本机运行 npm run agent:binance-probe，或检查代理后重试。",
          });
        }
      case "分身反应":
        return NextResponse.json(
          模拟分身反应({
            分身编号: 参数.分身编号 as string | undefined,
            样本编号: 参数.样本编号 as string | undefined,
          }),
        );
      case "点评下单":
        return NextResponse.json(
          点评模拟开仓({
            分身编号: 参数.分身编号 as string | undefined,
            交易对: 参数.交易对 as string | undefined,
            方向: 参数.方向 as "做多" | "做空" | "观望",
            订单类型: 参数.订单类型 as "市价" | "限价",
            仓位比例: 参数.仓位比例 as number | undefined,
            用户理由: 参数.用户理由 as string | undefined,
            涨跌百分比: 参数.涨跌百分比 as number | undefined,
            RSI: 参数.RSI as number | null | undefined,
          }),
        );
      case "开仓前提醒":
        return NextResponse.json(
          开仓前行为提醒({
            分身编号: 参数.分身编号 as string | undefined,
            样本编号: 参数.样本编号 as string | undefined,
            交易对: 参数.交易对 as string | undefined,
            用户准备怎么做: String(参数.用户准备怎么做 ?? ""),
          }),
        );
      case "记录记忆":
        return NextResponse.json(
          记录决策记忆({
            分身编号: 参数.分身编号 as string | undefined,
            样本编号: 参数.样本编号 as string | undefined,
            分身倾向代码: 参数.分身倾向代码 as never,
            用户真实选择代码: 参数.用户真实选择代码 as never,
            暴露的弱点: 参数.暴露的弱点 as string | undefined,
            盈亏原因备注: 参数.盈亏原因备注 as string | undefined,
          }),
        );
      default:
        return NextResponse.json({ 错误: "未知动作" }, { status: 400 });
    }
  } catch (err) {
    const message =
      err instanceof ZodError
        ? `请检查${err.issues.map(issue => `${issue.path.join(".") || "输入内容"}（${issue.message}）`).join("、")}`
        : err instanceof Error
          ? err.message
          : "请求失败";
    return NextResponse.json({ 错误: message }, { status: 400 });
  }
}
