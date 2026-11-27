import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, deleteUser, getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { UserRole } from '../types/domain';

const BRANCH_ID = 'ABS';

interface SparkUser {
  uid: string;
  displayName: string;
  roles: UserRole[];
}

function hasRole(user: SparkUser, role: UserRole): boolean {
  return user.roles.includes(role);
}

function auditEntry(params: {
  user: SparkUser;
  action: string;
  entityType: string;
  entityId: string;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  reason?: string | null;
}) {
  return {
    branchId: BRANCH_ID,
    userId: params.user.uid,
    actorUid: params.user.uid,
    actorName: params.user.displayName,
    actorRole: params.user.roles[0] || 'REQUESTER',
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    previousValues: params.previousValues ?? null,
    newValues: params.newValues ?? null,
    reason: params.reason ?? null,
    timestamp: new Date().toISOString(),
    createdAt: serverTimestamp(),
  };
}

export async function submitFinancialRequestSpark(requestId: string, user: SparkUser) {
  const requestRef = doc(db, 'requests', requestId);
  const configRef = doc(db, 'settings', 'approval_chain');
  const auditRef = doc(collection(db, 'audit_logs'));
  const year = new Date().getFullYear();

  return runTransaction(db, async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists()) throw new Error('Request not found.');

    const request = requestSnapshot.data();
    if (request.createdBy !== user.uid && !hasRole(user, 'ADMIN')) {
      throw new Error('Only the request creator or an administrator can submit this request.');
    }
    if (!['DRAFT', 'REJECTED'].includes(request.status)) {
      throw new Error(`Cannot submit a request with status ${request.status}.`);
    }
    if (!request.customerId || !Number.isFinite(Number(request.requestedAmount)) || Number(request.requestedAmount) <= 0) {
      throw new Error('A valid customer and positive requested amount are required.');
    }

    const configSnapshot = await transaction.get(configRef);
    if (!configSnapshot.exists() || !configSnapshot.data().enabled) {
      throw new Error('The approval chain is missing or disabled.');
    }
    const config = configSnapshot.data();
    const assignedManagerIds = Array.isArray(config.managerUserIds) ? config.managerUserIds : [];
    const assignedFinanceManagerIds = Array.isArray(config.financeManagerUserIds)
      ? config.financeManagerUserIds
      : [];
    if (assignedManagerIds.length === 0 || assignedFinanceManagerIds.length === 0) {
      throw new Error('Active Manager and Finance Manager assignments are required.');
    }

    let requestNumber = request.requestNumber || '';
    if (!requestNumber || requestNumber.startsWith('DRAFT-')) {
      const prefix = request.requestType === 'CHEQUE' ? 'CH' : 'PC';
      const counterRef = doc(db, 'counters', `${BRANCH_ID}_${prefix}_${year}`);
      const counterSnapshot = await transaction.get(counterRef);
      const counter = counterSnapshot.exists() ? counterSnapshot.data() : {};
      const nextSequence = Number(counter.lastSeq ?? counter.seq ?? 0) + 1;
      requestNumber = `${BRANCH_ID}-${prefix}-${year}-${String(nextSequence).padStart(5, '0')}`;
      transaction.set(
        counterRef,
        {
          branchId: BRANCH_ID,
          type: request.requestType,
          year,
          lastSeq: nextSequence,
          seq: nextSequence,
          lastRequestId: requestId,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    const approvalSnapshot = {
      assignedManagerIds,
      assignedFinanceManagerIds,
      snapshottedAt: new Date().toISOString(),
      configVersion: Number(config.version) || 1,
    };
    const nextStatus = 'PENDING_MANAGER';

    transaction.update(requestRef, {
      requestNumber,
      status: nextStatus,
      approvedAmount: 0,
      totalPaidAmount: 0,
      remainingAmount: Number(request.requestedAmount),
      approvalSnapshot,
      submittedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(
      auditRef,
      auditEntry({
        user,
        action: request.status === 'REJECTED' ? 'REQUEST_RESUBMITTED' : 'REQUEST_SUBMITTED',
        entityType: 'REQUEST',
        entityId: requestId,
        previousValues: { status: request.status },
        newValues: { requestNumber, status: nextStatus, approvalSnapshot },
      })
    );

    return requestNumber;
  });
}

export async function processApprovalDecisionSpark(params: {
  requestId: string;
  stage: 'MANAGER' | 'FINANCE_MANAGER';
  decision: 'APPROVED' | 'REJECTED';
  comment: string;
  approvedAmount?: number;
  user: SparkUser;
}) {
  const { requestId, stage, decision, comment, approvedAmount, user } = params;
  if (decision === 'REJECTED' && comment.trim().length < 3) {
    throw new Error('A rejection reason of at least 3 characters is required.');
  }

  const requestRef = doc(db, 'requests', requestId);
  const approvalRef = doc(collection(db, 'approvals'));
  const auditRef = doc(collection(db, 'audit_logs'));

  return runTransaction(db, async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists()) throw new Error('Request not found.');
    const request = requestSnapshot.data();
    const isAdmin = hasRole(user, 'ADMIN');

    if (request.createdBy === user.uid && !isAdmin) {
      throw new Error('You cannot approve a request you created.');
    }
    const snapshot = request.approvalSnapshot;
    if (!snapshot) throw new Error('The request has no approval assignment snapshot.');

    const history: Array<{
      stage: 'MANAGER' | 'FINANCE_MANAGER';
      decision: 'APPROVED' | 'REJECTED';
      actorId: string;
    }> = Array.isArray(request.approvalHistory) ? request.approvalHistory : [];

    let nextStatus: string;
    let finalApprovedAmount = Number(request.approvedAmount || 0);
    let remainingAmount = Number(request.remainingAmount ?? request.requestedAmount);

    if (stage === 'MANAGER') {
      if (request.status !== 'PENDING_MANAGER') {
        throw new Error('This request is not awaiting Manager approval.');
      }
      if (!isAdmin && (!hasRole(user, 'MANAGER') || !snapshot.assignedManagerIds?.includes(user.uid))) {
        throw new Error('You are not an assigned Manager approver for this request.');
      }
      nextStatus = decision === 'APPROVED' ? 'PENDING_FINANCE' : 'REJECTED';
    } else {
      if (request.status !== 'PENDING_FINANCE') {
        throw new Error('This request is not awaiting Finance Manager approval.');
      }
      if (
        !isAdmin &&
        (!hasRole(user, 'FINANCE_MANAGER') ||
          !snapshot.assignedFinanceManagerIds?.includes(user.uid))
      ) {
        throw new Error('You are not an assigned Finance Manager approver for this request.');
      }
      const managerDecision = history
        .filter((entry) => entry.stage === 'MANAGER')
        .slice(-1)[0];
      if (!managerDecision || managerDecision.decision !== 'APPROVED') {
        throw new Error('A Manager approval is required first.');
      }
      if (managerDecision.actorId === user.uid && !isAdmin) {
        throw new Error('The same user cannot approve both stages.');
      }
      nextStatus = decision === 'APPROVED' ? 'READY_FOR_PAYMENT' : 'REJECTED';
      if (decision === 'APPROVED') {
        finalApprovedAmount = Number(approvedAmount ?? request.requestedAmount);
        if (
          !Number.isFinite(finalApprovedAmount) ||
          finalApprovedAmount <= 0 ||
          finalApprovedAmount > Number(request.requestedAmount)
        ) {
          throw new Error('Approved amount must be positive and no greater than the requested amount.');
        }
        remainingAmount = finalApprovedAmount;
      }
    }

    if (decision === 'REJECTED') finalApprovedAmount = 0;
    const decisionRecord = {
      approvalId: approvalRef.id,
      stage,
      decision,
      actorId: user.uid,
      actorName: user.displayName,
      comment: comment.trim(),
      approvedAmount: finalApprovedAmount,
      decidedAt: new Date().toISOString(),
    };
    const nextHistory = [...history, decisionRecord];

    transaction.update(requestRef, {
      status: nextStatus,
      approvedAmount: finalApprovedAmount,
      remainingAmount,
      approvalHistory: nextHistory,
      updatedAt: serverTimestamp(),
    });
    transaction.set(approvalRef, {
      id: approvalRef.id,
      branchId: BRANCH_ID,
      requestId,
      requestNumber: request.requestNumber,
      ...decisionRecord,
    });
    transaction.set(
      auditRef,
      auditEntry({
        user,
        action: `${stage}_${decision}`,
        entityType: 'REQUEST',
        entityId: requestId,
        previousValues: { status: request.status },
        newValues: { status: nextStatus, approvedAmount: finalApprovedAmount, decisionRecord },
        reason: decision === 'REJECTED' ? comment.trim() : null,
      })
    );

    return nextStatus;
  });
}

export async function recordDisbursementSpark(params: {
  requestId: string;
  idempotencyKey: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  transactionReference: string;
  chequeDetails?: {
    chequeNumber: string;
    bankName: string;
    chequeDate: string;
    payeeName: string;
  } | null;
  notes: string;
  user: SparkUser;
}) {
  const {
    requestId,
    idempotencyKey,
    amount,
    paymentDate,
    paymentMethod,
    transactionReference,
    chequeDetails,
    notes,
    user,
  } = params;
  if (!hasRole(user, 'DISBURSEMENT_OFFICER') && !hasRole(user, 'ADMIN')) {
    throw new Error('A Disbursement Officer role is required.');
  }
  const paymentAmount = Number(Number(amount).toFixed(2));
  const normalizedKey = idempotencyKey.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (
    !normalizedKey ||
    normalizedKey.length > 100 ||
    !Number.isFinite(paymentAmount) ||
    paymentAmount <= 0 ||
    !paymentDate ||
    !paymentMethod
  ) {
    throw new Error('A positive amount, payment date, and payment method are required.');
  }

  const requestRef = doc(db, 'requests', requestId);
  const paymentId = `${requestId}_${normalizedKey}`;
  const paymentRef = doc(db, 'disbursements', paymentId);
  const auditRef = doc(collection(db, 'audit_logs'));

  return runTransaction(db, async (transaction) => {
    const [requestSnapshot, paymentSnapshot] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(paymentRef),
    ]);
    if (!requestSnapshot.exists()) throw new Error('Request not found.');
    const request = requestSnapshot.data();
    const normalizedReference = transactionReference.trim();

    if (paymentSnapshot.exists()) {
      const existingPayment = paymentSnapshot.data();
      if (
        existingPayment.requestId !== requestId ||
        existingPayment.disbursedBy !== user.uid ||
        Number(existingPayment.amount) !== paymentAmount ||
        existingPayment.paymentDate !== paymentDate ||
        existingPayment.paymentMethod !== paymentMethod ||
        existingPayment.transactionReference !== normalizedReference
      ) {
        throw new Error('This idempotency key was already used for a different payment.');
      }
      return {
        paymentId,
        status: request.status,
        remainingAmount: Number(request.remainingAmount || 0),
      };
    }

    if (!['READY_FOR_PAYMENT', 'PARTIALLY_PAID'].includes(request.status)) {
      throw new Error('The request is not approved and ready for disbursement.');
    }

    const approvedAmount = Number(request.approvedAmount || 0);
    const totalPaidAmount = Number(request.totalPaidAmount || 0);
    const remainingAmount = Number((approvedAmount - totalPaidAmount).toFixed(2));
    if (approvedAmount <= 0 || paymentAmount > remainingAmount + 0.0001) {
      throw new Error('The payment amount exceeds the approved remaining balance.');
    }
    const mergedChequeDetails = chequeDetails
      ? { ...(request.chequeDetails || {}), ...chequeDetails }
      : request.chequeDetails || null;
    if (
      request.requestType === 'CHEQUE' &&
      (!mergedChequeDetails?.chequeNumber ||
        !mergedChequeDetails?.bankName ||
        !mergedChequeDetails?.chequeDate)
    ) {
      throw new Error('Cheque number, bank name, and cheque date are required.');
    }

    const newTotalPaid = Number((totalPaidAmount + paymentAmount).toFixed(2));
    const newRemaining = Number((approvedAmount - newTotalPaid).toFixed(2));
    const nextStatus = newRemaining <= 0 ? 'PAID' : 'PARTIALLY_PAID';
    const now = new Date().toISOString();
    transaction.set(paymentRef, {
      id: paymentId,
      idempotencyKey: normalizedKey,
      branchId: BRANCH_ID,
      requestId,
      requestNumber: request.requestNumber,
      requestType: request.requestType,
      customerId: request.customerId,
      customerName: request.customerSnapshot?.name || '',
      amount: paymentAmount,
      currency: request.currency || 'EGP',
      paymentDate,
      paymentMethod,
      transactionReference: normalizedReference,
      chequeDetails: mergedChequeDetails,
      receiptUrl: null,
      notes: notes.trim(),
      isReversal: false,
      reversesPaymentId: null,
      disbursedBy: user.uid,
      disbursedByName: user.displayName,
      createdAt: now,
    });
    transaction.update(requestRef, {
      totalPaidAmount: newTotalPaid,
      remainingAmount: newRemaining,
      status: nextStatus,
      chequeDetails: mergedChequeDetails,
      updatedAt: serverTimestamp(),
      lastDisbursementId: paymentId,
      lastDisbursementAmount: paymentAmount,
      lastDisbursementIsReversal: false,
    });
    transaction.set(
      auditRef,
      auditEntry({
        user,
        action: nextStatus === 'PAID' ? 'DISBURSEMENT_FULL_COMPLETED' : 'DISBURSEMENT_PARTIAL_RECORDED',
        entityType: 'DISBURSEMENT',
        entityId: paymentId,
        previousValues: { status: request.status, totalPaidAmount, remainingAmount },
        newValues: {
          status: nextStatus,
          paymentAmount,
          totalPaidAmount: newTotalPaid,
          remainingAmount: newRemaining,
          paymentMethod,
          transactionReference: normalizedReference,
        },
      })
    );

    return { paymentId, status: nextStatus, remainingAmount: newRemaining };
  });
}

export async function reverseDisbursementSpark(params: {
  paymentId: string;
  reason: string;
  user: SparkUser;
}) {
  const { paymentId, reason, user } = params;
  if (!hasRole(user, 'DISBURSEMENT_OFFICER') && !hasRole(user, 'ADMIN')) {
    throw new Error('A Disbursement Officer role is required.');
  }
  if (reason.trim().length < 5) throw new Error('A reversal reason of at least 5 characters is required.');

  const originalRef = doc(db, 'disbursements', paymentId);
  const reversalRef = doc(db, 'disbursements', `REV_${paymentId}`);
  const auditRef = doc(collection(db, 'audit_logs'));

  return runTransaction(db, async (transaction) => {
    const originalSnapshot = await transaction.get(originalRef);
    const reversalSnapshot = await transaction.get(reversalRef);
    if (!originalSnapshot.exists()) throw new Error('Original payment not found.');
    if (reversalSnapshot.exists()) throw new Error('This payment has already been reversed.');
    const original = originalSnapshot.data();
    if (original.isReversal) throw new Error('A reversal entry cannot itself be reversed.');

    const requestRef = doc(db, 'requests', original.requestId);
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists()) throw new Error('Parent request not found.');
    const request = requestSnapshot.data();
    const reversedAmount = Number(original.amount);
    const newTotalPaid = Number((Number(request.totalPaidAmount || 0) - reversedAmount).toFixed(2));
    if (!Number.isFinite(reversedAmount) || reversedAmount <= 0 || newTotalPaid < 0) {
      throw new Error('Payment reversal would result in an invalid paid balance.');
    }
    const newRemaining = Number((Number(request.approvedAmount || 0) - newTotalPaid).toFixed(2));
    const nextStatus = newTotalPaid === 0 ? 'READY_FOR_PAYMENT' : 'PARTIALLY_PAID';
    const now = new Date().toISOString();
    const reversalId = reversalRef.id;

    transaction.set(reversalRef, {
      id: reversalId,
      branchId: BRANCH_ID,
      requestId: original.requestId,
      requestNumber: original.requestNumber,
      requestType: original.requestType,
      customerId: original.customerId,
      customerName: original.customerName,
      amount: -reversedAmount,
      currency: original.currency,
      paymentDate: now.slice(0, 10),
      paymentMethod: original.paymentMethod,
      transactionReference: `REVERSAL OF ${paymentId}`,
      chequeDetails: original.chequeDetails || null,
      receiptUrl: null,
      notes: reason.trim(),
      isReversal: true,
      reversesPaymentId: paymentId,
      disbursedBy: user.uid,
      disbursedByName: user.displayName,
      createdAt: now,
    });
    transaction.update(requestRef, {
      totalPaidAmount: newTotalPaid,
      remainingAmount: newRemaining,
      status: nextStatus,
      updatedAt: serverTimestamp(),
      lastDisbursementId: reversalId,
      lastDisbursementAmount: -reversedAmount,
      lastDisbursementIsReversal: true,
    });
    transaction.set(
      auditRef,
      auditEntry({
        user,
        action: 'DISBURSEMENT_REVERSED',
        entityType: 'DISBURSEMENT',
        entityId: paymentId,
        previousValues: { totalPaidAmount: request.totalPaidAmount, status: request.status },
        newValues: { totalPaidAmount: newTotalPaid, remainingAmount: newRemaining, status: nextStatus },
        reason: reason.trim(),
      })
    );

    return { reversalId, status: nextStatus, remainingAmount: newRemaining };
  });
}

export async function updateApprovalChainConfigSpark(params: {
  managerUserIds: string[];
  financeManagerUserIds: string[];
  enabled: boolean;
  reason: string;
  user: SparkUser;
}) {
  const { managerUserIds, financeManagerUserIds, enabled, reason, user } = params;
  if (!hasRole(user, 'ADMIN')) throw new Error('Only an administrator can update the approval chain.');
  if (reason.trim().length < 3) {
    throw new Error('An audit reason of at least 3 characters is required for approval-chain changes.');
  }
  if (enabled && (!managerUserIds.length || !financeManagerUserIds.length)) {
    throw new Error('At least one Manager and Finance Manager must be assigned when the workflow is enabled.');
  }

  const configRef = doc(db, 'settings', 'approval_chain');
  const auditRef = doc(collection(db, 'audit_logs'));
  return runTransaction(db, async (transaction) => {
    const configSnapshot = await transaction.get(configRef);
    const previousConfig = configSnapshot.exists() ? configSnapshot.data() : {};
    const version = Number(previousConfig.version || 0) + 1;
    const nextConfig = {
      branchId: BRANCH_ID,
      managerUserIds,
      financeManagerUserIds,
      enabled,
      version,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    };
    transaction.set(configRef, nextConfig, { merge: true });
    transaction.set(
      auditRef,
      auditEntry({
        user,
        action: 'APPROVAL_CHAIN_UPDATED',
        entityType: 'SETTINGS',
        entityId: 'approval_chain',
        previousValues: {
          managerUserIds: previousConfig.managerUserIds || [],
          financeManagerUserIds: previousConfig.financeManagerUserIds || [],
          enabled: previousConfig.enabled ?? false,
          version: previousConfig.version || 0,
        },
        newValues: { managerUserIds, financeManagerUserIds, enabled, version },
        reason: reason.trim(),
      })
    );
    return version;
  });
}

export async function provisionUserSpark(params: {
  email: string;
  password: string;
  displayName: string;
  employeeCode: string;
  department: string;
  roles: UserRole[];
  adminUser: SparkUser;
}) {
  const { email, password, displayName, employeeCode, department, roles, adminUser } = params;
  if (!hasRole(adminUser, 'ADMIN')) throw new Error('Only an administrator can provision users.');
  if (!email.trim() || !password || !displayName.trim() || roles.length === 0) {
    throw new Error('Email, password, display name, and at least one role are required.');
  }

  const secondaryApp = initializeApp(
    {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-retac.firebaseapp.com',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-retac',
    },
    `SecondaryUserCreator_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
  const secondaryAuth = getAuth(secondaryApp);
  let createdUser: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>['user'] | null = null;

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
    createdUser = credential.user;
    const newUid = credential.user.uid;
    const profileRef = doc(db, 'users', newUid);
    const auditRef = doc(collection(db, 'audit_logs'));
    await runTransaction(db, async (transaction) => {
      transaction.set(profileRef, {
        uid: newUid,
        email: email.trim(),
        displayName: displayName.trim(),
        employeeCode: employeeCode.trim(),
        department: department.trim(),
        branchId: BRANCH_ID,
        roles,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      transaction.set(
        auditRef,
        auditEntry({
          user: adminUser,
          action: 'USER_PROVISIONED',
          entityType: 'USER',
          entityId: newUid,
          newValues: { email: email.trim(), roles, branchId: BRANCH_ID },
        })
      );
    });
    return newUid;
  } catch (error) {
    if (createdUser) await deleteUser(createdUser);
    throw error;
  } finally {
    await deleteApp(secondaryApp);
  }
}
