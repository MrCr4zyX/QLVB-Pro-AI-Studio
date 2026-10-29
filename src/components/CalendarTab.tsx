import { FullTextPopover } from './FullTextPopover';
import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { EnrichedReport } from '../types';
import { daysInMonth, displayDate } from '../utils/dateUtils';

interface CalendarTabProps {
  reports: EnrichedReport[];
  onOpenReportResult: (reportId: string) => void;
  onToggleReportComplete: (reportId: string) => void;
}

export const CalendarTab: React.FC<CalendarTabProps> = ({
  reports,
  onOpenReportResult,
  onToggleReportComplete,
}) => {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1); // 1-12
  const [selectedDateIso, setSelectedDateIso] = useState<string>(
    today.toISOString().slice(0, 10)
  );

  const prevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    const t = new Date();
    setCurrentYear(t.getFullYear());
    setCurrentMonth(t.getMonth() + 1);
    setSelectedDateIso(t.toISOString().slice(0, 10));
  };

  // Group reports by due date in this month
  const reportsByDay = useMemo(() => {
    const map = new Map<string, EnrichedReport[]>();
    const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    reports.forEach((r) => {
      if (r.precision === 'day' && r.due_date.startsWith(monthPrefix)) {
        const list = map.get(r.due_date) || [];
        list.push(r);
        map.set(r.due_date, list);
      }
    });

    return map;
  }, [reports, currentYear, currentMonth]);

  // Calendar cells generation (Monday to Sunday)
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 is Sunday
    // Convert so Monday is 0, Sunday is 6
    const mondayBasedFirstDay = (firstDayIndex + 6) % 7;
    const totalDays = daysInMonth(currentYear, currentMonth);

    const cells: { dateIso: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    // Leading empty days from prev month
    const prevMonthDays = daysInMonth(
      currentMonth === 1 ? currentYear - 1 : currentYear,
      currentMonth === 1 ? 12 : currentMonth - 1
    );

    for (let i = mondayBasedFirstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = currentMonth === 1 ? 12 : currentMonth - 1;
      const y = currentMonth === 1 ? currentYear - 1 : currentYear;
      cells.push({
        dateIso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        dayNum: d,
        isCurrentMonth: false,
      });
    }

    // Days in current month
    for (let d = 1; d <= totalDays; d++) {
      cells.push({
        dateIso: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        dayNum: d,
        isCurrentMonth: true,
      });
    }

    // Trailing days to complete weeks
    const remainder = cells.length % 7;
    if (remainder > 0) {
      const fillCount = 7 - remainder;
      const nextM = currentMonth === 12 ? 1 : currentMonth + 1;
      const nextY = currentMonth === 12 ? currentYear + 1 : currentYear;
      for (let d = 1; d <= fillCount; d++) {
        cells.push({
          dateIso: `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          dayNum: d,
          isCurrentMonth: false,
        });
      }
    }

    return cells;
  }, [currentYear, currentMonth]);

  const selectedReports = useMemo(() => {
    return reports.filter((r) => r.precision === 'day' && r.due_date === selectedDateIso);
  }, [reports, selectedDateIso]);

  const todayIso = today.toISOString().slice(0, 10);

  return (
    <div className="pb-24 pt-2 px-3 max-w-4xl mx-auto space-y-2">
      {/* Month Navigator Header - Compact */}
      <div className="bg-white rounded-xl py-2 px-3 border border-slate-200/90 shadow-xs flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
          aria-label="Tháng trước"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h2 className="text-[13px] sm:text-lg font-bold text-slate-800 tracking-tight leading-tight">
            THÁNG {String(currentMonth).padStart(2, '0')}/{currentYear}
          </h2>
          <span className="text-[11px] text-slate-500 font-medium leading-none block mt-0.5">
            Lịch báo cáo tổng hợp
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={goToday}
            className="text-[12px] font-semibold px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
          >
            Hôm nay
          </button>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition"
            aria-label="Tháng sau"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Legend - Compact */}
      <div className="flex items-center justify-center gap-3 text-[11px] font-semibold text-slate-700 flex-wrap py-0">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
          Quá hạn
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
          ≤ 7 ngày
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />
          30 ngày
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
          Hoàn thành
        </span>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 bg-blue-50/70 border-b border-blue-100 text-center py-2 text-[12px] font-bold text-blue-900">
          <span>T2</span>
          <span>T3</span>
          <span>T4</span>
          <span>T5</span>
          <span>T6</span>
          <span className="text-blue-700">T7</span>
          <span className="text-red-600">CN</span>
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-px bg-slate-200">
          {calendarCells.map((cell) => {
            const dayReports = reportsByDay.get(cell.dateIso) || [];
            const isSelected = cell.dateIso === selectedDateIso;
            const isToday = cell.dateIso === todayIso;

            const pending = dayReports.filter((r) => !r.completed_date);
            const hasOverdue = pending.some((r) => r.due_date < todayIso);
            const hasUrgent = pending.some((r) => {
              const diff = (new Date(r.due_date).getTime() - new Date(todayIso).getTime()) / (1000 * 3600 * 24);
              return diff >= 0 && diff <= 7;
            });
            const hasCompleted = dayReports.length > 0 && pending.length === 0;

            let indicatorBg = '';
            if (hasOverdue) indicatorBg = 'bg-red-500';
            else if (hasUrgent) indicatorBg = 'bg-amber-500';
            else if (pending.length > 0) indicatorBg = 'bg-yellow-400';
            else if (hasCompleted) indicatorBg = 'bg-emerald-500';

            return (
              <div
                key={cell.dateIso}
                onClick={() => setSelectedDateIso(cell.dateIso)}
                className={`h-[45px] min-h-[45px] p-1 flex flex-col justify-between transition cursor-pointer ${
                  isSelected
                    ? 'bg-blue-100 ring-2 ring-blue-600 ring-inset'
                    : cell.isCurrentMonth
                    ? 'bg-white hover:bg-slate-50'
                    : 'bg-slate-50/70 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  {/* Kích thước ngày Lịch */}
                  <span
                    className={`text-[13px] font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                        isToday
                        ? 'bg-blue-600 text-white'
                        : isSelected
                        ? 'text-blue-900 font-black'
                        : cell.isCurrentMonth
                        ? 'text-slate-800'
                        : 'text-slate-400'
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {/* Kích thước số lượng báo cáo */}       
                  {dayReports.length > 0 && (
                    <span
                      className={`text-[12px] leading-[15px] font-bold px-1 rounded-sm shrink-0 min-w-[16px] text-center ${
                        hasOverdue
                          ? 'bg-red-100 text-red-700'
                          : hasUrgent
                          ? 'bg-orange-100 text-orange-700'
                          : hasCompleted
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {dayReports.length}
                    </span>
                  )}
                </div>

                {/* Status Dot / Mini Badge - Compact without truncation */}
                {dayReports.length > 0 && (
                  <div className="flex items-center gap-1 w-full overflow-hidden leading-tight">
                    <span className={`w-2 h-2 rounded-full ${indicatorBg} shrink-0`} />
                    <span className="text-[9px] font-bold text-slate-800 tracking-tighter whitespace-nowrap overflow-hidden">
                      {hasOverdue ? 'Quá' : hasUrgent ? 'Sắp' : hasCompleted ? 'Xong' : 'Chờ'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Reports List */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase">
            <CalendarIcon className="w-4 h-4 text-blue-600" />
            <span>Báo cáo ngày {displayDate(selectedDateIso)}</span>
          </h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
            {selectedReports.length} kỳ
          </span>
        </div>

        {selectedReports.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2 text-center">
            Không có kỳ hạn báo cáo nào vào ngày này.
          </p>
        ) : (
          <div className="space-y-2">
            {selectedReports.map((report) => {
              const isDone = Boolean(report.completed_date);
              const isOverdue = report.tag === 'overdue';
              const isUrgent = report.tag === 'urgent';

              return (
                <div
                  key={report.id}
                  className={`p-3 rounded-xl border transition ${
                    isDone
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : isOverdue
                      ? 'bg-red-50/60 border-red-200'
                      : isUrgent
                      ? 'bg-amber-50/60 border-amber-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 font-mono">
                          {report.number}/{report.symbol}
                        </span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                          {report.kind}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isDone
                              ? 'bg-emerald-100 text-emerald-800'
                              : isOverdue
                              ? 'bg-red-600 text-white'
                              : 'bg-amber-500 text-white'
                          }`}
                        >
                          {report.countLabel}
                        </span>
                      </div>
                      <FullTextPopover text={report.summary} className="text-xs text-slate-700 font-medium line-clamp-2" />
                    </div>

                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => onToggleReportComplete(report.id)}
                        className={`text-[11px] font-bold px-2 py-1 rounded-lg transition active:scale-95 ${
                          isDone
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {isDone ? 'Hoàn tác' : 'Xong'}
                      </button>
                      <button
                        onClick={() => onOpenReportResult(report.id)}
                        className="text-[10px] font-medium px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
                      >
                        Kết quả
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
