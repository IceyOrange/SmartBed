export type ModuleId = "body" | "care" | "relationship" | "daily" | "unknown";

export interface ModuleDef {
  id: Exclude<ModuleId, "unknown">;
  /** 显示名 */
  title: string;
  /** 一句话定位 */
  blurb: string;
  /** 覆盖能力，用于常驻卡片 */
  capabilities: string[];
  /** 演示话术，点按可填入输入框 */
  examples: string[];
  /** 卡片强调色（CSS 变量后缀） */
  accent: string;
}

export const MODULES: ModuleDef[] = [
  {
    id: "body",
    title: "身体舒适",
    blurb: "靠背、腿托、床高、翻身与便孔",
    capabilities: ["靠背调节", "腿托调节", "整床升降", "便孔护理", "情景姿势", "停止复位"],
    examples: ["把靠背升高一点", "帮我把腿抬高", "帮我翻个身", "马上停下"],
    accent: "body",
  },
  {
    id: "care",
    title: "日常照护",
    blurb: "提醒、记录、待办与应急呼叫",
    capabilities: ["护理提醒", "护理记录", "护理待办", "应急呼叫"],
    examples: ["十分钟后提醒我喝水", "记一下我吃过药了", "今天还有什么护理事项", "救命，快叫护理员"],
    accent: "care",
  },
  {
    id: "relationship",
    title: "家人联系",
    blurb: "通话、留言与重要日子的祝福",
    capabilities: ["实时通话", "语音留言", "纪念日祝福"],
    examples: ["给女儿打电话", "给儿子留言说我晚点回电话", "上次我留言了什么", "给孙女送生日祝福"],
    accent: "relationship",
  },
  {
    id: "daily",
    title: "日常服务",
    blurb: "日程、天气、记事、陪聊与点播",
    capabilities: ["今日事项", "天气", "帮助记事", "轻量陪聊", "内容点播"],
    examples: ["今天有什么安排", "今天天气怎么样", "记一下眼镜在抽屉里", "播放一段京剧"],
    accent: "daily",
  },
];

export interface MappedIntent {
  module: ModuleId;
  /** 命中模块的短意图标签 */
  intent: string;
  /** 对本次理解的一句话说明 */
  detail: string;
  /** 面向用户的口语回复；查询与陪聊会用到，可空 */
  reply: string;
  /** 0–1 置信度 */
  confidence: number;
}

const KNOWN_MODULES: ReadonlySet<string> = new Set([
  "body",
  "care",
  "relationship",
  "daily",
  "unknown",
]);

function asText(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function asConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * 把模型返回的（可能不规范的）JSON 收敛成 MappedIntent。
 * 纯函数：不触网络、不读全局，方便单测。低于阈值或模块不合法时归为 unknown。
 */
export function mapIntent(raw: unknown, minimumConfidence = 0.55): MappedIntent {
  const source = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const moduleRaw = asText(source.module).toLowerCase();
  const module: ModuleId = KNOWN_MODULES.has(moduleRaw) ? (moduleRaw as ModuleId) : "unknown";
  const confidence = asConfidence(source.confidence);
  const intent = asText(source.intent);
  const detail = asText(source.detail);
  const reply = asText(source.reply);

  if (module === "unknown" || confidence < minimumConfidence || !intent) {
    return {
      module: "unknown",
      intent: intent || "没有听清",
      detail: detail || "这次没有明确对应到某个功能，请换个说法再试一次。",
      reply,
      confidence,
    };
  }

  return { module, intent, detail: detail || intent, reply, confidence };
}

/**
 * 单个预写功能：功能名、匹配关键词（顺序即优先级）、命中后的确定性反馈，
 * 以及该功能会驱动的真实部件/子系统名（用于“语音→意图→功能→部件”展示）。
 */
export interface FeatureDef {
  feature: string;
  match: string[];
  action: string;
  /** 该功能对应的部件/子系统名（预写演示文案，零随机）。 */
  component: string;
  /** 床边状态板上的口语化状态（面向家属/照护者，忌技术名词）。 */
  state: string;
}

/**
 * 预写功能目录：每个模块一份默认反馈 + 默认部件 + 有序功能列表。
 * 关键词按顺序匹配，查询/安全类排在前，避免被执行类误命中。
 * 全部文案（含部件名）为预写，零随机；大模型只负责路由到模块，不生成执行反馈或部件名。
 */
export const FEATURE_CATALOG: Record<
  Exclude<ModuleId, "unknown">,
  { defaultAction: string; defaultComponent: string; defaultState: string; idleState: string; features: FeatureDef[] }
> = {
  body: {
    defaultAction: "已为您调整床位",
    defaultComponent: "体位控制中枢",
    defaultState: "床位调好了",
    idleState: "平躺歇息",
    features: [
      { feature: "停止复位", match: ["停", "别动", "复位", "不要动", "停下", "停止", "归位", "回原位"], action: "已停止并保持当前位置", component: "安全急停模块", state: "已停,保持不动" },
      { feature: "靠背调节", match: ["靠背", "背", "上半身", "头抬", "抬高头", "摇高", "摇起来", "扶我起", "扶起", "起身", "坐起", "坐直"], action: "已调整靠背角度", component: "靠背舵机", state: "靠背升起来了" },
      { feature: "腿托调节", match: ["腿托", "腿", "脚", "膝", "抬腿", "抬脚", "下肢", "小腿", "屈膝"], action: "已调整腿托", component: "腿托舵机", state: "腿托抬起来了" },
      { feature: "整床升降", match: ["床高", "整床", "升降", "床身", "床调", "床降", "床升", "降床", "升床", "床太高", "床太低", "下床", "上床"], action: "已调整床身高度", component: "床体升降机构", state: "床高调好了" },
      { feature: "便孔护理", match: ["便孔", "变孔", "排便孔", "如厕孔", "坐便", "便口", "开孔", "接便", "便器", "大小便"], action: "已打开床体便孔", component: "床体便孔机构", state: "便孔已打开" },
      { feature: "情景姿势", match: ["姿势", "体位", "坐立", "躺平", "放平", "翻身", "侧翻", "翻", "侧身", "半躺", "斜躺", "吃饭", "用餐", "睡眠", "入睡", "看电视", "阅读", "读书"], action: "已切换到舒适姿势", component: "体位联动控制器", state: "换了个舒服姿势" },
    ],
  },
  care: {
    defaultAction: "已为您安排",
    defaultComponent: "照护调度中枢",
    defaultState: "已安排好",
    idleState: "暂无提醒",
    features: [
      { feature: "应急呼叫", match: ["救命", "护理员", "护工", "护士", "摔", "喘不过", "喘不上", "呼吸", "难受", "晕", "急救", "急", "疼得", "剧痛", "叫人", "快来"], action: "已呼叫护理员，马上就到", component: "护理站呼叫链路", state: "已叫护理员,马上到" },
      { feature: "护理提醒", match: ["提醒", "别忘", "记得叫", "到点", "闹钟", "定时", "翻身提醒"], action: "已设置提醒", component: "护理提醒引擎", state: "提醒定好了" },
      { feature: "护理记录", match: ["记一下", "记录", "吃过药", "吃了药", "服药", "用药", "量了", "血压", "血糖", "体温", "心率", "翻过身", "换药"], action: "已记入护理记录", component: "电子护理档案", state: "记进档案了" },
      { feature: "护理待办", match: ["待办", "护理事项", "护理任务", "还有什么", "要做什么", "清单", "任务"], action: "已列出今日护理事项", component: "护理任务看板", state: "今天的事都列好了" },
    ],
  },
  relationship: {
    defaultAction: "已为您转达",
    defaultComponent: "亲情联络中枢",
    defaultState: "已转达",
    idleState: "暂无新留言",
    features: [
      { feature: "留言回顾", match: ["上一条", "什么留言", "留了什么", "留言了什么", "留过", "念留言", "念一下留言", "回顾留言", "上次留言", "之前留言", "刚才留言", "上次的留言", "之前的留言"], action: "已为您找到留言", component: "家人留言箱", state: "念了上一条留言" },
      { feature: "实时通话", match: ["打电话", "接通", "通话", "拨", "打给", "视频", "接个电话", "连线", "视频电话", "联系"], action: "正在接通", component: "亲情通话网关", state: "正在接通家人" },
      { feature: "语音留言", match: ["留言", "捎", "带句话", "带个话", "转告", "留个言", "留句话", "带话", "报平安", "发语音", "发条语音", "捎个信"], action: "已记录留言", component: "家人留言箱", state: "留言存好了" },
      { feature: "纪念祝福", match: ["祝福", "生日", "纪念", "节日", "快乐", "恭喜", "问候", "祝"], action: "祝福已送达", component: "纪念日祝福服务", state: "祝福送出去了" },
    ],
  },
  daily: {
    defaultAction: "已为您处理",
    defaultComponent: "生活服务中枢",
    defaultState: "已处理好",
    idleState: "一切照常",
    features: [
      { feature: "天气", match: ["天气", "冷", "热", "下雨", "温度", "气温", "出太阳", "刮风", "预报", "穿"], action: "已为您查询天气", component: "天气服务", state: "天气查好了" },
      { feature: "今日事项", match: ["安排", "日程", "今天有什么", "今天要", "计划", "行程", "几点", "星期几", "礼拜几", "周几", "几号", "今天几"], action: "已列出今日安排", component: "日程助理", state: "今天安排列好了" },
      { feature: "帮助记事", match: ["记一下", "记事", "放在", "在哪", "备忘", "记住", "别忘了放", "搁在"], action: "已记入备忘", component: "生活备忘录", state: "帮您记下了" },
      { feature: "内容点播", match: ["播放", "来一段", "来首", "听", "京剧", "戏", "音乐", "新闻", "评书", "歌", "相声", "广播", "故事", "笑话", "读报", "报纸", "念报"], action: "正在为您播放", component: "影音点播服务", state: "正在播放" },
      { feature: "轻量陪聊", match: ["聊", "陪我", "无聊", "说说话", "孤单", "想你们", "闷", "唠", "解闷", "睡不着"], action: "我在这儿陪您说说话", component: "陪伴对话引擎", state: "陪您聊着" },
    ],
  },
};

/**
 * 确定性路由：由模块 + 大模型短意图 + 用户原话解析出预写功能、反馈与部件名。
 * 纯函数：不触网络、不读全局。按功能列表顺序做子串匹配，第一个命中即返回；
 * 全不中回落到该模块默认反馈与默认部件（永不为空）。module 为 unknown 时返回空对象。
 * 匹配对象是 `intent + " " + userText`，因此“替谁做”的第三人称主语不影响命中，
 * 只要动作关键词出现即可（如“帮我妈把靠背升高”仍命中靠背调节）。
 */
export function resolveAction(
  module: ModuleId,
  intent: string,
  userText: string,
): { feature: string; action: string; component: string; state: string } {
  if (module === "unknown") return { feature: "", action: "", component: "", state: "" };
  const catalog = FEATURE_CATALOG[module];
  const haystack = `${intent} ${userText}`;
  for (const feature of catalog.features) {
    if (feature.match.some((keyword) => haystack.includes(keyword))) {
      return { feature: feature.feature, action: feature.action, component: feature.component, state: feature.state };
    }
  }
  return { feature: "", action: catalog.defaultAction, component: catalog.defaultComponent, state: catalog.defaultState };
}

/** 从模型返回的文本里尽力解析出 JSON 对象。 */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
