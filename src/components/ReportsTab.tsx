import { FullTextPopover } from './FullTextPopover';
import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  CalendarDays,
  FileCheck2,
  Building2,
  Check,
} from 'lucide-react';
import { EnrichedReport } from '../types';
import { searchKey, formatDocCode } from '../utils/dateUtils';

interface ReportsTabProps {
  reports: EnrichedReport[];
  initialFilter?: string | null;
  initialPeriod?: { mode: 'Toàn bộ' | 'Tháng' | 'Quý' | 'Năm'; year: number; month: number; quarter: number } | null;
  onOpenReportResult: (reportId: string) => void;
  onToggleReportComplete: (reportId: string) => void;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  reports,
  initialFilter,
  initialPeriod,
  onOpenReportResult,
  onToggleReportComplete,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter || '30 ngày');

  const filteredReports = useMemo(() => {
    const key = searchKey(searchTerm);
    const todayStr = new Date().toISOString().slice(0, 10);

    return reports.filter((r) => {
      // Preserve the Dashboard period scope when navigating from KPI cards.
      if (initialPeriod && initialPeriod.mode !== 'Toàn bộ') {
        const year = Number(r.due_date?.slice(0, 4));
        if (year !== initialPeriod.year) return false;
        if (initialPeriod.mode !== 'Năm') {
          const month = Number(r.due_date?.slice(5, 7));
          if (initialPeriod.mode === 'Tháng' && month !== initialPeriod.month) return false;
          if (initialPeriod.mode === 'Quý' && (!month || Math.floor((month - 1) / 3) + 1 !== initialPeriod.quarter)) return false;
        }
      }
      // Status filter
      if (statusFilter === 'Quá hạn') {
        if (r.completed_date || r.precision !== 'day' || r.due_date >= todayStr) return false;
      } else if (statusFilter === '7 ngày' || statusFilter === '30 ngày') {
        // Include today and the next N calendar days, excluding completed reports.
        const days = statusFilter === '7 ngày' ? 7 : 30;
        const limit = new Date();
        limit.setHours(12, 0, 0, 0);
        limit.setDate(limit.getDate() + days);
        const limitStr = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`;
        if (r.completed_date || r.precision !== 'day' || r.due_date < todayStr || r.due_date > limitStr) return false;
      } else if (statusFilter === 'Chưa hoàn thành') {
        if (r.completed_date) return false;
      } else if (statusFilter === 'Hoàn thành') {
        if (!r.completed_date) return false;
      }

      // Search keyword
      if (!key) return true;
      const haystack = searchKey(
        `${r.number} ${r.symbol} ${r.summary} ${r.agency} ${r.kind} ${r.result_symbol || ''} ${r.result_notes || ''}`
      );
      return haystack.includes(key);
    });
  }, [reports, searchTerm, statusFilter, initialPeriod]);

  const scopedTotal = useMemo(() => {
    if (!initialPeriod || initialPeriod.mode === 'Toàn bộ') return reports.length;
    return reports.filter(r => {
      const year = Number(r.due_date?.slice(0, 4));
      if (year !== initialPeriod.year) return false;
      if (initialPeriod.mode === 'Năm') return true;
      const month = Number(r.due_date?.slice(5, 7));
      if (initialPeriod.mode === 'Tháng') return month === initialPeriod.month;
      return Boolean(month) && Math.floor((month - 1) / 3) + 1 === initialPeriod.quarter;
    }).length;
  }, [reports, initialPeriod]);

  const filterOptions = [
    'Tất cả',
    '30 ngày',
    '7 ngày',
    'Quá hạn',
    'Chưa hoàn thành',
    'Hoàn thành',
  ];

  return (
    <div className="pb-24 pt-3 px-3.5 max-w-4xl mx-auto space-y-3">
      {/* Search Bar */}
      <div className="bg-white rounded-2xl p-2.5 border border-slate-200/90 shadow-xs flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
        <input
          type="text"
          placeholder="Tìm kỳ báo cáo theo số, trích yếu, loại báo cáo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full text-xs text-slate-800 placeholder-slate-400 outline-none bg-transparent"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Horizontal Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
        {filterOptions.map((opt) => {
          const isActive = statusFilter === opt;
          return (
            <button
              key={opt}
              onClick={() => setStatusFilter(opt)}
              className={`px-3 py-1.5 rounded-xl font-medium shrink-0 transition ${
                isActive
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {/* Summary line */}
      <div className="flex items-center justify-between text-xs px-1 text-slate-500 font-medium">
        <span>
          Hiển thị <strong className="text-slate-800">{filteredReports.length}</strong> / {scopedTotal} kỳ báo cáo
        </span>
        {statusFilter !== 'Tất cả' && (
          <button
            onClick={() => setStatusFilter('Tất cả')}
            className="text-blue-600 hover:underline"
          >
            Bỏ lọc trạng thái
          </button>
        )}
      </div>

      {/* Reports List */}
      <div className="space-y-2.5">
        {filteredReports.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-400 space-y-2">
            <Clock className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-medium text-slate-600">Không có kỳ báo cáo nào trong bộ lọc này</p>
            <p className="text-xs">Thử chuyển sang "Tất cả" hoặc thay đổi từ khóa</p>
          </div>
        ) : (
          filteredReports.map((report) => {
            const isDone = Boolean(report.completed_date);
            const isOverdue = report.tag === 'overdue';
            const isUrgent = report.tag === 'urgent';

            const tagBadge = {
              overdue: 'bg-red-600 text-white',
              urgent: 'bg-amber-500 text-white',
              orange: 'bg-orange-100 text-orange-800 border border-orange-300',
              yellow: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
              normal: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
              done: 'bg-teal-100 text-teal-800 border border-teal-200',
            }[report.tag];

            return (
              <div
                key={report.id}
                className={`rounded-2xl p-3.5 border transition shadow-xs ${
                  isDone
                    ? 'bg-slate-50/70 border-slate-200 opacity-90'
                    : isOverdue
                    ? 'bg-red-50/60 border-red-200'
                    : isUrgent
                    ? 'bg-amber-50/60 border-amber-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    {/* Header tags */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 font-mono">
                        {formatDocCode(report.number, report.symbol)}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                        {report.kind}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${tagBadge}`}>
                        {report.countLabel}
                      </span>
                    </div>

                    {/* Summary */}
                    <FullTextPopover text={report.summary} className="text-xs text-slate-800 font-medium line-clamp-2 leading-relaxed" />

                    {/* Meta */}
                    <div className="flex items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500 font-medium pt-0.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-slate-700 shrink-0 whitespace-nowrap">
                        <CalendarDays className="w-3 h-3 text-slate-400 shrink-0" />
                        Hạn: <strong>{report.displayDue}</strong>
                      </span>
                      {report.completed_date && (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold shrink-0 whitespace-nowrap">
                          <Check className="w-3 h-3 shrink-0" />
                          Xong ngày: {report.completed_date}
                        </span>
                      )}
                      <span className="text-slate-600 font-semibold break-words min-w-0">{report.agency}</span>
                    </div>

                    {/* Report result details if entered */}
                    {(report.result_symbol || report.result_notes) && (
                      <div className="mt-1.5 p-2 rounded-xl bg-blue-50/80 border border-blue-100 text-[11px] text-blue-900 space-y-0.5">
                        {report.result_symbol && (
                          <div>
                            <strong>Số KQ:</strong> {report.result_symbol}
                          </div>
                        )}
                        {report.result_notes && (
                          <div className="line-clamp-2">
                            <strong>Ghi chú KQ:</strong> {report.result_notes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Action buttons */}
                  <div className="flex flex-col gap-1.5 shrink-0 pt-0.5">
                    <button
                      onClick={() => onToggleReportComplete(report.id)}
                      className={`text-xs font-bold px-2.5 py-1.5 rounded-xl transition flex items-center justify-center gap-1 active:scale-95 shadow-xs ${
                        isDone
                          ? 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                      title={isDone ? 'Hoàn tác về chưa hoàn thành' : 'Đánh dấu đã hoàn thành'}
                    >
                      {isDone ? (
                        <>
                          <RotateCcw className="w-3 h-3" />
                          <span>Hoàn tác</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Xong</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => onOpenReportResult(report.id)}
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                    >
                      Kết quả...
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
