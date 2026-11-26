import React, { createContext, useContext, useEffect, useState } from 'react';

export type Language = 'en' | 'ar';

const translations = {
  en: {
    brandTitle: 'RETAC Financial Control',
    branchName: 'Abu Simbel Branch (ABS)',
    navDashboard: 'Dashboard',
    navRequests: 'Requests',
    navManagerApprovals: 'Manager Approvals',
    navFinanceApprovals: 'Finance Approvals',
    navDisbursements: 'Disbursement Center',
    navCustomers: 'Customer Master',
    navReports: 'Financial Reports',
    navAuditLog: 'Audit Trail',
    navSettings: 'System Settings',
    signOut: 'Sign Out',
    loginTitle: 'Sign in to RETAC Finance',
    loginSubtitle: 'Petty Cash & Cheque Control — Abu Simbel',
    emailLabel: 'Corporate Email',
    passwordLabel: 'Password',
    signInBtn: 'Sign In',
    signingIn: 'Authenticating...',
    unauthorizedTitle: 'Access Restricted',
    unauthorizedDesc: 'Your role does not permit access to this module.',
    newRequest: 'New Request',
    pettyCash: 'Petty Cash',
    cheque: 'Cheque',
    submit: 'Submit for Approval',
    saveDraft: 'Save Draft',
    approve: 'Approve',
    reject: 'Reject',
    disburse: 'Record Payment',
    exportExcel: 'Export Excel',
    printReport: 'Print / PDF',
  },
  ar: {
    brandTitle: 'نظام ريتاك للرقابة المالية',
    branchName: 'فرع أبو سمبل (ABS)',
    navDashboard: 'لوحة التحكم',
    navRequests: 'الطلبات المالية',
    navManagerApprovals: 'اعتماد المدير',
    navFinanceApprovals: 'اعتماد الإدارة المالية',
    navDisbursements: 'مركز الصرف',
    navCustomers: 'سجل العملاء والموردين',
    navReports: 'التقارير المالية',
    navAuditLog: 'سجل المراجعة والتدقيق',
    navSettings: 'إعدادات النظام',
    signOut: 'تسجيل الخروج',
    loginTitle: 'تسجيل الدخول إلى نظام ريتاك المالي',
    loginSubtitle: 'إدارة العهد النقدية والشيكات — فرع أبو سمبل',
    emailLabel: 'البريد الإلكتروني الوظيفي',
    passwordLabel: 'كلمة المرور',
    signInBtn: 'دخول',
    signingIn: 'جاري التحقق...',
    unauthorizedTitle: 'صلاحية غير متوفرة',
    unauthorizedDesc: 'دورك الوظيفي الحالي لا يسمح بالدخول إلى هذه الشاشة.',
    newRequest: 'طلب جديد',
    pettyCash: 'عهدة نقدية (Petty Cash)',
    cheque: 'شيك (Cheque)',
    submit: 'إرسال للاعتماد',
    saveDraft: 'حفظ كمسودة',
    approve: 'اعتماد',
    reject: 'رفض',
    disburse: 'تسجيل صرف',
    exportExcel: 'تصدير Excel',
    printReport: 'طباعة / PDF',
  },
} as const;

type TranslationKeys = keyof typeof translations.en;

interface I18nContextValue {
  lang: Language;
  dir: 'ltr' | 'rtl';
  setLang: (lang: Language) => void;
  t: (key: TranslationKeys) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('retac_lang');
    return saved === 'ar' ? 'ar' : 'en';
  });

  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    localStorage.setItem('retac_lang', lang);
  }, [lang, dir]);

  const t = (key: TranslationKeys): string => translations[lang][key];

  return (
    <I18nContext.Provider value={{ lang, dir, setLang: setLangState, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextValue => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
};
