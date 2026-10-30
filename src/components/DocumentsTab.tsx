import { FullTextPopover } from './FullTextPopover';
import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  X,
  Plus,
  FileText,
  Calendar,
  Building2,
  Clock,
  Edit2,
  Trash2,
  Shield,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { EnrichedDocument, DocumentType, WorkField } from '../types';
import { searchKey, displayDate, formatDocCode } from '../utils/dateUtils';

interface DocumentsTabProps {
  documents: EnrichedDocument[];
  documentTypes: DocumentType[];
  workFields: WorkField[];
  onAddNew: () => void;
  onEdit: (doc: EnrichedDocument) => void;
  onDelete: (docId: string) => void;
  onViewReportsForDoc: (docId: string) => void;
}

export const DocumentsTab: React.FC<DocumentsTabProps> = ({
  documents,
  documentTypes,
  workFields,
  onAddNew,
  onEdit,
  onDelete,
  onViewReportsForDoc,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('Tất cả');
  const [selectedField, setSelectedField] = useState<string>('Tất cả');
  const [selectedEffect, setSelectedEffect] = useState<string>('Tất cả');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedDocIds, setExpandedDocIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredDocs = useMemo(() => {
    const key = searchKey(searchTerm);

    return documents.filter((d) => {
      if (selectedType !== 'Tất cả' && d.typeName !== selectedType) return false;
      if (selectedField !== 'Tất cả' && !d.fieldNames.includes(selectedField)) return false;
      if (selectedEffect !== 'Tất cả' && d.effect_status !== selectedEffect) return false;

      if (!key) return true;
      const haystack = searchKey(
        `${d.number} ${d.symbol} ${d.agency} ${d.summary} ${d.notes} ${d.amendment_text} ${d.fieldNames.join(' ')}`
      );
      return haystack.includes(key);
    });
  }, [documents, searchTerm, selectedType, selectedField, selectedEffect]);

  const activeFilterCount =
    (selectedType !== 'Tất cả' ? 1 : 0) +
    (selectedField !== 'Tất cả' ? 1 : 0) +
    (selectedEffect !== 'Tất cả' ? 1 : 0);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedType('Tất cả');
    setSelectedField('Tất cả');
    setSelectedEffect('Tất cả');
  };

  return (
    <div className="pb-24 pt-3 px-4 sm:px-6 max-w-6xl mx-auto space-y-3 flex flex-col min-h-[calc(100vh-100px)]">
      {/* Search Bar */}
      <div className="bg-white rounded-2xl p-2.5 border border-slate-200/90 shadow-xs flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
        <input
          type="text"
          placeholder="Tìm theo số, ký hiệu, cơ quan, trích yếu..."
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
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition shrink-0 ${
            activeFilterCount > 0 || showFilters
              ? 'bg-blue-100 text-blue-700'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Lọc</span>
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-white rounded-2xl p-3 border border-blue-200 shadow-xs space-y-2.5 animate-fadeIn">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Bộ lọc danh sách</span>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-[11px] text-red-600 hover:underline font-medium"
              >
                Xóa tất cả lọc
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {/* Loại văn bản */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Loại văn bản:
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-slate-700 font-medium"
              >
                <option value="Tất cả">Tất cả loại</option>
                {documentTypes.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Lĩnh vực */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Lĩnh vực:
              </label>
              <select
                value={selectedField}
                onChange={(e) => setSelectedField(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-slate-700 font-medium"
              >
                <option value="Tất cả">Tất cả lĩnh vực</option>
                {workFields.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Trạng thái hiệu lực */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Hiệu lực:
              </label>
              <select
                value={selectedEffect}
                onChange={(e) => setSelectedEffect(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-slate-700 font-medium"
              >
                <option value="Tất cả">Tất cả trạng thái</option>
                <option value="Còn hiệu lực">Còn hiệu lực</option>
                <option value="Hết hiệu lực">Hết hiệu lực</option>
                <option value="Cần rà soát">Cần rà soát</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Results Count & Quick Actions */}
      <div className="flex items-center justify-between text-xs px-1">
        <span className="text-slate-500 font-medium">
          Hiển thị <strong className="text-slate-800">{filteredDocs.length}</strong> / {documents.length} văn bản
        </span>
        <button
          onClick={onAddNew}
          className="text-blue-700 font-bold hover:underline flex items-center gap-1 text-[11px]"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Thêm văn bản mới</span>
        </button>
      </div>

      {/* Document Cards List */}
      <div className="space-y-3 flex-1 flex flex-col">
        {filteredDocs.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-400 space-y-2">
            <FileText className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-medium text-slate-600">Không tìm thấy văn bản phù hợp</p>
            <p className="text-xs">Thử đổi từ khóa hoặc xóa bớt điều kiện lọc</p>
            <button
              onClick={clearFilters}
              className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700"
            >
              Đặt lại bộ lọc
            </button>
          </div>
        ) : (
          filteredDocs.map((doc) => {
            const isExpanded = expandedDocIds.has(doc.id);

            const effectBadgeColors = {
              'Còn hiệu lực': 'bg-emerald-100 text-emerald-800 border-emerald-200',
              'Hết hiệu lực': 'bg-rose-100 text-rose-800 border-rose-200',
              'Cần rà soát': 'bg-amber-100 text-amber-800 border-amber-200',
            }[doc.effect_status] || 'bg-slate-100 text-slate-700';

            const nextTagColors = {
              overdue: 'bg-red-600 text-white',
              urgent: 'bg-amber-500 text-white',
              orange: 'bg-orange-100 text-orange-800 border border-orange-300',
              yellow: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
              normal: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
              done: 'bg-teal-100 text-teal-800 border border-teal-200',
              none: 'bg-slate-100 text-slate-500',
            }[doc.nextReportTag];

            return (
              <div
                key={doc.id}
                className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-xs hover:border-blue-300 transition-all space-y-2"
              >
                {/* Row 1: Number/Symbol, Status Badges & Next Deadline */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                    <span className="text-sm font-black text-blue-900 font-mono tracking-tight break-all">
                      {formatDocCode(doc.number, doc.symbol)}
                    </span>
                    {doc.security_level !== 'Thường' && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-300 flex items-center gap-0.5 shrink-0">
                        <Shield className="w-2.5 h-2.5 shrink-0" />
                        {doc.security_level}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${effectBadgeColors}`}
                    >
                      {doc.effect_status}
                    </span>
                  </div>

                  {/* Next Deadline Badge */}
                  <div className="text-right shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md inline-block whitespace-nowrap ${nextTagColors}`}>
                      {doc.nextReportLabel}
                    </span>
                    {doc.nextReportDue && (
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5 whitespace-nowrap">
                        Hạn: {doc.nextReportDue}
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2: Full-width Date & Issuing Agency (prevents narrow vertical text wrapping) */}
                <div className="flex items-start gap-2 text-xs text-slate-600 font-medium bg-slate-50/90 px-2.5 py-1.5 rounded-xl border border-slate-100">
                  <span className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap text-slate-500">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{displayDate(doc.issued)}</span>
                  </span>
                  <span className="text-slate-300 shrink-0">•</span>
                  <span className="inline-flex items-start gap-1.5 text-slate-600 font-normal min-w-0 flex-1">
                    <Building2 className="w-3.5 h-3.5 text-blue-600/80 shrink-0 mt-0.5" />
                    <span className="leading-snug break-words">{doc.agency || 'Chưa rõ cơ quan'}</span>
                  </span>
                </div>

                {/* Summary */}
                <FullTextPopover text={doc.summary} className={`text-xs text-slate-800 font-medium leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`} />

                {/* Tags: Type, Fields */}
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  <span className="font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    {doc.typeName}
                  </span>
                  {doc.fieldNames.map((f, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium"
                    >
                      {f}
                    </span>
                  ))}
                </div>
                {doc.notes && (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-700">
                    <span className="font-bold text-slate-800">Chú thích: </span>
                    <FullTextPopover text={doc.notes} className="block line-clamp-2 leading-relaxed" />
                  </div>
                )}

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs text-slate-600 bg-slate-50/50 p-2.5 rounded-xl">
                    {doc.expiry_date && (
                      <div>
                        <strong className="text-slate-800">Ngày hết hiệu lực:</strong> {displayDate(doc.expiry_date)}
                      </div>
                    )}
                    {doc.amendment_text && (
                      <div>
                        <strong className="text-slate-800">Sửa đổi bổ sung bởi:</strong> {doc.amendment_text}
                      </div>
                    )}
                    {doc.linkedAmendments.length > 0 && (
                      <div>
                        <strong className="text-slate-800">Văn bản liên kết:</strong> {doc.linkedAmendments.join(', ')}
                      </div>
                    )}
                    {doc.attachment && (
                      <div>
                        <strong className="text-slate-800">Đường dẫn tệp:</strong> <span className="font-mono text-[11px] text-slate-500">{doc.attachment}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer Actions */}
                <div className="pt-1 flex items-center justify-between border-t border-slate-100 text-xs">
                  <button
                    onClick={() => toggleExpand(doc.id)}
                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 font-medium"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" />
                        <span>Thu gọn</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        <span>Chi tiết</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onViewReportsForDoc(doc.id)}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700"
                      title="Xem các kỳ hạn báo cáo"
                    >
                      <Clock className="w-3 h-3" />
                      <span>{doc.reportsCount} kỳ hạn</span>
                    </button>
                    <button
                      onClick={() => onEdit(doc)}
                      className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-blue-700 transition"
                      title="Sửa văn bản"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(doc.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                      title="Xóa văn bản"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <button
        onClick={onAddNew}
        className="fixed right-4 z-40 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-2xl flex items-center justify-center active:scale-95 transition-all focus:outline-none ring-4 ring-white/90"
        style={{ bottom: 'calc(8.25rem + env(safe-area-inset-bottom, 12px))' }}
        aria-label="Thêm văn bản mới"
        title="Thêm văn bản mới"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>
    </div>
  );
};
