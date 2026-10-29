import React from 'react';
import {
  LayoutDashboard,
  FileText,
  Clock,
  Calendar,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { TabType } from '../types';

interface BottomNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  overdueCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  overdueCount,
}) => {
  const tabs = [
    { id: 'dashboard' as TabType, label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'documents' as TabType, label: 'Văn bản', icon: FileText },
    { id: 'reports' as TabType, label: 'Báo cáo', icon: Clock, badge: overdueCount },
    { id: 'calendar' as TabType, label: 'Lịch tháng', icon: Calendar },
    { id: 'stats' as TabType, label: 'Thống kê', icon: BarChart3 },
    { id: 'sync' as TabType, label: 'Đồng bộ', icon: RefreshCw },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg select-none"
      style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="max-w-md mx-auto flex items-center justify-around px-1 pt-1 pb-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all relative min-w-[54px] ${
                isActive
                  ? 'text-blue-700 font-bold'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <div
                className={`flex items-center justify-center w-10 h-7 rounded-full transition-all relative ${
                  isActive ? 'bg-blue-100/90 text-blue-700' : 'text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.3 : 1.8} />
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center shadow-xs">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                ) : null}
              </div>
              <span
                className={`text-[10px] mt-0.5 tracking-tight ${
                  isActive ? 'text-blue-700 font-bold' : 'text-slate-500 font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
