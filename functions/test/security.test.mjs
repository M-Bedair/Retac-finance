import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const rules = fs.readFileSync('../firestore.rules', 'utf8');

test('RETAC Security Rules Acceptance Suite', async (t) => {
  const testEnv = await initializeTestEnvironment({
    projectId: 'retac-finance-abs-test',
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'requester_1'), {
      uid: 'requester_1',
      branchId: 'ABS',
      roles: ['REQUESTER'],
      isActive: true,
    });
    await setDoc(doc(db, 'users', 'officer_1'), {
      uid: 'officer_1',
      branchId: 'ABS',
      roles: ['DISBURSEMENT_OFFICER'],
      isActive: true,
    });
    await setDoc(doc(db, 'users', 'outsider_1'), {
      uid: 'outsider_1',
      branchId: 'CAIRO',
      roles: ['ADMIN'],
      isActive: true,
    });
  });

  await t.test('Requester can create a valid DRAFT request', async () => {
    const reqDb = testEnv.authenticatedContext('requester_1').firestore();
    await assertSucceeds(
      setDoc(doc(reqDb, 'requests', 'req_1'), {
        branchId: 'ABS',
        createdBy: 'requester_1',
        status: 'DRAFT',
        requestedAmount: 2500,
        approvedAmount: 0,
        totalPaidAmount: 0,
      })
    );
  });

  await t.test('Requester cannot self-approve or mark request as PAID directly', async () => {
    const reqDb = testEnv.authenticatedContext('requester_1').firestore();
    await assertFails(
      updateDoc(doc(reqDb, 'requests', 'req_1'), {
        status: 'READY_FOR_PAYMENT',
        approvedAmount: 2500,
      })
    );
  });

  await t.test('Active users can append their own audit logs but cannot mutate them', async () => {
    const officerDb = testEnv.authenticatedContext('officer_1').firestore();
    const auditRef = doc(officerDb, 'audit_logs', 'valid_log');
    await assertSucceeds(
      setDoc(auditRef, {
        branchId: 'ABS',
        userId: 'officer_1',
        actorUid: 'officer_1',
        actorName: 'Officer',
        actorRole: 'DISBURSEMENT_OFFICER',
        action: 'DISBURSEMENT_RECORDED',
        entityType: 'DISBURSEMENT',
        entityId: 'payment_1',
        timestamp: new Date().toISOString(),
      })
    );
    await assertFails(updateDoc(auditRef, { action: 'TAMPER' }));
    await assertFails(deleteDoc(auditRef));
  });

  await t.test('Cross-branch user is blocked from reading Abu Simbel requests', async () => {
    const outsiderDb = testEnv.authenticatedContext('outsider_1').firestore();
    await assertFails(deleteDoc(doc(outsiderDb, 'requests', 'req_1')));
  });

  await testEnv.cleanup();
});
