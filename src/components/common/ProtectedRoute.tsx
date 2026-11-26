import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { UserRole } from '../../types/domain';
import { ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles, children }) => {
  const { profile, loading, hasRole } = useAuth();
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-retac-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-retac-navy border-t-retac-gold" />
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !hasRole(allowedRoles)) {
    return (
      <div className="p-8 max-w-lg mx-auto mt-16 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
        <ShieldAlert className="w-12 h-12 text-rose-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-retac-navy">{t('unauthorizedTitle')}</h2>
        <p className="text-sm text-slate-600 mt-1">{t('unauthorizedDesc')}</p>
      </div>
    );
  }

  return <>{children}</>;
};
