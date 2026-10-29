import { FullTextPopover } from './FullTextPopover';
import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  ArrowRight,
  TrendingUp,
  PlusCircle,
  CalendarDays,
} from 'lucide-react';
import { EnrichedReport, EnrichedDocument } from '../types';

interface DashboardTabProps {
  documents: EnrichedDocument[];
  reports: EnrichedReport[];
  onOpenReportResult: (reportId: string) => void;
  onToggleReportComplete: (reportId: string) => void;
  onNavigateToTab: (tab: 'documents' | 'reports' | 'calendar', filter?: string, period?: { mode: 'Toàn bộ' | 'Tháng' | 'Quý' | 'Năm'; year: number; month: number; quarter: number }) => void;
  onAddNewDocument: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  documents,
  reports,
  onOpenReportResult,
  onToggleReportComplete,
  onNavigateToTab,
  onAddNewDocument,
}) => {
  const now = new Date();
  const [periodMode, setPeriodMode] = useState<'Toàn bộ' | 'Tháng' | 'Quý' | 'Năm'>('Toàn bộ');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(now.getMonth() / 3) + 1);

  // Filter reports according to periodMode
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (periodMode === 'Toàn bộ') return true;
      const raw = r.due_date;
      if (!raw) return false;
      const reportYear = parseInt(raw.slice(0, 4), 10);
      if (reportYear !== selectedYear) return false;

      if (periodMode === 'Năm') return true;

      const reportMonth = raw.length >= 7 ? parseInt(raw.slice(5, 7), 10) : null;
      if (periodMode === 'Tháng') {
        return reportMonth === selectedMonth;
      }
      if (periodMode === 'Quý') {
        if (!reportMonth) return false;
        const q = Math.floor((reportMonth - 1) / 3) + 1;
        return q === selectedQuarter;
      }
      return true;
    });
  }, [reports, periodMode, selectedYear, selectedMonth, selectedQuarter]);

  // Statistics calculation
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const totalReports = filteredReports.length;
    const completed = filteredReports.filter((r) => r.completed_date).length;
    const pending = totalReports - completed;

    // Overdue: precision == 'day', incomplete, due_date < today
    const overdueList = filteredReports.filter(
      (r) => !r.completed_date && r.precision === 'day' && r.due_date < todayStr
    );

    // Upcoming in 7 days
    const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const upcomingList = filteredReports.filter(
      (r) => !r.completed_date && r.precision === 'day' && r.due_date >= todayStr && r.due_date <= sevenDaysLater
    );

    const completionRate = totalReports > 0 ? (completed / totalReports) * 100 : 0;
    const priorityList = [...overdueList, ...upcomingList].sort((a, b) => a.due_date.localeCompare(b.due_date));

    return {
      totalDocs: documents.length,
      totalReports,
      completed,
      pending,
      overdue: overdueList.length,
      upcoming: upcomingList.length,
      completionRate,
      priorityList,
    };
  }, [filteredReports, documents.length]);

  return (
    <div className="pb-24 pt-3 px-3.5 max-w-4xl mx-auto space-y-4">
      {/* Title & Quick Add Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <span>TỔNG QUAN CÔNG VIỆC</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Theo dõi tiến độ và các hạn báo cáo trọng tâm
          </p>
        </div>
        <button
          onClick={onAddNewDocument}
          className="relative -top-[7pt] flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-xs transition active:scale-95"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Thêm VB</span>
        </button>
      </div>

      {/* Period Filter Card */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Filter className="w-3.5 h-3.5 text-blue-600" />
            <span>Phạm vi thống kê</span>
          </div>
          {periodMode !== 'Toàn bộ' && (
            <button
              onClick={() => setPeriodMode('Toàn bộ')}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
            >
              Xem tất cả
            </button>
          )}
        </div>

        {/* Mode selector pills */}
        <div className="grid grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-medium text-slate-600">
          {(['Toàn bộ', 'Tháng', 'Quý', 'Năm'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setPeriodMode(mode)}
              className={`py-1.5 rounded-lg text-center transition-all ${
                periodMode === mode
                  ? 'bg-white text-blue-700 font-bold shadow-xs'
                  : 'hover:text-slate-800'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Dynamic sub-filters for Month / Quarter / Year */}
        {periodMode !== 'Toàn bộ' && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 text-xs">
            {periodMode === 'Tháng' && (
              <div className="flex-1 flex items-center gap-1.5">
                <span className="text-slate-500 font-medium shrink-0">Tháng:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 font-medium w-full"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      Tháng {m}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {periodMode === 'Quý' && (
              <div className="flex-1 flex items-center gap-1.5">
                <span className="text-slate-500 font-medium shrink-0">Quý:</span>
                <select
                  value={selectedQuarter}
                  onChange={(e) => setSelectedQuarter(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 font-medium w-full"
                >
                  <option value={1}>Quý 1 (Tháng 1-3)</option>
                  <option value={2}>Quý 2 (Tháng 4-6)</option>
                  <option value={3}>Quý 3 (Tháng 7-9)</option>
                  <option value={4}>Quý 4 (Tháng 10-12)</option>
                </select>
              </div>
            )}

            <div className="flex-1 flex items-center gap-1.5">
              <span className="text-slate-500 font-medium shrink-0">Năm:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 font-medium w-full"
              >
                {Array.from({ length: 9 }, (_, i) => now.getFullYear() - 4 + i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 4 Interactive KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Total Documents */}
        <div
          onClick={() => onNavigateToTab('documents')}
          className="bg-gradient-to-br from-blue-50 to-indigo-50/60 border border-blue-200/80 rounded-2xl p-3.5 shadow-xs cursor-pointer active:scale-98 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-700 tracking-wider uppercase">
              Tổng văn bản
            </span>
            <FileText className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-900 mt-1">
            {stats.totalDocs}
          </div>
          <div className="text-[10px] text-blue-600/80 font-medium flex items-center justify-between mt-1">
            <span>Toàn bộ hệ thống</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* Pending Reports */}
        <div
          onClick={() => onNavigateToTab('reports', 'Chưa hoàn thành', { mode: periodMode, year: selectedYear, month: selectedMonth, quarter: selectedQuarter })}
          className="bg-gradient-to-br from-amber-50 to-yellow-50/60 border border-amber-200/80 rounded-2xl p-3.5 shadow-xs cursor-pointer active:scale-98 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 tracking-wider uppercase">
              Chưa hoàn thành
            </span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-900 mt-1">
            {stats.pending}
          </div>
          <div className="text-[10px] text-amber-700 font-medium flex items-center justify-between mt-1">
            <span>{stats.totalReports} kỳ trong phạm vi</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* Overdue Reports */}
        <div
          onClick={() => onNavigateToTab('reports', 'Quá hạn', { mode: periodMode, year: selectedYear, month: selectedMonth, quarter: selectedQuarter })}
          className="bg-gradient-to-br from-red-50 to-rose-50/60 border border-red-200/80 rounded-2xl p-3.5 shadow-xs cursor-pointer active:scale-98 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-red-700 tracking-wider uppercase">
              Quá hạn
            </span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-black text-red-700 mt-1">
            {stats.overdue}
          </div>
          <div className="text-[10px] text-red-600 font-medium flex items-center justify-between mt-1">
            <span>Cần ưu tiên xử lý</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>

        {/* Completed Reports */}
        <div
          onClick={() => onNavigateToTab('reports', 'Hoàn thành', { mode: periodMode, year: selectedYear, month: selectedMonth, quarter: selectedQuarter })}
          className="bg-gradient-to-br from-emerald-50 to-teal-50/60 border border-emerald-200/80 rounded-2xl p-3.5 shadow-xs cursor-pointer active:scale-98 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-700 tracking-wider uppercase">
              Đã hoàn thành
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-800 mt-1">
            {stats.completed}
          </div>
          <div className="text-[10px] text-emerald-600 font-medium flex items-center justify-between mt-1">
            <span>Tiến độ: {stats.completionRate.toFixed(1)}%</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* Progress Bar Card */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-800">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>Tiến độ hoàn thành: {stats.completionRate.toFixed(1)}%</span>
          </div>
          <span className="text-slate-500 font-medium">
            {stats.completed}/{stats.totalReports} kỳ
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, stats.completionRate))}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-slate-500 font-medium pt-0.5">
          <span>Đến hạn ≤ 7 ngày: <strong className="text-amber-700">{stats.upcoming} kỳ</strong></span>
          <span>Quá hạn: <strong className="text-red-600">{stats.overdue} kỳ</strong></span>
        </div>
      </div>

      {/* Priority Tasks List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-red-700 tracking-tight flex items-center gap-1.5 uppercase">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>Ưu tiên cần làm (Quá hạn / ≤ 7 ngày)</span>
          </h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
            {stats.priorityList.length} việc
          </span>
        </div>

        {stats.priorityList.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-slate-200/80 text-slate-500 space-y-1">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-sm font-medium text-slate-700">Tuyệt vời! Không có báo cáo nào bị quá hạn hoặc sắp đến hạn trong 7 ngày tới.</p>
            <p className="text-xs text-slate-400">Bạn có thể kiểm tra danh sách đầy đủ ở tab Báo cáo.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.priorityList.slice(0, 15).map((item) => {
              const isOverdue = item.tag === 'overdue';
              const isUrgent = item.tag === 'urgent';

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl p-3 border transition shadow-xs ${
                    isOverdue
                      ? 'bg-red-50/80 border-red-200'
                      : isUrgent
                      ? 'bg-amber-50/80 border-amber-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 font-mono">
                          {item.number}/{item.symbol}
                        </span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white/80 border border-slate-200 text-slate-600">
                          {item.kind}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            isOverdue
                              ? 'bg-red-600 text-white'
                              : isUrgent
                              ? 'bg-amber-500 text-white'
                              : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          {item.countLabel}
                        </span>
                      </div>
                      <FullTextPopover text={item.summary} className="text-xs text-slate-700 font-medium line-clamp-2 mt-1" />
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium pt-1">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3 text-slate-400" />
                          Hạn: <strong>{item.displayDue}</strong>
                        </span>
                        <span className="truncate">{item.agency}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={() => onToggleReportComplete(item.id)}
                        className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition active:scale-95"
                      >
                        Hoàn thành
                      </button>
                      <button
                        onClick={() => onOpenReportResult(item.id)}
                        className="text-[10px] font-medium px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                      >
                        Kết quả...
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
