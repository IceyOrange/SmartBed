import { describe, expect, it } from "vitest";
import { mapIntent, parseModelJson, resolveAction } from "./modules";

describe("parseModelJson", () => {
  it("parses clean JSON", () => {
    expect(parseModelJson('{"module":"body"}')).toEqual({ module: "body" });
  });

  it("recovers JSON wrapped in prose or code fences", () => {
    const wrapped = '好的，这是结果：```json\n{"module":"care","confidence":0.9}\n``` 完毕';
    expect(parseModelJson(wrapped)).toEqual({ module: "care", confidence: 0.9 });
  });

  it("returns null when there is no JSON object", () => {
    expect(parseModelJson("完全不是 JSON")).toBeNull();
  });
});

describe("mapIntent", () => {
  it("keeps a confident, well-formed module intent", () => {
    const mapped = mapIntent({
      module: "relationship",
      intent: "给儿子留言",
      detail: "给儿子留言：晚点回电话",
      reply: "好的，这就记下您的留言。",
      confidence: 0.92,
    });
    expect(mapped.module).toBe("relationship");
    expect(mapped.intent).toBe("给儿子留言");
    expect(mapped.reply).toContain("留言");
  });

  it("falls back to unknown below the confidence threshold", () => {
    const mapped = mapIntent({ module: "body", intent: "升高靠背", confidence: 0.2 });
    expect(mapped.module).toBe("unknown");
  });

  it("falls back to unknown for an unrecognized module name", () => {
    const mapped = mapIntent({ module: "spaceship", intent: "起飞", confidence: 0.99 });
    expect(mapped.module).toBe("unknown");
  });

  it("clamps out-of-range confidence and treats it as low", () => {
    const mapped = mapIntent({ module: "care", intent: "记录", confidence: -3 });
    expect(mapped.confidence).toBe(0);
    expect(mapped.module).toBe("unknown");
  });

  it("uses intent as detail when detail is missing", () => {
    const mapped = mapIntent({ module: "daily", intent: "查询天气", confidence: 0.8 });
    expect(mapped.detail).toBe("查询天气");
  });

  it("handles non-object input without throwing", () => {
    expect(mapIntent(null).module).toBe("unknown");
    expect(mapIntent("nope").module).toBe("unknown");
  });

  it("keeps unknown when the model itself returns unknown even at high confidence", () => {
    const mapped = mapIntent({ module: "unknown", intent: "", detail: "无法判断", confidence: 0.99 });
    expect(mapped.module).toBe("unknown");
    expect(mapped.detail).toBe("无法判断");
  });
});

describe("resolveAction", () => {
  it("resolves 靠背调节 for a backrest request", () => {
    expect(resolveAction("body", "升高靠背", "把靠背升高一点")).toEqual({
      feature: "靠背调节",
      action: "已调整靠背角度",
      component: "靠背舵机",
      state: "靠背升起来了",
    });
  });

  it("resolves 停止复位 for a stop request", () => {
    expect(resolveAction("body", "停止", "马上停下")).toEqual({
      feature: "停止复位",
      action: "已停止并保持当前位置",
      component: "安全急停模块",
      state: "已停,保持不动",
    });
  });

  it("resolves 应急呼叫 for an emergency", () => {
    expect(resolveAction("care", "呼叫护理员", "救命，快叫护理员")).toEqual({
      feature: "应急呼叫",
      action: "已呼叫护理员，马上就到",
      component: "护理站呼叫链路",
      state: "已叫护理员,马上到",
    });
  });

  it("resolves 语音留言 for leaving a message", () => {
    expect(resolveAction("relationship", "给儿子留言", "给儿子留言说我晚点回电话")).toEqual({
      feature: "语音留言",
      action: "已记录留言",
      component: "家人留言箱",
      state: "留言存好了",
    });
  });

  it("resolves 留言回顾 before 语音留言 for a lookup query", () => {
    expect(resolveAction("relationship", "回顾留言", "上次我留言了什么")).toEqual({
      feature: "留言回顾",
      action: "已为您找到留言",
      component: "家人留言箱",
      state: "念了上一条留言",
    });
  });

  it("resolves 天气 for a weather query", () => {
    expect(resolveAction("daily", "查询天气", "今天天气怎么样")).toEqual({
      feature: "天气",
      action: "已为您查询天气",
      component: "天气服务",
      state: "天气查好了",
    });
  });

  it("returns empty for the unknown module", () => {
    expect(resolveAction("unknown", "任何", "任何输入")).toEqual({
      feature: "",
      action: "",
      component: "",
      state: "",
    });
  });

  it("falls back to the module default action and default component when no keyword matches", () => {
    expect(resolveAction("body", "随便动动", "随便动动")).toEqual({
      feature: "",
      action: "已为您调整床位",
      component: "体位控制中枢",
      state: "床位调好了",
    });
  });

  it("names the driven component for at least one feature per module", () => {
    expect(resolveAction("body", "抬高腿托", "把腿托抬高一点").component).toBe("腿托舵机");
    expect(resolveAction("care", "设置提醒", "十分钟后提醒我喝水").component).toBe("护理提醒引擎");
    expect(resolveAction("relationship", "打电话", "给女儿打个电话").component).toBe("亲情通话网关");
    expect(resolveAction("daily", "点播京剧", "播放一段京剧").component).toBe("影音点播服务");
  });

  it("routes on-behalf / third-person phrasing by the requested action", () => {
    expect(resolveAction("body", "升高靠背", "帮我妈把靠背升高一点")).toEqual({
      feature: "靠背调节",
      action: "已调整靠背角度",
      component: "靠背舵机",
      state: "靠背升起来了",
    });
    expect(resolveAction("care", "记录用药", "记一下我爸刚吃过药了")).toEqual({
      feature: "护理记录",
      action: "已记入护理记录",
      component: "电子护理档案",
      state: "记进档案了",
    });
  });

  it("returns the bedside board state for a matched feature", () => {
    expect(resolveAction("daily", "点播京剧", "播放一段京剧").state).toBe("正在播放");
    expect(resolveAction("care", "呼叫护理员", "快叫护理员").state).toBe("已叫护理员,马上到");
  });

  it("returns the module defaultState when the module is hit but no keyword matches", () => {
    expect(resolveAction("care", "随便看看", "随便看看").state).toBe("已安排好");
    expect(resolveAction("relationship", "随便说说", "随便说说").state).toBe("已转达");
    expect(resolveAction("daily", "随便看看", "随便看看").state).toBe("已处理好");
  });

  it("returns an empty board state for the unknown module", () => {
    expect(resolveAction("unknown", "任何", "任何输入").state).toBe("");
  });

  it("covers newly added colloquial phrasings per module", () => {
    // body：扶我起身 / 摇高 → 靠背调节（先于情景姿势命中）
    expect(resolveAction("body", "起身", "扶我坐起来").feature).toBe("靠背调节");
    expect(resolveAction("body", "摇高床头", "把床头摇高一点").feature).toBe("靠背调节");
    // body：下床 → 整床升降
    expect(resolveAction("body", "下床", "我想下床").feature).toBe("整床升降");
    // relationship：报平安 / 发条语音 → 语音留言
    expect(resolveAction("relationship", "报平安", "给家里报个平安").feature).toBe("语音留言");
    // daily：星期几 → 今日事项；读报 → 内容点播；睡不着 → 轻量陪聊
    expect(resolveAction("daily", "今天星期几", "今天星期几").feature).toBe("今日事项");
    expect(resolveAction("daily", "读报", "给我读段报纸").feature).toBe("内容点播");
    expect(resolveAction("daily", "睡不着", "睡不着想找人说说话").feature).toBe("轻量陪聊");
  });

  it("resolves 抬腿 / 侧翻 / 便孔 body requests to their features", () => {
    // 口语“把腿抬高”“抬腿” → 腿托调节
    expect(resolveAction("body", "抬高腿", "帮我把腿抬高一点")).toEqual({
      feature: "腿托调节",
      action: "已调整腿托",
      component: "腿托舵机",
      state: "腿托抬起来了",
    });
    // 侧翻 / 翻身 → 情景姿势
    expect(resolveAction("body", "侧翻", "帮我侧翻一下").feature).toBe("情景姿势");
    expect(resolveAction("body", "翻身", "帮我翻个身").feature).toBe("情景姿势");
    // 便孔 / 变孔（同音） → 便孔护理，先于情景姿势命中
    expect(resolveAction("body", "打开便孔", "把便孔打开")).toEqual({
      feature: "便孔护理",
      action: "已打开床体便孔",
      component: "床体便孔机构",
      state: "便孔已打开",
    });
    expect(resolveAction("body", "变孔", "帮我变孔").feature).toBe("便孔护理");
  });

  it("routes 把床放平 to posture, not bed-height", () => {
    // “放平”是情景姿势；此前 整床升降 里的 “把床” 会先截胡，导致误报“床高调好了”。
    expect(resolveAction("body", "把床放平", "把床放平").feature).toBe("情景姿势");
    expect(resolveAction("body", "躺平", "帮我躺平").feature).toBe("情景姿势");
    // 真正的升降请求仍走整床升降。
    expect(resolveAction("body", "把床降低", "床太高了降一点").feature).toBe("整床升降");
    expect(resolveAction("body", "下床", "我想下床").feature).toBe("整床升降");
  });

  it("does not let bare temporal words hijack 留言回顾", () => {
    // “刚才是谁给我打电话”是通话查询，不该被 上次/刚才 误判成留言回顾。
    expect(resolveAction("relationship", "谁打来的", "刚才是谁给我打电话").feature).toBe("实时通话");
    // 但“上次我留言了什么 / 上次留言”仍应命中留言回顾（记忆回顾能力必须保住）。
    expect(resolveAction("relationship", "回顾留言", "上次我留言了什么").feature).toBe("留言回顾");
    expect(resolveAction("relationship", "上次留言", "上次留言说了啥").feature).toBe("留言回顾");
  });
});
