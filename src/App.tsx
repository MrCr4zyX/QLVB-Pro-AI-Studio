import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TabType,
  Document,
  Schedule,
  EnrichedReport,
  EnrichedDocument,
} from './types';
import {
  loadAppData,
  saveAppData,
  getEnrichedReports,
  getEnrichedDocuments,
  ensureSchedulesAndReports,
} from './services/storageService';
import { AppDataState } from './utils/excelSync';
import { useNotifications } from './hooks/useNotifications';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { DashboardTab } from './components/DashboardTab';
import { DocumentsTab } from './components/DocumentsTab';
import { ReportsTab } from './components/ReportsTab';
import { CalendarTab } from './components/CalendarTab';
import { StatisticsTab } from './components/StatisticsTab';
import { SyncTab } from './components/SyncTab';
import { DocumentModal } from './components/DocumentModal';
import { ReportResultModal } from './components/ReportResultModal';
import { NotificationModal } from './components/NotificationModal';
import { InstallApkModal } from './components/InstallApkModal';
import { FloatingNotification } from './components/FloatingNotification';
const splashPreviewImage = './app-logo.png';

export default function App() {
  const [appState, setAppState] = useState<AppDataState>(() => loadAppData());
  const [currentTab, setCurrentTab] = useState<TabType>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('apk_auth') === '1' || params.get('tab') === 'sync' || params.get('code')) {
        return 'sync';
      }
    }
    return 'dashboard';
  });

  // Modals state
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [docToEdit, setDocToEdit] = useState<Document | null>(null);

  const [isReportResultModalOpen, setIsReportResultModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [reportsInitialFilter, setReportsInitialFilter] = useState<string | null>(null);
  const [reportsPeriod, setReportsPeriod] = useState<{ mode: 'Toàn bộ' | 'Tháng' | 'Quý' | 'Năm'; year: number; month: number; quarter: number } | null>(null);
  const [reportsNavigationId, setReportsNavigationId] = useState(0);

  // Online status
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkPendingApkAuth = () => {
      const bridge = (window as any).AndroidBridge;
      if (bridge && typeof bridge.hasPendingAuthUri === 'function' && bridge.hasPendingAuthUri()) {
        setCurrentTab('sync');
        window.dispatchEvent(new CustomEvent('k02-apk-auth-received'));
      }
    };
    (window as any).onApkAuthCallback = () => {
      setCurrentTab('sync');
      window.dispatchEvent(new CustomEvent('k02-apk-auth-received'));
    };
    checkPendingApkAuth();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    saveAppData(appState);
  }, [appState]);

  // Enriched records
  const enrichedReports = useMemo(() => getEnrichedReports(appState), [appState]);
  const enrichedDocuments = useMemo(() => getEnrichedDocuments(appState), [appState]);

  // Notification hook
  const {
    alertReports,
    overdueCount,
    totalAlertsCount,
    permission,
    requestPermission,
  } = useNotifications(enrichedReports);

  // Show startup alert if overdue or urgent deadlines exist (matching PC 3.5.10 startup popup)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('apk_auth') === '1' || params.get('pwa_origin') || params.get('code')) {
      return;
    }
    const hasSeenTodayAlert = sessionStorage.getItem('k02_startup_alert_shown');
    if (!hasSeenTodayAlert && alertReports.length > 0) {
      sessionStorage.setItem('k02_startup_alert_shown', 'true');
      setIsNotificationModalOpen(true);
    }
  }, [alertReports.length]);

  // Selected report for result editor
  const currentReportForEditor = useMemo(() => {
    if (!selectedReportId) return null;
    return enrichedReports.find((r) => r.id === selectedReportId) || null;
  }, [enrichedReports, selectedReportId]);

  // Scheds & Fields for editing doc
  const docSchedules = useMemo(() => {
    if (!docToEdit) return [];
    return appState.schedules.filter((s) => s.document_id === docToEdit.id);
  }, [appState.schedules, docToEdit]);

  const docFieldIds = useMemo(() => {
    if (!docToEdit) return [];
    return appState.documentFields
      .filter((df) => df.document_id === docToEdit.id)
      .map((df) => df.field_id);
  }, [appState.documentFields, docToEdit]);

  // Action Handlers
  const handleOpenDocModal = (doc?: EnrichedDocument) => {
    setDocToEdit(doc || null);
    setIsDocModalOpen(true);
  };

  const handleSaveDocument = (
    docData: Partial<Document>,
    schedules: Schedule[],
    selectedFieldIds: number[]
  ) => {
    setAppState((prev) => {
      const docId = docData.id || `doc-${Date.now()}`;
      const fullDoc = { ...docData, id: docId } as Document;

      // Update or add document
      const otherDocs = prev.documents.filter((d) => d.id !== docId);
      const updatedDocs = [fullDoc, ...otherDocs];

      // Update schedules: remove old ones for this doc, add new ones
      const otherSchedules = prev.schedules.filter((s) => s.document_id !== docId);
      const updatedSchedules = [...otherSchedules, ...schedules];

      // Update document fields
      const otherDocFields = prev.documentFields.filter((df) => df.document_id !== docId);
      const newDocFields = selectedFieldIds.map((fid) => ({
        document_id: docId,
        field_id: fid,
      }));

      // Log change
      const log = {
        id: `log-${Date.now()}`,
        document_id: docId,
        changed_at: new Date().toISOString(),
        action: docToEdit ? 'Chỉnh sửa' : 'Thêm mới',
        document_label: `${fullDoc.number}/${fullDoc.symbol}`,
        details: `Cập nhật văn bản và ${schedules.length} lịch báo cáo`,
      };

      const nextState: AppDataState = {
        ...prev,
        documents: updatedDocs,
        schedules: updatedSchedules,
        documentFields: [...otherDocFields, ...newDocFields],
        changeLogs: [log, ...prev.changeLogs],
      };

      return ensureSchedulesAndReports(nextState);
    });
  };

  const handleDeleteDocument = (docId: string) => {
    const doc = appState.documents.find((d) => d.id === docId);
    if (!doc) return;

    if (
      confirm(
        `Xác nhận xóa văn bản ${doc.number}/${doc.symbol} cùng toàn bộ lịch báo cáo liên quan?`
      )
    ) {
      setAppState((prev) => {
        const schedulesToDelete = new Set(
          prev.schedules.filter((s) => s.document_id === docId).map((s) => s.id)
        );

        return {
          ...prev,
          documents: prev.documents.filter((d) => d.id !== docId),
          schedules: prev.schedules.filter((s) => s.document_id !== docId),
          reports: prev.reports.filter((r) => !schedulesToDelete.has(r.schedule_id)),
          documentFields: prev.documentFields.filter((df) => df.document_id !== docId),
          documentAmendments: prev.documentAmendments.filter(
            (da) => da.document_id !== docId && da.amendment_id !== docId
          ),
          changeLogs: [
            {
              id: `log-${Date.now()}`,
              document_id: docId,
              changed_at: new Date().toISOString(),
              action: 'Xóa văn bản',
              document_label: `${doc.number}/${doc.symbol}`,
              details: 'Đã xóa văn bản và các lịch liên quan',
            },
            ...prev.changeLogs,
          ],
        };
      });
    }
  };

  const handleToggleReportComplete = useCallback(
    (reportId: string) => {
      const report = appState.reports.find((r) => r.id === reportId);
      if (!report) return;

      if (report.completed_date) {
        if (
          confirm('Chuyển kỳ báo cáo này về chưa hoàn thành? Thông tin kết quả vẫn được giữ.')
        ) {
          const now = new Date().toISOString();
          setAppState((prev) => ({
            ...prev,
            reports: prev.reports.map((r) =>
              r.id === reportId
                ? { ...r, completed_date: null, result_updated: now }
                : r
            ),
            resultAudits: [
              {
                id: `audit-${Date.now()}`,
                report_id: reportId,
                action: 'Hoàn tác',
                changed_at: now,
                completed_date: null,
                result_symbol: report.result_symbol,
                result_attachment: report.result_attachment,
                result_notes: report.result_notes,
              },
              ...prev.resultAudits,
            ],
          }));
        }
      } else {
        // Open result editor to enter details or quick complete
        setSelectedReportId(reportId);
        setIsReportResultModalOpen(true);
      }
    },
    [appState.reports]
  );

  const handleSaveReportResult = (
    reportId: string,
    completedDate: string,
    resultSymbol: string,
    resultAttachment: string,
    resultNotes: string
  ) => {
    const now = new Date().toISOString();
    setAppState((prev) => ({
      ...prev,
      reports: prev.reports.map((r) =>
        r.id === reportId
          ? {
              ...r,
              completed_date: completedDate,
              result_symbol: resultSymbol,
              result_attachment: resultAttachment,
              result_notes: resultNotes,
              result_updated: now,
            }
          : r
      ),
      resultAudits: [
        {
          id: `audit-${Date.now()}`,
          report_id: reportId,
          action: 'Lưu kết quả',
          changed_at: now,
          completed_date: completedDate,
          result_symbol: resultSymbol,
          result_attachment: resultAttachment,
          result_notes: resultNotes,
        },
        ...prev.resultAudits,
      ],
    }));
  };

  const handleUndoReport = (reportId: string) => {
    const now = new Date().toISOString();
    const report = appState.reports.find((r) => r.id === reportId);
    if (!report) return;

    setAppState((prev) => ({
      ...prev,
      reports: prev.reports.map((r) =>
        r.id === reportId
          ? { ...r, completed_date: null, result_updated: now }
          : r
      ),
      resultAudits: [
        {
          id: `audit-${Date.now()}`,
          report_id: reportId,
          action: 'Hoàn tác',
          changed_at: now,
          completed_date: null,
          result_symbol: report.result_symbol,
          result_attachment: report.result_attachment,
          result_notes: report.result_notes,
        },
        ...prev.resultAudits,
      ],
    }));
  };

  const handleOpenReportResult = (reportId: string) => {
    setSelectedReportId(reportId);
    setIsReportResultModalOpen(true);
  };

  // Preview only: /?previewSplash — permanent preview for inspection
  const previewSplash = new URLSearchParams(window.location.search).has('previewSplash');
  if (previewSplash) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white px-4">
        <img
          src={splashPreviewImage}
          alt="K02 QLVB PRO"
          className="w-[260px] h-[260px] max-w-[85vw] max-h-[60dvh] shrink-0 object-contain drop-shadow-xs mb-3"
        />
        <h1 className="text-xl sm:text-2xl font-black text-blue-900 tracking-wider text-center">
          K02 QLVB PRO
        </h1>
        <p className="text-xs sm:text-sm font-semibold text-slate-500 tracking-widest uppercase mt-1 text-center">
          QUẢN LÝ VĂN BẢN & BÁO CÁO
        </p>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-slate-100 flex flex-col font-sans antialiased text-slate-800 select-none overflow-hidden relative">
      {/* Floating Heads-up Notification Banner */}
      <FloatingNotification
        overdueCount={overdueCount}
        urgentCount={Math.max(0, totalAlertsCount - overdueCount)}
        onOpenDetails={() => setIsNotificationModalOpen(true)}
      />

      {/* Top Header */}
      <Header
        unreadAlertsCount={totalAlertsCount}
        onOpenNotifications={() => setIsNotificationModalOpen(true)}
        onOpenSync={() => setCurrentTab('sync')}
        onOpenInstallGuide={() => setIsInstallModalOpen(true)}
      />

      {/* Offline Toast */}
      {!isOnline && (
        <div className="bg-amber-600 text-white text-xs font-semibold py-1 px-4 text-center shrink-0 z-20 shadow-xs flex items-center justify-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span>Chế độ ngoại tuyến (Offline) — Dữ liệu được lưu trữ trực tiếp trên thiết bị của bạn</span>
        </div>
      )}

      {/* Main Tab Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden scroll-touch">
        {currentTab === 'dashboard' && (
          <DashboardTab
            documents={enrichedDocuments}
            reports={enrichedReports}
            onOpenReportResult={handleOpenReportResult}
            onToggleReportComplete={handleToggleReportComplete}
            onNavigateToTab={(tab, filter, period) => {
              setReportsInitialFilter(tab === 'reports' ? filter ?? null : null);
              setReportsPeriod(tab === 'reports' ? period ?? null : null);
              setReportsNavigationId(id => id + 1);
              setCurrentTab(tab);
            }}
            onAddNewDocument={() => handleOpenDocModal()}
          />
        )}

        {currentTab === 'documents' && (
          <DocumentsTab
            documents={enrichedDocuments}
            documentTypes={appState.documentTypes}
            workFields={appState.workFields}
            onAddNew={() => handleOpenDocModal()}
            onEdit={(doc) => handleOpenDocModal(doc)}
            onDelete={handleDeleteDocument}
            onViewReportsForDoc={(docId) => {
              setReportsInitialFilter(null);
              setReportsPeriod(null);
              setReportsNavigationId(id => id + 1);
              setCurrentTab('reports');
            }}
          />
        )}

        {currentTab === 'reports' && (
          <ReportsTab
            key={reportsNavigationId}
            reports={enrichedReports}
            initialPeriod={reportsPeriod}
            initialFilter={reportsInitialFilter}
            onOpenReportResult={handleOpenReportResult}
            onToggleReportComplete={handleToggleReportComplete}
          />
        )}

        {currentTab === 'calendar' && (
          <CalendarTab
            reports={enrichedReports}
            onOpenReportResult={handleOpenReportResult}
            onToggleReportComplete={handleToggleReportComplete}
          />
        )}

        {currentTab === 'stats' && (
          <StatisticsTab
            documents={enrichedDocuments}
            documentTypes={appState.documentTypes}
            workFields={appState.workFields}
            onOpenDoc={(doc) => handleOpenDocModal(doc)}
          />
        )}

        {currentTab === 'sync' && (
          <SyncTab
            appState={appState}
            onUpdateState={(newState) => {
              setAppState(ensureSchedulesAndReports(newState));
            }}
          />
        )}
      </main>

      {/* Android Bottom Navigation Bar */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setReportsInitialFilter(null);
          setReportsPeriod(null);
          setReportsNavigationId(id => id + 1);
          setCurrentTab(tab);
        }}
        overdueCount={overdueCount}
      />

      {/* Modals */}
      <DocumentModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        onSave={handleSaveDocument}
        documentToEdit={docToEdit}
        existingSchedules={docSchedules}
        existingFieldIds={docFieldIds}
        allDocuments={appState.documents}
        documentTypes={appState.documentTypes}
        workFields={appState.workFields}
      />

      <ReportResultModal
        isOpen={isReportResultModalOpen}
        onClose={() => {
          setIsReportResultModalOpen(false);
          setSelectedReportId(null);
        }}
        report={currentReportForEditor}
        onSaveResult={handleSaveReportResult}
        onUndoReport={handleUndoReport}
        resultAudits={appState.resultAudits}
      />

      <NotificationModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
        alertReports={alertReports}
        permission={permission}
        onRequestPermission={requestPermission}
        onGoToDashboard={() => setCurrentTab('dashboard')}
        onOpenReportResult={handleOpenReportResult}
      />

      <InstallApkModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />
    </div>
  );
}
