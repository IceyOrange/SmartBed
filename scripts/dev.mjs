import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

export function commandsFor(platform = process.platform) {
  return {
    python: platform === "win32" ? "python" : "python3",
    node: process.execPath,
  };
}

export function viteArgumentsFor(viteEntry) {
  return [viteEntry, "--host", "127.0.0.1", "--port", "5173", "--strictPort"];
}

export async function waitForHealth({
  fetchImpl = fetch,
  url = "http://127.0.0.1:8765/api/v1/health",
  timeoutMs = 15_000,
  intervalMs = 250,
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
} = {}) {
  const startedAt = now();
  while (now() - startedAt <= timeoutMs) {
    try {
      const response = await fetchImpl(url);
      if (response.ok) return;
    } catch {
      if (now() - startedAt >= timeoutMs) break;
    }
    await sleep(intervalMs);
  }
  throw new Error("Agent 未能在规定时间内启动。请检查 Python 3.12、端口 8765 和 agent/.env。 ");
}

export function stopChildren(children) {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

export async function main() {
  const { python, node } = commandsFor();
  const agentDir = join(rootDir, "agent");
  const appDir = join(rootDir, "app");
  const viteEntry = join(appDir, "node_modules", "vite", "bin", "vite.js");
  const children = [];
  let shuttingDown = false;

  const shutdown = (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopChildren(children);
    setTimeout(() => process.exit(exitCode), 100).unref();
  };

  process.once("SIGINT", () => shutdown(0));
  process.once("SIGTERM", () => shutdown(0));

  const agent = spawn(python, ["-B", "-m", "care_bed_agent"], {
    cwd: agentDir,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONPATH: join(agentDir, "src") },
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(agent);
  agent.once("error", (error) => {
    console.error(`Agent 启动失败：${error.message}`);
    shutdown(1);
  });
  agent.once("exit", (code) => {
    if (!shuttingDown) {
      console.error(`Agent 已退出（代码 ${code ?? "未知"}）。`);
      shutdown(code ?? 1);
    }
  });

  try {
    await waitForHealth();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    shutdown(1);
    return;
  }

  const app = spawn(node, viteArgumentsFor(viteEntry), {
    cwd: appDir,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(app);
  app.once("error", (error) => {
    console.error(`前端启动失败：${error.message}`);
    shutdown(1);
  });
  app.once("exit", (code) => {
    if (!shuttingDown) {
      console.error(`前端已退出（代码 ${code ?? "未知"}）。`);
      shutdown(code ?? 1);
    }
  });
  console.log("护理床 Demo 已启动：http://127.0.0.1:5173/");
  console.log("床侧语音演示：http://127.0.0.1:5173/voice-demo.html");
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryUrl) {
  void main();
}
