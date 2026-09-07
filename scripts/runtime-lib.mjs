import fs from "node:fs";
import path from "node:path";

export const NODE_VERSION = "24.13.0";
export const CODEX_VERSION = "0.153.4";

export function nodeDistribution(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  const distributions = {
    "win32-x64": {
      directory: `node-v${NODE_VERSION}-win-x64`,
      archive: `node-v${NODE_VERSION}-win-x64.zip`,
      sha256: "ca2742695be8de44027d71b3f53a4bdb36009b95575fe1ae6f7f0b5ce091cb88",
    },
    "darwin-arm64": {
      directory: `node-v${NODE_VERSION}-darwin-arm64`,
      archive: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
      sha256: "d595961e563fcae057d4a0fb992f175a54d97fcc4a14dc2d474d92ddeea3b9f8",
    },
    "darwin-x64": {
      directory: `node-v${NODE_VERSION}-darwin-x64`,
      archive: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
      sha256: "6f03c1b48ddbe1b129a6f8038be08e0899f05f17185b4d3e4350180ab669a7f3",
    },
  };
  const distribution = distributions[key];
  if (!distribution) throw new Error(`当前版本尚未支持 ${platform}/${arch}。`);
  return distribution;
}

export function npmCliForNode(nodeExecutable = process.execPath) {
  const bin = path.dirname(nodeExecutable);
  const root = process.platform === "win32" ? bin : path.dirname(bin);
  const candidates = [
    path.join(bin, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(root, "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("项目内 Node.js 缺少 npm，请重新运行首次安装。");
  return found;
}

export function codexBinaryCandidates(codexRoot, platform = process.platform, arch = process.arch) {
  const executable = platform === "win32" ? "codex.exe" : "codex";
  const target = platform === "win32"
    ? arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc"
    : platform === "darwin"
      ? arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin"
      : "";
  return [
    path.join(codexRoot, "node_modules", "@openai", "codex", "bin", "codex.js"),
    target && path.join(codexRoot, "node_modules", "@openai", "codex", "node_modules", "@openai", `codex-${platform === "win32" ? "win32" : "darwin"}-${arch}`, "vendor", target, "bin", executable),
    path.join(codexRoot, "node_modules", ".bin", platform === "win32" ? "codex.cmd" : "codex"),
  ].filter(Boolean);
}

export function resolveCodexBinary(codexRoot, platform = process.platform, arch = process.arch) {
  const candidate = codexBinaryCandidates(codexRoot, platform, arch).find((file) => fs.existsSync(file));
  if (!candidate) throw new Error("Codex 连接程序不完整，请重新运行首次安装。");
  if (platform !== "win32" && !candidate.endsWith(".js")) {
    try { fs.accessSync(candidate, fs.constants.X_OK); }
    catch { throw new Error("Codex 连接程序没有执行权限，请重新运行首次安装。"); }
  }
  return candidate;
}

export function runtimePath(nodeExecutable = process.execPath, currentPath = process.env.PATH ?? "") {
  const separator = process.platform === "win32" ? ";" : ":";
  const additions = process.platform === "win32"
    ? [path.dirname(nodeExecutable)]
    : [path.dirname(nodeExecutable), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
  return [...additions, ...currentPath.split(separator)]
    .filter(Boolean)
    .filter((entry, index, all) => all.indexOf(entry) === index)
    .join(separator);
}
