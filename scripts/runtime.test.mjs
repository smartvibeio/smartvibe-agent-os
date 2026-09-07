import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { codexBinaryCandidates, nodeDistribution } from "./runtime-lib.mjs";

test("Node发行包按系统与架构选择，并锁定官方校验值", () => {
  assert.match(nodeDistribution("win32", "x64").archive, /win-x64\.zip$/);
  assert.match(nodeDistribution("darwin", "arm64").archive, /darwin-arm64\.tar\.gz$/);
  assert.match(nodeDistribution("darwin", "x64").archive, /darwin-x64\.tar\.gz$/);
  assert.equal(nodeDistribution("darwin", "arm64").sha256.length, 64);
  assert.throws(() => nodeDistribution("linux", "x64"), /尚未支持/);
});

test("Codex二进制规则覆盖Windows和两种Mac架构", () => {
  assert.ok(codexBinaryCandidates("/runtime", "win32", "x64").some((candidate) => /x86_64-pc-windows-msvc[\\/]bin[\\/]codex\.exe$/.test(candidate)));
  assert.ok(codexBinaryCandidates("/runtime", "darwin", "arm64").some((candidate) => /aarch64-apple-darwin[\\/]bin[\\/]codex$/.test(candidate)));
  assert.ok(codexBinaryCandidates("/runtime", "darwin", "x64").some((candidate) => /x86_64-apple-darwin[\\/]bin[\\/]codex$/.test(candidate)));
  assert.ok(codexBinaryCandidates("/runtime", "darwin", "arm64")[0].endsWith("codex.js"));
});

test("双平台入口都进入共享运行程序", () => {
  const windows = fs.readFileSync("scripts/windows.ps1");
  assert.deepEqual([...windows.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(windows.toString("utf8"), /scripts\/runtime\.mjs/);
  assert.match(fs.readFileSync("scripts/macos.sh", "utf8"), /scripts\/runtime\.mjs/);
  for (const entry of ["首次安装.command", "启动交易陪练.command", "连接检查.command"])
    assert.match(fs.readFileSync(entry, "utf8"), /scripts\/macos\.sh/);
});
