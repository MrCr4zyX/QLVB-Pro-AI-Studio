import React from 'react';
import {
  LayoutDashboard,
  FileText,
  Clock,
  Calendar,
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
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg select-none"
      style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="max-w-xl mx-auto grid grid-cols-4 items-center px-1.5 pt-1 pb-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`min-h-[48px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-colors relative ${
                isActive
                  ? 'text-blue-700 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div
                className={`flex items-center justify-center w-11 h-7 rounded-full transition-colors relative ${
                  isActive ? 'bg-blue-100 text-blue-700' : 'text-slate-500'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2.4 : 1.9} />
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-black tabular-nums flex items-center justify-center shadow-xs">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                ) : null}
              </div>
              <span
                className={`text-[11px] mt-0.5 tracking-tight whitespace-nowrap leading-tight ${
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
