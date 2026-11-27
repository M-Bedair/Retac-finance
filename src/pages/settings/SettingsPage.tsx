import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { UserProfile, UserRole } from '../../types/domain';
import {
  provisionUserSpark,
  updateApprovalChainConfigSpark,
} from '../../services/sparkOperations';
import { useI18n } from '../../contexts/I18nContext';

const ALL_ROLES: UserRole[] = [
  'ADMIN',
  'REQUESTER',
  'MANAGER',
  'FINANCE_MANAGER',
  'DISBURSEMENT_OFFICER',
  'AUDITOR',
];

export const SettingsPage: React.FC = () => {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [financeIds, setFinanceIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [configVersion, setConfigVersion] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [savingChain, setSavingChain] = useState(false);

  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    displayName: '',
    employeeCode: '',
    department: 'Finance',
    roles: ['REQUESTER'] as UserRole[],
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageError, setMessageError] = useState(false);

  useEffect(() => {
    const uq = query(
      collection(db, 'users'),
      where('branchId', '==', 'ABS'),
      orderBy('displayName', 'asc')
    );
    const unsubUsers = onSnapshot(uq, (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserProfile, 'uid'>) })));
    });

    const unsubConfig = onSnapshot(doc(db, 'settings', 'approval_chain'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setManagerIds(d.managerUserIds || []);
        setFinanceIds(d.financeManagerUserIds || []);
        setEnabled(Boolean(d.enabled));
        setConfigVersion(d.version || 1);
      }
    });

    return () => {
      unsubUsers();
      unsubConfig();
    };
  }, []);

  const toggleId = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const handleSaveApprovalChain = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingChain(true);
    setMessage(null);
    setMessageError(false);
    try {
      if (!profile) throw new Error('You must be signed in to update settings.');
      await updateApprovalChainConfigSpark({
        managerUserIds: managerIds,
        financeManagerUserIds: financeIds,
        enabled,
        reason,
        user: profile,
      });
      setReason('');
      setMessage(t('approvalChainSaved'));
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Failed to update approval chain');
      setMessageError(true);
    } finally {
      setSavingChain(false);
    }
  };

  const handleProvisionUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    setMessage(null);
    setMessageError(false);
    try {
      if (!profile) throw new Error('You must be signed in to provision a user.');
      await provisionUserSpark({ ...newUser, adminUser: profile });
      setNewUser({
        email: '',
        password: '',
        displayName: '',
        employeeCode: '',
        department: 'Finance',
        roles: ['REQUESTER'],
      });
      setMessage(t('userProvisionedMessage'));
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'User provisioning failed');
      setMessageError(true);
    } finally {
      setCreatingUser(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-retac-navy">
          {t('settingsTitle')}
        </h2>
        <p className="text-xs text-slate-500">
          {t('settingsSubtitle')}
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg border text-xs ${
            messageError
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
          role={messageError ? 'alert' : 'status'}
        >
          {message}
        </div>
      )}

      {/* DYNAMIC APPROVAL CHAIN */}
      <form
        onSubmit={handleSaveApprovalChain}
        className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-retac-navy">
              {t('activeApprovalChain', { version: configVersion })}
            </h3>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>{t('workflowEnabled')}</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-slate-200 rounded-lg p-4">
            <h4 className="text-xs font-bold text-retac-navy mb-2">
              {t('stageOneManagers')}
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {users
                .filter((u) => u.isActive && u.roles.includes('MANAGER'))
                .map((u) => (
                  <label key={u.uid} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={managerIds.includes(u.uid)}
                      onChange={() => toggleId(managerIds, setManagerIds, u.uid)}
                    />
                    <span>
                      {u.displayName} ({u.email})
                    </span>
                  </label>
                ))}
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4">
            <h4 className="text-xs font-bold text-retac-navy mb-2">
              {t('stageTwoFinance')}
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {users
                .filter((u) => u.isActive && u.roles.includes('FINANCE_MANAGER'))
                .map((u) => (
                  <label key={u.uid} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={financeIds.includes(u.uid)}
                      onChange={() => toggleId(financeIds, setFinanceIds, u.uid)}
                    />
                    <span>
                      {u.displayName} ({u.email})
                    </span>
                  </label>
                ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            placeholder={t('approvalChangeReason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs"
          />
          <button
            type="submit"
            disabled={savingChain}
            className="px-5 py-2 rounded-lg bg-retac-navy text-retac-gold text-xs font-bold"
          >
            {savingChain ? t('saving') : t('saveApprovalChain')}
          </button>
        </div>
      </form>

      {/* PROVISION USER */}
      <form
        onSubmit={handleProvisionUser}
        className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"
      >
        <h3 className="text-sm font-bold text-retac-navy">{t('provisionBranchUser')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <input
            required
            placeholder={t('fullNameRequired')}
            value={newUser.displayName}
            onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
          />
          <input
            type="email"
            required
            placeholder={t('corporateEmailRequired')}
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder={t('temporaryPasswordRequired')}
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          {ALL_ROLES.map((role) => (
            <label key={role} className="inline-flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={newUser.roles.includes(role)}
                onChange={() =>
                  setNewUser({
                    ...newUser,
                    roles: newUser.roles.includes(role)
                      ? newUser.roles.filter((r) => r !== role)
                      : [...newUser.roles, role],
                  })
                }
              />
              <span>
                {role === 'ADMIN'
                  ? t('roleAdmin')
                  : role === 'REQUESTER'
                    ? t('roleRequester')
                    : role === 'MANAGER'
                      ? t('roleManager')
                      : role === 'FINANCE_MANAGER'
                        ? t('roleFinanceManager')
                        : role === 'DISBURSEMENT_OFFICER'
                          ? t('roleDisbursementOfficer')
                          : t('roleAuditor')}
              </span>
            </label>
          ))}
        </div>
        <button
          type="submit"
          disabled={creatingUser}
          className="px-4 py-2 rounded-lg bg-retac-gold text-retac-navy text-xs font-bold"
        >
          {creatingUser ? t('creating') : t('createUser')}
        </button>
      </form>
    </div>
  );
};
