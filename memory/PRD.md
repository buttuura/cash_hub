# Class One Savings - Group Cash Hub PRD

## Original Problem Statement
Web app for managing group cash with a Super Admin who can add other admins and delete users. Members save UGX 52,000/month (ordinary) and become eligible for loans up to UGX 600,000 (premium). System tracks total group balance, deposits, loans, withdrawals. Deployed as single service on Render with MongoDB Atlas.

## User Personas

### Super Admin
- Add/remove admins, delete any user (except self)
- Change user roles (member ↔ admin) and memberships (ordinary ↔ premium)
- Edit total group balance (year-end reset)
- Delete petty cash entries

### Admin
- Approve/reject deposits, loans, withdrawals
- Add petty cash expenses
- View all members and transactions

### Premium Member (savings ≥ UGX 52,000)
- Request deposits, loans (max UGX 600,000), withdrawals
- Serve as guarantor (max 2 active guarantees)

### Ordinary Member (savings < UGX 52,000)
- Request deposits and withdrawals (no loans)

## Business Rules (Implemented Feb 2026)

1. **Monthly Savings**: UGX 52,000 due 1st–10th of month
2. **Late Fee**: UGX 3,000 × position after 10th (stops applying at 20th)
3. **Development Fee**: UGX 3,000/month (non-withdrawable unless leaving group)
4. **Loan Interest**:
   - 3% per month for first 4 months
   - 5% per month beyond 4 months
5. **Loan Guarantors**: Each loan needs 1 guarantor; each member can guarantee max 2 active loans
6. **Max Loan**: UGX 600,000 (premium members only)
7. **Withdrawal to Leave Group**: Requires 2-month notice, no active loans, not guaranteeing any loan
8. **Regular Withdrawal**: Only from savings; development fund cannot be withdrawn unless leaving
9. **Committee Appreciation**: UGX 2,000/member (constant tracked)
10. **Year-End Sharing**: 2026-12-20

## Implemented Features

### Backend (FastAPI + MongoDB)
- JWT auth with role-based access (super_admin / admin / member)
- Super Admin seeded on startup from ADMIN_EMAIL/ADMIN_PASSWORD env
- Endpoints: deposits, loans (with interest calculation), withdrawals, leaving requests, petty cash CRUD
- Auto-calculated group balance: savings + dev fund + interest + late fees − petty cash
- Auto-promotion to premium when savings ≥ UGX 52,000

### Frontend (React + Tailwind + Shadcn)
- Login / Register pages
- Dashboard tabs: Overview, Financials, Deposits, Loans, Withdrawals, Members, Rules, Admin
- Financials tab: total balance card + breakdown (savings, dev fund, interest, late fees, petty cash) + active/repaid loans + petty cash history with delete
- Admin badges hidden from non-super-admin users in member list
- Custom dialog/select popup styling for visibility

### Deployment
- Single-service Render deployment (FastAPI serves built React static files)
- `render.yaml`, `build.sh`, `RENDER_DEPLOYMENT.md`
- MongoDB Atlas for production (local MongoDB for preview — port 27017 blocked outbound)

## API Endpoints

### Auth
- POST /api/auth/register, /api/auth/login, /api/auth/logout
- GET /api/auth/me

### Members
- GET /api/members, /api/members/{id}
- DELETE /api/members/{id} (super_admin)

### Admin Management
- POST /api/admin/set-role (super_admin)
- POST /api/admin/set-membership (admin)
- POST /api/admin/update-group-balance (super_admin)

### Transactions
- POST /api/deposits/request, GET /api/deposits, POST /api/deposits/approve
- POST /api/loans/request, GET /api/loans, POST /api/loans/approve, POST /api/loans/{id}/repay
- POST /api/withdrawals/request, GET /api/withdrawals, POST /api/withdrawals/approve

### Leaving Group
- POST /api/leaving/request, GET /api/leaving/status

### Financials / Petty Cash
- GET /api/stats/group, /api/stats/financial, /api/stats/rules
- POST /api/petty-cash/add (admin), GET /api/petty-cash, DELETE /api/petty-cash/{id} (super_admin)

## DB Schema (MongoDB)
- users: email, password_hash, name, phone, role, membership_type, total_savings, development_fund, total_late_fees, guarantees_given, leaving_requested
- deposits: user_id, amount, deposit_type (savings/development_fee), late_fee, status, month
- loans: user_id, amount, interest_rate, guarantor_id, status, repaid, amount_repaid, due_date
- withdrawals: user_id, amount, withdrawal_type (savings/leaving_group), status
- leaving_requests: user_id, can_leave_after, status
- petty_cash: amount, description, category, added_by
- settings: key='group_balance', value

## Test Credentials
- Super Admin: superadmin@savingsgroup.com  **or phone** `0700000000` / SuperAdmin@123

## Tech Stack
- Backend: FastAPI, Motor (MongoDB async), PyJWT, bcrypt
- Frontend: React 19, Tailwind, Shadcn/UI, React Router, Axios, Sonner
- Deployment: Render single-service, MongoDB Atlas

## Changelog
- **Feb 2026**: Smoke-test verified Financials tab, petty cash flow, login, and stats endpoints (PRD synced; no bugs found).
- **Feb 2026**: Added Financials tab + petty cash CRUD; full business rules overhaul (late fees, 3%/5% interest, guarantor limits, dev fee, 2-month leaving notice).
- **Jan 2026**: Removed Google Sheets sync; migrated to single-service Render deployment.
- **Jan 2026**: Initial MVP — auth, deposits, loans, withdrawals, member management.

## Backlog

### P1
- Monthly contribution tracking UI (which members have paid this month)
- CSV export of transactions
- Email notifications for approval events (Resend/SendGrid)
- Year-end auto share-out calculation

### P2
- SMS notifications (Twilio)
- Dashboard analytics charts (trends over months)
- Scheduled auto-deposits
- Refactor Dashboard.js (1610 lines) into per-tab components
