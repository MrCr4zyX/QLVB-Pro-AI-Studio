import * as XLSX from 'xlsx';
import { saveWorkbookToQlvbFolder } from './fileExportUtils';
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
} from '../types';

export interface AppDataState {
  documents: Document[];
  schedules: Schedule[];
  reports: ReportHistory[];
  documentTypes: DocumentType[];
  workFields: WorkField[];
  documentFields: DocumentField[];
  documentAmendments: DocumentAmendment[];
  resultAudits: ResultAudit[];
  changeLogs: DocumentChangeLog[];
}

export interface ImportResult {
  success: boolean;
  message: string;
  stats: {
    documents: number;
    schedules: number;
    reports: number;
    documentTypes: number;
    workFields: number;
  };
  data?: AppDataState;
}

/**
 * Build a PC-compatible .xlsx workbook from current state
 */
export function buildExcelWorkbook(state: AppDataState): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // 1. VAN_BAN
  const docCols = [
    'id', 'issued', 'number', 'symbol', 'agency', 'summary',
    'notes', 'attachment', 'updated', 'security_level',
    'type_id', 'effect_status', 'expiry_date', 'amendment_text'
  ];
  const docData = state.documents.map((d) => [
    d.id,
    d.issued || '',
    d.number || '',
    d.symbol || '',
    d.agency || '',
    d.summary || '',
    d.notes || '',
    d.attachment || '',
    d.updated || '',
    d.security_level || 'Thường',
    d.type_id !== null && d.type_id !== undefined ? d.type_id : '',
    d.effect_status || 'Cần rà soát',
    d.expiry_date || '',
    d.amendment_text || ''
  ]);
  const wsDocs = XLSX.utils.aoa_to_sheet([docCols, ...docData]);
  XLSX.utils.book_append_sheet(wb, wsDocs, 'VAN_BAN');

  // 2. LICH_BAO_CAO
  const schedCols = ['id', 'document_id', 'kind', 'start_date', 'day_of_month', 'repeat_rule', 'precision'];
  const schedData = state.schedules.map((s) => [
    s.id,
    s.document_id,
    s.kind,
    s.start_date || '',
    s.day_of_month !== null && s.day_of_month !== undefined ? s.day_of_month : '',
    s.repeat_rule || 'Không lặp',
    s.precision || 'day'
  ]);
  const wsSched = XLSX.utils.aoa_to_sheet([schedCols, ...schedData]);
  XLSX.utils.book_append_sheet(wb, wsSched, 'LICH_BAO_CAO');

  // 3. LICH_SU
  const repCols = [
    'id', 'schedule_id', 'due_date', 'completed_date', 'notes',
    'result_symbol', 'result_attachment', 'result_notes', 'result_updated'
  ];
  const repData = state.reports.map((r) => [
    r.id,
    r.schedule_id,
    r.due_date,
    r.completed_date || '',
    r.notes || '',
    r.result_symbol || '',
    r.result_attachment || '',
    r.result_notes || '',
    r.result_updated || ''
  ]);
  const wsReps = XLSX.utils.aoa_to_sheet([repCols, ...repData]);
  XLSX.utils.book_append_sheet(wb, wsReps, 'LICH_SU');

  // 4. NHAT_KY_KET_QUA
  const auditCols = ['id', 'report_id', 'action', 'changed_at', 'completed_date', 'result_symbol', 'result_attachment', 'result_notes'];
  const auditData = state.resultAudits.map((a) => [
    a.id, a.report_id, a.action, a.changed_at, a.completed_date || '', a.result_symbol || '', a.result_attachment || '', a.result_notes || ''
  ]);
  const wsAudit = XLSX.utils.aoa_to_sheet([auditCols, ...auditData]);
  XLSX.utils.book_append_sheet(wb, wsAudit, 'NHAT_KY_KET_QUA');

  // 5. LICH_SU_THAY_DOI
  const logCols = ['id', 'document_id', 'changed_at', 'action', 'document_label', 'details'];
  const logData = state.changeLogs.map((l) => [
    l.id, l.document_id, l.changed_at, l.action, l.document_label, l.details
  ]);
  const wsLog = XLSX.utils.aoa_to_sheet([logCols, ...logData]);
  XLSX.utils.book_append_sheet(wb, wsLog, 'LICH_SU_THAY_DOI');

  // 6. LOAI_VAN_BAN
  const typeCols = ['id', 'name', 'active'];
  const typeData = state.documentTypes.map((t) => [t.id, t.name, t.active]);
  const wsTypes = XLSX.utils.aoa_to_sheet([typeCols, ...typeData]);
  XLSX.utils.book_append_sheet(wb, wsTypes, 'LOAI_VAN_BAN');

  // 7. LINH_VUC
  const fieldCols = ['id', 'name', 'active'];
  const fieldData = state.workFields.map((f) => [f.id, f.name, f.active]);
  const wsFields = XLSX.utils.aoa_to_sheet([fieldCols, ...fieldData]);
  XLSX.utils.book_append_sheet(wb, wsFields, 'LINH_VUC');

  // 8. VAN_BAN_LINH_VUC
  const docFieldCols = ['document_id', 'field_id'];
  const docFieldData = state.documentFields.map((df) => [df.document_id, df.field_id]);
  const wsDocFields = XLSX.utils.aoa_to_sheet([docFieldCols, ...docFieldData]);
  XLSX.utils.book_append_sheet(wb, wsDocFields, 'VAN_BAN_LINH_VUC');

  // 9. VAN_BAN_SUA_DOI
  const amendCols = ['document_id', 'amendment_id'];
  const amendData = state.documentAmendments.map((da) => [da.document_id, da.amendment_id]);
  const wsAmend = XLSX.utils.aoa_to_sheet([amendCols, ...amendData]);
  XLSX.utils.book_append_sheet(wb, wsAmend, 'VAN_BAN_SUA_DOI');

  return wb;
}

/**
 * Export current database state into a PC-compatible .xlsx file inside Download/QLVB_PRO
 */
export function exportToExcel(state: AppDataState, filename = 'documents.xlsx') {
  const wb = buildExcelWorkbook(state);
  saveWorkbookToQlvbFolder(wb, filename);
  return state.documents.length;
}

/**
 * Export current database state into a Blob for cloud sync (Google Drive)
 */
export function exportToExcelBlob(state: AppDataState): Blob {
  const wb = buildExcelWorkbook(state);
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Import Excel from an ArrayBuffer (used for both file uploads and Drive downloads)
 */
export async function importFromExcelBuffer(
  arrayBuffer: ArrayBuffer,
  currentData: AppDataState,
  overwrite = false
): Promise<ImportResult> {
  try {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });

    const requiredSheets = ['VAN_BAN', 'LICH_BAO_CAO', 'LICH_SU'];
    const hasRequired = requiredSheets.every((s) => wb.SheetNames.includes(s));

    if (!hasRequired) {
      // If user uploaded a simplified single-sheet document list
      if (wb.SheetNames.length > 0) {
        const firstSheetName = wb.SheetNames[0];
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[firstSheetName]);
        if (rows.length > 0) {
          return importSimplifiedSheet(rows, currentData, overwrite);
        }
      }
      return {
        success: false,
        message: 'File Excel không đúng cấu trúc K02 PC (yêu cầu các sheet: VAN_BAN, LICH_BAO_CAO, LICH_SU)',
        stats: { documents: 0, schedules: 0, reports: 0, documentTypes: 0, workFields: 0 },
      };
    }

    // Helper to extract JSON from sheet
    const parseSheet = <T>(sheetName: string): T[] => {
      if (!wb.SheetNames.includes(sheetName)) return [];
      const sheet = wb.Sheets[sheetName];
      return XLSX.utils.sheet_to_json<T>(sheet, { raw: false });
    };

    const rawDocs = parseSheet<Record<string, unknown>>('VAN_BAN');
    const rawSchedules = parseSheet<Record<string, unknown>>('LICH_BAO_CAO');
    const rawReports = parseSheet<Record<string, unknown>>('LICH_SU');
    const rawTypes = parseSheet<Record<string, unknown>>('LOAI_VAN_BAN');
    const rawFields = parseSheet<Record<string, unknown>>('LINH_VUC');
    const rawDocFields = parseSheet<Record<string, unknown>>('VAN_BAN_LINH_VUC');
    const rawAmendments = parseSheet<Record<string, unknown>>('VAN_BAN_SUA_DOI');
    const rawAudits = parseSheet<Record<string, unknown>>('NHAT_KY_KET_QUA');
    const rawLogs = parseSheet<Record<string, unknown>>('LICH_SU_THAY_DOI');

    // Parse Document Types
    const importedTypes: DocumentType[] = rawTypes.map((r) => ({
      id: Number(r.id),
      name: String(r.name || '').trim(),
      active: Number(r.active ?? 1),
    })).filter((t) => t.id && t.name);

    // Parse Work Fields
    const importedFields: WorkField[] = rawFields.map((r) => ({
      id: Number(r.id),
      name: String(r.name || '').trim(),
      active: Number(r.active ?? 1),
    })).filter((f) => f.id && f.name);

    // Parse Documents
    const importedDocs: Document[] = rawDocs.map((r) => {
      const id = String(r.id || '').trim();
      return {
        id,
        issued: String(r.issued || '').trim(),
        number: String(r.number || '').trim(),
        symbol: String(r.symbol || '').trim(),
        agency: String(r.agency || '').trim(),
        summary: String(r.summary || '').trim(),
        notes: String(r.notes || '').trim(),
        attachment: String(r.attachment || '').trim(),
        updated: String(r.updated || new Date().toISOString()).trim(),
        security_level: (['Thường', 'Mật', 'Tối mật', 'Tuyệt mật'].includes(String(r.security_level))
          ? String(r.security_level)
          : 'Thường') as Document['security_level'],
        type_id: r.type_id !== undefined && r.type_id !== '' ? Number(r.type_id) : null,
        effect_status: (['Còn hiệu lực', 'Hết hiệu lực', 'Cần rà soát'].includes(String(r.effect_status))
          ? String(r.effect_status)
          : 'Cần rà soát') as Document['effect_status'],
        expiry_date: r.expiry_date ? String(r.expiry_date).trim() : null,
        amendment_text: String(r.amendment_text || '').trim(),
      };
    }).filter((d) => d.id && (d.number || d.summary));

    // Parse Schedules
    const importedSchedules: Schedule[] = rawSchedules.map((r) => {
      const id = String(r.id || '').trim();
      return {
        id,
        document_id: String(r.document_id || '').trim(),
        kind: String(r.kind || 'Định kỳ 1').trim(),
        start_date: r.start_date ? String(r.start_date).trim() : null,
        day_of_month: r.day_of_month !== undefined && r.day_of_month !== '' ? Number(r.day_of_month) : null,
        repeat_rule: String(r.repeat_rule || 'Không lặp').trim(),
        precision: (['day', 'month', 'year'].includes(String(r.precision)) ? String(r.precision) : 'day') as Schedule['precision'],
      };
    }).filter((s) => s.id && s.document_id);

    // Parse Reports
    const importedReports: ReportHistory[] = rawReports.map((r) => {
      const id = String(r.id || '').trim();
      return {
        id,
        schedule_id: String(r.schedule_id || '').trim(),
        due_date: String(r.due_date || '').trim(),
        completed_date: r.completed_date ? String(r.completed_date).trim() : null,
        notes: String(r.notes || '').trim(),
        result_symbol: String(r.result_symbol || '').trim(),
        result_attachment: String(r.result_attachment || '').trim(),
        result_notes: String(r.result_notes || '').trim(),
        result_updated: String(r.result_updated || '').trim(),
      };
    }).filter((r) => r.id && r.schedule_id && r.due_date);

    // Parse relations
    const importedDocFields: DocumentField[] = rawDocFields.map((r) => ({
      document_id: String(r.document_id || '').trim(),
      field_id: Number(r.field_id),
    })).filter((df) => df.document_id && df.field_id);

    const importedAmendments: DocumentAmendment[] = rawAmendments.map((r) => ({
      document_id: String(r.document_id || '').trim(),
      amendment_id: String(r.amendment_id || '').trim(),
    })).filter((da) => da.document_id && da.amendment_id);

    const importedAudits: ResultAudit[] = rawAudits.map((r) => ({
      id: String(r.id || '').trim(),
      report_id: String(r.report_id || '').trim(),
      action: String(r.action || '').trim(),
      changed_at: String(r.changed_at || '').trim(),
      completed_date: r.completed_date ? String(r.completed_date).trim() : null,
      result_symbol: String(r.result_symbol || '').trim(),
      result_attachment: String(r.result_attachment || '').trim(),
      result_notes: String(r.result_notes || '').trim(),
    })).filter((a) => a.id && a.report_id);

    const importedLogs: DocumentChangeLog[] = rawLogs.map((r) => ({
      id: String(r.id || '').trim(),
      document_id: String(r.document_id || '').trim(),
      changed_at: String(r.changed_at || '').trim(),
      action: String(r.action || '').trim(),
      document_label: String(r.document_label || '').trim(),
      details: String(r.details || '').trim(),
    })).filter((l) => l.id && l.document_id);

    let nextState: AppDataState;

    if (overwrite) {
      nextState = {
        documents: importedDocs,
        schedules: importedSchedules,
        reports: importedReports,
        documentTypes: importedTypes.length > 0 ? importedTypes : currentData.documentTypes,
        workFields: importedFields.length > 0 ? importedFields : currentData.workFields,
        documentFields: importedDocFields,
        documentAmendments: importedAmendments,
        resultAudits: importedAudits,
        changeLogs: importedLogs,
      };
    } else {
      // Merge: replace existing IDs, append new ones
      const docMap = new Map(currentData.documents.map((d) => [d.id, d]));
      importedDocs.forEach((d) => docMap.set(d.id, d));

      const schedMap = new Map(currentData.schedules.map((s) => [s.id, s]));
      importedSchedules.forEach((s) => schedMap.set(s.id, s));

      const repMap = new Map(currentData.reports.map((r) => [r.id, r]));
      importedReports.forEach((r) => repMap.set(r.id, r));

      const typeMap = new Map(currentData.documentTypes.map((t) => [t.id, t]));
      importedTypes.forEach((t) => typeMap.set(t.id, t));

      const fieldMap = new Map(currentData.workFields.map((f) => [f.id, f]));
      importedFields.forEach((f) => fieldMap.set(f.id, f));

      nextState = {
        documents: Array.from(docMap.values()),
        schedules: Array.from(schedMap.values()),
        reports: Array.from(repMap.values()),
        documentTypes: Array.from(typeMap.values()),
        workFields: Array.from(fieldMap.values()),
        documentFields: [...currentData.documentFields, ...importedDocFields],
        documentAmendments: [...currentData.documentAmendments, ...importedAmendments],
        resultAudits: [...currentData.resultAudits, ...importedAudits],
        changeLogs: [...currentData.changeLogs, ...importedLogs],
      };
    }

    return {
      success: true,
      message: `Đồng bộ thành công ${importedDocs.length} văn bản, ${importedSchedules.length} lịch và ${importedReports.length} kỳ báo cáo!`,
      stats: {
        documents: importedDocs.length,
        schedules: importedSchedules.length,
        reports: importedReports.length,
        documentTypes: importedTypes.length,
        workFields: importedFields.length,
      },
      data: nextState,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Lỗi đọc file Excel: ${errorMsg}`,
      stats: { documents: 0, schedules: 0, reports: 0, documentTypes: 0, workFields: 0 },
    };
  }
}

/**
 * Import Excel file uploaded by user (wraps importFromExcelBuffer)
 */
export async function importFromExcel(file: File, currentData: AppDataState, overwrite = false): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  return importFromExcelBuffer(arrayBuffer, currentData, overwrite);
}

/**
 * Handle simplified single sheet if user provides standard Excel table
 */
function importSimplifiedSheet(
  rows: Record<string, unknown>[],
  currentData: AppDataState,
  overwrite: boolean
): ImportResult {
  const newDocs: Document[] = [];
  const newSchedules: Schedule[] = [];
  const newReports: ReportHistory[] = [];

  rows.forEach((r, idx) => {
    const id = (r.id as string) || `doc-import-${Date.now()}-${idx}`;
    const number = String(r['Số/Ký hiệu'] || r.number || r.so || '').trim();
    const symbol = String(r['Ký hiệu'] || r.symbol || '').trim();
    const agency = String(r['Cơ quan ký'] || r['Cơ quan'] || r.agency || '').trim();
    const summary = String(r['Trích yếu'] || r['Nội dung'] || r.summary || '').trim();
    const issued = String(r['Ngày ban hành'] || r.issued || new Date().toISOString().slice(0, 10)).trim();

    if (!summary && !number) return;

    const doc: Document = {
      id,
      issued,
      number: number || `VB-${idx + 1}`,
      symbol: symbol || 'BC',
      agency: agency || 'Công an tỉnh',
      summary: summary || 'Văn bản báo cáo',
      notes: String(r['Chú thích'] || r.notes || ''),
      attachment: String(r['File đính kèm'] || r.attachment || ''),
      updated: new Date().toISOString(),
      security_level: 'Thường',
      type_id: 1,
      effect_status: 'Còn hiệu lực',
      expiry_date: null,
      amendment_text: '',
    };
    newDocs.push(doc);
  });

  const nextState: AppDataState = overwrite
    ? { ...currentData, documents: newDocs, schedules: newSchedules, reports: newReports }
    : { ...currentData, documents: [...currentData.documents, ...newDocs] };

  return {
    success: true,
    message: `Đã nhập nhanh ${newDocs.length} văn bản từ bảng tính!`,
    stats: {
      documents: newDocs.length,
      schedules: 0,
      reports: 0,
      documentTypes: currentData.documentTypes.length,
      workFields: currentData.workFields.length,
    },
    data: nextState,
  };
}
