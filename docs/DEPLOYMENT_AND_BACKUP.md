# Deployment & Disaster Recovery Guide

## 1. Initial Admin Bootstrap
1. Create the initial Admin user in Firebase Authentication.
2. Create the corresponding document in `users/{uid}` with:
   ```json
   {
     "uid": "<AUTH_UID>",
     "email": "admin@retac-abusimbel.com",
     "displayName": "System Administrator",
     "branchId": "ABS",
     "roles": ["ADMIN"],
     "isActive": true
   }
   ```
3. Log in to the web app, navigate to **System Settings**, provision branch staff, and configure the active **Approval Chain**.

## 2. Production Deployment
```bash
npm run build
firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting
```

## 3. Backup & Point-in-Time Recovery (PITR)
1. Enable **Firestore Point-in-Time Recovery (PITR)** in Google Cloud Console for 7-day granularity.
2. Schedule daily automated exports to a versioned GCS bucket:
   ```bash
   gcloud firestore export gs://<PROJECT_ID>-backups/daily-$(date +%F)
   ```
3. Never delete `audit_logs` or `disbursements` collections; all financial corrections must use `reverseDisbursement`.
