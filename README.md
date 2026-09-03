# 京东京造 · 护理床语音意图演示

一个纯前端的轻量演示：说一句话或打一行字，大模型识别意图后，界面把它映射到对应的护理床功能模块并展示。**只做演示，不驱动任何真实设备。**

- 语音输入用浏览器自带的中文语音识别（Web Speech API），文字输入是稳定兜底。
- 每句话调用一次大模型（GLM），把用户原话整理成受约束的展示 JSON。
- 识别结果点亮四个功能模块之一：身体舒适 / 日常照护 / 家人联系 / 日常服务。
- 保留本次会话的对话历史并随请求带上，因此可以追问“上次我留言了什么”。刷新页面即清空，不用数据库、不做长期存储。

没有后端。浏览器直接调用大模型接口。

## 环境要求

- Node.js 和 npm
- 支持 Web Speech API 的浏览器（Chrome / Edge）体验语音；其他浏览器可用文字输入
- 一个 GLM API Key（智谱开放平台）

## 配置

### 本地开发

复制 `web/.env.example` 为 `web/.env`，填入 Key：

```
GLM_API_KEY=你的key
GLM_MODEL=glm-5.3-flash
GLM_API_URL=https://open.bigmodel.cn/api/paas/v4/chat/completions
```

> 本地开发时，`web/api/chat.ts` 是一个 Vercel Function，`vite dev` 不会转发它；要用
> `vercel dev` 或直接跑在 Vercel 上测试。纯本地静态预览需另接一层网关，见下方「本地代理」。

### Vercel 部署（Key 存在服务端，前端看不到）

在 Vercel 项目的 **Settings → Environment Variables** 里添加：

- `GLM_API_KEY` = 你的 GLM Key

可选 `GLM_MODEL`、`GLM_API_URL` 覆盖默认值。**不要用 `VITE_` 前缀**——那是给前端打包用的，不带前缀才会只留在服务端。

前端发起的所有请求都打到同源 `POST /api/chat`，由 `web/api/chat.ts`（Vercel Serverless Function）在服务端拼接 `Bearer` 头转发给 GLM。浏览器里从头到尾看不到 Key。

### 本地代理（可选）

纯静态预览时没有 `/api/chat` 后端。想在本地也走通，可在 `web/vite.config.ts` 里加一层
`server.proxy` 把 `/api` 转发到 `vercel dev` 起的本地网关；正式体验建议直接用 `vercel dev`。

## 启动

```powershell
npm --prefix web install
npm --prefix web run dev
```

打开 `http://127.0.0.1:5173/`。点击光球或按空格键开始说话，也可以直接在输入框打字。焦点在输入框时空格键不会触发语音。

## 试试这样说

- 身体舒适：`把靠背升高一点`、`调到睡眠姿势`、`马上停下`
- 日常照护：`十分钟后提醒我喝水`、`记一下我吃过药了`、`救命，快叫护理员`
- 家人联系：`给儿子留言说我晚点回电话`、`上次我留言了什么`、`给孙女送生日祝福`
- 日常服务：`今天天气怎么样`、`记一下眼镜在抽屉里`、`播放一段京剧`

## 验证

```powershell
npm --prefix web run test    # 意图映射的单元测试
npm --prefix web run build   # 类型检查 + 生产构建
```

## 结构

```
web/
  index.html
  api/
    chat.ts        服务端代理：Vercel Function，持有 Key 并转发 GLM
  src/
    main.ts        输入 → 识别 → 渲染的组装层
    glm.ts         前端 GLM 客户端（走同源 /api/chat，非流式、json_object）
    prompt.ts      面向“意图→模块”的精简系统提示词
    modules.ts     四个模块定义 + GLM JSON → 模块 的纯映射（含单测）
    session.ts     会话记忆：本次页面内的对话历史
    speech.ts      Web Speech API 封装 + 文字兜底
    styles.css     配色、朗正体、呼吸光球
  public/fonts/    京东朗正体（演示所需字重）
```

## 边界

- 不连接真实床控、通话、天气或医疗系统；所有结果仅用于展示。
- 页面中的联系人、提醒、留言等均为演示内容，不能作为真实医疗或应急依据。
