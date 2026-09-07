// Explicit source allowlist: never package a developer's workspace wholesale.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'release', `smartvibe-${Date.now()}`);
const files = ['README.md', '.gitignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.vitest.json', 'vitest.config.ts', '首次安装.cmd', '启动交易陪练.cmd', '连接检查.cmd', '首次安装.command', '启动交易陪练.command', '连接检查.command', '.github/workflows/cross-platform.yml', 'agent/安装说明.md', 'agent/mcp.cursor.example.json', 'agent/mcp-server/index.ts', 'agent/smoke.ts', 'agent/binance-mcp-probe.ts', 'agent/smartvibe-trading-doppelganger/SKILL.md', 'web/package.json', 'web/package-lock.json', 'web/tsconfig.json', 'web/next-env.d.ts', 'web/next.config.ts'];
if (fs.existsSync(path.join(root, 'LICENSE'))) files.push('LICENSE');
for (const dir of ['src', 'tests', 'schemas', 'web/app', 'scripts']) {
  function walk(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`不打包链接：${child}`);
      if (entry.isDirectory()) walk(child);
      else if (/\.(ts|tsx|css|json|sql|mjs|ps1|sh)$/.test(entry.name)) files.push(child);
    }
  }
  walk(dir);
}
for (const relative of [...new Set(files)].sort()) {
  const source = path.join(root, relative);
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error(`不打包链接：${relative}`);
  const target = path.join(output, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  if (/\.(?:command|sh)$/.test(relative)) fs.chmodSync(target, 0o755);
}
const skill = 'agent/smartvibe-trading-doppelganger/SKILL.md';
const skillTarget = path.join(output, '.agents/skills/smartvibe-trading-doppelganger/SKILL.md');
fs.mkdirSync(path.dirname(skillTarget), { recursive: true });
fs.copyFileSync(path.join(root, skill), skillTarget);
fs.writeFileSync(path.join(output, '发布文件清单.json'), JSON.stringify([...new Set(files), '.agents/skills/smartvibe-trading-doppelganger/SKILL.md'].sort(), null, 2));
console.log(output);
