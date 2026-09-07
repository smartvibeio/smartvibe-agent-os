"use client";

import { useMemo, useState } from "react";

type 情景 = {
  情景编号: string;
  标题?: string;
  问题: string;
  市场摘要: string;
  选项: Array<{ 选项编号: string; 文案: string }>;
};

const 步骤名 = [
  "认识你",
  "行情来了",
  "分身怎么看",
  "你要开仓时",
  "记下这一次",
  "模拟推演",
] as const;

async function 调用(动作: string, 参数?: Record<string, unknown>) {
  const res = await fetch("/api/experience", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 动作, 参数 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.错误 || "请求失败");
  return data;
}

export default function 体验页() {
  const [步骤, set步骤] = useState(0);
  const [忙碌, set忙碌] = useState(false);
  const [错误, set错误] = useState<string | null>(null);

  const [情景列表, set情景列表] = useState<情景[]>([]);
  const [题号, set题号] = useState(0);
  const [答案, set答案] = useState<Array<{ 情景编号: string; 选项编号: string }>>(
    [],
  );
  const [分身, set分身] = useState<Record<string, unknown> | null>(null);
  const [行情, set行情] = useState<Record<string, unknown> | null>(null);
  const [反应, set反应] = useState<Record<string, unknown> | null>(null);
  const [提醒, set提醒] = useState<Record<string, unknown> | null>(null);
  const [记忆, set记忆] = useState<Record<string, unknown> | null>(null);
  const [模拟, set模拟] = useState<Record<string, unknown> | null>(null);
  const [准备做什么, set准备做什么] = useState("我想直接追进去开多");

  const 当前题 = 情景列表[题号];

  const 跑 = async (fn: () => Promise<void>) => {
    set忙碌(true);
    set错误(null);
    try {
      await fn();
    } catch (e) {
      set错误(e instanceof Error ? e.message : "出错了");
    } finally {
      set忙碌(false);
    }
  };

  const 开始认识 = () =>
    跑(async () => {
      const data = await 调用("冷启动列表");
      set情景列表(data.情景列表 || []);
      set题号(0);
      set答案([]);
      set步骤(0);
    });

  const 选题 = (选项编号: string) =>
    跑(async () => {
      if (!当前题) return;
      const next答案 = [
        ...答案,
        { 情景编号: 当前题.情景编号, 选项编号 },
      ];
      set答案(next答案);
      if (题号 + 1 < 情景列表.length) {
        set题号(题号 + 1);
        return;
      }
      const twin = await 调用("创建分身", {
        显示名称: "我的交易分身",
        答案: next答案,
      });
      set分身(twin);
      const m = await 调用("行情", { 样本编号: "rapid_pump" });
      set行情(m);
      set步骤(1);
    });

  const 看分身反应 = () =>
    跑(async () => {
      const r = await 调用("模拟反应", {
        分身编号: 分身?.分身编号,
        样本编号: "rapid_pump",
      });
      set反应(r);
      set步骤(2);
    });

  const 看开仓提醒 = () =>
    跑(async () => {
      const c = await 调用("开仓前提醒", {
        分身编号: 分身?.分身编号,
        样本编号: "rapid_pump",
        用户准备怎么做: 准备做什么,
      });
      set提醒(c);
      set步骤(3);
    });

  const 记下 = () =>
    跑(async () => {
      const 倾向 = (反应?.分身反应 as { 倾向代码?: string } | undefined)
        ?.倾向代码;
      const m = await 调用("记录记忆", {
        分身编号: 分身?.分身编号,
        样本编号: "rapid_pump",
        分身倾向代码: 倾向 || "observe_wait",
        用户真实选择代码: "chase_entry",
        暴露的弱点: "害怕踏空而追入",
        盈亏原因备注: "历史上类似追入后容易回撤",
      });
      set记忆(m);
      set步骤(4);
    });

  const 看模拟 = () =>
    跑(async () => {
      const s = await 调用("轻量模拟", {
        分身编号: 分身?.分身编号,
        交易对: "BTCUSDT",
      });
      set模拟(s);
      set步骤(5);
    });

  const 进度 = useMemo(() => 步骤名.map((名, i) => ({ 名, 亮: i <= 步骤 })), [步骤]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">
            <span>SmartVibe</span> 交易分身 · 体验台
          </div>
          <p className="tagline">
            用「昨天的自己」做镜子。不荐股、不自动下单。只需点按钮体验。
          </p>
        </div>
        <div className="badge">点选验证 · 无需命令行</div>
      </header>

      <div className="steps">
        {进度.map((p, i) => (
          <span
            key={p.名}
            className={
              i === 步骤 ? "step-pill active" : i < 步骤 ? "step-pill done" : "step-pill"
            }
          >
            {i + 1}.{p.名}
          </span>
        ))}
      </div>

      {步骤 === 0 && 情景列表.length === 0 ? (
        <section className="card">
          <h1 className="h1">先快速认识你的交易习惯</h1>
          <p className="muted">
            只问 3 个市场情景题，用来创建「初始交易分身」。这是起点，不是人格报告。
          </p>
          <div className="actions">
            <button className="btn btn-primary" disabled={忙碌} onClick={开始认识}>
              {忙碌 ? "准备中…" : "开始"}
            </button>
          </div>
        </section>
      ) : null}

      {步骤 === 0 && 当前题 ? (
        <section className="card">
          <div className="panel-title">
            认识你 · 第 {题号 + 1} / {情景列表.length} 题
          </div>
          <h1 className="h1">{当前题.标题 || "情景题"}</h1>
          <p className="muted">{当前题.市场摘要}</p>
          <h2 className="h2">{当前题.问题}</h2>
          {当前题.选项.map((o) => (
            <button
              key={o.选项编号}
              className="option"
              disabled={忙碌}
              onClick={() => 选题(o.选项编号)}
            >
              {o.文案}
            </button>
          ))}
        </section>
      ) : null}

      {步骤 >= 1 && 分身 ? (
        <section className="card">
          <div className="panel-title">你的交易分身已建立</div>
          <div className="kv">
            <div className="k">名称</div>
            <div>{String(分身.名称)}</div>
            <div className="k">版本</div>
            <div>第 {String(分身.版本)} 版（初始）</div>
          </div>
        </section>
      ) : null}

      {步骤 === 1 && 行情 ? (
        <section className="card" style={{ marginTop: 12 }}>
          <div className="panel-title">市场出现变化</div>
          <h1 className="h1">{String((行情.行情 as { 中文简述?: string })?.中文简述)}</h1>
          <p className="muted">
            接下来让分身回答：按你过去的习惯，这时更可能怎么处理？
          </p>
          <div className="actions">
            <button className="btn btn-primary" disabled={忙碌} onClick={看分身反应}>
              看分身怎么说
            </button>
          </div>
        </section>
      ) : null}

      {步骤 === 2 && 反应 ? (
        <section className="card">
          <div className="panel-title">分身反应（不是买卖建议）</div>
          <h1 className="h1">
            {String((反应.分身反应 as { 决策倾向?: string })?.决策倾向)}
          </h1>
          <p className="muted">
            {String((反应.分身反应 as { 理由?: string })?.理由)}
          </p>
          <p className="muted" style={{ marginTop: 12 }}>
            假设你现在准备实盘动手，先写一下你打算怎么做，再看提醒：
          </p>
          <input
            value={准备做什么}
            onChange={(e) => set准备做什么(e.target.value)}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "10px 12px",
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text)",
            }}
          />
          <div className="actions">
            <button className="btn btn-primary" disabled={忙碌} onClick={看开仓提醒}>
              看开仓前提醒
            </button>
          </div>
        </section>
      ) : null}

      {步骤 === 3 && 提醒 ? (
        <section className="card">
          <div className="panel-title">开仓前行为提醒</div>
          <p className="muted">{String(提醒.提醒)}</p>
          <ul className="muted">
            {(提醒.审视问题 as string[] | undefined)?.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <div className="actions">
            <button className="btn btn-primary" disabled={忙碌} onClick={记下}>
              记下这次真实选择
            </button>
          </div>
        </section>
      ) : null}

      {步骤 === 4 && 记忆 ? (
        <section className="card">
          <div className="panel-title">决策记忆已写入</div>
          <p className="muted">{String(记忆.说明)}</p>
          <div className="kv">
            <div className="k">分身版本</div>
            <div>
              {String((记忆.分身版本变化 as { 之前?: number })?.之前)} →{" "}
              {String((记忆.分身版本变化 as { 之后?: number })?.之后)}
            </div>
          </div>
          <div className="actions">
            <button className="btn btn-primary" disabled={忙碌} onClick={看模拟}>
              看轻量模拟推演
            </button>
          </div>
        </section>
      ) : null}

      {步骤 === 5 && 模拟 ? (
        <section className="card">
          <div className="panel-title">轻量模拟：按旧习惯开可能怎样</div>
          <p className="muted">{String(模拟.说明)}</p>
          <div className="muted" style={{ marginTop: 10 }}>
            {(模拟.模拟路径 as Array<{ 时刻: string; 价格变化百分比: number; 说明: string }>)?.map(
              (p) => (
                <div key={p.时刻} style={{ marginBottom: 6 }}>
                  <strong>{p.时刻}</strong>：{p.价格变化百分比}% · {p.说明}
                </div>
              ),
            )}
          </div>
          <h2 className="h2" style={{ marginTop: 14 }}>
            暴露的问题
          </h2>
          <ul className="muted">
            {(模拟.暴露问题提示 as string[] | undefined)?.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="muted">{String(模拟.如何用于提高)}</p>
          <div className="hero-line" style={{ fontSize: 20, marginTop: 16 }}>
            分身是昨天的自己。
            <br />
            <em>用来审视和提高，不是用来复制局限。</em>
          </div>
          <div className="actions">
            <button
              className="btn btn-ghost"
              onClick={() => {
                set步骤(0);
                set情景列表([]);
                set分身(null);
                set行情(null);
                set反应(null);
                set提醒(null);
                set记忆(null);
                set模拟(null);
              }}
            >
              再走一遍
            </button>
          </div>
        </section>
      ) : null}

      {错误 ? <p className="error">{错误}</p> : null}
    </main>
  );
}
