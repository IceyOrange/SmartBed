import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { type FormEvent, useState } from "react";

import type { CareTask } from "../types";

interface CarePlanScreenProps {
  tasks: CareTask[];
  onChange: (tasks: CareTask[]) => void;
  onBack: () => void;
}

interface TaskDraft {
  id?: string;
  title: string;
  time: string;
  note: string;
}

const emptyDraft: TaskDraft = {
  title: "",
  time: "08:30",
  note: "到点后由护理床主动语音提醒",
};

export function CarePlanScreen({ tasks, onChange, onBack }: CarePlanScreenProps) {
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const enabledTasks = tasks.filter((task) => task.enabled);
  const completedCount = enabledTasks.filter((task) => task.status === "done").length;

  const toggleTask = (id: string) => {
    onChange(tasks.map((task) => task.id === id ? { ...task, enabled: !task.enabled } : task));
  };

  const openEdit = (task: CareTask) => {
    setDraft({ id: task.id, title: task.title, time: task.time, note: task.note });
  };

  const saveTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !draft.title.trim()) {
      return;
    }

    if (draft.id) {
      onChange(tasks.map((task) => task.id === draft.id
        ? { ...task, title: draft.title.trim(), time: draft.time, note: draft.note.trim() }
        : task));
    } else {
      onChange([
        ...tasks,
        {
          id: `care-${Date.now()}`,
          title: draft.title.trim(),
          time: draft.time,
          note: draft.note.trim(),
          status: "upcoming",
          enabled: true,
        },
      ]);
    }

    setDraft(null);
  };

  const deleteTask = () => {
    if (!draft?.id) {
      return;
    }
    onChange(tasks.filter((task) => task.id !== draft.id));
    setDraft(null);
  };

  return (
    <main className="care-plan-screen">
      <header className="detail-header">
        <button type="button" className="back-button" aria-label="返回首页" onClick={onBack}>
          <ArrowLeft size={21} aria-hidden="true" />
        </button>
        <div>
          <h1>护理事项</h1>
          <p>由床端语音提醒，家属端负责设置</p>
        </div>
        <button type="button" className="more-button" aria-label="更多护理设置">
          <MoreHorizontal size={21} aria-hidden="true" />
        </button>
      </header>

      <section className="care-plan-overview">
        <div className="care-plan-progress">
          <span>{completedCount}</span>
          <small>/{enabledTasks.length} 已完成</small>
        </div>
        <div>
          <strong>今天的照护节奏</strong>
          <p>还有 {Math.max(0, enabledTasks.length - completedCount)} 项需要确认</p>
        </div>
        <button type="button" onClick={() => onChange(tasks.map((task) => ({ ...task, status: "upcoming" })))}>
          <RotateCcw size={15} aria-hidden="true" />重置
        </button>
      </section>

      <section className="care-task-list" aria-label="护理事项列表">
        <div className="care-list-heading">
          <h2>今日计划</h2>
          <span>{enabledTasks.length} 项已启用</span>
        </div>
        {tasks.map((task) => (
          <article className={`care-task-row status-${task.status}${task.enabled ? "" : " is-disabled"}`} key={task.id}>
            <div className="task-time"><Clock3 size={15} aria-hidden="true" />{task.time}</div>
            <div className="task-main">
              <strong>{task.title}</strong>
              <p>{task.note}</p>
              <span className="task-state">
                {task.status === "done" ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                {task.status === "done" ? "已完成" : task.status === "attention" ? "需要关注" : "待进行"}
              </span>
            </div>
            <div className="task-controls">
              <label className="mini-switch" aria-label={`${task.enabled ? "停用" : "启用"}${task.title}`}>
                <input type="checkbox" checked={task.enabled} onChange={() => toggleTask(task.id)} />
                <span aria-hidden="true" />
              </label>
              <button type="button" aria-label={`编辑${task.title}`} onClick={() => openEdit(task)}>
                <MoreHorizontal size={18} aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </section>

      <button type="button" className="add-care-button" aria-label="新增护理事项" onClick={() => setDraft(emptyDraft)}>
        <Plus size={19} aria-hidden="true" />新增护理事项
      </button>

      {draft ? (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDraft(null);
        }}>
          <section className="edit-task-sheet" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-title-row">
              <div>
                <h2 id="task-form-title">{draft.id ? "编辑护理事项" : "新增护理事项"}</h2>
                <p>设置后将同步到护理床端</p>
              </div>
              {draft.id ? (
                <button type="button" className="delete-task-button" aria-label="删除护理事项" onClick={deleteTask}>
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <form onSubmit={saveTask}>
              <label>
                <span>事项名称</span>
                <input
                  value={draft.title}
                  placeholder="例如：早餐后服药"
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  autoFocus
                />
              </label>
              <label>
                <span>提醒时间</span>
                <input
                  type="time"
                  value={draft.time}
                  onChange={(event) => setDraft({ ...draft, time: event.target.value })}
                />
              </label>
              <label>
                <span>提醒说明</span>
                <textarea
                  rows={3}
                  value={draft.note}
                  onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                />
              </label>
              <div className="sheet-actions">
                <button type="button" onClick={() => setDraft(null)}>取消</button>
                <button type="submit" className="primary-action">保存并同步</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
