import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileSpreadsheet,
  CheckSquare,
  BadgeDollarSign,
  Wallet,
  Building2,
  BarChart3,
  History,
  Settings,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { UserRole } from '../../types/domain';

interface NavItem {
  to: string;
  labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0];
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    labelKey: 'navDashboard',
    icon: LayoutDashboard,
    roles: ['ADMIN', 'REQUESTER', 'MANAGER', 'FINANCE_MANAGER', 'DISBURSEMENT_OFFICER', 'AUDITOR'],
  },
  {
    to: '/requests',
    labelKey: 'navRequests',
    icon: FileSpreadsheet,
    roles: ['ADMIN', 'REQUESTER', 'MANAGER', 'FINANCE_MANAGER', 'DISBURSEMENT_OFFICER', 'AUDITOR'],
  },
  {
    to: '/approvals/manager',
    labelKey: 'navManagerApprovals',
    icon: CheckSquare,
    roles: ['ADMIN', 'MANAGER'],
  },
  {
    to: '/approvals/finance',
    labelKey: 'navFinanceApprovals',
    icon: BadgeDollarSign,
    roles: ['ADMIN', 'FINANCE_MANAGER'],
  },
  {
    to: '/disbursements',
    labelKey: 'navDisbursements',
    icon: Wallet,
    roles: ['ADMIN', 'DISBURSEMENT_OFFICER'],
  },
  {
    to: '/customers',
    labelKey: 'navCustomers',
    icon: Building2,
    roles: ['ADMIN', 'REQUESTER', 'FINANCE_MANAGER', 'AUDITOR'],
  },
  {
    to: '/reports',
    labelKey: 'navReports',
    icon: BarChart3,
    roles: ['ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'DISBURSEMENT_OFFICER', 'AUDITOR'],
  },
  {
    to: '/audit',
    labelKey: 'navAuditLog',
    icon: History,
    roles: ['ADMIN', 'AUDITOR'],
  },
  {
    to: '/settings',
    labelKey: 'navSettings',
    icon: Settings,
    roles: ['ADMIN'],
  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const { hasRole } = useAuth();
  const { t } = useI18n();

  const visibleItems = NAV_ITEMS.filter((item) => hasRole(item.roles));

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden no-print"
          onClick={onClose}
        />
      )}
      <aside
        className={`no-print fixed inset-y-0 start-0 z-40 w-64 bg-retac-navy text-white flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'
        }`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-retac-gold" />
              <span className="font-bold tracking-wide text-retac-gold text-base">
                RETAC
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">{t('branchName')}</p>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-slate-300 hover:text-white"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-retac-gold text-retac-navy font-semibold shadow-sm'
                      : 'text-slate-200 hover:bg-retac-navySecondary hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 text-xs text-slate-400">
          RETAC Financial Control v1.0
        </div>
      </aside>
    </>
  );
};
