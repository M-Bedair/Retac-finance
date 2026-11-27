import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';

function getFirebaseErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  return typeof error.code === 'string' ? error.code : '';
}

export const LoginPage: React.FC = () => {
  const { profile, signIn, authError } = useAuth();
  const { lang, setLang, t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (profile) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err: unknown) {
      const code = getFirebaseErrorCode(err);
      setFormError(
        code === 'auth/invalid-credential' ||
          code === 'auth/user-not-found' ||
          code === 'auth/wrong-password'
          ? t('authInvalidCredentials')
          : code === 'auth/network-request-failed'
            ? t('authNetworkError')
            : err instanceof Error
              ? err.message
              : t('authInvalidCredentials')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-retac-navy flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-retac-navySecondary p-6 border-b border-retac-gold/30 flex items-center justify-between">
          <div>
            <span className="text-retac-gold font-bold tracking-wider text-sm">
              RETAC • ABU SIMBEL
            </span>
            <h1 className="text-white text-xl font-bold mt-1">{t('loginTitle')}</h1>
            <p className="text-slate-300 text-xs mt-0.5">{t('loginSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="text-xs px-2.5 py-1 rounded border border-retac-gold/40 text-retac-gold hover:bg-retac-gold/10"
          >
            {lang === 'en' ? 'عربي' : 'EN'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {(formError || authError) && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              {formError ||
                (authError?.includes('Account inactive')
                  ? t('authAccountInactive')
                  : authError?.includes('User profile not provisioned')
                    ? t('authProfileMissing')
                    : authError)}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('emailLabel')}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-retac-gold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('passwordLabel')}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-retac-gold"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-lg bg-retac-navy text-white font-semibold text-sm hover:bg-retac-navySecondary disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4 text-retac-gold" />
            <span>{submitting ? t('signingIn') : t('signInBtn')}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
