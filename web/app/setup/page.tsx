'use client';
import { useState } from 'react';
export default function Setup() {
  const [message, setMessage] = useState('请先登录 Codex，再授权币安。登录状态与模型可用性分别验证。');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [userCode, setUserCode] = useState('');
  async function run(action: string) {
    setBusy(true); setUrl(''); setUserCode('');
    try {
      const response = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.url) {
        setUrl(data.url);
        setUserCode(data.userCode ?? '');
        setMessage(data.loginMode === 'deviceCode'
          ? '请打开下面的 OpenAI 官方验证页，登录后输入这里显示的一次性代码。保持陪练服务运行，完成后返回检查状态。'
          : action === 'codex'
            ? '请打开下面的OpenAI官方页面完成Codex登录，并保持陪练服务运行。完成后返回检查状态。'
            : '请现在打开下面的币安官方授权链接，并保持陪练服务运行。等待窗口为10分钟；若旧回调页失败，请重新获取链接，不要刷新旧回调地址。完成后返回检查状态。');
      }
      else setMessage(`Codex：${data.codex ? '已登录（尚不代表模型请求成功）' : '未登录'}；币安：${data.binanceConnected ? `已连接，可用工具 ${data.binanceTools?.length ?? 0} 个` : data.binanceRuntime === 'authenticationRequired' ? '授权已失效，请重新点击“授权币安”' : `尚未连接（${data.binanceRuntime ?? '状态未知'}），请授权或重新检查`}。`);
    } catch(e) { setMessage(e instanceof Error ? e.message : '连接失败'); }
    finally { setBusy(false); }
  }
  return <main style={{maxWidth:760,margin:'50px auto',padding:24,lineHeight:1.8}}>
    <h1>首次连接交易陪练</h1>
    <p>这是本机模拟交易陪练。Codex 登录及币安授权保存在此项目的独立配置目录，不复制其他客户端凭证。</p>
    <p>币安权限由你在官方页面确认；只选择行情与账户只读权限，不开通交易或划转。本产品仅调用 K 线、账户和成交查询。</p>
    <p><button disabled={busy} onClick={()=>run('codex')}>1. 登录 Codex</button>　<button disabled={busy} onClick={()=>run('binance')}>2. 授权币安</button>　<button disabled={busy} onClick={()=>run('status')}>检查连接状态</button></p>
    <details style={{margin:'8px 0 14px'}}>
      <summary style={{cursor:'pointer',color:'#aeb9c8'}}>普通登录无法完成？查看官方备用方式</summary>
      <p style={{fontSize:13,color:'#aeb9c8'}}>设备代码是Codex提供的备用登录方式。OpenAI验证页会提示防范设备代码钓鱼；只有当你刚刚在本机此页面主动点击下面按钮时，才应输入这里生成的代码。不要使用别人通过聊天、邮件或其他网站发来的代码。</p>
      <button disabled={busy} onClick={()=>run('codexDevice')}>使用设备代码备用登录</button>
    </details>
    <p role="status">{busy ? '正在连接，请稍候…' : message}</p>
    {url && <div style={{padding:'14px 16px',border:'1px solid #f0b90b',borderRadius:8,background:'#17150d'}}>
      {userCode && <p style={{margin:'0 0 10px'}}>一次性登录代码： <strong style={{fontSize:24,letterSpacing:'0.14em',color:'#f0b90b'}}>{userCode}</strong></p>}
      <a href={url} target="_blank" rel="noopener noreferrer">打开官方登录 / 授权页面</a>
      {userCode && <p style={{margin:'8px 0 0',fontSize:13,color:'#aeb9c8'}}>只在 OpenAI 官方页面输入此代码；代码过期后请重新点击“使用设备代码备用登录”。</p>}
    </div>}
    <h2>数据如何使用</h2>
    <p>档案、模拟单与追问保存在项目 data 文件夹。点击 AI 私教时，相关建档回答、模拟记录、用户补充和已读取的账户证据会发给云端模型，不是完全离线。不要填写密码、密钥或无关隐私。</p>
    <p>未授权时可能使用币安公开行情，页面会标明来源；这不代表账户已连接。模型失败会显示错误，不会用规则结果冒充 AI。登录成功也不保证额度或网络可用。</p>
    <p><a href="/coach">进入陪练 → 完成八题建档 → 提交模拟决定 → 与 AI 私教继续追问</a></p>
  </main>;
}
