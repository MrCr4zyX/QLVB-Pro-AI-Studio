import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, AlertTriangle, Plus, Trash2, Calendar, Shield, Save, ChevronDown, FolderOpen, FileText, Folder, Camera, ImagePlus, Loader2, CheckCircle2, Sparkles, WifiOff } from 'lucide-react';
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
import { prepareImageForScan, scanDocumentImage, ScanMode, ScanEngine } from '../utils/documentScanner';

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
  const [effectStatus, setEffectStatus] = useState<EffectStatus>('Cần rà soát');
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

  // AI + Offline OCR Document Scan state
  const [scanMenuOpen, setScanMenuOpen] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('auto');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanStatusText, setScanStatusText] = useState('Đang chuẩn bị hình ảnh...');
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccessMsg, setScanSuccessMsg] = useState<string | null>(null);
  const [scanEngineUsed, setScanEngineUsed] = useState<ScanEngine | null>(null);
  const [scanFallbackNotice, setScanFallbackNotice] = useState<string | null>(null);
  const [highlightedFields, setHighlightedFields] = useState<Record<string, boolean>>({});
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  const scanMenuRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const scanAbortRef = useRef<AbortController | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (documentToEdit) {
      setIssued(displayDate(documentToEdit.issued));
      setNumber(documentToEdit.number || '');
      setSymbol(documentToEdit.symbol || '');
      setSecurityLevel(documentToEdit.security_level || 'Thường');
      setAgency(documentToEdit.agency || '');
      setTypeId(documentToEdit.type_id || 1);
      setSelectedFields(existingFieldIds);
      setEffectStatus(documentToEdit.effect_status || 'Cần rà soát');
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
      setEffectStatus('Cần rà soát');
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

  const stopWebcamStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const closeWebcam = useCallback(() => {
    stopWebcamStream();
    setWebcamOpen(false);
    setWebcamError(null);
  }, [stopWebcamStream]);

  // Reset scan state when modal closes or reopens
  useEffect(() => {
    if (!isOpen) {
      scanAbortRef.current?.abort();
      scanAbortRef.current = null;
      stopWebcamStream();
      setWebcamOpen(false);
      setWebcamError(null);
      setScanMenuOpen(false);
      setScanLoading(false);
      setScanStatusText('Đang chuẩn bị hình ảnh...');
      setScanPreviewUrl(null);
      setScanError(null);
      setScanSuccessMsg(null);
      setScanEngineUsed(null);
      setScanFallbackNotice(null);
      setHighlightedFields({});
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    }
  }, [isOpen, stopWebcamStream]);

  // Cleanup webcam & abort controller on unmount
  useEffect(() => {
    return () => {
      scanAbortRef.current?.abort();
      stopWebcamStream();
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, [stopWebcamStream]);

  // Close scan dropdown when clicking outside
  useEffect(() => {
    if (!scanMenuOpen) return;
    const handleOutside = (event: PointerEvent) => {
      if (!scanMenuRef.current?.contains(event.target as Node)) {
        setScanMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [scanMenuOpen]);

  const handleScanFile = useCallback(
    async (file?: File | Blob | null) => {
      if (!file) return;
      setScanMenuOpen(false);
      setScanError(null);
      setScanSuccessMsg(null);
      setScanEngineUsed(null);
      setScanFallbackNotice(null);
      setScanStatusText('Đang tối ưu hình ảnh...');
      setScanLoading(true);

      scanAbortRef.current?.abort();
      const controller = new AbortController();
      scanAbortRef.current = controller;

      try {
        const prepared = await prepareImageForScan(file);
        if (controller.signal.aborted) return;
        setScanPreviewUrl(prepared.previewUrl);

        const result = await scanDocumentImage(
          prepared,
          documentTypes.map((t) => t.name),
          workFields.map((f) => f.name),
          {
            mode: scanMode,
            signal: controller.signal,
            onProgress: (text) => {
              if (!controller.signal.aborted) {
                setScanStatusText(text);
              }
            },
          }
        );
        if (controller.signal.aborted) return;

        const filledLabels: string[] = [];
        const newlyHighlighted: Record<string, boolean> = {};

        // 1. Ngày ban hành
        if (result.issued && parseDateInput(result.issued)) {
          setIssued(result.issued);
          filledLabels.push('Ngày ban hành');
          newlyHighlighted.issued = true;
        }

        // 2. Số văn bản & Ký hiệu
        let extractedNumber = (result.number || '').trim();
        let extractedSymbol = (result.symbol || '').trim();
        if (extractedNumber.includes('/') && !extractedSymbol) {
          const slashIdx = extractedNumber.indexOf('/');
          extractedSymbol = extractedNumber.slice(slashIdx + 1).trim();
          extractedNumber = extractedNumber.slice(0, slashIdx).trim();
        }
        if (extractedNumber) {
          setNumber(extractedNumber);
          filledLabels.push('Số VB');
          newlyHighlighted.number = true;
        }
        if (extractedSymbol) {
          setSymbol(extractedSymbol);
          filledLabels.push('Ký hiệu');
          newlyHighlighted.symbol = true;
        }

        // 3. Cơ quan ký
        if (result.agency) {
          setAgency(result.agency);
          filledLabels.push('Cơ quan ký');
          newlyHighlighted.agency = true;
        }

        // 4. Loại văn bản
        if (result.documentType) {
          const targetKey = searchKey(result.documentType);
          const matchedType =
            documentTypes.find((t) => searchKey(t.name) === targetKey) ||
            documentTypes.find(
              (t) => searchKey(t.name).includes(targetKey) || targetKey.includes(searchKey(t.name))
            );
          if (matchedType) {
            setTypeId(matchedType.id);
            filledLabels.push('Loại VB');
            newlyHighlighted.typeId = true;
          }
        }

        // 5. Trích yếu nội dung
        if (result.summary) {
          setSummary(result.summary);
          filledLabels.push('Trích yếu');
          newlyHighlighted.summary = true;
        }

        // 6. Lĩnh vực công tác
        if (Array.isArray(result.workFields) && result.workFields.length > 0) {
          const matchedFieldIds = result.workFields
            .map((name) => {
              const key = searchKey(name);
              return workFields.find((f) => searchKey(f.name) === key)?.id;
            })
            .filter((id): id is number => typeof id === 'number');
          if (matchedFieldIds.length > 0) {
            setSelectedFields(Array.from(new Set(matchedFieldIds)));
            filledLabels.push('Lĩnh vực');
            newlyHighlighted.fields = true;
          }
        }

        if (filledLabels.length > 0) {
          setHighlightedFields(newlyHighlighted);
          if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
          highlightTimerRef.current = window.setTimeout(() => {
            setHighlightedFields({});
          }, 3200);
          setScanEngineUsed(result.engine);
          setScanFallbackNotice(result.fallbackNotice || null);
          setScanSuccessMsg(
            `Đã tự điền: ${filledLabels.join(', ')}. Vui lòng kiểm tra lại trước khi lưu.`
          );
        } else {
          setScanError(
            result.engine === 'offline'
              ? 'OCR trên máy chưa đọc được thông tin rõ ràng. Hãy chụp thẳng, đủ sáng và cận phần đầu văn bản hơn.'
              : 'Không đọc được thông tin rõ ràng từ ảnh. Vui lòng chụp cận cảnh phần đầu văn bản hơn.'
          );
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        setScanError(err?.message || 'Không thể nhận diện ảnh văn bản. Vui lòng thử lại.');
      } finally {
        if (!controller.signal.aborted) {
          setScanLoading(false);
        }
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        if (galleryInputRef.current) galleryInputRef.current.value = '';
      }
    },
    [documentTypes, workFields, scanMode]
  );

  // Support Ctrl+V image paste while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      if (scanLoading) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            handleScanFile(file);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, scanLoading, handleScanFile]);

  const handleOpenCamera = async () => {
    setScanMenuOpen(false);
    const isMobileDevice =
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    // On phones/tablets, native camera input provides full-res autofocus & flash
    if (isMobileDevice || !navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    // On desktop, open live webcam viewfinder (with fallback to file picker on error)
    setWebcamError(null);
    setWebcamOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setWebcamError('Không thể mở camera trên thiết bị này. Bạn có thể chọn ảnh có sẵn từ máy.');
    }
  };

  useEffect(() => {
    if (webcamOpen && videoRef.current && mediaStreamRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
    }
  }, [webcamOpen]);

  const handleCaptureWebcam = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        closeWebcam();
        if (blob) handleScanFile(blob);
      },
      'image/jpeg',
      0.9
    );
  };

  const handleCancelScan = () => {
    scanAbortRef.current?.abort();
    scanAbortRef.current = null;
    setScanLoading(false);
    setScanPreviewUrl(null);
  };

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
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 px-4 py-3 flex items-center justify-between gap-2 text-white shrink-0 relative z-20">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 className="font-bold text-sm tracking-tight truncate">
              {documentToEdit ? 'Chỉnh sửa văn bản' : 'Thêm văn bản mới'}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Hidden inputs for Mobile Native Camera & Gallery/Desktop Image Picker */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleScanFile(e.target.files?.[0])}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleScanFile(e.target.files?.[0])}
            />

            {/* Compact Scan Button with Effect right inside the modal header */}
            <div ref={scanMenuRef} className="relative">
              <button
                type="button"
                disabled={scanLoading}
                onClick={() => setScanMenuOpen((v) => !v)}
                title="Chụp hoặc chọn ảnh văn bản để AI tự điền form"
                className={`scan-btn-effect inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold tracking-wide transition active:scale-95 border ${
                  scanLoading
                    ? 'bg-amber-500/25 border-amber-300/80 text-amber-200 cursor-wait'
                    : 'bg-gradient-to-r from-amber-400/20 via-sky-400/20 to-amber-400/25 hover:from-amber-400/35 hover:to-sky-400/35 border-amber-300/85 text-white'
                }`}
              >
                {scanLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300 shrink-0" />
                    <span>Đang quét...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span>Scan</span>
                  </>
                )}
              </button>

              {scanMenuOpen && !scanLoading && (
                <div className="absolute right-0 top-full mt-2 w-60 bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 p-1.5 z-[120]">
                  <button
                    type="button"
                    onClick={handleOpenCamera}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-blue-50 text-left transition"
                  >
                    <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                      <Camera className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-800">Chụp ảnh (Camera)</span>
                      <span className="block text-[10px] text-slate-500">Mở máy ảnh chụp văn bản</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setScanMenuOpen(false);
                      galleryInputRef.current?.click();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-indigo-50 text-left transition mt-0.5"
                  >
                    <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                      <ImagePlus className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-800">Chọn ảnh từ máy</span>
                      <span className="block text-[10px] text-slate-500">Thư viện điện thoại hoặc máy tính</span>
                    </span>
                  </button>

                  <div className="mt-1.5 pt-1.5 border-t border-slate-100 px-1.5 pb-1 space-y-1.5">
                    <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setScanMode('auto')}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition flex items-center justify-center gap-1 ${
                          scanMode === 'auto'
                            ? 'bg-white text-blue-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        <Sparkles className="w-3 h-3 shrink-0" />
                        <span>Tự động AI</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setScanMode('offline')}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition flex items-center justify-center gap-1 ${
                          scanMode === 'offline'
                            ? 'bg-white text-amber-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        <WifiOff className="w-3 h-3 shrink-0" />
                        <span>OCR trên máy</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-snug px-0.5">
                      {scanMode === 'auto'
                        ? 'Ưu tiên AI khi có mạng, tự động chuyển OCR trên máy khi offline. Hỗ trợ Ctrl+V.'
                        : 'Chạy OCR trực tiếp trên thiết bị, không gửi ảnh ra mạng (lần đầu tải gói tiếng Việt).'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-blue-200 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Compact AI / Offline OCR Scan Progress & Feedback Banner */}
        {scanLoading && (
          <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-200 flex items-center gap-3 shrink-0">
            <div className="relative w-10 h-12 rounded-lg overflow-hidden bg-slate-900 border border-indigo-300 shrink-0 shadow-xs">
              {scanPreviewUrl ? (
                <img src={scanPreviewUrl} alt="Ảnh đang quét" className="w-full h-full object-cover opacity-85" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Camera className="w-4 h-4 text-indigo-300" />
                </div>
              )}
              <div className="animate-scan-laser absolute left-0 right-0 h-0.5 bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>{scanMode === 'offline' ? 'Đang quét OCR trên máy...' : 'Đang nhận diện văn bản...'}</span>
              </div>
              <p className="text-[11px] text-indigo-700/90 truncate">
                {scanStatusText}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCancelScan}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 shrink-0"
            >
              Hủy
            </button>
          </div>
        )}

        {!scanLoading && scanSuccessMsg && (
          <div
            className={`px-4 py-2 border-b flex items-start gap-2 shrink-0 ${
              scanEngineUsed === 'offline'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <CheckCircle2
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                scanEngineUsed === 'offline' ? 'text-amber-600' : 'text-emerald-600'
              }`}
            />
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    scanEngineUsed === 'offline'
                      ? 'bg-amber-200/80 text-amber-900'
                      : 'bg-emerald-200/80 text-emerald-900'
                  }`}
                >
                  {scanEngineUsed === 'offline' ? 'OCR trên máy' : 'AI trực tuyến'}
                </span>
                <span className="text-[11px] font-medium leading-snug">{scanSuccessMsg}</span>
              </div>
              {scanFallbackNotice && (
                <p className="text-[10px] opacity-80 leading-snug">{scanFallbackNotice}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setScanSuccessMsg(null);
                setScanFallbackNotice(null);
              }}
              className={`p-0.5 rounded ${
                scanEngineUsed === 'offline'
                  ? 'hover:bg-amber-100 text-amber-700'
                  : 'hover:bg-emerald-100 text-emerald-600'
              }`}
              aria-label="Đóng thông báo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {!scanLoading && scanError && (
          <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 flex items-center gap-2 text-rose-800 shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="text-[11px] font-medium flex-1 leading-snug">{scanError}</span>
            <button
              type="button"
              onClick={() => setScanError(null)}
              className="p-0.5 rounded hover:bg-rose-100 text-rose-600"
              aria-label="Đóng cảnh báo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

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
                className={`w-full rounded-lg p-2 font-medium text-slate-800 transition ${
                  highlightedFields.issued
                    ? 'bg-emerald-50 border-2 border-emerald-400'
                    : 'bg-slate-50 border border-slate-300'
                }`}
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
                className={`w-full rounded-lg p-2 font-medium text-slate-800 font-mono transition ${
                  highlightedFields.number
                    ? 'bg-emerald-50 border-2 border-emerald-400'
                    : 'bg-slate-50 border border-slate-300'
                }`}
                required
              />
            </div>

            <div className={highlightedFields.symbol ? 'ring-2 ring-emerald-400 rounded-lg' : ''}>
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
            <div className={highlightedFields.agency ? 'ring-2 ring-emerald-400 rounded-lg' : ''}>
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
                className={`w-full rounded-lg p-2 font-medium text-slate-800 transition ${
                  highlightedFields.typeId
                    ? 'bg-emerald-50 border-2 border-emerald-400'
                    : 'bg-slate-50 border border-slate-300'
                }`}
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
            <div
              className={`flex flex-wrap gap-1.5 p-2 rounded-xl transition ${
                highlightedFields.fields
                  ? 'bg-emerald-50 border-2 border-emerald-400'
                  : 'bg-slate-50 border border-slate-200'
              }`}
            >
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
              className={`w-full rounded-lg p-2 font-medium text-slate-800 leading-relaxed transition ${
                highlightedFields.summary
                  ? 'bg-emerald-50 border-2 border-emerald-400'
                  : 'bg-slate-50 border border-slate-300'
              }`}
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

      {/* Desktop Live Webcam Capture Modal */}
      {webcamOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-slate-900 text-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-700">
            <div className="px-4 py-3 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-sm">Chụp ảnh văn bản để quét AI</span>
              </div>
              <button
                type="button"
                onClick={closeWebcam}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {webcamError ? (
                <div className="py-8 px-4 text-center space-y-3 bg-slate-800/70 rounded-xl border border-slate-700">
                  <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                  <p className="text-xs text-slate-200 leading-relaxed">{webcamError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      closeWebcam();
                      galleryInputRef.current?.click();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>Chọn ảnh có sẵn từ máy</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] border border-slate-700">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {/* Framing corner guides */}
                    <div className="pointer-events-none absolute inset-4 border border-white/25 rounded-lg">
                      <span className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-2 border-l-2 border-amber-400 rounded-tl-md" />
                      <span className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-2 border-r-2 border-amber-400 rounded-tr-md" />
                      <span className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-2 border-l-2 border-amber-400 rounded-bl-md" />
                      <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-2 border-r-2 border-amber-400 rounded-br-md" />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 text-center">
                    Đưa phần đầu văn bản (Số/ký hiệu, Ngày ban hành, Cơ quan ký, Trích yếu) vào khung sáng rõ rồi bấm Chụp.
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        closeWebcam();
                        galleryInputRef.current?.click();
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1.5"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>Chọn ảnh</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={closeWebcam}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        Đóng
                      </button>
                      <button
                        type="button"
                        onClick={handleCaptureWebcam}
                        className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg inline-flex items-center gap-1.5 active:scale-95"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Chụp &amp; Quét</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
