import assert from "node:assert/strict";
import test from "node:test";

import { commandsFor, stopChildren, viteArgumentsFor, waitForHealth } from "./dev.mjs";

test("commandsFor selects Windows executables", () => {
  assert.deepEqual(commandsFor("win32"), { python: "python", node: process.execPath });
});

test("viteArgumentsFor keeps the documented frontend port", () => {
  assert.deepEqual(viteArgumentsFor("vite.js"), [
    "vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ]);
});

test("waitForHealth retries until Agent responds", async () => {
  let attempts = 0;
  await waitForHealth({
    fetchImpl: async () => ({ ok: ++attempts === 2 }),
    timeoutMs: 100,
    intervalMs: 0,
    now: () => attempts * 10,
    sleep: async () => {},
  });
  assert.equal(attempts, 2);
});

test("waitForHealth reports a timeout", async () => {
  let currentTime = 0;
  await assert.rejects(
    waitForHealth({
      fetchImpl: async () => {
        currentTime += 10;
        throw new Error("offline");
      },
      timeoutMs: 5,
      intervalMs: 0,
      now: () => currentTime,
      sleep: async () => {},
    }),
    /Agent 未能在规定时间内启动/,
  );
});

test("stopChildren terminates every live child", () => {
  const stopped = [];
  const children = [
    { killed: false, kill: () => stopped.push("agent") },
    { killed: true, kill: () => stopped.push("already-stopped") },
    { killed: false, kill: () => stopped.push("app") },
  ];

  stopChildren(children);

  assert.deepEqual(stopped, ["agent", "app"]);
});
