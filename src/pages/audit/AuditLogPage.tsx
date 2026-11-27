import React, { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useI18n } from '../../contexts/I18nContext';
import { AuditLogEntry } from '../../types/domain';

type TranslationKey = Parameters<ReturnType<typeof useI18n>['t']>[0];

const AUDIT_ACTION_LABELS: Partial<Record<string, TranslationKey>> = {
  REQUEST_SUBMITTED: 'auditRequestSubmitted',
  REQUEST_RESUBMITTED: 'auditRequestResubmitted',
  MANAGER_APPROVED: 'auditManagerApproved',
  MANAGER_REJECTED: 'auditManagerRejected',
  FINANCE_MANAGER_APPROVED: 'auditFinanceApproved',
  FINANCE_MANAGER_REJECTED: 'auditFinanceRejected',
  DISBURSEMENT_FULL_COMPLETED: 'auditPaymentCompleted',
  DISBURSEMENT_PARTIAL_RECORDED: 'auditPaymentRecorded',
  DISBURSEMENT_REVERSED: 'auditPaymentReversed',
  APPROVAL_CHAIN_UPDATED: 'auditApprovalChainUpdated',
  USER_PROVISIONED: 'auditUserProvisioned',
};

const AUDIT_ENTITY_LABELS: Partial<Record<string, TranslationKey>> = {
  REQUEST: 'entityRequest',
  DISBURSEMENT: 'entityDisbursement',
  SETTINGS: 'entitySettings',
  USER: 'entityUser',
};

function auditActionLabel(action: string, translate: ReturnType<typeof useI18n>['t']): string {
  const key = AUDIT_ACTION_LABELS[action];
  return key ? translate(key) : action;
}

function auditEntityLabel(entity: string, translate: ReturnType<typeof useI18n>['t']): string {
  const key = AUDIT_ENTITY_LABELS[entity];
  return key ? translate(key) : entity;
}

export const AuditLogPage: React.FC = () => {
  const { t, lang } = useI18n();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'audit_logs'),
      where('branchId', '==', 'ABS'),
      orderBy('timestamp', 'desc'),
      limit(150)
    );
    return onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogEntry, 'id'>) })));
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-retac-navy">{t('auditTitle')}</h2>
        <p className="text-xs text-slate-500">{t('auditSubtitle')}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-start">{t('timestamp')}</th>
                <th className="px-4 py-3 text-start">{t('actor')}</th>
                <th className="px-4 py-3 text-start">{t('action')}</th>
                <th className="px-4 py-3 text-start">{t('entity')}</th>
                <th className="px-4 py-3 text-start">{t('reason')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {new Date(log.timestamp).toLocaleString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-EG')}
                  </td>
                  <td className="px-4 py-3 font-semibold text-retac-navy">{log.actorName}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-[11px]">
                      {auditActionLabel(log.action, t)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {auditEntityLabel(log.entityType, t)}: {log.entityId}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{log.reason || '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    {t('noAuditLogs')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
