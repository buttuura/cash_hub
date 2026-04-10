# Group Cash Hub - Product Requirements Document

## Original Problem Statement
Create a web app for group managing cash with a super admin who can add other admin and he is the only one who can delete other users. Users save money every month, UGX 55,000 for premium and anyone below 55,000 is ordinary member and is not eligible to take loan. User can see a list of all members. Show total balance collected throughout the year. When user deposits money they are approved by the admin. The web app uses Google Sheets for storage and database. User can request withdrawal and can take loan of UGX 600,000 maximum if you're a premium member.

## User Personas

### Super Admin
- Can add/remove admins
- Can delete any user (except themselves)
- Can change user roles (member ↔ admin)
- Can change membership types (ordinary ↔ premium)
- Full access to all features

### Admin
- Can approve/reject deposits, loans, withdrawals
- Can change membership types
- Can view all members and transactions
- Cannot delete users or manage admin roles

### Premium Member
- Can request deposits
- Can request loans (up to UGX 600,000)
- Can request withdrawals
- Can view own transactions and member list

### Ordinary Member
- Can request deposits
- Can request withdrawals
- Cannot request loans
- Can view own transactions and member list

## Core Requirements

### Authentication
- [x] Email/password registration
- [x] JWT-based authentication
- [x] Role-based access control
- [x] Super Admin seeded on startup

### Financial Transactions
- [x] Deposit requests with admin approval
- [x] Loan requests (premium only, max 600,000 UGX)
- [x] Withdrawal requests with admin approval
- [x] Currency display with commas (UGX format)

### Member Management
- [x] View all members
- [x] Premium/Ordinary status badges
- [x] Super Admin: change roles
- [x] Super Admin: change membership types
- [x] Super Admin: delete members

### Dashboard
- [x] Total group balance
- [x] Personal savings
- [x] Active loans overview
- [x] Recent activity
- [x] Quick action buttons

### Data Storage
- [x] MongoDB for primary storage
- [x] Google Sheets sync for transparency

## What's Been Implemented (Jan 2026)

### Backend (FastAPI)
- User authentication with JWT tokens
- All CRUD endpoints for deposits, loans, withdrawals
- Admin approval workflows
- Google Sheets sync integration
- Role-based middleware

### Frontend (React)
- Login/Registration pages
- Dashboard with stats cards
- Transaction management (deposits, loans, withdrawals)
- Members list view
- Admin panel with approval queues
- Super Admin member management
- Responsive design with Tailwind CSS

## Technical Architecture

### Backend Stack
- FastAPI (Python)
- MongoDB (Motor async driver)
- JWT authentication (PyJWT)
- bcrypt password hashing
- gspread for Google Sheets

### Frontend Stack
- React 19
- Tailwind CSS
- Shadcn/UI components
- React Router
- Axios for API calls
- Sonner for toasts

## Prioritized Backlog

### P0 - Critical (Done)
- ✅ Authentication system
- ✅ Deposit/Loan/Withdrawal flows
- ✅ Admin approval system
- ✅ Member management

### P1 - Important (Future)
- Monthly contribution tracking
- Transaction history export
- Email notifications for approvals
- Dashboard analytics/charts

### P2 - Nice to Have (Future)
- Mobile app
- SMS notifications
- Interest calculation on loans
- Scheduled auto-deposits

## Test Credentials

- **Super Admin**: superadmin@savingsgroup.com / SuperAdmin@123

## API Endpoints

### Auth
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- POST /api/auth/logout

### Members
- GET /api/members
- GET /api/members/{id}
- DELETE /api/members/{id}

### Transactions
- POST /api/deposits/request
- GET /api/deposits
- POST /api/deposits/approve
- POST /api/loans/request
- GET /api/loans
- POST /api/loans/approve
- POST /api/loans/{id}/repay
- POST /api/withdrawals/request
- GET /api/withdrawals
- POST /api/withdrawals/approve

### Admin
- POST /api/admin/set-role
- POST /api/admin/set-membership

### Stats
- GET /api/stats/group

## Next Steps
1. Add monthly contribution tracking
2. Implement email notifications
3. Add transaction export to CSV
