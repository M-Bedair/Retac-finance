import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { I18nProvider } from './contexts/I18nContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';

const LoginPage = lazy(() =>
  import('./pages/auth/LoginPage').then((module) => ({ default: module.LoginPage }))
);
const DashboardPage = lazy(() =>
  import('./pages/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage }))
);
const RequestsPage = lazy(() =>
  import('./pages/requests/RequestsPage').then((module) => ({ default: module.RequestsPage }))
);
const ApprovalWorkspacePage = lazy(() =>
  import('./pages/approvals/ApprovalWorkspacePage').then((module) => ({
    default: module.ApprovalWorkspacePage,
  }))
);
const DisbursementsPage = lazy(() =>
  import('./pages/disbursements/DisbursementsPage').then((module) => ({
    default: module.DisbursementsPage,
  }))
);
const CustomersPage = lazy(() =>
  import('./pages/customers/CustomersPage').then((module) => ({ default: module.CustomersPage }))
);
const ReportsPage = lazy(() =>
  import('./pages/reports/ReportsPage').then((module) => ({ default: module.ReportsPage }))
);
const AuditLogPage = lazy(() =>
  import('./pages/audit/AuditLogPage').then((module) => ({ default: module.AuditLogPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/settings/SettingsPage').then((module) => ({ default: module.SettingsPage }))
);

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Suspense
            fallback={
              <div className="min-h-screen grid place-items-center" role="status" aria-label="جارٍ التحميل">
                <span className="w-7 h-7 rounded-full border-2 border-retac-gold border-t-transparent animate-spin" />
              </div>
            }
          >
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="requests" element={<RequestsPage />} />
                <Route
                  path="approvals/manager"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}>
                      <ApprovalWorkspacePage stage="MANAGER" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="approvals/finance"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'FINANCE_MANAGER']}>
                      <ApprovalWorkspacePage stage="FINANCE_MANAGER" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="disbursements"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'DISBURSEMENT_OFFICER']}>
                      <DisbursementsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="customers"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'REQUESTER', 'FINANCE_MANAGER', 'AUDITOR']}>
                      <CustomersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="reports"
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        'ADMIN',
                        'MANAGER',
                        'FINANCE_MANAGER',
                        'DISBURSEMENT_OFFICER',
                        'AUDITOR',
                      ]}
                    >
                      <ReportsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="audit"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'AUDITOR']}>
                      <AuditLogPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN']}>
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
};

export default App;
