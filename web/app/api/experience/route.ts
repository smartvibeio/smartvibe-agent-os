import { NextResponse } from "next/server";
import {
  获取Agent说明,
  列出冷启动情景,
  创建交易分身,
  获取行情上下文,
  模拟分身反应,
  开仓前行为提醒,
  记录决策记忆,
  轻量模拟开仓,
} from "@smartvibe/agent/coreTools.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  动作: string;
  参数?: Record<string, unknown>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const 参数 = body.参数 ?? {};

    switch (body.动作) {
      case "说明":
        return NextResponse.json(获取Agent说明("fixtures"));
      case "冷启动列表":
        return NextResponse.json(列出冷启动情景());
      case "创建分身":
        return NextResponse.json(
          创建交易分身({
            显示名称: (参数.显示名称 as string) || "我的交易分身",
            答案: 参数.答案 as Array<{ 情景编号: string; 选项编号: string }>,
          }),
        );
      case "行情":
        return NextResponse.json(
          (() => {
            const pack = 获取行情上下文({
              样本编号: 参数.样本编号 as string | undefined,
              交易对: 参数.交易对 as string | undefined,
            });
            const { _market: _, ...rest } = pack;
            return rest;
          })(),
        );
      case "模拟反应":
        return NextResponse.json(
          模拟分身反应({
            分身编号: 参数.分身编号 as string | undefined,
            样本编号: 参数.样本编号 as string | undefined,
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
      case "轻量模拟":
        return NextResponse.json(
          轻量模拟开仓({
            分身编号: 参数.分身编号 as string | undefined,
            交易对: 参数.交易对 as string | undefined,
          }),
        );
      default:
        return NextResponse.json({ 错误: "未知动作" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "请求失败";
    return NextResponse.json({ 错误: message }, { status: 400 });
  }
}
