# Database Architecture & RBAC Matrix

## Firestore Collections
- `users`: `{ uid, email, displayName, employeeCode, department, branchId: 'ABS', roles[], isActive, createdAt, updatedAt }`
- `settings/approval_chain`: `{ branchId: 'ABS', enabled, managerUserIds[], financeManagerUserIds[], version, updatedBy, updatedAt }`
- `counters/ABS_{PC|CH}_{YEAR}`: `{ seq, year, branchId: 'ABS', updatedAt }`
- `customers`: `{ name, taxRegistrationNumber, address, phone, contactPerson, email, status, branchId: 'ABS' }`
- `requests`: Financial request header, frozen `customerSnapshot`, frozen `approvalSnapshot`, amounts (`requestedAmount`, `approvedAmount`, `totalPaidAmount`, `remainingAmount`), and `approvalHistory[]`.
- `approvals`: Immutable stage decision documents (`MANAGER` / `FINANCE_MANAGER`).
- `disbursements`: Immutable payment ledger supporting partial payments, idempotency keys, and audited reversals (`REV_<paymentId>`).
- `audit_logs`: Server-only append-only event stream.
- `notifications`: User-targeted notifications with unread badge support.

## Role Permissions
| Role | Capabilities |
| :--- | :--- |
| `ADMIN` | User provisioning, dynamic approval chain configuration, request reassignment, full visibility |
| `REQUESTER` | Create/save drafts, submit requests, resubmit rejected requests |
| `MANAGER` | First-level approval or rejection with mandatory reason |
| `FINANCE_MANAGER` | Second-level financial approval (cannot be same person as Manager or Requester) |
| `DISBURSEMENT_OFFICER` | Record full/partial disbursements against `READY_FOR_PAYMENT` requests and execute audited reversals |
| `AUDITOR` | Read-only access to financial records, reports, and immutable audit trails |
