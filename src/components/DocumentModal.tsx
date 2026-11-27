import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, Calendar, Save, FolderOpen, FileText, Folder, Camera, ImagePlus, Loader2, Sparkles, WifiOff } from 'lucide-react';
import {
  Document,
  Schedule,
  DocumentType,
  WorkField,
  SecurityLevel,
  EffectStatus,
} from '../types';
import {
  displayDate,
  parseDateInput,
  parseFlexibleDate,
  searchKey,
  formatDateInputMask,
} from '../utils/dateUtils';
import { ATTACHMENT_PREFIX, getAttachment, saveAttachment, openAttachment, chooseAttachmentFolder } from '../services/attachmentService';
import { prepareImageForScan, scanDocumentImage, ScanMode, ScanEngine } from '../utils/documentScanner';
import { showToast } from './AppFeedback';
import { HistoryCombo } from './document-modal/HistoryCombo';
import { DocumentScanFeedback } from './document-modal/DocumentScanFeedback';
import { ScheduleEditorSection, ScheduleFormItem } from './document-modal/ScheduleEditorSection';
import { DuplicateWarningModal, WebcamCaptureModal } from './document-modal/DocumentSubModals';

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
  initialScanFile?: File | null;
  autoOpenCamera?: boolean;
  onConsumeInitialScan?: () => void;
}


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
  initialScanFile = null,
  autoOpenCamera = false,
  onConsumeInitialScan,
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
  type ScheduleItem = ScheduleFormItem;

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
  const [scanAgencySuggestions, setScanAgencySuggestions] = useState<string[]>([]);
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
      showToast(`Đã đính kèm tệp "${file.name}"`, 'success');
    } catch (error) {
      showToast('Không lưu được file đính kèm: ' + (error instanceof Error ? error.message : String(error)), 'error');
    } finally {
      setAttachmentBusy(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    }
  };

  const handleOpenAttachment = async () => {
    if (!attachment.trim()) return;
    try { await openAttachment(attachment.trim()); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
  };

  const handleOpenFolder = async () => {
    try { await chooseAttachmentFolder(attachmentName); }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      showToast(error instanceof Error ? error.message : String(error), 'error');
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
      setScanAgencySuggestions([]);
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
      setScanAgencySuggestions([]);
      setScanStatusText('Đang tối ưu hình ảnh...');
      setScanLoading(true);

      scanAbortRef.current?.abort();
      const controller = new AbortController();
      scanAbortRef.current = controller;

      try {
        const prepared = await prepareImageForScan(file);
        if (controller.signal.aborted) return;
        setScanPreviewUrl(prepared.previewUrl);

        const symbolAgencyHints = allDocuments
          .filter((d) => (d.symbol || '').trim() && (d.agency || '').trim())
          .map((d) => ({ symbol: d.symbol.trim(), agency: d.agency.trim() }));

        const result = await scanDocumentImage(
          prepared,
          documentTypes.map((t) => t.name),
          workFields.map((f) => f.name),
          {
            mode: scanMode,
            signal: controller.signal,
            knownAgencies: agencyHistory,
            symbolAgencyHints,
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

        // 3. Cơ quan ký & danh sách đề xuất khớp từ danh mục có sẵn
        if (result.agency) {
          setAgency(result.agency);
          filledLabels.push('Cơ quan ký');
          newlyHighlighted.agency = true;
        }
        if (Array.isArray(result.agencySuggestions) && result.agencySuggestions.length > 0) {
          setScanAgencySuggestions(result.agencySuggestions);
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
    [documentTypes, workFields, scanMode, agencyHistory, allDocuments]
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

  // Auto-trigger quick scan when launched from the floating Camera FAB
  useEffect(() => {
    if (!isOpen) return;
    if (initialScanFile) {
      handleScanFile(initialScanFile);
      onConsumeInitialScan?.();
    } else if (autoOpenCamera) {
      handleOpenCamera();
      onConsumeInitialScan?.();
    }
  }, [isOpen, initialScanFile, autoOpenCamera]);

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
      showToast('Vui lòng nhập Số văn bản và Ký hiệu!', 'warning');
      return;
    }
    if (!summary.trim()) {
      showToast('Vui lòng nhập Trích yếu nội dung!', 'warning');
      return;
    }

    const issuedIso = parseDateInput(issued);
    if (!issuedIso) {
      showToast('Ngày ban hành không hợp lệ (định dạng dd/mm/yyyy)', 'warning');
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
            showToast(`${item.kind}: Vui lòng nhập ngày/tháng hợp lệ (ví dụ: 15/10)`, 'warning');
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
            showToast(`${item.kind}: Vui lòng nhập ngày từ 1 đến 31`, 'warning');
            return;
          }
          const dayNum = Number(v);
          if (dayNum < 1 || dayNum > 31) {
            showToast(`${item.kind}: Ngày báo cáo phải là số từ 1 đến 31`, 'warning');
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
          showToast(`${item.kind}: Đã chọn nhưng chưa nhập thời hạn!`, 'warning');
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
          showToast(`${item.kind}: ${err.message}`, 'warning');
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
        <DocumentScanFeedback
          scanLoading={scanLoading}
          scanMode={scanMode}
          scanStatusText={scanStatusText}
          scanPreviewUrl={scanPreviewUrl}
          scanSuccessMsg={scanSuccessMsg}
          scanEngineUsed={scanEngineUsed}
          scanFallbackNotice={scanFallbackNotice}
          scanError={scanError}
          onCancelScan={handleCancelScan}
          onDismissSuccess={() => {
            setScanSuccessMsg(null);
            setScanFallbackNotice(null);
          }}
          onDismissError={() => setScanError(null)}
        />

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
              {scanAgencySuggestions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-semibold text-slate-500">Đề xuất:</span>
                  {scanAgencySuggestions.map((item) => {
                    const isActive = searchKey(agency) === searchKey(item);
                    return (
                      <button
                        type="button"
                        key={item}
                        onClick={() => setAgency(item)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition border ${
                          isActive
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-blue-50/70 text-blue-800 border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              )}
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
          <ScheduleEditorSection
            scheduleItems={scheduleItems}
            onAddPeriodicSchedule={addPeriodicSchedule}
            onRemovePeriodicSchedule={removePeriodicSchedule}
            onUpdateScheduleItem={updateScheduleItem}
          />

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
      <DuplicateWarningModal
        isOpen={showDuplicateWarning}
        number={number}
        symbol={symbol}
        duplicateList={duplicateList}
        onCancel={() => setShowDuplicateWarning(false)}
        onConfirm={confirmDuplicateSave}
      />

      {/* Desktop Live Webcam Capture Modal */}
      <WebcamCaptureModal
        isOpen={webcamOpen}
        webcamError={webcamError}
        videoRef={videoRef}
        onClose={closeWebcam}
        onCapture={handleCaptureWebcam}
        onPickFromGallery={() => {
          closeWebcam();
          galleryInputRef.current?.click();
        }}
      />
    </div>
  );
};
