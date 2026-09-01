import { HeartHandshake, Home, UserRound } from "lucide-react";

import type { AppTab } from "../lib/navigation";

interface BottomNavigationProps {
  activeTab: AppTab;
  unreadCount: number;
  onChange: (tab: AppTab) => void;
}

const navigationItems = [
  { id: "home", label: "首页", icon: Home },
  { id: "contact", label: "联系", icon: HeartHandshake },
  { id: "profile", label: "我的", icon: UserRound },
] as const;

export function BottomNavigation({
  activeTab,
  unreadCount,
  onChange,
}: BottomNavigationProps) {
  return (
    <nav className="bottom-navigation" aria-label="主要导航">
      {navigationItems.map((item) => {
        const Icon = item.icon;
        const active = activeTab === item.id;
        return (
          <button
            className={`nav-item${active ? " is-active" : ""}`}
            type="button"
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(item.id)}
            key={item.id}
          >
            <span className="nav-icon-wrap">
              <Icon size={21} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
              {item.id === "contact" && unreadCount > 0 ? (
                <span className="nav-badge" aria-label={`${unreadCount} 条新留言`}>
                  {unreadCount}
                </span>
              ) : null}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
