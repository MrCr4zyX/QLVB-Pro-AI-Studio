/**
 * Type definitions matching K02 Document Manager PC version 3.5.10
 */

export type SecurityLevel = 'Thường' | 'Mật' | 'Tối mật' | 'Tuyệt mật';
export type EffectStatus = 'Còn hiệu lực' | 'Hết hiệu lực' | 'Cần rà soát';
export type RepeatRule = 'Không lặp' | 'Hằng tháng' | 'Hằng quý' | 'Hằng năm' | 'Năm sau' | string;
export type DatePrecision = 'day' | 'month' | 'year';

export interface Document {
  id: string;
  issued: string; // ISO YYYY-MM-DD
  number: string;
  symbol: string;
  agency: string;
  summary: string;
  notes: string;
  attachment: string;
  updated: string; // ISO DateTime
  security_level: SecurityLevel;
  type_id: number | null;
  effect_status: EffectStatus;
  expiry_date: string | null; // ISO YYYY-MM-DD
  amendment_text: string;
}

export interface Schedule {
  id: string;
  document_id: string;
  kind: string; // 'Sắp tới' | 'Định kỳ 1' | 'Định kỳ 2' | 'Sơ kết' | 'Tổng kết' | custom
  start_date: string | null; // ISO YYYY-MM-DD or YYYY-MM or YYYY
  day_of_month: number | null; // 1-31
  repeat_rule: RepeatRule;
  precision: DatePrecision;
}

export interface ReportHistory {
  id: string;
  schedule_id: string;
  due_date: string; // ISO YYYY-MM-DD
  completed_date: string | null; // ISO YYYY-MM-DD or null
  notes: string;
  result_symbol: string;
  result_attachment: string;
  result_notes: string;
  result_updated: string;
}

export interface DocumentType {
  id: number;
  name: string;
  active: number;
}

export interface WorkField {
  id: number;
  name: string;
  active: number;
}

export interface DocumentField {
  document_id: string;
  field_id: number;
}

export interface DocumentAmendment {
  document_id: string;
  amendment_id: string;
}

export interface ResultAudit {
  id: string;
  report_id: string;
  action: string;
  changed_at: string;
  completed_date: string | null;
  result_symbol: string;
  result_attachment: string;
  result_notes: string;
}

export interface DocumentChangeLog {
  id: string;
  document_id: string;
  changed_at: string;
  action: string;
  document_label: string;
  details: string;
}

export interface EnrichedReport extends ReportHistory {
  kind: string;
  precision: DatePrecision;
  schedule_start: string | null;
  document_id: string;
  number: string;
  symbol: string;
  summary: string;
  agency: string;
  security_level: SecurityLevel;
  displayDue: string;
  countLabel: string;
  tag: 'overdue' | 'urgent' | 'orange' | 'yellow' | 'normal' | 'done';
}

export interface EnrichedDocument extends Document {
  typeName: string;
  fieldNames: string[];
  linkedAmendments: string[];
  nextReportDue: string | null;
  nextReportLabel: string;
  nextReportTag: 'overdue' | 'urgent' | 'orange' | 'yellow' | 'normal' | 'done' | 'none';
  reportsCount: number;
  pendingReportsCount: number;
}

export type TabType = 'dashboard' | 'documents' | 'reports' | 'calendar' | 'stats' | 'sync';
