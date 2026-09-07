import { beginConnectionLogin, connectionStatus } from '@smartvibe/agent/codexBridge.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || request.headers.get('origin') !== url.origin)
    return Response.json({ error: '仅允许本机同源操作' }, { status: 403 });
  try {
    const { action } = await request.json();
    if (action === 'status') return Response.json(await connectionStatus());
    if (action === 'codex' || action === 'codexDevice' || action === 'binance') return Response.json(await beginConnectionLogin(action));
    return Response.json({ error: '未知操作' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : '连接失败，请重试' }, { status: 400 });
  }
}
