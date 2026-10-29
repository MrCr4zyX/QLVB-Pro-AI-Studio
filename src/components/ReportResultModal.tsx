import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, RotateCcw, FileText, Calendar, Save, History } from 'lucide-react';
import { EnrichedReport, ResultAudit } from '../types';
import { displayDate, parseDateInput } from '../utils/dateUtils';

interface ReportResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: EnrichedReport | null;
  onSaveResult: (
    reportId: string,
    completedDate: string,
    resultSymbol: string,
    resultAttachment: string,
    resultNotes: string
  ) => void;
  onUndoReport: (reportId: string) => void;
  resultAudits?: ResultAudit[];
}

export const ReportResultModal: React.FC<ReportResultModalProps> = ({
  isOpen,
  onClose,
  report,
  onSaveResult,
  onUndoReport,
  resultAudits = [],
}) => {
  const [completedDate, setCompletedDate] = useState('');
  const [resultSymbol, setResultSymbol] = useState('');
  const [resultAttachment, setResultAttachment] = useState('');
  const [resultNotes, setResultNotes] = useState('');

  useEffect(() => {
    if (report) {
      const todayIso = new Date().toISOString().slice(0, 10);
      setCompletedDate(displayDate(report.completed_date || todayIso));
      setResultSymbol(report.result_symbol || '');
      setResultAttachment(report.result_attachment || '');
      setResultNotes(report.result_notes || '');
    }
  }, [report, isOpen]);

  if (!isOpen || !report) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const iso = parseDateInput(completedDate);
    if (!iso) {
      alert('Vui lòng nhập ngày hoàn thành hợp lệ (dd/mm/yyyy)');
      return;
    }

    onSaveResult(
      report.id,
      iso,
      resultSymbol.trim(),
      resultAttachment.trim(),
      resultNotes.trim()
    );
    onClose();
  };

  const handleUndo = () => {
    if (confirm('Chuyển kỳ báo cáo này về chưa hoàn thành? Thông tin kết quả vẫn được giữ để tra cứu.')) {
      onUndoReport(report.id);
      onClose();
    }
  };

  const auditsForThisReport = resultAudits.filter((a) => a.report_id === report.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 px-4 py-3 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-bold tracking-tight">KẾT QUẢ BÁO CÁO</h3>
            <p className="text-[11px] text-blue-200">
              {report.number}/{report.symbol} • {report.kind} (Hạn: {report.displayDue})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-blue-200 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 overflow-y-auto flex-1 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Ngày hoàn thành (dd/mm/yyyy) *
            </label>
            <input
              type="text"
              placeholder="dd/mm/yyyy"
              value={completedDate}
              onChange={(e) => setCompletedDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Số/Ký hiệu báo cáo kết quả
            </label>
            <input
              type="text"
              placeholder="VD: 45/BC-TM"
              value={resultSymbol}
              onChange={(e) => setResultSymbol(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              File báo cáo kết quả (đường dẫn / tên tệp)
            </label>
            <input
              type="text"
              placeholder="D:/K02/Ket_qua_bao_cao.pdf"
              value={resultAttachment}
              onChange={(e) => setResultAttachment(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800 font-mono text-[11px]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Ghi chú kết quả báo cáo
            </label>
            <textarea
              rows={3}
              placeholder="Nhập chi tiết tình hình thực hiện, nơi nhận, số công văn đi kèm..."
              value={resultNotes}
              onChange={(e) => setResultNotes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800 leading-relaxed"
            />
          </div>

          {/* Audit History */}
          {auditsForThisReport.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600 mb-1.5">
                <History className="w-3.5 h-3.5 text-blue-600" />
                <span>Lịch sử cập nhật kết quả:</span>
              </div>
              <div className="max-h-24 overflow-y-auto space-y-1 bg-slate-50 p-2 rounded-xl border border-slate-200 text-[10px]">
                {auditsForThisReport.map((a) => (
                  <div key={a.id} className="text-slate-600">
                    <span className="font-semibold text-slate-800">{a.changed_at.slice(0, 16)}</span>: {a.action} ({a.completed_date || 'Chưa xong'}) {a.result_symbol ? `- ${a.result_symbol}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
            <div>
              {report.completed_date && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 flex items-center gap-1 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Hoàn tác</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Đóng
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5 active:scale-95 transition"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Lưu kết quả</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
