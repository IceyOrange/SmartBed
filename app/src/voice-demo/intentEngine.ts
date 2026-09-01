export type VoiceDomain = "body" | "care" | "relationship" | "daily" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type TurnStatus =
  | "clarifying"
  | "awaiting-confirmation"
  | "simulated-complete"
  | "information"
  | "restricted";

export type IntentId =
  | "bed.stop"
  | "bed.back.adjust"
  | "bed.legs.adjust"
  | "bed.height.adjust"
  | "bed.scene"
  | "bed.reset"
  | "care.reminder.create"
  | "care.record.create"
  | "care.record.query"
  | "care.emergency"
  | "care.todo.query"
  | "care.todo.update"
  | "relation.call.start"
  | "relation.call.answer"
  | "relation.call.end"
  | "relation.message.play"
  | "relation.message.create"
  | "relation.anniversary.query"
  | "relation.anniversary.greet"
  | "daily.schedule.query"
  | "daily.weather.query"
  | "daily.note.create"
  | "daily.note.query"
  | "daily.chat"
  | "daily.media.play"
  | "daily.media.control"
  | "medical.restricted"
  | "conversation.confirm"
  | "conversation.cancel"
  | "unknown";

export interface IntentSlots {
  bodyPart?: "靠背" | "腿板" | "整床";
  direction?: "升高" | "降低" | "放平" | "停止";
  amount?: "小幅" | "大幅";
  angle?: number;
  scene?: "吃饭" | "看电视" | "睡眠";
  contact?: string;
  time?: string;
  item?: string;
  content?: string;
  action?: string;
}

export interface IntentMatch {
  rawText: string;
  normalizedText: string;
  domain: VoiceDomain;
  domainLabel: string;
  intent: IntentId;
  label: string;
  confidence: Confidence;
  slots: IntentSlots;
  safety: "立即响应" | "需要确认" | "标准" | "受限";
  route: "本地规则" | "业务技能" | "对话能力" | "Agent 编排";
}

export interface DemoTurn {
  id: string;
  userText: string;
  response: string;
  status: TurnStatus;
  match: IntentMatch;
  simulatedAction?: string;
}

export interface DemoSessionState {
  turns: DemoTurn[];
  lastBedIntent?: IntentId;
  pendingAction?: IntentMatch;
  activeCall: boolean;
  activeMedia: boolean;
}

export interface VoiceDomainDefinition {
  id: Exclude<VoiceDomain, "unknown">;
  title: string;
  subtitle: string;
  capabilities: string[];
  examples: string[];
}

export const VOICE_DOMAINS: VoiceDomainDefinition[] = [
  {
    id: "body",
    title: "调节护理床",
    subtitle: "靠背、腿板、整床和常用姿势",
    capabilities: ["靠背调节", "腿板调节", "整床升降", "情景姿态", "复位与停止"],
    examples: ["把靠背升高一点", "调到吃饭姿势", "把床全部放平", "马上停下"],
  },
  {
    id: "care",
    title: "提醒与照护",
    subtitle: "提醒、记录和紧急求助",
    capabilities: ["护理提醒", "护理记录", "应急呼叫", "护理 Todo"],
    examples: ["十分钟后提醒我喝水", "记一下我吃过药了", "今天还有什么护理事项", "救命，快叫护理员"],
  },
  {
    id: "relationship",
    title: "联系家人",
    subtitle: "打电话、听留言和发送祝福",
    capabilities: ["实时通话", "非实时留言", "纪念日祝福"],
    examples: ["给女儿打电话", "听听女儿的留言", "给孙女送生日祝福"],
  },
  {
    id: "daily",
    title: "日常帮助",
    subtitle: "日程、天气、记事和播放内容",
    capabilities: ["今日事项", "天气", "帮助记事", "轻量陪聊", "点播"],
    examples: ["今天有什么安排", "今天天气怎么样", "记一下眼镜在抽屉里", "播放一段京剧"],
  },
];

const DOMAIN_LABELS: Record<VoiceDomain, string> = {
  body: "身体自主",
  care: "照护协同",
  relationship: "关系链接",
  daily: "日常生活",
  unknown: "需要澄清",
};

const CONFIRM_PATTERN = /^(确认|可以|好的|继续执行|执行吧|没问题)$/;
const CANCEL_PATTERN = /^(取消|不用了?|算了|不要了?)$/;
const STOP_PATTERN = /(^|[，。！？,.!?\s])(停|停止|马上停下|别动了?|不要动了?|床别动了?)([，。！？,.!?\s]|$)/;
const EMERGENCY_PATTERN = /(救命|快来人|急救|紧急呼叫|快叫护理员|马上叫护工|我需要紧急帮助)/;
const MEDICAL_PATTERN = /(吃几片|吃多少|药量|加一倍|减药|停药|换药|是不是得了|诊断一下)/;
const TIME_PATTERN = /((?:\d+|[一二三四五六七八九十两半]+)(?:分钟|小时)后|(?:今天|明天|上午|下午|晚上|早上)?(?:\d+|[一二三四五六七八九十两]+)点(?:半|\d+分)?)/;
const ANGLE_PATTERN = /(\d{1,2})\s*度/;

function normalize(text: string) {
  return text.trim().replace(/\s+/g, " ").replace(/[呀啊呢吧嘛啦哦]/g, "");
}

function makeMatch(
  rawText: string,
  domain: VoiceDomain,
  intent: IntentId,
  label: string,
  slots: IntentSlots = {},
  confidence: Confidence = "high",
  safety: IntentMatch["safety"] = "标准",
  route: IntentMatch["route"] = "业务技能",
): IntentMatch {
  return {
    rawText,
    normalizedText: normalize(rawText),
    domain,
    domainLabel: DOMAIN_LABELS[domain],
    intent,
    label,
    confidence,
    slots,
    safety,
    route,
  };
}

function extractDirection(text: string): IntentSlots["direction"] {
  if (/(放平|平躺|复位)/.test(text)) return "放平";
  if (/(降低|降下|放低|低一点|往下)/.test(text)) return "降低";
  if (/(升高|升起|抬高|抬起|高一点|往上)/.test(text)) return "升高";
  return undefined;
}

function extractAmount(text: string): IntentSlots["amount"] {
  return /(大幅|很多|最高|最低|全部)/.test(text) ? "大幅" : "小幅";
}

function extractContact(text: string) {
  const known = text.match(/(女儿|儿子|老伴|丈夫|妻子|孙女|孙子|护理员|护工|医生|护士)/);
  if (known) return known[1];
  const named = text.match(/(?:给|联系|找)([\u4e00-\u9fa5]{2,4})(?:打电话|通话|留言)/);
  return named?.[1];
}

function extractReminderItem(text: string) {
  const known = text.match(/(吃(?:过|完)?药|服药|喝水|翻身|测量血压|量血压|康复训练|锻炼)/);
  return known?.[1]?.replace(/吃(?:过|完)药/, "吃药");
}

function unknown(text: string, label = "需要进一步说明") {
  return makeMatch(text, "unknown", "unknown", label, {}, "low", "标准", "对话能力");
}

export function recognizeIntent(text: string, state?: DemoSessionState): IntentMatch {
  const normalized = normalize(text);

  if (STOP_PATTERN.test(` ${normalized} `) || normalized === "停") {
    return makeMatch(text, "body", "bed.stop", "紧急停止", { direction: "停止" }, "high", "立即响应", "本地规则");
  }
  if (EMERGENCY_PATTERN.test(normalized)) {
    return makeMatch(text, "care", "care.emergency", "应急呼叫", {}, "high", "立即响应", "本地规则");
  }
  if (state?.pendingAction && CONFIRM_PATTERN.test(normalized)) {
    return makeMatch(text, state.pendingAction.domain, "conversation.confirm", "确认执行", {}, "high", "标准", "本地规则");
  }
  if (state?.pendingAction && CANCEL_PATTERN.test(normalized)) {
    return makeMatch(text, state.pendingAction.domain, "conversation.cancel", "取消执行", {}, "high", "标准", "本地规则");
  }
  if (MEDICAL_PATTERN.test(normalized)) {
    return makeMatch(text, "care", "medical.restricted", "医疗判断请求", {}, "high", "受限", "本地规则");
  }

  if (/(挂断|结束通话)/.test(normalized)) {
    return makeMatch(text, "relationship", "relation.call.end", "结束通话", {}, state?.activeCall ? "high" : "medium");
  }
  if (/(接听|接电话)/.test(normalized)) {
    return makeMatch(text, "relationship", "relation.call.answer", "接听电话");
  }
  if (/(暂停|下一首|上一首|继续播放|声音|音量|关掉音乐|停止播放)/.test(normalized)) {
    const action = /暂停|停止播放|关掉/.test(normalized)
      ? "暂停"
      : /下一首/.test(normalized)
        ? "下一首"
        : /上一首/.test(normalized)
          ? "上一首"
          : /小|低/.test(normalized)
            ? "调低音量"
            : /大|高/.test(normalized)
              ? "调高音量"
              : "继续播放";
    return makeMatch(text, "daily", "daily.media.control", "播放控制", { action }, state?.activeMedia ? "high" : "medium");
  }

  if (/(全部放平|恢复平躺|恢复平躺|床.*复位|复位|所有.*放平)/.test(normalized)) {
    return makeMatch(text, "body", "bed.reset", "床体复位", { direction: "放平", amount: "大幅" }, "high", "需要确认", "本地规则");
  }
  if (/(吃饭姿势|用餐姿势)/.test(normalized)) {
    return makeMatch(text, "body", "bed.scene", "情景姿态", { scene: "吃饭", amount: "大幅" }, "high", "需要确认", "本地规则");
  }
  if (/(看电视|坐起来)/.test(normalized)) {
    return makeMatch(text, "body", "bed.scene", "情景姿态", { scene: "看电视", amount: "大幅" }, "high", "需要确认", "本地规则");
  }
  if (/(睡觉姿势|睡眠姿势)/.test(normalized)) {
    return makeMatch(text, "body", "bed.scene", "情景姿态", { scene: "睡眠", amount: "小幅" }, "high", "标准", "本地规则");
  }
  if (/(靠背|背板|背部)/.test(normalized) && /(升|抬|降|低|放平|调)/.test(normalized)) {
    return makeMatch(text, "body", "bed.back.adjust", "靠背调节", {
      bodyPart: "靠背",
      direction: extractDirection(normalized),
      amount: extractAmount(normalized),
      angle: Number(ANGLE_PATTERN.exec(normalized)?.[1]) || undefined,
    }, "high", extractAmount(normalized) === "大幅" ? "需要确认" : "标准", "本地规则");
  }
  if (/(腿板|腿部|把腿|脚部)/.test(normalized) && /(升|抬|降|低|放平|调)/.test(normalized)) {
    return makeMatch(text, "body", "bed.legs.adjust", "腿板调节", {
      bodyPart: "腿板",
      direction: extractDirection(normalized),
      amount: extractAmount(normalized),
    }, "high", "标准", "本地规则");
  }
  if (/(整床|床体|床升|床降|把床升|把床降)/.test(normalized) && /(升|降|高|低)/.test(normalized)) {
    const amount = extractAmount(normalized);
    return makeMatch(text, "body", "bed.height.adjust", "整床升降", {
      bodyPart: "整床",
      direction: extractDirection(normalized),
      amount,
    }, "high", amount === "大幅" ? "需要确认" : "标准", "本地规则");
  }
  if (/^(再)?(高|低)(一点|一些)|^(再来一点|继续|就这样)$/.test(normalized)) {
    if (state?.lastBedIntent && state.lastBedIntent !== "bed.stop") {
      const part = state.lastBedIntent === "bed.back.adjust" ? "靠背" : state.lastBedIntent === "bed.legs.adjust" ? "腿板" : "整床";
      return makeMatch(text, "body", state.lastBedIntent, `${part}连续微调`, {
        bodyPart: part,
        direction: /低/.test(normalized) ? "降低" : "升高",
        amount: "小幅",
      }, "high", "标准", "本地规则");
    }
    return unknown(text, "请说明要调整靠背、腿板还是整床高度");
  }

  if (/(提醒|叫我)/.test(normalized)) {
    const time = normalized.match(TIME_PATTERN)?.[1];
    const item = extractReminderItem(normalized);
    return makeMatch(text, "care", "care.reminder.create", "护理提醒", { time, item }, time && item ? "high" : "medium");
  }
  if (/(今天|今日).*(护理事项|护理安排)|还有什么护理|护理待办/.test(normalized)) {
    return makeMatch(text, "care", "care.todo.query", "护理 Todo", { time: "今天" });
  }
  if (/(完成了|做完了|已经做了)/.test(normalized) && /(翻身|服药|吃药|康复|护理)/.test(normalized)) {
    return makeMatch(text, "care", "care.todo.update", "完成护理事项", { item: extractReminderItem(normalized), action: "完成" });
  }
  if (/(护理记录|翻过几次|吃药记录|服药记录|血压记录)/.test(normalized) && /(查|看看|几次|什么)/.test(normalized)) {
    return makeMatch(text, "care", "care.record.query", "查询护理记录", { item: extractReminderItem(normalized) });
  }
  if (/(记一下|记录一下)/.test(normalized) && /(吃(?:过|完)?药|服药|翻身|血压|康复)/.test(normalized)) {
    return makeMatch(text, "care", "care.record.create", "护理记录", { item: extractReminderItem(normalized), content: normalized });
  }

  if (/(打(?:个)?电话|通话|联系)/.test(normalized)) {
    const contact = extractContact(normalized);
    return makeMatch(text, "relationship", "relation.call.start", "实时通话", { contact }, contact ? "high" : "low");
  }
  if (/(听|播放|收听).*(留言|语音)|有什么留言/.test(normalized)) {
    return makeMatch(text, "relationship", "relation.message.play", "收听留言", { contact: extractContact(normalized) }, "high");
  }
  if (/(留句话|留个言|录.*留言|回复留言)/.test(normalized)) {
    return makeMatch(text, "relationship", "relation.message.create", "录制留言", { contact: extractContact(normalized) }, "high");
  }
  if (/(谁.*生日|纪念日|什么日子)/.test(normalized)) {
    return makeMatch(text, "relationship", "relation.anniversary.query", "纪念日查询");
  }
  if (/(生日祝福|祝.*生日|送.*祝福)/.test(normalized)) {
    return makeMatch(text, "relationship", "relation.anniversary.greet", "纪念日祝福", { contact: extractContact(normalized) });
  }

  if (/(今天|今日|下午|上午|晚上).*(安排|事项|做什么)|今天有什么/.test(normalized)) {
    return makeMatch(text, "daily", "daily.schedule.query", "今日事项", { time: normalized.match(/今天|今日|下午|上午|晚上/)?.[0] });
  }
  if (/(天气|下雨|温度|冷不冷|热不热)/.test(normalized)) {
    return makeMatch(text, "daily", "daily.weather.query", "天气查询", { time: normalized.match(/今天|明天|后天/)?.[0] });
  }
  if (/(记一下|帮我记)/.test(normalized)) {
    return makeMatch(text, "daily", "daily.note.create", "帮助记事", { content: normalized.replace(/^(帮我)?记一下/, "") }, "high");
  }
  if (/(我.*记了什么|备忘|记事)/.test(normalized)) {
    return makeMatch(text, "daily", "daily.note.query", "查询记事");
  }
  if (/(播放|放一段|放点|听).*(京剧|戏曲|音乐|有声书|广播|新闻|故事)|继续昨天的有声书/.test(normalized)) {
    const content = normalized.match(/(京剧|戏曲|轻音乐|音乐|有声书|广播|新闻|故事)/)?.[1] ?? "推荐内容";
    return makeMatch(text, "daily", "daily.media.play", "内容点播", { content, action: "播放" }, "high");
  }
  if (/(星期几|几点|今年.*年|讲个故事|陪我聊|聊会儿)/.test(normalized)) {
    return makeMatch(text, "daily", "daily.chat", "轻量陪聊", { content: normalized }, "high", "标准", "对话能力");
  }

  return unknown(text);
}

function slotSummary(slots: IntentSlots) {
  const values = Object.values(slots).filter((value) => value !== undefined && value !== "");
  return values.length ? values.join(" · ") : "无需额外参数";
}

function createTurn(match: IntentMatch, response: string, status: TurnStatus, simulatedAction?: string): DemoTurn {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userText: match.rawText,
    response,
    status,
    match,
    simulatedAction,
  };
}

export function createDemoSession(): DemoSessionState {
  return { turns: [], activeCall: false, activeMedia: false };
}

function needsConfirmation(match: IntentMatch) {
  return match.safety === "需要确认";
}

function responseFor(match: IntentMatch): { response: string; status: TurnStatus; action?: string } {
  const { intent, slots } = match;
  switch (intent) {
    case "bed.stop":
      return { response: "已立即模拟停止所有床体动作。实体急停始终拥有最高优先级。", status: "simulated-complete", action: "中断床体运动" };
    case "bed.back.adjust":
    case "bed.legs.adjust":
    case "bed.height.adjust":
      return { response: `正在模拟${slots.bodyPart}${slots.direction ?? "调节"}${slots.amount === "小幅" ? "一点" : ""}。你可以继续说“再高一点”或“就这样”。`, status: "simulated-complete", action: `${slots.bodyPart}${slots.direction ?? "调节"}` };
    case "bed.scene":
      return { response: `将模拟切换到${slots.scene}姿势。`, status: "simulated-complete", action: `${slots.scene}姿势` };
    case "bed.reset":
      return { response: "将模拟把靠背与腿板恢复到平躺位置。", status: "simulated-complete", action: "床体复位" };
    case "care.emergency":
      return { response: "已模拟触发床旁紧急求助，并通知预设护理人员。请保持呼吸平稳，护理人员正在赶来。", status: "simulated-complete", action: "床旁应急呼叫" };
    case "care.reminder.create":
      if (!slots.time || !slots.item) return { response: "请再告诉我提醒时间和具体事项，例如“十分钟后提醒我喝水”。", status: "clarifying" };
      return { response: `已模拟创建提醒：${slots.time}${slots.item}。`, status: "simulated-complete", action: `保存提醒：${slots.time} ${slots.item}` };
    case "care.record.create":
      return { response: `已模拟记录：${slots.item ?? "护理事项"}已完成。`, status: "simulated-complete", action: "写入护理记录" };
    case "care.record.query":
      return { response: "演示记录显示：今天已完成早餐后服药和下午翻身护理。", status: "information" };
    case "care.todo.query":
      return { response: "今天还有两项：16:30 腿部康复训练，18:30 晚间服药。", status: "information" };
    case "care.todo.update":
      return { response: `已模拟把“${slots.item ?? "护理事项"}”标记为完成。`, status: "simulated-complete", action: "更新护理 Todo" };
    case "relation.call.start":
      if (!slots.contact) return { response: "你想联系谁？请说出联系人，例如“给女儿打电话”。", status: "clarifying" };
      return { response: `正在模拟呼叫${slots.contact}，护理床端将使用扬声器通话。`, status: "simulated-complete", action: `呼叫${slots.contact}` };
    case "relation.call.answer":
      return { response: "已模拟接听来电。", status: "simulated-complete", action: "接听通话" };
    case "relation.call.end":
      return { response: "已模拟结束通话。", status: "simulated-complete", action: "结束通话" };
    case "relation.message.play":
      return { response: "女儿今天 10:20 留下一条 38 秒语音。现在为你模拟播放。", status: "simulated-complete", action: "播放留言" };
    case "relation.message.create":
      return { response: `好的，开始模拟录制${slots.contact ? `给${slots.contact}` : ""}的留言。说完后请说“发送”。`, status: "simulated-complete", action: "录制留言" };
    case "relation.anniversary.query":
      return { response: "本周六是外孙女安安的生日。", status: "information" };
    case "relation.anniversary.greet":
      return { response: `可以。现在模拟录制${slots.contact ? `给${slots.contact}` : ""}的生日祝福。`, status: "simulated-complete", action: "录制生日祝福" };
    case "daily.schedule.query":
      return { response: "今天下午 14:00 翻身护理，16:30 腿部康复训练，晚上 20:00 和家人通话。", status: "information" };
    case "daily.weather.query":
      return { response: "演示天气：杭州今天多云，23 至 29 摄氏度，晚间可能有阵雨。", status: "information" };
    case "daily.note.create":
      return { response: `已模拟记下：${slots.content ?? "这件事"}。`, status: "simulated-complete", action: "保存生活记事" };
    case "daily.note.query":
      return { response: "最近一条演示记事：护工把眼镜放在床头柜抽屉里。", status: "information" };
    case "daily.chat":
      return { response: "今天是星期一。很高兴陪你聊聊，你想听个故事，还是说说今天发生的事？", status: "information" };
    case "daily.media.play":
      return { response: `正在模拟播放${slots.content ?? "推荐内容"}。你可以说“暂停”或“声音小一点”。`, status: "simulated-complete", action: `播放${slots.content ?? "内容"}` };
    case "daily.media.control":
      return { response: `已模拟${slots.action ?? "调整播放"}。`, status: "simulated-complete", action: slots.action ?? "媒体控制" };
    case "medical.restricted":
      return { response: "我不能判断药量或替代医嘱。请按医嘱服药，或让我帮你联系护理人员。", status: "restricted" };
    default:
      return { response: match.label === "需要进一步说明" ? "我还不能确定你的意思。你可以说“调整靠背”“设置护理提醒”“给女儿打电话”或“播放京剧”。" : match.label, status: "clarifying" };
  }
}

export function processDemoInput(state: DemoSessionState, text: string) {
  const match = recognizeIntent(text, state);
  let nextState: DemoSessionState = { ...state, turns: [...state.turns] };
  let turn: DemoTurn;

  if (match.intent === "conversation.confirm" && state.pendingAction) {
    const pending = state.pendingAction;
    const result = responseFor(pending);
    turn = createTurn(
      { ...pending, rawText: text, normalizedText: normalize(text), intent: pending.intent },
      `已模拟完成${pending.label}。${result.response}`,
      "simulated-complete",
      result.action,
    );
    nextState.pendingAction = undefined;
  } else if (match.intent === "conversation.cancel") {
    turn = createTurn(match, "好的，已取消刚才的模拟动作。", "simulated-complete", "取消待执行动作");
    nextState.pendingAction = undefined;
  } else if (match.intent === "bed.stop") {
    const result = responseFor(match);
    turn = createTurn(match, result.response, result.status, result.action);
    nextState.pendingAction = undefined;
  } else if (needsConfirmation(match)) {
    turn = createTurn(match, `${responseFor(match).response} 这是幅度较大的动作，请确认是否模拟执行。`, "awaiting-confirmation");
    nextState.pendingAction = match;
  } else {
    const result = responseFor(match);
    turn = createTurn(match, result.response, result.status, result.action);
  }

  if (match.domain === "body" && match.intent.startsWith("bed.") && match.intent !== "bed.stop") {
    nextState.lastBedIntent = match.intent;
  }
  if (match.intent === "relation.call.start" && match.slots.contact) nextState.activeCall = true;
  if (match.intent === "relation.call.end") nextState.activeCall = false;
  if (match.intent === "daily.media.play") nextState.activeMedia = true;
  if (match.intent === "daily.media.control" && match.slots.action === "暂停") nextState.activeMedia = false;

  nextState.turns = [turn, ...nextState.turns].slice(0, 8);
  return { state: nextState, turn };
}

export function formatSlots(slots: IntentSlots) {
  return slotSummary(slots);
}
