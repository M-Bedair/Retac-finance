import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { I18nProvider } from './contexts/I18nContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { RequestsPage } from './pages/requests/RequestsPage';
import { ApprovalWorkspacePage } from './pages/approvals/ApprovalWorkspacePage';
import { DisbursementsPage } from './pages/disbursements/DisbursementsPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { AuditLogPage } from './pages/audit/AuditLogPage';
import { SettingsPage } from './pages/settings/SettingsPage';

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
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
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
};

export default App;
