import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, AlertTriangle, Plus, Trash2, Calendar, Shield, Save, ChevronDown, FolderOpen, FileText, Folder } from 'lucide-react';
import {
  Document,
  Schedule,
  DocumentType,
  WorkField,
  SecurityLevel,
  EffectStatus,
} from '../types';
import { displayDate, parseDateInput, parseFlexibleDate, searchKey, formatDateInputMask } from '../utils/dateUtils';
import { ATTACHMENT_PREFIX, getAttachment, saveAttachment, openAttachment, chooseAttachmentFolder } from '../services/attachmentService';

interface DocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (docData: Partial<Document>, schedules: Schedule[], selectedFieldIds: number[]) => void;
  documentToEdit?: Document | null;
  existingSchedules?: Schedule[];
  existingFieldIds?: number[];
  allDocuments: Document[];
  documentTypes: DocumentType[];
  workFields: WorkField[];
}

// Editable combo box: offers existing values without restricting free typing.
interface HistoryComboProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  mono?: boolean;
}

const HistoryCombo: React.FC<HistoryComboProps> = ({ value, onChange, options, placeholder, required, mono }) => {
  const [open, setOpen] = useState(false);
  const [querying, setQuerying] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const q = querying ? searchKey(value.trim()) : '';
    return options.filter(item => !q || searchKey(item).includes(q));
  }, [options, querying, value]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div className="flex items-stretch rounded-lg border border-slate-300 bg-slate-50 focus-within:ring-2 focus-within:ring-blue-200">
        <input
          type="text"
          value={value}
          required={required}
          placeholder={placeholder}
          onChange={event => { onChange(event.target.value); setQuerying(true); setOpen(true); }}
          onFocus={() => { setQuerying(false); }}
          onKeyDown={event => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'ArrowDown') { event.preventDefault(); setQuerying(false); setOpen(true); }
          }}
          className={`min-w-0 w-full bg-transparent p-2 text-slate-800 font-medium outline-none ${mono ? 'font-mono' : ''}`}
        />
        <button type="button" aria-label="Xem lịch sử đã nhập" aria-expanded={open}
          onClick={() => { setQuerying(false); setOpen(v => !v); }}
          className="shrink-0 px-2 border-l border-slate-200 text-slate-600 hover:bg-slate-100 rounded-r-lg">
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[100] max-h-48 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white shadow-xl">
          {matches.length ? matches.map(item => (
            <button type="button" key={item} onClick={() => { onChange(item); setOpen(false); setQuerying(false); }}
              className="block w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-blue-50 focus:bg-blue-50 break-words">
              {item}
            </button>
          )) : <div className="px-3 py-2 text-xs text-slate-500">Chưa có giá trị phù hợp</div>}
        </div>
      )}
    </div>
  );
};

export const DocumentModal: React.FC<DocumentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  documentToEdit,
  existingSchedules = [],
  existingFieldIds = [],
  allDocuments,
  documentTypes,
  workFields,
}) => {
  const [issued, setIssued] = useState('');
  const [number, setNumber] = useState('');
  const [symbol, setSymbol] = useState('');
  const [securityLevel, setSecurityLevel] = useState<SecurityLevel>('Thường');
  const [agency, setAgency] = useState('Bộ Công an');
  const symbolHistory = useMemo(() => Array.from(new Set(allDocuments.map(d => (d.symbol || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi')), [allDocuments]);
  const agencyHistory = useMemo(() => Array.from(new Set(['Bộ Công an', ...allDocuments.map(d => (d.agency || '').trim())].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi')), [allDocuments]);
  const [typeId, setTypeId] = useState<number>(1);
  const [selectedFields, setSelectedFields] = useState<number[]>([]);
  const [effectStatus, setEffectStatus] = useState<EffectStatus>('Còn hiệu lực');
  const [expiryDate, setExpiryDate] = useState('');
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [attachment, setAttachment] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [amendmentText, setAmendmentText] = useState('');

  // Schedules state
  interface ScheduleItem {
    kind: string;
    enabled: boolean;
    dateInput: string;
    repeatRule: string;
    yearInput: string;
  }

  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateList, setDuplicateList] = useState<Document[]>([]);
  const [pendingSavePayload, setPendingSavePayload] = useState<any>(null);

  useEffect(() => {
    if (documentToEdit) {
      setIssued(displayDate(documentToEdit.issued));
      setNumber(documentToEdit.number || '');
      setSymbol(documentToEdit.symbol || '');
      setSecurityLevel(documentToEdit.security_level || 'Thường');
      setAgency(documentToEdit.agency || '');
      setTypeId(documentToEdit.type_id || 1);
      setSelectedFields(existingFieldIds);
      setEffectStatus(documentToEdit.effect_status || 'Còn hiệu lực');
      setExpiryDate(displayDate(documentToEdit.expiry_date));
      setSummary(documentToEdit.summary || '');
      setNotes(documentToEdit.notes || '');
      setAttachment(documentToEdit.attachment || '');
      setAmendmentText(documentToEdit.amendment_text || '');

      // Load existing schedules
      const defaultKinds = ['Sắp tới', 'Định kỳ', 'Sơ kết', 'Tổng kết'];
      const extraKinds = existingSchedules
        .map((s) => s.kind)
        .filter((k) => !defaultKinds.includes(k));

      const allKindsToRender = Array.from(new Set([...defaultKinds, ...extraKinds]));

      const items: ScheduleItem[] = allKindsToRender.map((kind) => {
        const found = existingSchedules.find((s) => s.kind === kind);
        if (found) {
          let dateStr = '';
          if (kind.startsWith('Định kỳ')) {
            if (found.repeat_rule === 'Hằng năm' && found.start_date) {
              const [, m] = found.start_date.split('-');
              dateStr = `${String(found.day_of_month || 15).padStart(2, '0')}/${m}`;
            } else {
              dateStr = String(found.day_of_month || 15);
            }
          } else {
            dateStr = displayDate(found.start_date);
          }

          return {
            kind,
            enabled: true,
            dateInput: dateStr,
            repeatRule: found.repeat_rule,
            yearInput: '',
          };
        }

        return {
          kind,
          enabled: false,
          dateInput: kind.startsWith('Định kỳ') ? '15' : '',
          repeatRule: kind.startsWith('Định kỳ') ? 'Hằng tháng' : 'Không lặp',
          yearInput: '',
        };
      });

      setScheduleItems(items);
    } else {
      // New document defaults
      const today = new Date();
      setIssued(displayDate(today.toISOString().slice(0, 10)));
      setNumber('');
      setSymbol('');
      setSecurityLevel('Thường');
      setAgency('Bộ Công an');
      setTypeId(10); // Kế hoạch
      setSelectedFields([4]); // Tham mưu
      setEffectStatus('Còn hiệu lực');
      setExpiryDate('');
      setSummary('');
      setNotes('');
      setAttachment('');
      setAmendmentText('');

      setScheduleItems([
        { kind: 'Sắp tới', enabled: false, dateInput: '', repeatRule: 'Không lặp', yearInput: '' },
        { kind: 'Định kỳ', enabled: true, dateInput: '20', repeatRule: 'Hằng tháng', yearInput: '' },
        { kind: 'Sơ kết', enabled: false, dateInput: '', repeatRule: 'Không lặp', yearInput: '' },
        { kind: 'Tổng kết', enabled: false, dateInput: '', repeatRule: 'Không lặp', yearInput: '' },
      ]);
    }
  }, [documentToEdit, existingSchedules, existingFieldIds, isOpen]);

  const handlePickAttachment = async (file?: File) => {
    if (!file) return;
    setAttachmentBusy(true);
    try {
      const reference = await saveAttachment(file);
      setAttachment(reference);
      setAttachmentName(file.name);
    } catch (error) {
      alert('Không lưu được file đính kèm: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setAttachmentBusy(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    }
  };

  const handleOpenAttachment = async () => {
    if (!attachment.trim()) return;
    try { await openAttachment(attachment.trim()); }
    catch (error) { alert(error instanceof Error ? error.message : String(error)); }
  };

  const handleOpenFolder = async () => {
    try { await chooseAttachmentFolder(attachmentName); }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    let active = true;
    if (!isOpen || !attachment.startsWith(ATTACHMENT_PREFIX)) {
      setAttachmentName('');
      return;
    }
    getAttachment(attachment).then(record => {
      if (active) setAttachmentName(record?.name || 'File không có trên thiết bị');
    }).catch(() => { if (active) setAttachmentName('Không đọc được file'); });
    return () => { active = false; };
  }, [attachment, isOpen]);

  if (!isOpen) return null;

  const toggleFieldSelection = (fieldId: number) => {
    setSelectedFields((prev) =>
      prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]
    );
  };

  const addPeriodicSchedule = () => {
    let nextIndex = 2;
    while (scheduleItems.some((item) => item.kind === `Định kỳ ${nextIndex}`)) {
      nextIndex++;
    }
    const newKind = `Định kỳ ${nextIndex}`;
    setScheduleItems((prev) => [
      ...prev,
      { kind: newKind, enabled: true, dateInput: '15', repeatRule: 'Hằng tháng', yearInput: '' },
    ]);
  };

  const removePeriodicSchedule = (kindToRemove: string) => {
    setScheduleItems((prev) => prev.filter((item) => item.kind !== kindToRemove));
  };

  const updateScheduleItem = (index: number, patch: Partial<ScheduleItem>) => {
    setScheduleItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!number.trim() || !symbol.trim()) {
      alert('Vui lòng nhập Số văn bản và Ký hiệu!');
      return;
    }
    if (!summary.trim()) {
      alert('Vui lòng nhập Trích yếu nội dung!');
      return;
    }

    const issuedIso = parseDateInput(issued);
    if (!issuedIso) {
      alert('Ngày ban hành không hợp lệ (định dạng dd/mm/yyyy)');
      return;
    }

    const expiryIso = expiryDate.trim() ? parseDateInput(expiryDate) : null;

    // Build Schedules
    const parsedSchedules: Schedule[] = [];
    const docId = documentToEdit?.id || `doc-${Date.now()}`;

    for (const item of scheduleItems) {
      if (!item.enabled) continue;
      const v = item.dateInput.trim();

      if (item.kind.startsWith('Định kỳ')) {
        if (item.repeatRule === 'Hằng năm') {
          const parts = v.split('/');
          if (parts.length !== 2 || !parts.every((p) => /^\d+$/.test(p))) {
            alert(`${item.kind}: Vui lòng nhập ngày/tháng hợp lệ (ví dụ: 15/10)`);
            return;
          }
          const [d, m] = parts.map((p) => parseInt(p, 10));
          const currentYear = new Date().getFullYear();
          const startDate = `${currentYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          parsedSchedules.push({
            id: `sch-${docId}-${item.kind}`,
            document_id: docId,
            kind: item.kind,
            start_date: startDate,
            day_of_month: d,
            repeat_rule: 'Hằng năm',
            precision: 'day',
          });
        } else {
          // Hằng tháng hoặc Hằng quý: nhập ngày trong tháng (1-31).
          if (!/^\d{1,2}$/.test(v)) {
            alert(`${item.kind}: Vui lòng nhập ngày từ 1 đến 31`);
            return;
          }
          const dayNum = Number(v);
          if (dayNum < 1 || dayNum > 31) {
            alert(`${item.kind}: Ngày báo cáo phải là số từ 1 đến 31`);
            return;
          }
          parsedSchedules.push({
            id: `sch-${docId}-${item.kind}`,
            document_id: docId,
            kind: item.kind,
            start_date: issuedIso,
            day_of_month: dayNum,
            repeat_rule: item.repeatRule === 'Hằng quý' ? 'Hằng quý' : 'Hằng tháng',
            precision: 'day',
          });
        }
      } else {
        // Sắp tới, Sơ kết, Tổng kết
        if (!v) {
          alert(`${item.kind}: Đã chọn nhưng chưa nhập thời hạn!`);
          return;
        }

        try {
          const { start, precision } = parseFlexibleDate(v, item.repeatRule === 'Hằng năm');
          parsedSchedules.push({
            id: `sch-${docId}-${item.kind}`,
            document_id: docId,
            kind: item.kind,
            start_date: start,
            day_of_month: null,
            repeat_rule: item.repeatRule,
            precision,
          });
        } catch (err: any) {
          alert(`${item.kind}: ${err.message}`);
          return;
        }
      }
    }

    const payload = {
      docData: {
        id: docId,
        issued: issuedIso,
        number: number.trim(),
        symbol: symbol.trim(),
        security_level: securityLevel,
        agency: agency.trim() || 'Bộ Công an',
        type_id: typeId,
        effect_status: effectStatus,
        expiry_date: expiryIso,
        summary: summary.trim(),
        notes: notes.trim(),
        attachment: attachment.trim(),
        amendment_text: amendmentText.trim(),
        updated: new Date().toISOString(),
      },
      schedules: parsedSchedules,
      selectedFieldIds: selectedFields,
    };

    // Duplicate detection warning check (matching PC 3.5.10)
    const normNum = searchKey(number.trim());
    const normSym = searchKey(symbol.trim());

    const dupes = allDocuments.filter(
      (d) =>
        d.id !== docId &&
        searchKey(d.number) === normNum &&
        searchKey(d.symbol) === normSym
    );

    if (dupes.length > 0) {
      setDuplicateList(dupes);
      setPendingSavePayload(payload);
      setShowDuplicateWarning(true);
      return;
    }

    // Save directly
    onSave(payload.docData, payload.schedules, payload.selectedFieldIds);
    onClose();
  };

  const confirmDuplicateSave = () => {
    if (pendingSavePayload) {
      onSave(
        pendingSavePayload.docData,
        pendingSavePayload.schedules,
        pendingSavePayload.selectedFieldIds
      );
      setShowDuplicateWarning(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 px-4 py-3 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm tracking-tight">
              {documentToEdit ? 'Chỉnh sửa văn bản' : 'Thêm văn bản mới'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-blue-200 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Row 1: Issued, Number, Symbol, Security */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Ngày ban hành *
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                placeholder="dd/mm/yyyy"
                value={issued}
                onChange={(e) => setIssued((prev) => formatDateInputMask(e.target.value, prev))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Số văn bản *
              </label>
              <input
                type="text"
                placeholder=" "
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Ký hiệu *
              </label>
              <HistoryCombo value={symbol} onChange={setSymbol} options={symbolHistory} placeholder=" " required mono />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Độ mật
              </label>
              <select
                value={securityLevel}
                onChange={(e) => setSecurityLevel(e.target.value as SecurityLevel)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800"
              >
                <option value="Thường">Thường</option>
                <option value="Mật">Mật</option>
                <option value="Tối mật">Tối mật</option>
                <option value="Tuyệt mật">Tuyệt mật</option>
              </select>
            </div>
          </div>

          {/* Row 2: Agency, Type, Validity, Expiry */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Cơ quan ký *
              </label>
              <HistoryCombo value={agency} onChange={setAgency} options={agencyHistory} placeholder="Bộ Công an" required />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Loại văn bản
              </label>
              <select
                value={typeId}
                onChange={(e) => setTypeId(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800"
              >
                {documentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Trạng thái hiệu lực
              </label>
              <select
                value={effectStatus}
                onChange={(e) => setEffectStatus(e.target.value as EffectStatus)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800"
              >
                <option value="Còn hiệu lực">Còn hiệu lực</option>
                <option value="Hết hiệu lực">Hết hiệu lực</option>
                <option value="Cần rà soát">Cần rà soát</option>
              </select>
            </div>
          </div>

          {/* Row 3: Work Fields (chips multi-select) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
              Lĩnh vực công tác (chọn nhiều)
            </label>
            <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200">
              {workFields.map((f) => {
                const isSelected = selectedFields.includes(f.id);
                return (
                  <button
                    type="button"
                    key={f.id}
                    onClick={() => toggleFieldSelection(f.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {f.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 4: Summary */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Trích yếu nội dung văn bản *
            </label>
            <textarea
              rows={3}
              placeholder="Nhập nội dung trích yếu của văn bản..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800 leading-relaxed"
              required
            />
          </div>

          {/* Row 5: Notes & Attachment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Chú thích trọng tâm
              </label>
              <textarea
                rows={2}
                placeholder="Ghi chú thêm về văn bản..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  File đính kèm (đường dẫn / tên tệp)
                </label>
                <input
                  type="text"
                  placeholder="Đường dẫn / URL hoặc chọn file..."
                  value={attachment.startsWith(ATTACHMENT_PREFIX) ? (attachmentName || 'File đã lưu trong ứng dụng') : attachment}
                  onChange={(e) => setAttachment(e.target.value)}
                  readOnly={attachment.startsWith(ATTACHMENT_PREFIX)}
                  title={attachment}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800 font-mono text-[11px]"
                />
                <input ref={attachmentInputRef} type="file" className="hidden"
                  onChange={e => void handlePickAttachment(e.target.files?.[0])} />
                <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                  <button type="button" disabled={attachmentBusy}
                    onClick={() => attachmentInputRef.current?.click()}
                    className="flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-1.5 py-2 text-[11px] font-semibold text-white disabled:opacity-50">
                    <FolderOpen size={14} /> {attachmentBusy ? 'Đang lưu...' : 'Chọn file'}
                  </button>
                  <button type="button" disabled={!attachment || attachmentBusy}
                    onClick={() => void handleOpenAttachment()}
                    className="flex items-center justify-center gap-1 rounded-lg border border-slate-300 px-1.5 py-2 text-[11px] font-semibold text-slate-700 disabled:opacity-40">
                    <FileText size={14} /> Mở file
                  </button>
                  <button type="button" onClick={() => void handleOpenFolder()}
                    className="flex items-center justify-center gap-1 rounded-lg border border-slate-300 px-1.5 py-2 text-[11px] font-semibold text-slate-700">
                    <Folder size={14} /> Thư mục
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">File được lưu riêng trên thiết bị/trình duyệt này; không tự đồng bộ sang thiết bị khác. Nút Thư mục yêu cầu chọn thủ công trên trình duyệt hỗ trợ.</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Sửa đổi, bổ sung bởi
                </label>
                <input
                  type="text"
                  placeholder="VD: 123/QĐ-BCA"
                  value={amendmentText}
                  onChange={(e) => setAmendmentText(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* SECTION: THỜI HẠN BÁO CÁO (Matching PC 3.5.10) */}
          <div className="pt-2 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-red-600 tracking-wider uppercase">
                THỜI HẠN BÁO CÁO
              </h4>
              <button
                type="button"
                onClick={addPeriodicSchedule}
                className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 flex items-center gap-1 hover:bg-blue-100"
              >
                <Plus className="w-3 h-3" />
                <span>Thêm định kỳ</span>
              </button>
            </div>

            <div className="space-y-2">
              {scheduleItems.map((item, idx) => (
                <div
                  key={item.kind}
                  className={`p-2.5 rounded-xl border transition ${
                    item.enabled ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 min-w-[90px]">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(e) => updateScheduleItem(idx, { enabled: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span>{item.kind}</span>
                    </label>

                    {item.enabled ? (
                      <div className="flex items-center gap-2 flex-1 justify-end flex-wrap">
                        <input
                          type="text"
                          placeholder={
                            item.kind === 'Sắp tới'
                              ? 'dd/mm/yyyy'
                              : item.kind.startsWith('Định kỳ')
                              ? item.repeatRule === 'Hằng năm'
                                ? 'dd/mm'
                                : 'Ngày (1-31)'
                              : 'dd/mm/yyyy, mm/yyyy hoặc yyyy'
                          }
                          value={item.dateInput}
                          onChange={(e) => updateScheduleItem(idx, { dateInput: e.target.value })}
                          className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 font-medium text-xs min-w-[110px]"
                        />

                        {item.kind.startsWith('Định kỳ') ? (
                          <select
                            value={item.repeatRule}
                            onChange={(e) => updateScheduleItem(idx, { repeatRule: e.target.value })}
                            className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-700 font-medium text-xs"
                          >
                            <option value="Hằng tháng">Hằng tháng</option>
                            <option value="Hằng quý">Hằng quý</option>
                            <option value="Hằng năm">Hằng năm</option>
                          </select>
                        ) : (
                          <select
                            value={item.repeatRule}
                            onChange={(e) => updateScheduleItem(idx, { repeatRule: e.target.value })}
                            className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-700 font-medium text-xs"
                          >
                            <option value="Không lặp">Không lặp</option>
                            <option value="Hằng năm">Hằng năm</option>
                            <option value="Năm sau">Năm sau</option>
                          </select>
                        )}

                        {item.kind.startsWith('Định kỳ') && item.repeatRule === 'Hằng quý' && (
                          <span className="text-[10px] text-blue-700">Ngày {item.dateInput || '…'} các tháng 12, 3, 6, 9</span>
                        )}

                        {item.kind.startsWith('Định kỳ') && item.kind !== 'Định kỳ' && (
                          <button
                            type="button"
                            onClick={() => removePeriodicSchedule(item.kind)}
                            className="p-1 rounded text-red-500 hover:bg-red-50"
                            title="Xóa kỳ này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Chưa kích hoạt</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md transition flex items-center gap-1.5 active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>{documentToEdit ? 'Lưu thay đổi' : 'Lưu văn bản'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Duplicate Warning Modal (Matching PC 3.5.10 behavior) */}
      {showDuplicateWarning && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 space-y-3 shadow-2xl border-2 border-amber-500">
            <div className="flex items-center gap-2 text-amber-600 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>CẢNH BÁO: TRÙNG SỐ VÀ KÝ HIỆU VĂN BẢN!</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Hệ thống phát hiện văn bản có số <strong>{number}/{symbol}</strong> đã tồn tại trong cơ sở dữ liệu:
            </p>
            <div className="max-h-36 overflow-y-auto space-y-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
              {duplicateList.map((d) => (
                <div key={d.id} className="p-1.5 bg-white rounded-lg border border-slate-200">
                  <div className="font-bold text-slate-800">{d.number}/{d.symbol} • Ngày {displayDate(d.issued)}</div>
                  <div className="text-slate-500 text-[11px]">{d.agency}</div>
                  <div className="text-slate-700 text-[11px] truncate">{d.summary}</div>
                </div>
              ))}
            </div>
            <p className="text-xs font-medium text-slate-700">
              Bạn có chắc chắn vẫn muốn lưu văn bản này không?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDuplicateWarning(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Quay lại sửa
              </button>
              <button
                type="button"
                onClick={confirmDuplicateSave}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
              >
                Vẫn tiếp tục lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
