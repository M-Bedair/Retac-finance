import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

admin.initializeApp();
const db = admin.firestore();

export type UserRole =
  | 'ADMIN'
  | 'REQUESTER'
  | 'MANAGER'
  | 'FINANCE_MANAGER'
  | 'DISBURSEMENT_OFFICER'
  | 'AUDITOR';

interface CallerContext {
  uid: string;
  displayName: string;
  email: string;
  roles: UserRole[];
  branchId: string;
}

async function assertAuthorized(
  auth: { uid: string } | undefined,
  requiredRoles?: UserRole[]
): Promise<CallerContext> {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  const userSnap = await db.collection('users').doc(auth.uid).get();
  if (!userSnap.exists) {
    throw new HttpsError('permission-denied', 'User profile not found.');
  }
  const user = userSnap.data()!;
  if (!user.isActive || user.branchId !== 'ABS') {
    throw new HttpsError('permission-denied', 'User inactive or outside Abu Simbel branch.');
  }
  const roles: UserRole[] = Array.isArray(user.roles) ? user.roles : [];
  if (requiredRoles && requiredRoles.length > 0) {
    const allowed = roles.some((r) => requiredRoles.includes(r));
    if (!allowed) {
      throw new HttpsError(
        'permission-denied',
        `Missing required role: ${requiredRoles.join(' or ')}`
      );
    }
  }
  return {
    uid: auth.uid,
    displayName: user.displayName || user.email || auth.uid,
    email: user.email || '',
    roles,
    branchId: user.branchId,
  };
}

function buildAuditEntry(params: {
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  reason?: string | null;
}) {
  return {
    branchId: 'ABS',
    userId: params.actorId,
    actorName: params.actorName,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    previousValues: params.previousValues ?? null,
    newValues: params.newValues ?? null,
    reason: params.reason ?? null,
    timestamp: new Date().toISOString(),
    serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function enqueueNotifications(
  userIds: string[],
  payload: {
    title: string;
    message: string;
    entityType: string;
    entityId: string;
    link: string;
  }
) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;
  const batch = db.batch();
  const now = new Date().toISOString();
  for (const uid of uniqueIds) {
    const ref = db.collection('notifications').doc();
    batch.set(ref, {
      userId: uid,
      branchId: 'ABS',
      title: payload.title,
      message: payload.message,
      entityType: payload.entityType,
      entityId: payload.entityId,
      link: payload.link,
      read: false,
      createdAt: now,
    });
  }
  await batch.commit();
}

/**
 * 1. ADMIN: Provision user profile and sync custom claims
 */
export const provisionUser = onCall(async (request) => {
  const caller = await assertAuthorized(request.auth, ['ADMIN']);
  const { email, password, displayName, employeeCode, department, roles } = request.data as {
    email: string;
    password: string;
    displayName: string;
    employeeCode: string;
    department: string;
    roles: UserRole[];
  };

  if (!email || !password || !displayName || !Array.isArray(roles) || roles.length === 0) {
    throw new HttpsError('invalid-argument', 'Missing required user provisioning fields.');
  }

  const userRecord = await admin.auth().createUser({
    email: email.trim(),
    password,
    displayName: displayName.trim(),
  });

  await admin.auth().setCustomUserClaims(userRecord.uid, {
    roles,
    branchId: 'ABS',
  });

  const now = new Date().toISOString();
  const profile = {
    uid: userRecord.uid,
    email: email.trim(),
    displayName: displayName.trim(),
    employeeCode: employeeCode || '',
    department: department || 'Operations',
    branchId: 'ABS',
    roles,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const batch = db.batch();
  batch.set(db.collection('users').doc(userRecord.uid), profile);
  batch.set(
    db.collection('audit_logs').doc(),
    buildAuditEntry({
      actorId: caller.uid,
      actorName: caller.displayName,
      action: 'USER_PROVISIONED',
      entityType: 'USER',
      entityId: userRecord.uid,
      newValues: { email: profile.email, roles, branchId: 'ABS' },
    })
  );
  await batch.commit();

  return { uid: userRecord.uid };
});

/**
 * 2. ADMIN: Update user roles or active status
 */
export const updateUserAccess = onCall(async (request) => {
  const caller = await assertAuthorized(request.auth, ['ADMIN']);
  const { targetUid, roles, isActive } = request.data as {
    targetUid: string;
    roles: UserRole[];
    isActive: boolean;
  };

  if (!targetUid || !Array.isArray(roles) || roles.length === 0) {
    throw new HttpsError('invalid-argument', 'Target user and at least one role are required.');
  }

  const targetRef = db.collection('users').doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    throw new HttpsError('not-found', 'Target user not found.');
  }
  const prev = targetSnap.data()!;

  await admin.auth().setCustomUserClaims(targetUid, {
    roles,
    branchId: 'ABS',
  });
  await admin.auth().updateUser(targetUid, { disabled: !isActive });

  const now = new Date().toISOString();
  const batch = db.batch();
  batch.update(targetRef, { roles, isActive, updatedAt: now });
  batch.set(
    db.collection('audit_logs').doc(),
    buildAuditEntry({
      actorId: caller.uid,
      actorName: caller.displayName,
      action: 'USER_ACCESS_UPDATED',
      entityType: 'USER',
      entityId: targetUid,
      previousValues: { roles: prev.roles, isActive: prev.isActive },
      newValues: { roles, isActive },
    })
  );
  await batch.commit();

  return { success: true };
});

/**
 * 3. ADMIN: Update Dynamic Approval Chain Configuration (Versioned + Audited)
 */
export const updateApprovalChainConfig = onCall(async (request) => {
  const caller = await assertAuthorized(request.auth, ['ADMIN']);
  const { managerUserIds, financeManagerUserIds, enabled, reason } = request.data as {
    managerUserIds: string[];
    financeManagerUserIds: string[];
    enabled: boolean;
    reason?: string;
  };

  if (!Array.isArray(managerUserIds) || !Array.isArray(financeManagerUserIds)) {
    throw new HttpsError('invalid-argument', 'Approver arrays are required.');
  }
  if (enabled && (managerUserIds.length === 0 || financeManagerUserIds.length === 0)) {
    throw new HttpsError(
      'invalid-argument',
      'At least one Manager and one Finance Manager must be assigned when enabled.'
    );
  }

  const configRef = db.collection('settings').doc('approval_chain');
  const now = new Date().toISOString();

  const newVersion = await db.runTransaction(async (tx) => {
    const snap = await tx.get(configRef);
    const prev = snap.exists ? snap.data()! : null;
    const version = (prev?.version || 0) + 1;

    const nextData = {
      branchId: 'ABS',
      enabled,
      managerUserIds: Array.from(new Set(managerUserIds)),
      financeManagerUserIds: Array.from(new Set(financeManagerUserIds)),
      version,
      updatedBy: caller.uid,
      updatedByName: caller.displayName,
      updatedAt: now,
    };

    tx.set(configRef, nextData);
    tx.set(db.collection('settings').doc('approval_chain').collection('history').doc(`v_${version}`), {
      ...nextData,
      reason: reason || null,
    });
    tx.set(
      db.collection('audit_logs').doc(),
      buildAuditEntry({
        actorId: caller.uid,
        actorName: caller.displayName,
        action: 'APPROVAL_CONFIG_UPDATED',
        entityType: 'SETTINGS',
        entityId: 'approval_chain',
        previousValues: prev
          ? {
              enabled: prev.enabled,
              managerUserIds: prev.managerUserIds,
              financeManagerUserIds: prev.financeManagerUserIds,
              version: prev.version,
            }
          : null,
        newValues: nextData,
        reason: reason || null,
      })
    );

    return version;
  });

  return { success: true, version: newVersion };
});

/**
 * 4. REQUESTER: Submit Request (Atomic Numbering + Approver Snapshot + Freeze)
 */
export const submitFinancialRequest = onCall(async (request) => {
  const caller = await assertAuthorized(request.auth, ['REQUESTER', 'ADMIN']);
  const { requestId } = request.data as { requestId: string };
  if (!requestId) {
    throw new HttpsError('invalid-argument', 'requestId is required.');
  }

  const reqRef = db.collection('requests').doc(requestId);
  const configRef = db.collection('settings').doc('approval_chain');
  const now = new Date().toISOString();
  const year = new Date().getFullYear();

  const result = await db.runTransaction(async (tx) => {
    const [reqSnap, configSnap] = await Promise.all([tx.get(reqRef), tx.get(configRef)]);
    if (!reqSnap.exists) {
      throw new HttpsError('not-found', 'Request document not found.');
    }
    const req = reqSnap.data()!;
    if (req.createdBy !== caller.uid && !caller.roles.includes('ADMIN')) {
      throw new HttpsError('permission-denied', 'Only the creator can submit this request.');
    }
    if (req.status !== 'DRAFT' && req.status !== 'REJECTED') {
      throw new HttpsError(
        'failed-precondition',
        `Cannot submit request in status ${req.status}.`
      );
    }
    if (!req.customerId || !req.requestedAmount || Number(req.requestedAmount) <= 0) {
      throw new HttpsError('invalid-argument', 'Valid customer and positive amount are required.');
    }
    if (!configSnap.exists || !configSnap.data()!.enabled) {
      throw new HttpsError(
        'failed-precondition',
        'Approval chain is not configured or is disabled by Admin.'
      );
    }

    const config = configSnap.data()!;
    const assignedManagerIds: string[] = config.managerUserIds || [];
    const assignedFinanceManagerIds: string[] = config.financeManagerUserIds || [];
    if (assignedManagerIds.length === 0 || assignedFinanceManagerIds.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'Active Manager and Finance Manager assignments are missing.'
      );
    }

    // Generate transaction-safe request number if not yet assigned
    let requestNumber: string = req.requestNumber || '';
    if (!requestNumber || requestNumber.startsWith('DRAFT-')) {
      const prefix = req.requestType === 'CHEQUE' ? 'CH' : 'PC';
      const counterId = `ABS_${prefix}_${year}`;
      const counterRef = db.collection('counters').doc(counterId);
      const counterSnap = await tx.get(counterRef);
      const nextSeq = (counterSnap.exists ? Number(counterSnap.data()!.seq) : 0) + 1;
      tx.set(counterRef, { seq: nextSeq, year, branchId: 'ABS', updatedAt: now }, { merge: true });
      requestNumber = `ABS-${prefix}-${year}-${String(nextSeq).padStart(5, '0')}`;
    }

    const approvalSnapshot = {
      assignedManagerIds,
      assignedFinanceManagerIds,
      snapshottedAt: now,
      configVersion: config.version || 1,
    };

    const amount = Number(req.requestedAmount);
    const updates = {
      requestNumber,
      status: 'PENDING_MANAGER',
      approvedAmount: 0,
      totalPaidAmount: 0,
      remainingAmount: amount,
      approvalSnapshot,
      submittedAt: now,
      updatedAt: now,
    };

    tx.update(reqRef, updates);
    tx.set(
      db.collection('audit_logs').doc(),
      buildAuditEntry({
        actorId: caller.uid,
        actorName: caller.displayName,
        action: req.status === 'REJECTED' ? 'REQUEST_RESUBMITTED' : 'REQUEST_SUBMITTED',
        entityType: 'REQUEST',
        entityId: requestId,
        previousValues: { status: req.status },
        newValues: {
          requestNumber,
          status: 'PENDING_MANAGER',
          requestedAmount: amount,
          approvalSnapshot,
        },
      })
    );

    return { requestNumber, assignedManagerIds };
  });

  await enqueueNotifications(result.assignedManagerIds, {
    title: 'New Request Awaiting Manager Approval',
    message: `Request ${result.requestNumber} submitted by ${caller.displayName} requires your review.`,
    entityType: 'REQUEST',
    entityId: requestId,
    link: '/approvals/manager',
  });

  return { success: true, requestNumber: result.requestNumber };
});

/**
 * 5. MANAGER & FINANCE MANAGER: Two-Stage Approval Decision
 */
export const processApprovalDecision = onCall(async (request) => {
  const caller = await assertAuthorized(request.auth, ['MANAGER', 'FINANCE_MANAGER', 'ADMIN']);
  const { requestId, stage, decision, comment, approvedAmount } = request.data as {
    requestId: string;
    stage: 'MANAGER' | 'FINANCE_MANAGER';
    decision: 'APPROVED' | 'REJECTED';
    comment?: string;
    approvedAmount?: number;
  };

  if (!requestId || !stage || !decision) {
    throw new HttpsError('invalid-argument', 'requestId, stage, and decision are required.');
  }
  if (decision === 'REJECTED' && (!comment || comment.trim().length < 3)) {
    throw new HttpsError('invalid-argument', 'A mandatory rejection reason is required.');
  }

  const reqRef = db.collection('requests').doc(requestId);
  const now = new Date().toISOString();

  const outcome = await db.runTransaction(async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) {
      throw new HttpsError('not-found', 'Request not found.');
    }
    const req = reqSnap.data()!;

    // Rule: No self-approval
    if (req.createdBy === caller.uid) {
      throw new HttpsError('permission-denied', 'Request creators cannot approve their own requests.');
    }

    const snapshot = req.approvalSnapshot;
    if (!snapshot) {
      throw new HttpsError('failed-precondition', 'Request lacks an approval assignment snapshot.');
    }

    const history: Array<{ stage: string; decision: string; actorId: string }> =
      req.approvalHistory || [];

    if (stage === 'MANAGER') {
      if (req.status !== 'PENDING_MANAGER') {
        throw new HttpsError(
          'failed-precondition',
          `Request is not awaiting Manager approval (current: ${req.status}).`
        );
      }
      if (!snapshot.assignedManagerIds.includes(caller.uid) && !caller.roles.includes('ADMIN')) {
        throw new HttpsError(
          'permission-denied',
          'You are not an assigned Manager approver for this request.'
        );
      }
      if (history.some((h) => h.stage === 'MANAGER' && h.decision === 'APPROVED')) {
        throw new HttpsError('already-exists', 'Manager stage has already been approved.');
      }
    } else if (stage === 'FINANCE_MANAGER') {
      if (req.status !== 'PENDING_FINANCE') {
        throw new HttpsError(
          'failed-precondition',
          `Request must pass Manager approval first (current: ${req.status}).`
        );
      }
      if (
        !snapshot.assignedFinanceManagerIds.includes(caller.uid) &&
        !caller.roles.includes('ADMIN')
      ) {
        throw new HttpsError(
          'permission-denied',
          'You are not an assigned Finance Manager approver for this request.'
        );
      }
      // Rule: Same person cannot approve both stages
      const managerApproval = history.find((h) => h.stage === 'MANAGER' && h.decision === 'APPROVED');
      if (!managerApproval) {
        throw new HttpsError('failed-precondition', 'Manager approval record missing.');
      }
      if (managerApproval.actorId === caller.uid) {
        throw new HttpsError(
          'permission-denied',
          'Segregation of duties violation: the same user cannot approve both stages.'
        );
      }
      if (history.some((h) => h.stage === 'FINANCE_MANAGER' && h.decision === 'APPROVED')) {
        throw new HttpsError('already-exists', 'Finance stage has already been approved.');
      }
    } else {
      throw new HttpsError('invalid-argument', 'Invalid approval stage.');
    }

    const decisionRecord = {
      stage,
      decision,
      actorId: caller.uid,
      actorName: caller.displayName,
      comment: (comment || '').trim(),
      decidedAt: now,
    };

    let nextStatus = req.status;
    let finalApprovedAmount = Number(req.approvedAmount || 0);
    let remainingAmount = Number(req.remainingAmount || req.requestedAmount);

    if (decision === 'REJECTED') {
      nextStatus = 'REJECTED';
      finalApprovedAmount = 0;
    } else if (stage === 'MANAGER') {
      nextStatus = 'PENDING_FINANCE';
    } else if (stage === 'FINANCE_MANAGER') {
      nextStatus = 'READY_FOR_PAYMENT';
      const candidateAmount =
        approvedAmount !== undefined && approvedAmount !== null
          ? Number(approvedAmount)
          : Number(req.requestedAmount);
      if (candidateAmount <= 0 || candidateAmount > Number(req.requestedAmount)) {
        throw new HttpsError(
          'invalid-argument',
          'Approved amount must be greater than 0 and not exceed requested amount.'
        );
      }
      finalApprovedAmount = candidateAmount;
      remainingAmount = candidateAmount;
    }

    const approvalDocRef = db.collection('approvals').doc();
    tx.set(approvalDocRef, {
      requestId,
      requestNumber: req.requestNumber,
      branchId: 'ABS',
      ...decisionRecord,
    });

    tx.update(reqRef, {
      status: nextStatus,
      approvedAmount: finalApprovedAmount,
      remainingAmount,
      approvalHistory: admin.firestore.FieldValue.arrayUnion(decisionRecord),
      updatedAt: now,
    });

    tx.set(
      db.collection('audit_logs').doc(),
      buildAuditEntry({
        actorId: caller.uid,
        actorName: caller.displayName,
        action: `${stage}_${decision}`,
        entityType: 'REQUEST',
        entityId: requestId,
        previousValues: { status: req.status },
        newValues: {
          status: nextStatus,
          approvedAmount: finalApprovedAmount,
          decisionRecord,
        },
        reason: decision === 'REJECTED' ? decisionRecord.comment : null,
      })
    );

    return {
      requestNumber: req.requestNumber,
      createdBy: req.createdBy as string,
      nextStatus,
      assignedFinanceManagerIds: snapshot.assignedFinanceManagerIds as string[],
    };
  });

  if (outcome.nextStatus === 'PENDING_FINANCE') {
    await enqueueNotifications(outcome.assignedFinanceManagerIds, {
      title: 'Request Awaiting Finance Approval',
      message: `Request ${outcome.requestNumber} was approved by Manager and awaits Finance review.`,
      entityType: 'REQUEST',
      entityId: requestId,
      link: '/approvals/finance',
    });
  } else if (outcome.nextStatus === 'READY_FOR_PAYMENT') {
    await enqueueNotifications([outcome.createdBy], {
      title: 'Request Fully Approved',
      message: `Request ${outcome.requestNumber} is approved and ready for disbursement.`,
      entityType: 'REQUEST',
      entityId: requestId,
      link: '/requests',
    });
    const officersSnap = await db
      .collection('users')
      .where('branchId', '==', 'ABS')
      .where('isActive', '==', true)
      .where('roles', 'array-contains', 'DISBURSEMENT_OFFICER')
      .get();
    await enqueueNotifications(
      officersSnap.docs.map((d) => d.id),
      {
        title: 'Request Ready for Payment',
        message: `Request ${outcome.requestNumber} is ready for disbursement.`,
        entityType: 'REQUEST',
        entityId: requestId,
        link: '/disbursements',
      }
    );
  } else if (outcome.nextStatus === 'REJECTED') {
    await enqueueNotifications([outcome.createdBy], {
      title: 'Request Rejected',
      message: `Request ${outcome.requestNumber} was rejected at ${stage} stage.`,
      entityType: 'REQUEST',
      entityId: requestId,
      link: '/requests',
    });
  }

  return { success: true, status: outcome.nextStatus };
});

/**
 * 6. ADMIN: Explicit Audited Reassignment of a Pending Request
 */
export const reassignPendingRequest = onCall(async (request) => {
  const caller = await assertAuthorized(request.auth, ['ADMIN']);
  const { requestId, assignedManagerIds, assignedFinanceManagerIds, reason } = request.data as {
    requestId: string;
    assignedManagerIds?: string[];
    assignedFinanceManagerIds?: string[];
    reason: string;
  };

  if (!requestId || !reason || reason.trim().length < 3) {
    throw new HttpsError('invalid-argument', 'requestId and an explicit reason are required.');
  }

  const reqRef = db.collection('requests').doc(requestId);
  const now = new Date().toISOString();

  await db.runTransaction(async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) {
      throw new HttpsError('not-found', 'Request not found.');
    }
    const req = reqSnap.data()!;
    if (req.status !== 'PENDING_MANAGER' && req.status !== 'PENDING_FINANCE') {
      throw new HttpsError(
        'failed-precondition',
        'Only pending requests can be reassigned.'
      );
    }

    const prevSnapshot = req.approvalSnapshot || {};
    const updatedSnapshot = {
      ...prevSnapshot,
      assignedManagerIds:
        assignedManagerIds && assignedManagerIds.length > 0
          ? Array.from(new Set(assignedManagerIds))
          : prevSnapshot.assignedManagerIds,
      assignedFinanceManagerIds:
        assignedFinanceManagerIds && assignedFinanceManagerIds.length > 0
          ? Array.from(new Set(assignedFinanceManagerIds))
          : prevSnapshot.assignedFinanceManagerIds,
      reassignedAt: now,
      reassignedBy: caller.uid,
    };

    tx.update(reqRef, {
      approvalSnapshot: updatedSnapshot,
      updatedAt: now,
    });

    tx.set(
      db.collection('audit_logs').doc(),
      buildAuditEntry({
        actorId: caller.uid,
        actorName: caller.displayName,
        action: 'REQUEST_APPROVER_REASSIGNED',
        entityType: 'REQUEST',
        entityId: requestId,
        previousValues: { approvalSnapshot: prevSnapshot },
        newValues: { approvalSnapshot: updatedSnapshot },
        reason: reason.trim(),
      })
    );
  });

  return { success: true };
});

/**
 * 7. DISBURSEMENT OFFICER: Execute Full or Partial Payment (Idempotent + Atomic)
 */
export const recordDisbursement = onCall(async (request) => {
  const caller = await assertAuthorized(request.auth, ['DISBURSEMENT_OFFICER', 'ADMIN']);
  const {
    requestId,
    idempotencyKey,
    amount,
    paymentDate,
    paymentMethod,
    transactionReference,
    chequeDetails,
    receiptUrl,
    notes,
  } = request.data as {
    requestId: string;
    idempotencyKey: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    transactionReference?: string;
    chequeDetails?: {
      chequeNumber: string;
      bankName: string;
      chequeDate: string;
      payeeName: string;
    } | null;
    receiptUrl?: string | null;
    notes?: string;
  };

  if (!requestId || !idempotencyKey || !paymentDate || !paymentMethod) {
    throw new HttpsError('invalid-argument', 'Missing required payment fields.');
  }
  const payAmount = Number(amount);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    throw new HttpsError('invalid-argument', 'Payment amount must be strictly positive.');
  }

  const reqRef = db.collection('requests').doc(requestId);
  const paymentDocId = `${requestId}_${idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const paymentRef = db.collection('disbursements').doc(paymentDocId);
  const now = new Date().toISOString();

  const outcome = await db.runTransaction(async (tx) => {
    const [reqSnap, existingPaymentSnap] = await Promise.all([
      tx.get(reqRef),
      tx.get(paymentRef),
    ]);

    // Idempotency protection against duplicate submissions
    if (existingPaymentSnap.exists) {
      throw new HttpsError(
        'already-exists',
        'Duplicate payment execution blocked (idempotency key already processed).'
      );
    }

    if (!reqSnap.exists) {
      throw new HttpsError('not-found', 'Financial request not found.');
    }
    const req = reqSnap.data()!;

    if (req.status !== 'READY_FOR_PAYMENT' && req.status !== 'PARTIALLY_PAID') {
      throw new HttpsError(
        'failed-precondition',
        `Request is not eligible for disbursement (status: ${req.status}).`
      );
    }

    const approvedAmount = Number(req.approvedAmount || 0);
    const currentPaid = Number(req.totalPaidAmount || 0);
    const currentRemaining = Number((approvedAmount - currentPaid).toFixed(2));

    if (approvedAmount <= 0) {
      throw new HttpsError('failed-precondition', 'Request has zero approved amount.');
    }
    if (payAmount > currentRemaining + 0.0001) {
      throw new HttpsError(
        'invalid-argument',
        `Payment amount (${payAmount}) exceeds remaining balance (${currentRemaining}).`
      );
    }

    // Enforce cheque metadata before final disbursement of CHEQUE requests
    if (req.requestType === 'CHEQUE') {
      const mergedCheque = { ...(req.chequeDetails || {}), ...(chequeDetails || {}) };
      if (!mergedCheque.chequeNumber || !mergedCheque.bankName || !mergedCheque.chequeDate) {
        throw new HttpsError(
          'invalid-argument',
          'Cheque number, bank name, and cheque date are required before cheque disbursement.'
        );
      }
    }

    const newTotalPaid = Number((currentPaid + payAmount).toFixed(2));
    const newRemaining = Number((approvedAmount - newTotalPaid).toFixed(2));
    const nextStatus = newRemaining <= 0 ? 'PAID' : 'PARTIALLY_PAID';

    const paymentRecord = {
      id: paymentDocId,
      branchId: 'ABS',
      requestId,
      requestNumber: req.requestNumber,
      requestType: req.requestType,
      customerId: req.customerId,
      customerName: req.customerSnapshot?.name || '',
      idempotencyKey,
      amount: payAmount,
      currency: req.currency || 'EGP',
      paymentDate,
      paymentMethod,
      transactionReference: (transactionReference || '').trim(),
      chequeDetails: chequeDetails || req.chequeDetails || null,
      receiptUrl: receiptUrl || null,
      notes: (notes || '').trim(),
      isReversal: false,
      reversesPaymentId: null,
      disbursedBy: caller.uid,
      disbursedByName: caller.displayName,
      createdAt: now,
    };

    tx.set(paymentRef, paymentRecord);
    tx.update(reqRef, {
      totalPaidAmount: newTotalPaid,
      remainingAmount: newRemaining,
      status: nextStatus,
      chequeDetails: chequeDetails ? { ...(req.chequeDetails || {}), ...chequeDetails } : req.chequeDetails || null,
      updatedAt: now,
    });

    tx.set(
      db.collection('audit_logs').doc(),
      buildAuditEntry({
        actorId: caller.uid,
        actorName: caller.displayName,
        action: nextStatus === 'PAID' ? 'DISBURSEMENT_FULL_COMPLETED' : 'DISBURSEMENT_PARTIAL_RECORDED',
        entityType: 'DISBURSEMENT',
        entityId: paymentDocId,
        previousValues: {
          status: req.status,
          totalPaidAmount: currentPaid,
          remainingAmount: currentRemaining,
        },
        newValues: {
          status: nextStatus,
          paymentAmount: payAmount,
          totalPaidAmount: newTotalPaid,
          remainingAmount: newRemaining,
          paymentMethod,
          transactionReference: paymentRecord.transactionReference,
        },
      })
    );

    return {
      requestNumber: req.requestNumber,
      createdBy: req.createdBy as string,
      nextStatus,
      newRemaining,
    };
  });

  await enqueueNotifications([outcome.createdBy], {
    title: outcome.nextStatus === 'PAID' ? 'Request Fully Paid' : 'Partial Payment Executed',
    message: `Payment recorded for ${outcome.requestNumber}. Remaining balance: ${outcome.newRemaining}.`,
    entityType: 'REQUEST',
    entityId: requestId,
    link: '/requests',
  });

  return {
    success: true,
    paymentId: paymentDocId,
    status: outcome.nextStatus,
    remainingAmount: outcome.newRemaining,
  };
});

/**
 * 8. DISBURSEMENT OFFICER / ADMIN: Authorized Payment Reversal (Preserves Original Record)
 */
export const reverseDisbursement = onCall(async (request) => {
  const caller = await assertAuthorized(request.auth, ['DISBURSEMENT_OFFICER', 'ADMIN']);
  const { paymentId, reason } = request.data as { paymentId: string; reason: string };

  if (!paymentId || !reason || reason.trim().length < 5) {
    throw new HttpsError('invalid-argument', 'paymentId and a detailed reversal reason are required.');
  }

  const origRef = db.collection('disbursements').doc(paymentId);
  const reversalRef = db.collection('disbursements').doc(`REV_${paymentId}`);
  const now = new Date().toISOString();

  await db.runTransaction(async (tx) => {
    const [origSnap, revSnap] = await Promise.all([tx.get(origRef), tx.get(reversalRef)]);
    if (!origSnap.exists) {
      throw new HttpsError('not-found', 'Original payment record not found.');
    }
    if (revSnap.exists) {
      throw new HttpsError('already-exists', 'This payment has already been reversed.');
    }
    const orig = origSnap.data()!;
    if (orig.isReversal) {
      throw new HttpsError('invalid-argument', 'Cannot reverse a reversal entry.');
    }

    const reqRef = db.collection('requests').doc(orig.requestId);
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) {
      throw new HttpsError('not-found', 'Parent request not found.');
    }
    const req = reqSnap.data()!;

    const reversedAmount = Number(orig.amount);
    const newTotalPaid = Math.max(0, Number((Number(req.totalPaidAmount) - reversedAmount).toFixed(2)));
    const newRemaining = Number((Number(req.approvedAmount) - newTotalPaid).toFixed(2));
    const nextStatus = newTotalPaid === 0 ? 'READY_FOR_PAYMENT' : 'PARTIALLY_PAID';

    tx.set(reversalRef, {
      id: `REV_${paymentId}`,
      branchId: 'ABS',
      requestId: orig.requestId,
      requestNumber: orig.requestNumber,
      requestType: orig.requestType,
      customerId: orig.customerId,
      customerName: orig.customerName,
      amount: -reversedAmount,
      currency: orig.currency,
      paymentDate: now.slice(0, 10),
      paymentMethod: orig.paymentMethod,
      transactionReference: `REVERSAL OF ${orig.id}`,
      notes: reason.trim(),
      isReversal: true,
      reversesPaymentId: orig.id,
      disbursedBy: caller.uid,
      disbursedByName: caller.displayName,
      createdAt: now,
    });

    tx.update(reqRef, {
      totalPaidAmount: newTotalPaid,
      remainingAmount: newRemaining,
      status: nextStatus,
      updatedAt: now,
    });

    tx.set(
      db.collection('audit_logs').doc(),
      buildAuditEntry({
        actorId: caller.uid,
        actorName: caller.displayName,
        action: 'DISBURSEMENT_REVERSED',
        entityType: 'DISBURSEMENT',
        entityId: paymentId,
        previousValues: { totalPaidAmount: req.totalPaidAmount, status: req.status },
        newValues: { totalPaidAmount: newTotalPaid, remainingAmount: newRemaining, status: nextStatus },
        reason: reason.trim(),
      })
    );
  });

  return { success: true };
});
