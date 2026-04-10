# Class One Savings Group - Render Deployment Guide

## Overview
This app consists of:
- **Backend**: FastAPI (Python) - handles API, auth, Google Sheets sync
- **Frontend**: React - user interface
- **Database**: MongoDB Atlas (you need to create a free cluster)

---

## Step 1: Set Up MongoDB Atlas (Free)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account and a free cluster
3. Click **"Connect"** on your cluster
4. Choose **"Connect your application"**
5. Copy the connection string (looks like: `mongodb+srv://username:password@cluster.xxxxx.mongodb.net/`)
6. **Important**: Replace `<password>` with your actual password
7. Save this - you'll need it for `MONGO_URL`

---

## Step 2: Deploy to Render

### Option A: Deploy from GitHub (Recommended)

1. Push this code to a GitHub repository
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **"New" → "Blueprint"**
4. Connect your GitHub repo
5. Render will detect the `render.yaml` and create both services

### Option B: Manual Deployment

#### Deploy Backend:
1. Go to Render Dashboard → **New** → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Name**: `class-one-api`
   - **Root Directory**: `backend`
   - **Runtime**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`

#### Deploy Frontend:
1. Go to Render Dashboard → **New** → **Static Site**
2. Connect your GitHub repo
3. Settings:
   - **Name**: `class-one-frontend`
   - **Root Directory**: `frontend`
   - **Build Command**: `yarn install && yarn build`
   - **Publish Directory**: `build`

---

## Step 3: Set Environment Variables

### Backend Environment Variables (Required):

| Variable | Value | Description |
|----------|-------|-------------|
| `MONGO_URL` | `mongodb+srv://Group_cash:Buttuura@cluster0.od3sa0a.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0` | Your MongoDB Atlas connection string |
| `DB_NAME` | `class_one_savings` | Database name |
| `JWT_SECRET` | (auto-generated) | Secret for JWT tokens |
| `ADMIN_EMAIL` | `superadmin@savingsgroup.com` | Super admin email |
| `ADMIN_PASSWORD` | Your choice | Super admin password |
| `CORS_ORIGINS` | `https://your-frontend-url.onrender.com` | Frontend URL |
| `GOOGLE_SPREADSHEET_ID` | `1gbSYI3EOP2L6ZqvL0lWbWKyyqpXK46Y_f9s3F5S34HI` | Your spreadsheet ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `class-one-savings-group@...` | Service account email |
| `GOOGLE_PROJECT_ID` | `awesome-habitat-374402` | Google Cloud project |
| `GOOGLE_PRIVATE_KEY_ID` | Your key ID | From service account JSON |
| `GOOGLE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----...` | Full private key (with newlines) |
| `GOOGLE_CLIENT_ID` | Your client ID | From service account JSON |

### Frontend Environment Variable:

| Variable | Value |
|----------|-------|
| `REACT_APP_BACKEND_URL` | `https://class-one-api.onrender.com` (your backend URL) |

---

## Step 4: Google Sheets Setup

1. Open your Google Spreadsheet
2. Click **Share** button
3. Add this email as **Editor**: `class-one-savings-group@awesome-habitat-374402.iam.gserviceaccount.com`
4. Click **Send**

---

## Step 5: Test Your Deployment

1. Visit your frontend URL: `https://class-one-frontend.onrender.com`
2. Login with your super admin credentials
3. Go to Admin Panel and click **"Sync to Google Sheets"**

---

## Troubleshooting

### Backend not starting?
- Check Render logs for errors
- Verify all environment variables are set correctly
- Make sure `GOOGLE_PRIVATE_KEY` has actual newlines (not `\n` strings)

### Database connection issues?
- Whitelist `0.0.0.0/0` in MongoDB Atlas Network Access
- Verify your connection string is correct

### Google Sheets not syncing?
- Make sure you shared the spreadsheet with the service account
- Check the service account email is correct

---

## Cost

- **Render Free Tier**: Backend sleeps after 15 mins of inactivity (wakes on request)
- **MongoDB Atlas Free Tier**: 512MB storage, sufficient for small groups
- **Google Sheets**: Free

For production use, consider Render's paid plan ($7/month) to keep the backend always running.
