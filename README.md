# 智能护理床软件 Demo

该项目已将家属端和床侧语音演示同时接入护理床 Agent：

- `agent/`：独立运行的 Python 服务，负责状态、护理事项、留言、通话、自然语言理解和安全确认。
- `app/`：React 前端，包含家属端和床侧语音演示两个入口。
- `scripts/dev.mjs`：先启动并检查 Agent，再启动前端；任一进程退出时会同步关闭另一方。

Agent 不嵌入前端页面。前端只通过公开 HTTP 接口访问 Agent，开发环境由 Vite 将 `/api` 代理到 `http://127.0.0.1:8765`。

## 环境要求

- Python 3.12 或更高版本
- Node.js 和 npm
- Windows 中文语音识别器（床侧本机语音输入使用；当前电脑已安装）

首次运行先安装前端依赖：

```powershell
npm --prefix app install
```

如需体验自然语言理解和床侧语音命令，请复制 `agent/.env.example` 为 `agent/.env`，并填写 `GLM_API_KEY`。未配置密钥时，结构化的状态、护理事项、留言和通话接口仍可使用，自然语言请求会返回未配置提示且不会执行动作。

## 一键启动

在项目根目录运行：

```powershell
npm run dev
```

启动器会同时运行两个独立进程：

- 家属端：`http://127.0.0.1:5173/`
- 床侧语音演示：`http://127.0.0.1:5173/voice-demo.html`
- Agent 健康检查：`http://127.0.0.1:8765/api/v1/health`

按 `Ctrl+C` 会同时停止前端和 Agent。

床侧页点击麦克风后，会优先使用 Agent 进程中的 Windows 本机中文识别，最长监听约 8 秒，音频不上传；本机识别器不可用时才回退到浏览器语音识别。请在 Windows“麦克风隐私设置”中允许桌面应用访问麦克风，并将要使用的设备设为系统默认输入设备。

## 分开启动排查

Agent：

```powershell
cd agent
$env:PYTHONDONTWRITEBYTECODE = "1"
$env:PYTHONPATH = "src"
python -B -m care_bed_agent
```

另开终端，在项目根目录启动前端：

```powershell
npm --prefix app run dev
```

## 验证

```powershell
npm test
npm run build

cd agent
$env:PYTHONDONTWRITEBYTECODE = "1"
$env:PYTHONPATH = "src"
python -B -m unittest discover -s tests -v
```

## 安全边界

- 家属端不能远程控制床体，即使通过自然语言提出也会被 Agent 拒绝。
- 床侧的大幅床体动作需要二次确认；取消、停止会清除待确认动作。
- 本机语音接口只接受受信任的本地演示页来源，并要求启动时生成的随机会话令牌，其他网页不能直接触发麦克风。
- 当前床控硬件、实时通话、媒体、天气和外部护理系统仍为演示实现，不会驱动真实设备。
