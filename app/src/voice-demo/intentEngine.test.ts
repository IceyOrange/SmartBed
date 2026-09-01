import { describe, expect, it } from "vitest";

import { createDemoSession, processDemoInput, recognizeIntent } from "./intentEngine";

describe("bedside voice intent engine", () => {
  it.each([
    ["把靠背升高一点", "body", "bed.back.adjust"],
    ["晚上八点提醒我吃药", "care", "care.reminder.create"],
    ["给女儿打个电话", "relationship", "relation.call.start"],
    ["播放一段京剧", "daily", "daily.media.play"],
  ])("recognizes %s", (text, domain, intent) => {
    const result = recognizeIntent(text);

    expect(result.domain).toBe(domain);
    expect(result.intent).toBe(intent);
    expect(result.confidence).not.toBe("low");
  });

  it("prioritizes emergency stop over an ordinary bed command", () => {
    expect(recognizeIntent("靠背升起来，不对，马上停下").intent).toBe("bed.stop");
  });

  it("prioritizes emergency help over conversation", () => {
    expect(recognizeIntent("别讲故事了，救命，快叫护理员").intent).toBe("care.emergency");
  });

  it("extracts common parameters", () => {
    expect(recognizeIntent("十分钟后提醒我喝水").slots).toMatchObject({
      time: "十分钟后",
      item: "喝水",
    });
    expect(recognizeIntent("给女儿打电话").slots.contact).toBe("女儿");
  });

  it("inherits bed context for continuous adjustment", () => {
    const first = processDemoInput(createDemoSession(), "把靠背升高一点");
    const second = processDemoInput(first.state, "再高一点");

    expect(second.turn.match.intent).toBe("bed.back.adjust");
    expect(second.turn.match.slots.bodyPart).toBe("靠背");
  });

  it("requires confirmation for reset and accepts spoken confirmation", () => {
    const first = processDemoInput(createDemoSession(), "把床全部放平");
    expect(first.turn.status).toBe("awaiting-confirmation");

    const second = processDemoInput(first.state, "确认");
    expect(second.turn.status).toBe("simulated-complete");
    expect(second.state.pendingAction).toBeUndefined();
  });

  it("stops immediately and clears a pending action", () => {
    const pending = processDemoInput(createDemoSession(), "把床全部放平");
    const stopped = processDemoInput(pending.state, "马上停下");

    expect(stopped.turn.match.intent).toBe("bed.stop");
    expect(stopped.state.pendingAction).toBeUndefined();
  });

  it("refuses medical dosage decisions", () => {
    const result = processDemoInput(createDemoSession(), "我该吃几片降压药");

    expect(result.turn.status).toBe("restricted");
    expect(result.turn.response).toContain("护理人员");
  });

  it("asks for a contact instead of guessing", () => {
    const result = processDemoInput(createDemoSession(), "帮我打电话");

    expect(result.turn.status).toBe("clarifying");
    expect(result.state.activeCall).toBe(false);
  });

  it.each([
    ["把腿放平", "bed.legs.adjust"],
    ["床升高一些", "bed.height.adjust"],
    ["调到吃饭姿势", "bed.scene"],
    ["恢复平躺", "bed.reset"],
    ["记一下我刚吃过药了", "care.record.create"],
    ["今天翻过几次身", "care.record.query"],
    ["今天还有什么护理事项", "care.todo.query"],
    ["下午康复训练完成了", "care.todo.update"],
    ["接听电话", "relation.call.answer"],
    ["挂断电话", "relation.call.end"],
    ["听听女儿的留言", "relation.message.play"],
    ["帮我给女儿留句话", "relation.message.create"],
    ["今天谁生日", "relation.anniversary.query"],
    ["给孙女送生日祝福", "relation.anniversary.greet"],
    ["今天有什么安排", "daily.schedule.query"],
    ["明天会下雨吗", "daily.weather.query"],
    ["记一下眼镜放在抽屉里", "daily.note.create"],
    ["我刚才记了什么", "daily.note.query"],
    ["陪我聊会儿", "daily.chat"],
    ["声音小一点", "daily.media.control"],
  ])("covers capability phrase %s", (text, intent) => {
    expect(recognizeIntent(text).intent).toBe(intent);
  });
});
