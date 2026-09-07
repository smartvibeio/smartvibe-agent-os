---
name: smartvibe-trading-doppelganger
description: 帮助安装、启动和使用 SmartVibe 交易陪练网页；用于建档、模拟练盘、私教追问和复盘的使用引导。
metadata:
  version: "0.4.0"
  language: zh-CN
---

# SmartVibe 交易陪练

产品为数字分身＋模拟交易＋AI 私教。分身记录并审视过去的习惯，用证据修正，不持续复制错误。保留建档校准、盘面解读、订单追问、专项训练、阶段复盘五个位置。

## 使用流程

1. 先找到用户解压的完整项目并阅读根目录 README.md；仅安装这个技能无法获得网页及其依赖。
2. Windows x64首次使用打开根目录「首次安装.cmd」；macOS Apple Silicon或Intel打开「首次安装.command」。依赖完成后打开连接页，由用户本人登录Codex、选择币安权限。不读取、复制凭证，不自动同意授权。
3. 后续在Windows打开「启动交易陪练.cmd」，在Mac打开「启动交易陪练.command」。它检查服务后打开http://localhost:3001/coach；不要把已有网页地址当作服务正在运行的证据。
4. 引导用户在网页完成八题建档，自己提交模拟决定，再查看分身和 AI 私教，回答追问，确认练习约定并继续训练。模拟计算、记录和训练状态复用产品，不在聊天中另建账本或冒充已保存。
5. 连接失败去网页「连接设置与隐私说明」；模型失败保留错误，不以规则输出替代 AI 点评。公开行情不代表币安账户授权成功。

## 工具边界

网页是完整体验主入口，不要求安装本地 MCP。可选本地 MCP 仍是早期样本工具，不能替代网页订单与训练。
调用前先读取实际可用工具清单。源码注册的工具为 get_agent_info、probe_binance_agent_os、list_cold_start_scenarios、create_trading_twin、get_market_context、simulate_twin_response、record_decision_memory、pre_trade_coach、simulate_open_lite。
其中 get_market_context、分身样本反应与轻量模拟使用样本和规则，不能称为真实连接或 AI 私教。网页私教功能没有对应的本地 MCP 注册工具，应引导网页操作。

## 边界与表达

默认中文，用鼠标操作步骤解释。币安提供授权范围内事实，模型负责证据理解与追问，产品负责资金风险计算和保存。不做自动实盘，不给买卖信号，不承诺收益，不用模拟结果预测未来。账户范围不等于主账户完整成交史。历史训练提交前不得泄露后续 K 线。
点击 AI 私教会把相关证据发送云端；本地保存不是完全离线。发布或分享只使用根说明中的白名单打包入口，不分享 data、.runtime、凭证、私人配置或开发记录。
安装通过、测试通过、登录成功与完整体验通过是不同结论。未经实际验证不承诺其他平台或客户端兼容。
