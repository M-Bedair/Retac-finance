# RETAC – Petty Cash & Cheque Management System
**Branch:** Abu Simbel – Egypt (`ABS`) | **Version:** 1.0

Enterprise financial control system built with **React + TypeScript + Tailwind CSS** and **Firebase Spark-compatible services (Authentication, Cloud Firestore, and Hosting)**. Financial workflows run in client-side Firestore transactions; the app does not require Cloud Functions or Firebase Storage.

## Quick Start (Local Development & Emulators)

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   ```

3. **Start Firebase Emulators**
   ```bash
   firebase emulators:start
   ```

4. **Start Frontend**
   ```bash
   npm run dev
   ```

5. **Run Security Rules Tests**
   ```bash
   npm run test:security
   ```

## Documentation
- `docs/DATABASE_AND_ROLES.md` — Collections, indexes, and RBAC matrix.
- `docs/DEPLOYMENT_AND_BACKUP.md` — Production deployment and disaster recovery runbook.
