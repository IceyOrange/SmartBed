import { useCallback, useEffect, useState } from "react";

import { agentApi, ApiError } from "./api/client";
import { toCareTasks, toRecentUpdates, toTimelineItems } from "./api/adapters";
import { BottomNavigation } from "./components/BottomNavigation";
import { CallOverlay } from "./components/CallOverlay";
import { ContactLauncher } from "./components/ContactLauncher";
import { Toast } from "./components/Toast";
import { type AppTab, shouldShowContactLauncher } from "./lib/navigation";
import { CarePlanScreen } from "./screens/CarePlanScreen";
import { ContactScreen } from "./screens/ContactScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import type { CareTask, RecentUpdate, TimelineItem } from "./types";

type AppView = "tabs" | "care-plan";
type ConnectionStatus = "connecting" | "online" | "offline";

function messageFor(error: unknown) {
  return error instanceof ApiError ? error.message : "操作失败，请稍后重试";
}

function scheduleFor(time: string) {
  return `今天 ${time}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [view, setView] = useState<AppView>("tabs");
  const [careTasks, setCareTasks] = useState<CareTask[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [recentUpdates, setRecentUpdates] = useState<RecentUpdate[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [bedAvailable, setBedAvailable] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const [, overview, state, reminderList] = await Promise.all([
        agentApi.health(),
        agentApi.getOverview(),
        agentApi.getState(),
        agentApi.getReminders(),
      ]);
      const nextTimeline = toTimelineItems(overview.relationship);
      setCareTasks(toCareTasks(reminderList.items));
      setTimeline(nextTimeline);
      setRecentUpdates(toRecentUpdates(overview.care_coordination));
      setUnreadCount(nextTimeline.filter((item) => item.kind === "incoming-voice" && item.unread).length);
      setBedAvailable(!state.bed.fault);
      setConnectionStatus("online");
    } catch {
      setBedAvailable(false);
      setConnectionStatus("offline");
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const runMutation = useCallback(async (operation: () => Promise<unknown>, success: string) => {
    try {
      await operation();
      await refreshData();
      showToast(success);
    } catch (error) {
      if (error instanceof ApiError && ["network_error", "timeout"].includes(error.code)) {
        setConnectionStatus("offline");
        setBedAvailable(false);
      }
      showToast(messageFor(error));
    }
  }, [refreshData, showToast]);

  const syncCareTasks = useCallback((nextTasks: CareTask[]) => {
    const previousById = new Map(careTasks.map((task) => [task.id, task]));
    const nextById = new Map(nextTasks.map((task) => [task.id, task]));
    const added = nextTasks.find((task) => !previousById.has(task.id));
    const removed = careTasks.find((task) => !nextById.has(task.id));
    const changed = nextTasks.filter((task) => {
      const previous = previousById.get(task.id);
      return previous && JSON.stringify(previous) !== JSON.stringify(task);
    });

    if (added) {
      void runMutation(() => agentApi.createReminder({
        actor_id: "family-1",
        recipient: "elder-1",
        scheduled_for: scheduleFor(added.time),
        message: added.title,
        note: added.note,
        status: added.status,
        enabled: added.enabled,
      }), "护理事项已同步");
      return;
    }
    if (removed) {
      void runMutation(() => agentApi.deleteReminder(removed.id), "护理事项已删除");
      return;
    }
    if (changed.length) {
      void runMutation(
        () => Promise.all(changed.map((task) => agentApi.updateReminder(task.id, {
          scheduled_for: scheduleFor(task.time),
          message: task.title,
          note: task.note,
          status: task.status,
          enabled: task.enabled,
        }))),
        "护理事项已同步",
      );
    }
  }, [careTasks, runMutation]);

  const changeTab = (tab: AppTab) => {
    setActiveTab(tab);
    setView("tabs");
    if (tab === "contact") setUnreadCount(0);
  };

  const sendVoice = (duration: number) => {
    void runMutation(() => agentApi.createVoiceMessage({
      sender: "family-1",
      recipient: "elder-1",
      content: "一条刚刚发送给妈妈的语音留言。",
      duration_seconds: duration,
      summary: "一条刚刚发送给妈妈的语音留言。",
    }), "留言已发送给妈妈");
  };

  const startCall = async () => {
    try {
      const response = await agentApi.startCall({ contact: "妈妈", initiated_by: "family-1" });
      setActiveCallId(response.item.call_id);
      setCallOpen(true);
    } catch (error) {
      showToast(messageFor(error));
    }
  };

  const endCall = () => {
    const callId = activeCallId;
    setCallOpen(false);
    setActiveCallId(null);
    if (callId) {
      void runMutation(() => agentApi.endCall(callId), "通话已结束");
    }
  };

  const openContact = () => changeTab("contact");
  const deviceOnline = connectionStatus === "online" && bedAvailable;

  return (
    <div className="app-stage">
      <div className="mobile-app-shell">
        <div className="app-status-bar" aria-hidden="true">
          <span>9:41</span>
          <div><span className="signal-bars" /><span className="wifi-mark" /><span className="battery-mark" /></div>
        </div>

        {view === "care-plan" ? (
          <CarePlanScreen tasks={careTasks} onChange={syncCareTasks} onBack={() => setView("tabs")} />
        ) : (
          <>
            {activeTab === "home" ? (
              <HomeScreen
                careTasks={careTasks}
                recentUpdates={recentUpdates}
                connectionStatus={connectionStatus}
                onManageCare={() => setView("care-plan")}
                onOpenContact={openContact}
                onStartCall={() => void startCall()}
                onToast={showToast}
              />
            ) : null}

            {activeTab === "contact" ? (
              <ContactScreen
                items={timeline}
                deviceOnline={deviceOnline}
                onStartCall={() => void startCall()}
                onToast={showToast}
              />
            ) : null}

            {activeTab === "profile" ? (
              <ProfileScreen deviceOnline={deviceOnline} onToast={showToast} />
            ) : null}

            {shouldShowContactLauncher(activeTab) ? (
              <ContactLauncher
                deviceOnline={deviceOnline}
                onSendVoice={sendVoice}
                onStartCall={() => void startCall()}
                onHint={showToast}
              />
            ) : null}

            <BottomNavigation activeTab={activeTab} unreadCount={unreadCount} onChange={changeTab} />
          </>
        )}

        <CallOverlay open={callOpen} onClose={endCall} />
        <Toast message={toast} />
      </div>
    </div>
  );
}
