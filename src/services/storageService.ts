import {
  Document,
  Schedule,
  ReportHistory,
  DocumentType,
  WorkField,
  DocumentField,
  DocumentAmendment,
  ResultAudit,
  DocumentChangeLog,
  EnrichedReport,
  EnrichedDocument,
} from '../types';
import { generateDueDates, getReportDisplay, searchKey } from '../utils/dateUtils';
import { AppDataState } from '../utils/excelSync';

const STORAGE_KEY = 'k02_document_manager_data_v1';

export const DEFAULT_DOCUMENT_TYPES: DocumentType[] = [
  { id: 1, name: 'Luật', active: 1 },
  { id: 2, name: 'Pháp lệnh', active: 1 },
  { id: 3, name: 'Nghị quyết', active: 1 },
  { id: 4, name: 'Nghị định', active: 1 },
  { id: 5, name: 'Quyết định', active: 1 },
  { id: 6, name: 'Thông tư', active: 1 },
  { id: 7, name: 'Thông tư liên tịch', active: 1 },
  { id: 8, name: 'Chỉ thị', active: 1 },
  { id: 9, name: 'Công văn', active: 1 },
  { id: 10, name: 'Kế hoạch', active: 1 },
  { id: 11, name: 'Hướng dẫn', active: 1 },
  { id: 12, name: 'Khác', active: 1 },
];

export const DEFAULT_WORK_FIELDS: WorkField[] = [
  { id: 1, name: 'Thi đua - Khen thưởng', active: 1 },
  { id: 2, name: 'Tổ chức cán bộ', active: 1 },
  { id: 3, name: 'Chính trị tư tưởng', active: 1 },
  { id: 4, name: 'Tham mưu - Tổng hợp', active: 1 },
  { id: 5, name: 'Huấn luyện', active: 1 },
  { id: 6, name: 'Hậu cần - Kỹ thuật', active: 1 },
  { id: 7, name: 'Khác', active: 1 },
];

/**
 * Generate rich, realistic initial administrative documents for K02 Document Manager
 */
export function generateInitialData(): AppDataState {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const pad = (n: number) => String(n).padStart(2, '0');
  const dStr = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

  const docs: Document[] = [
    {
      id: 'doc-001',
      issued: dStr(currentYear, 1, 15),
      number: '18/KH-CAT-TM',
      symbol: 'KH-CAT-TM',
      agency: 'Công an tỉnh - Phòng Tham mưu',
      summary: 'Kế hoạch công tác trọng tâm năm và chế độ thông tin báo cáo định kỳ công tác tham mưu',
      notes: 'Báo cáo định kỳ trước ngày 20 hàng tháng về Văn phòng',
      attachment: 'D:/K02/Ke_hoach_18_CAT_TM.pdf',
      updated: new Date().toISOString(),
      security_level: 'Thường',
      type_id: 10, // Kế hoạch
      effect_status: 'Còn hiệu lực',
      expiry_date: null,
      amendment_text: '',
    },
    {
      id: 'doc-002',
      issued: dStr(currentYear, 2, 10),
      number: '45/CV-BCA-V01',
      symbol: 'CV-BCA-V01',
      agency: 'Bộ Công an - V01',
      summary: 'Công văn chỉ đạo về tăng cường công tác phòng chống tội phạm công nghệ cao và bảo vệ an ninh mạng',
      notes: 'Báo cáo sơ kết 6 tháng và tổng kết năm gửi về Cục',
      attachment: 'D:/K02/CV_45_BCA.docx',
      updated: new Date().toISOString(),
      security_level: 'Mật',
      type_id: 9, // Công văn
      effect_status: 'Còn hiệu lực',
      expiry_date: null,
      amendment_text: '',
    },
    {
      id: 'doc-003',
      issued: dStr(currentYear, 3, 5),
      number: '120/QĐ-UBND',
      symbol: 'QĐ-UBND',
      agency: 'Ủy ban nhân dân tỉnh',
      summary: 'Quyết định ban hành Quy chế phối hợp liên ngành bảo đảm trật tự an toàn giao thông trên địa bàn tỉnh',
      notes: 'Báo cáo quý gửi về Ban An toàn giao thông tỉnh',
      attachment: 'D:/K02/QD_120_UBND.pdf',
      updated: new Date().toISOString(),
      security_level: 'Thường',
      type_id: 5, // Quyết định
      effect_status: 'Còn hiệu lực',
      expiry_date: null,
      amendment_text: '',
    },
    {
      id: 'doc-004',
      issued: dStr(currentYear, 4, 1),
      number: '08/HD-CAT-PX01',
      symbol: 'HD-CAT-PX01',
      agency: 'Công an tỉnh - Phòng Tổ chức cán bộ',
      summary: 'Hướng dẫn đánh giá, phân loại cán bộ, chiến sĩ và bình xét thi đua khen thưởng định kỳ',
      notes: 'Báo cáo sơ kết thi đua đợt 1 và tổng kết cuối năm',
      attachment: 'D:/K02/Huong_dan_08_TCCB.pdf',
      updated: new Date().toISOString(),
      security_level: 'Thường',
      type_id: 11, // Hướng dẫn
      effect_status: 'Còn hiệu lực',
      expiry_date: null,
      amendment_text: '',
    },
    {
      id: 'doc-005',
      issued: dStr(currentYear - 1, 11, 20),
      number: '02/CT-TU',
      symbol: 'CT-TU',
      agency: 'Tỉnh ủy',
      summary: 'Chỉ thị về nâng cao hiệu lực, hiệu quả công tác tiếp công dân, giải quyết khiếu nại, tố cáo',
      notes: 'Báo cáo định kỳ ngày 25 hàng tháng gửi Thường trực Tỉnh ủy',
      attachment: 'D:/K02/Chi_thi_02_Tinh_uy.pdf',
      updated: new Date().toISOString(),
      security_level: 'Thường',
      type_id: 8, // Chỉ thị
      effect_status: 'Còn hiệu lực',
      expiry_date: null,
      amendment_text: '',
    },
  ];

  const schedules: Schedule[] = [
    // doc-001 schedules
    {
      id: 'sch-001-1',
      document_id: 'doc-001',
      kind: 'Định kỳ 1',
      start_date: dStr(currentYear, 1, 15),
      day_of_month: 20,
      repeat_rule: 'Hằng tháng',
      precision: 'day',
    },
    {
      id: 'sch-001-2',
      document_id: 'doc-001',
      kind: 'Tổng kết',
      start_date: dStr(currentYear, 12, 15),
      day_of_month: null,
      repeat_rule: 'Không lặp',
      precision: 'day',
    },
    // doc-002 schedules
    {
      id: 'sch-002-1',
      document_id: 'doc-002',
      kind: 'Sắp tới',
      // Due in 3 days from today for immediate demonstration
      start_date: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      day_of_month: null,
      repeat_rule: 'Không lặp',
      precision: 'day',
    },
    {
      id: 'sch-002-2',
      document_id: 'doc-002',
      kind: 'Sơ kết',
      start_date: dStr(currentYear, 6, 25),
      day_of_month: null,
      repeat_rule: 'Không lặp',
      precision: 'day',
    },
    // doc-003 schedules
    {
      id: 'sch-003-1',
      document_id: 'doc-003',
      kind: 'Định kỳ 1',
      start_date: dStr(currentYear, 3, 5),
      day_of_month: 15,
      repeat_rule: 'Hằng năm',
      precision: 'day',
    },
    // doc-004 schedules
    {
      id: 'sch-004-1',
      document_id: 'doc-004',
      kind: 'Sơ kết',
      start_date: dStr(currentYear, 7, 10),
      day_of_month: null,
      repeat_rule: 'Không lặp',
      precision: 'day',
    },
    // doc-005 schedules
    {
      id: 'sch-005-1',
      document_id: 'doc-005',
      kind: 'Định kỳ 1',
      start_date: dStr(currentYear - 1, 12, 1),
      day_of_month: 25,
      repeat_rule: 'Hằng tháng',
      precision: 'day',
    },
  ];

  // Document Fields mapping
  const docFields: DocumentField[] = [
    { document_id: 'doc-001', field_id: 4 }, // Tham mưu
    { document_id: 'doc-002', field_id: 4 },
    { document_id: 'doc-003', field_id: 4 },
    { document_id: 'doc-004', field_id: 1 }, // Thi đua
    { document_id: 'doc-004', field_id: 2 }, // Tổ chức cán bộ
    { document_id: 'doc-005', field_id: 4 },
  ];

  // Generate Report History records
  const reports: ReportHistory[] = [];
  let reportCounter = 1;

  for (const s of schedules) {
    const dates = generateDueDates(s, today);
    for (const d of dates) {
      const isPast = d < today.toISOString().slice(0, 10);
      const isCompleted = isPast && Math.random() > 0.4; // Some completed, some overdue

      reports.push({
        id: `rep-${String(reportCounter++).padStart(4, '0')}`,
        schedule_id: s.id,
        due_date: d,
        completed_date: isCompleted ? d : null,
        notes: isCompleted ? 'Đã hoàn thành đúng hạn và gửi đơn vị nhận.' : '',
        result_symbol: isCompleted ? `BC-KQ-${d.slice(5, 7)}` : '',
        result_attachment: '',
        result_notes: isCompleted ? 'Báo cáo đã gửi qua hệ thống Voffice' : '',
        result_updated: isCompleted ? new Date().toISOString() : '',
      });
    }
  }

  // Ensure there is at least one overdue report and one due today/tomorrow for testing
  const overdueDueDate = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const urgentDueDate = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  reports.push({
    id: `rep-overdue-sample`,
    schedule_id: 'sch-001-1',
    due_date: overdueDueDate,
    completed_date: null,
    notes: 'Kỳ báo cáo công tác tham mưu tháng cần xử lý gấp',
    result_symbol: '',
    result_attachment: '',
    result_notes: '',
    result_updated: '',
  });

  reports.push({
    id: `rep-urgent-sample`,
    schedule_id: 'sch-005-1',
    due_date: urgentDueDate,
    completed_date: null,
    notes: 'Báo cáo khiếu nại tố cáo gửi Thường trực',
    result_symbol: '',
    result_attachment: '',
    result_notes: '',
    result_updated: '',
  });

  return {
    documents: docs,
    schedules,
    reports,
    documentTypes: DEFAULT_DOCUMENT_TYPES,
    workFields: DEFAULT_WORK_FIELDS,
    documentFields: docFields,
    documentAmendments: [],
    resultAudits: [],
    changeLogs: [],
  };
}

/**
 * Load app data from localStorage or generate defaults
 */
export function loadAppData(): AppDataState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.documents)) {
        return ensureSchedulesAndReports(parsed);
      }
    }
  } catch (e) {
    console.error('Failed to load local data:', e);
  }

  const initial = generateInitialData();
  saveAppData(initial);
  return initial;
}

/**
 * Save data to localStorage
 */
export function saveAppData(state: AppDataState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

/**
 * Ensures all schedules have up-to-date due dates in report_history
 */
export function ensureSchedulesAndReports(state: AppDataState): AppDataState {
  const today = new Date();
  const existingSet = new Set(state.reports.map((r) => `${r.schedule_id}_${r.due_date}`));
  const newReports = [...state.reports];
  let idCounter = state.reports.length + 1;

  for (const s of state.schedules) {
    const dates = generateDueDates(s, today);
    for (const d of dates) {
      const key = `${s.id}_${d}`;
      if (!existingSet.has(key)) {
        existingSet.add(key);
        newReports.push({
          id: `rep-gen-${idCounter++}-${Date.now().toString().slice(-4)}`,
          schedule_id: s.id,
          due_date: d,
          completed_date: null,
          notes: '',
          result_symbol: '',
          result_attachment: '',
          result_notes: '',
          result_updated: '',
        });
      }
    }
  }

  return {
    ...state,
    reports: newReports,
  };
}

/**
 * Join reports with schedule and document info
 */
export function getEnrichedReports(state: AppDataState): EnrichedReport[] {
  const schedMap = new Map<string, Schedule>(state.schedules.map((s) => [s.id, s]));
  const docMap = new Map<string, Document>(state.documents.map((d) => [d.id, d]));

  return state.reports
    .map((r) => {
      const sched = schedMap.get(r.schedule_id);
      if (!sched) return null;
      const doc = docMap.get(sched.document_id);
      if (!doc) return null;

      const disp = getReportDisplay({
        due_date: r.due_date,
        completed_date: r.completed_date,
        precision: sched.precision,
      });

      return {
        ...r,
        kind: sched.kind,
        precision: sched.precision,
        schedule_start: sched.start_date,
        document_id: doc.id,
        number: doc.number,
        symbol: doc.symbol,
        summary: doc.summary,
        agency: doc.agency,
        security_level: doc.security_level,
        displayDue: disp.displayDue,
        countLabel: disp.label,
        tag: disp.tag,
      };
    })
    .filter((r): r is EnrichedReport => r !== null)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

/**
 * Join documents with type, fields and next upcoming report
 */
export function getEnrichedDocuments(state: AppDataState): EnrichedDocument[] {
  const enrichedReports = getEnrichedReports(state);
  const typeMap = new Map<number, string>(state.documentTypes.map((t) => [t.id, t.name]));
  const fieldMap = new Map<number, string>(state.workFields.map((f) => [f.id, f.name]));
  const docMap = new Map<string, Document>(state.documents.map((d) => [d.id, d]));

  // Group fields by document
  const docFieldsMap = new Map<string, string[]>();
  state.documentFields.forEach((df) => {
    const list = docFieldsMap.get(df.document_id) || [];
    const fName = fieldMap.get(df.field_id);
    if (fName) list.push(fName);
    docFieldsMap.set(df.document_id, list);
  });

  // Group amendments by document
  const amendMap = new Map<string, string[]>();
  state.documentAmendments.forEach((da) => {
    const list = amendMap.get(da.document_id) || [];
    const target = docMap.get(da.amendment_id);
    if (target) list.push(`${target.number}/${target.symbol}`);
    amendMap.set(da.document_id, list);
  });

  // Reports by document
  const reportsByDoc = new Map<string, EnrichedReport[]>();
  enrichedReports.forEach((r) => {
    const list = reportsByDoc.get(r.document_id) || [];
    list.push(r);
    reportsByDoc.set(r.document_id, list);
  });

  return state.documents.map((d) => {
    const docReps = reportsByDoc.get(d.id) || [];
    const pendingReps = docReps.filter((r) => !r.completed_date);
    const nextR = pendingReps.length > 0 ? pendingReps[0] : null;

    return {
      ...d,
      typeName: (d.type_id && typeMap.get(d.type_id)) || 'Chưa phân loại',
      fieldNames: docFieldsMap.get(d.id) || [],
      linkedAmendments: amendMap.get(d.id) || [],
      nextReportDue: nextR ? nextR.displayDue : null,
      nextReportLabel: nextR ? nextR.countLabel : (docReps.length > 0 ? 'Đã hoàn thành hết' : 'Không có hạn'),
      nextReportTag: nextR ? nextR.tag : (docReps.length > 0 ? 'done' : 'none'),
      reportsCount: docReps.length,
      pendingReportsCount: pendingReps.length,
    };
  });
}
