import { FullTextPopover } from './FullTextPopover';
import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3,
  Download,
  CheckCircle,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileText,
  PieChart,
  Layers,
  Building,
  Calendar,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { EnrichedDocument, DocumentType, WorkField } from '../types';
import { displayDate, formatDocCode } from '../utils/dateUtils';
import { playSuccessChime, playAlertChime, notifyAndroidNative } from '../utils/soundUtils';
import {
  getExportTimestampPrefix,
  saveWorkbookToQlvbFolder,
} from '../utils/fileExportUtils';

interface StatisticsTabProps {
  documents: EnrichedDocument[];
  documentTypes: DocumentType[];
  workFields: WorkField[];
  onOpenDoc: (doc: EnrichedDocument) => void;
}

export const StatisticsTab: React.FC<StatisticsTabProps> = ({
  documents,
  documentTypes,
  workFields,
  onOpenDoc,
}) => {
  const [activeStatus, setActiveStatus] = useState<string>('Tất cả');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!exportNotice) return;
    const timer = setTimeout(() => setExportNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [exportNotice]);

  // Counts by validity status
  const statusStats = useMemo(() => {
    const total = documents.length;
    const valid = documents.filter((d) => d.effect_status === 'Còn hiệu lực').length;
    const expired = documents.filter((d) => d.effect_status === 'Hết hiệu lực').length;
    const review = documents.filter((d) => d.effect_status === 'Cần rà soát').length;

    return { total, valid, expired, review };
  }, [documents]);

  // Breakdown by Type
  const typeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    documents.forEach((d) => {
      const t = d.typeName || 'Chưa phân loại';
      counts.set(t, (counts.get(t) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [documents]);

  // Breakdown by Field
  const fieldBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    documents.forEach((d) => {
      if (d.fieldNames.length === 0) {
        counts.set('Chưa phân loại', (counts.get('Chưa phân loại') || 0) + 1);
      } else {
        d.fieldNames.forEach((f) => counts.set(f, (counts.get(f) || 0) + 1));
      }
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [documents]);

  // Breakdown by Agency
  const agencyBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    documents.forEach((d) => {
      const a = d.agency || 'Không rõ';
      counts.set(a, (counts.get(a) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [documents]);

  // Export summary Excel (supports both Android APK native bridge and PC/Web QLVB_PRO subfolder creation)
  const exportStatisticsExcel = async () => {
    try {
      const wb = XLSX.utils.book_new();

      // Summary sheet
      const summaryData = [
        ['Chỉ tiêu', 'Số lượng'],
        ['Tổng số văn bản', statusStats.total],
        ['Còn hiệu lực', statusStats.valid],
        ['Hết hiệu lực', statusStats.expired],
        ['Cần rà soát', statusStats.review],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'TONG_HOP');

      // Type sheet
      const typeData = [['Loại văn bản', 'Số văn bản'], ...typeBreakdown];
      const wsType = XLSX.utils.aoa_to_sheet(typeData);
      XLSX.utils.book_append_sheet(wb, wsType, 'THEO_LOAI');

      // Field sheet
      const fieldData = [['Lĩnh vực', 'Số văn bản'], ...fieldBreakdown];
      const wsField = XLSX.utils.aoa_to_sheet(fieldData);
      XLSX.utils.book_append_sheet(wb, wsField, 'THEO_LINH_VUC');

      // Agency sheet
      const agencyData = [['Cơ quan', 'Số văn bản'], ...agencyBreakdown];
      const wsAgency = XLSX.utils.aoa_to_sheet(agencyData);
      XLSX.utils.book_append_sheet(wb, wsAgency, 'THEO_CO_QUAN');

      // Full doc list sheet
      const docData = [
        ['Số/Ký hiệu', 'Trích yếu', 'Cơ quan', 'Ngày ban hành', 'Loại văn bản', 'Lĩnh vực', 'Trạng thái', 'Hạn gần nhất'],
        ...documents.map((d) => [
          `${d.number}/${d.symbol}`,
          d.summary,
          d.agency,
          displayDate(d.issued),
          d.typeName,
          d.fieldNames.join('; '),
          d.effect_status,
          d.nextReportLabel,
        ]),
      ];
      const wsDocs = XLSX.utils.aoa_to_sheet(docData);
      XLSX.utils.book_append_sheet(wb, wsDocs, 'DANH_SACH');

      const timestamp = getExportTimestampPrefix();
      const filename = `${timestamp}_ThongKeVanBan.xlsx`;
      const { targetPath, isIframeFallback } = await saveWorkbookToQlvbFolder(wb, filename);

      playSuccessChime();
      notifyAndroidNative(
        'K02 Mobile - Xuất thống kê Excel',
        `Đã lưu "${targetPath}" (${documents.length} văn bản)`
      );
      setExportNotice({
        type: 'success',
        message: isIframeFallback
          ? `✓ Đã tải tệp "${filename}".\n(Mở ứng dụng ở tab trình duyệt PC riêng để tự động tạo thư mục con Download/QLVB_PRO)`
          : `✓ Đã xuất tệp thống kê thành công (${documents.length} văn bản)!\n📁 Vị trí: ${targetPath}`,
      });
    } catch (err: any) {
      if (err?.isUserCancelled) return;
      playAlertChime();
      setExportNotice({
        type: 'error',
        message: `Lỗi khi xuất tệp thống kê Excel: ${err?.message || 'Không thể ghi tệp'}`,
      });
    }
  };

  // Administrative priority is a display preference, not a statement of legal hierarchy.
  const typePriority = [
    'Hiến pháp', 'Bộ luật', 'Luật', 'Pháp lệnh', 'Nghị quyết', 'Nghị định',
    'Quyết định', 'Thông tư liên tịch', 'Thông tư', 'Chỉ thị', 'Quy định',
    'Quy chế', 'Hướng dẫn', 'Kế hoạch', 'Chương trình', 'Đề án',
    'Công văn', 'Thông báo', 'Báo cáo', 'Tờ trình', 'Biên bản', 'Khác', 'Chưa phân loại',
  ];
  const getTypePriority = (typeName: string) => {
    const index = typePriority.findIndex((name) => name.toLocaleLowerCase('vi') === (typeName || 'Chưa phân loại').toLocaleLowerCase('vi'));
    return index < 0 ? typePriority.length - 2 : index;
  };

  const filteredByStatus = useMemo(() => {
    return documents
      .filter((d) => activeStatus === 'Tất cả' || d.effect_status === activeStatus)
      .filter((d) => !selectedType || (d.typeName || 'Chưa phân loại') === selectedType)
      .filter((d) => !selectedField || (d.fieldNames?.length ? d.fieldNames.includes(selectedField) : selectedField === 'Chưa phân loại'))
      .slice()
      .sort((a, b) => getTypePriority(a.typeName) - getTypePriority(b.typeName) ||
        (a.typeName || '').localeCompare(b.typeName || '', 'vi') ||
        (a.number || '').localeCompare(b.number || '', 'vi', { numeric: true }));
  }, [documents, activeStatus, selectedType, selectedField]);

  return (
    <div className="pb-24 pt-4 px-4 sm:px-6 max-w-6xl mx-auto space-y-4 flex flex-col min-h-[calc(100vh-100px)]">
      {exportNotice && (
        <div
          className="fixed left-3 right-3 max-w-lg mx-auto z-50 animate-bounce-in shadow-2xl pointer-events-auto"
          style={{ top: 'max(3.8rem, calc(env(safe-area-inset-top, 0px) + 3.8rem))' }}
        >
          <div
            className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 backdrop-blur-md shadow-2xl overflow-hidden ${
              exportNotice.type === 'success'
                ? 'bg-slate-900/95 border-emerald-400 text-emerald-100'
                : 'bg-slate-900/95 border-rose-400 text-rose-100'
            }`}
          >
            {exportNotice.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0 font-semibold leading-relaxed break-words break-all [overflow-wrap:anywhere] whitespace-pre-line">
              {exportNotice.message}
            </div>
            <button
              onClick={() => setExportNotice(null)}
              className="text-xs font-black p-1 hover:bg-white/20 rounded-lg text-white shrink-0 ml-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <span>THỐNG KÊ VĂN BẢN</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Phân tích hiệu lực, cơ quan và các nhóm lĩnh vực
          </p>
        </div>
        <button
          onClick={exportStatisticsExcel}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-xs transition active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Xuất Excel</span>
        </button>
      </div>

      {/* Compact status cards: counts aligned to the right */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {([
          ['Tất cả', 'Tổng số', statusStats.total, 'bg-blue-600 text-white border-blue-700', 'bg-blue-50/80 text-blue-900 border-blue-200'],
          ['Còn hiệu lực', 'Còn hiệu lực', statusStats.valid, 'bg-emerald-600 text-white border-emerald-700', 'bg-emerald-50/80 text-emerald-900 border-emerald-200'],
          ['Hết hiệu lực', 'Hết hiệu lực', statusStats.expired, 'bg-rose-600 text-white border-rose-700', 'bg-rose-50/80 text-rose-900 border-rose-200'],
          ['Cần rà soát', 'Cần rà soát', statusStats.review, 'bg-amber-500 text-white border-amber-600', 'bg-amber-50/80 text-amber-900 border-amber-200'],
        ] as const).map(([value, label, count, activeStyle, idleStyle]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveStatus(value)}
            aria-pressed={activeStatus === value}
            className={`min-h-[38px] px-2.5 py-2 rounded-xl border text-left flex items-center justify-between gap-2 transition ${activeStatus === value ? activeStyle + ' shadow-sm ring-1 ring-inset ring-white/30' : idleStyle}`}
          >
            <span className="text-[12px] font-bold uppercase leading-tight">{label}</span>
            <span className="text-lg font-black tabular-nums shrink-0">{count}</span>
          </button>
        ))}
      </div>

      {/* Breakdown Lists */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* Filter by document type */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase">
              <Layers className="w-4 h-4 text-blue-600" /> Theo loại văn bản
            </h3>
            {selectedType && <button type="button" onClick={() => setSelectedType(null)} aria-label="Bỏ lọc loại văn bản" title="Bỏ lọc loại văn bản" className="flex items-center gap-0.5 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-1.5 py-1"><X className="w-3 h-3" /> Bỏ lọc</button>}
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto p-0.5 pr-1">
            {typeBreakdown.slice().sort((a, b) => getTypePriority(a[0]) - getTypePriority(b[0]) || a[0].localeCompare(b[0], 'vi')).map(([name, count]) => {
              const pct = statusStats.total > 0 ? (count / statusStats.total) * 100 : 0;
              const isSelected = selectedType === name;
              return (
                <button
                  type="button"
                  key={name}
                  onClick={() => setSelectedType(isSelected ? null : name)}
                  aria-pressed={isSelected}
                  className={`block w-full text-left rounded-lg px-2.5 py-1.5 border transition ${
                    isSelected
                      ? 'bg-blue-100/90 border-blue-400 shadow-2xs'
                      : 'border-transparent hover:bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <div className={`flex justify-between text-xs font-medium gap-2 ${isSelected ? 'text-blue-950 font-semibold' : 'text-slate-700'}`}>
                    <span>{name}</span>
                    <span className="font-bold shrink-0">{count} ({pct.toFixed(0)}%)</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter by work field */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase">
              <PieChart className="w-4 h-4 text-indigo-600" /> Theo lĩnh vực công tác
            </h3>
            {selectedField && <button type="button" onClick={() => setSelectedField(null)} aria-label="Bỏ lọc lĩnh vực" title="Bỏ lọc lĩnh vực" className="flex items-center gap-0.5 text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-1.5 py-1"><X className="w-3 h-3" /> Bỏ lọc</button>}
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto p-0.5 pr-1">
            {fieldBreakdown.map(([name, count]) => {
              const isSelected = selectedField === name;
              return (
                <button
                  type="button"
                  key={name}
                  onClick={() => setSelectedField(isSelected ? null : name)}
                  aria-pressed={isSelected}
                  className={`block w-full text-left rounded-lg px-2.5 py-1.5 border transition ${
                    isSelected
                      ? 'bg-indigo-100/90 border-indigo-400 shadow-2xs'
                      : 'border-transparent hover:bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <div className={`flex justify-between text-xs font-medium gap-2 ${isSelected ? 'text-indigo-950 font-semibold' : 'text-slate-700'}`}>
                    <span className="truncate">{name}</span>
                    <span className="font-bold shrink-0">{count}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Status Document List */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-xs space-y-2.5 flex-1 flex flex-col min-h-[350px]">
        <div className="flex items-center justify-between text-xs">
          <h3 className="font-bold text-slate-800 uppercase">
            Danh sách ({[activeStatus !== 'Tất cả' ? activeStatus : null, selectedType, selectedField].filter(Boolean).join(' · ') || 'Tất cả'}): {filteredByStatus.length} văn bản
          </h3>
          <span className="text-[11px] text-slate-400">Nhấn vào để chỉnh sửa</span>
        </div>

        <div className="space-y-2 flex-1 overflow-y-auto pr-1">
          {filteredByStatus.length === 0 && <div className="p-3 text-xs text-slate-500 text-center">Không có văn bản phù hợp với bộ lọc đã chọn.</div>}
          {filteredByStatus.map((d) => (
            <div
              key={d.id}
              onClick={() => onOpenDoc(d)}
              className="p-3 rounded-xl border border-slate-200 hover:border-blue-300 bg-slate-50/60 hover:bg-blue-50/40 cursor-pointer transition space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs font-black text-blue-800 break-all">
                      {formatDocCode(d.number, d.symbol)}
                    </span>
                    <span className="text-[10px] text-slate-500">• {displayDate(d.issued)}</span>
                  </div>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 shrink-0 max-w-[42%] text-right">
                  {d.nextReportLabel}
                </span>
              </div>

              {/* Two-line summary; mouse hover or single tap/click reveals full text. */}
              <FullTextPopover
                text={d.summary}
                className="block text-xs text-slate-800 leading-relaxed line-clamp-2"
              />

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700">
                  {d.typeName || 'Chưa phân loại'}
                </span>
                {(d.fieldNames || []).map((field, index) => (
                  <span key={`${field}-${index}`} className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium">
                    {field}
                  </span>
                ))}
              </div>

              {d.notes && (
                <div className="rounded-lg bg-white border border-slate-200 p-2 text-xs text-slate-700">
                  <span className="font-bold text-slate-800">Chú thích: </span>
                  <FullTextPopover text={d.notes} className="block line-clamp-2 leading-relaxed" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
