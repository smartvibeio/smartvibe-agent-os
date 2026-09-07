import { connectionStatus } from '../src/agent/codexBridge.js';
import { 探测币安连接 } from '../src/agent/coreTools.js';
try {
  const result = await connectionStatus();
  const actual = result.binanceConnected ? await 探测币安连接() : null;
  const klineVerified = actual?.初始化 === '已连接';
  console.log(JSON.stringify({ Node: process.version, Codex已登录: result.codex, 币安授权状态: result.binance, 币安运行状态: result.binanceRuntime, 币安可用工具数: result.binanceTools.length, 现货K线实际调用: klineVerified ? '成功' : actual?.初始化详情 ?? '未连接，未调用', 注意: '尚未验证模型请求和真实账户读取' }, null, 2));
  process.exit(result.codex && result.binanceConnected && klineVerified ? 0 : 2);
} catch (e) {
  console.error(e instanceof Error ? e.message : '连接检查失败');
  process.exit(1);
}
