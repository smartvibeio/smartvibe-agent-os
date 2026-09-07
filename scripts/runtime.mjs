import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CODEX_VERSION, npmCliForNode, resolveCodexBinary, runtimePath } from "./runtime-lib.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const runtimeDir = path.join(root, ".runtime");
const webDir = path.join(root, "web");
const codexDir = path.join(runtimeDir, "codex");
const action = process.argv[2] ?? "start";
const noLaunch = process.argv.includes("--no-launch");
const node = process.execPath;
const npmCli = npmCliForNode(node);
const instance = Buffer.from(root, "utf8").toString("base64");

fs.mkdirSync(runtimeDir, { recursive: true });
const env = {
  ...process.env,
  PATH: runtimePath(node),
  npm_config_cache: path.join(runtimeDir, "npm-cache"),
  SMARTVIBE_PROJECT_ROOT: root,
  SMARTVIBE_DATA_DIR: path.join(root, "data"),
  SMARTVIBE_CODEX_HOME: path.join(runtimeDir, "codex-home"),
  SMARTVIBE_BUILD_DIR: ".next-release",
  SMARTVIBE_INSTANCE: instance,
  NEXT_TELEMETRY_DISABLED: "1",
};

function run(label, args, cwd = root) {
  console.log(label);
  const result = spawnSync(node, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label}失败（${result.status ?? "未知状态"}）。`);
}

async function health() {
  try {
    const response = await fetch("http://localhost:3001/api/health", { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

async function warmBridge() {
  try {
    await fetch("http://localhost:3001/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3001" },
      body: JSON.stringify({ action: "status" }),
      signal: AbortSignal.timeout(65000),
    });
  } catch {
    console.log("AI私教连接将在首次使用时继续自动恢复；网页和训练记录不受影响。");
  }
}

async function portAvailable() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(3001, "127.0.0.1");
  });
}

function openBrowser(url) {
  if (noLaunch) return;
  const command = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const opened = spawn(command, [url], { detached: true, stdio: "ignore", env });
  opened.unref();
}

async function install() {
  run("正在安装锁定版本的项目依赖…", [npmCli, "ci", "--no-audit", "--no-fund"]);
  run("正在安装网页依赖…", [npmCli, "--prefix", "web", "ci", "--no-audit", "--no-fund"]);
  run("正在安装 Codex 连接程序…", [npmCli, "install", "--prefix", codexDir, "--save-exact", `@openai/codex@${CODEX_VERSION}`, "--no-audit", "--no-fund"]);
  env.SMARTVIBE_CODEX_BINARY = resolveCodexBinary(codexDir);
  fs.mkdirSync(env.SMARTVIBE_CODEX_HOME, { recursive: true });
  run("正在构建交易陪练核心…", [npmCli, "run", "build"]);
  run("正在构建交易陪练网页…", [npmCli, "--prefix", "web", "run", "build"]);
}

function prepareInstalledRuntime() {
  env.SMARTVIBE_CODEX_BINARY = resolveCodexBinary(codexDir);
  fs.mkdirSync(env.SMARTVIBE_CODEX_HOME, { recursive: true });
  if (!fs.existsSync(path.join(webDir, ".next-release", "BUILD_ID")))
    throw new Error("网页尚未构建成功，请重新运行首次安装。");
}

async function start() {
  const existing = await health();
  if (existing?.instance === instance) {
    openBrowser(`http://localhost:3001/${action === "install" ? "setup" : "coach"}`);
    console.log("交易陪练已经在运行，已打开现有页面。");
    return;
  }
  if (!(await portAvailable())) throw new Error("端口3001已被其他程序或另一份陪练占用，请关闭那个服务后重试。");

  const stdout = fs.openSync(path.join(runtimeDir, "web.log"), "a");
  const stderr = fs.openSync(path.join(runtimeDir, "web-error.log"), "a");
  const server = spawn(node, ["--experimental-sqlite", "--no-warnings", "./node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3001"], {
    cwd: webDir,
    env,
    stdio: ["ignore", stdout, stderr],
    windowsHide: true,
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    if (!server.killed) server.kill();
  };
  process.once("SIGINT", () => { stop(); process.exit(0); });
  process.once("SIGTERM", () => { stop(); process.exit(0); });
  process.once("exit", stop);

  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("网页启动失败，请查看 .runtime/web-error.log。");
    const current = await health();
    if (current?.instance === instance) {
      const destination = `http://localhost:3001/${action === "install" ? "setup" : "coach"}`;
      openBrowser(destination);
      void warmBridge();
      console.log("网页已打开。结束使用时，在这里按回车停止服务；训练记录会保留。");
      if (process.stdin.isTTY) {
        process.stdin.resume();
        await new Promise((resolve) => process.stdin.once("data", resolve));
        stop();
        await new Promise((resolve) => server.once("exit", resolve));
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  stop();
  throw new Error("网页启动超时，请查看 .runtime/web-error.log后重试。");
}

try {
  if (!["install", "start", "check"].includes(action)) throw new Error(`未知操作：${action}`);
  if (action === "install") await install();
  prepareInstalledRuntime();
  if (noLaunch && action === "install") {
    console.log("依赖与网页构建完成；尚未进行登录、授权和完整体验验收。");
  } else if (action === "check") {
    if (!fs.existsSync(path.join(root, "dist", "agent", "codexBridge.js")))
      throw new Error("核心程序尚未构建成功，请重新运行首次安装。");
    run("正在检查连接…", ["--experimental-sqlite", "--no-warnings", "scripts/check.mjs"]);
  } else {
    await start();
  }
} catch (error) {
  console.error(`未完成：${error instanceof Error ? error.message : String(error)}`);
  console.error("不会清除已有档案。联网失败时请检查网络或系统代理，再重新运行。");
  process.exitCode = 1;
}
