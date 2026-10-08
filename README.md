# Cash Hub

This repository already includes Cloudinary file storage support in `backend/server.py`.

## Cloudinary setup

1. Create a Cloudinary account.
2. Add a Cloudinary API key and secret.
3. Set `CLOUDINARY_URL` in your backend environment.

Example:

```env
CLOUDINARY_URL=cloudinary://<API_KEY>:<API_SECRET>@<CLOUD_NAME>
```

## Available upload routes

- `POST /api/uploads` - upload a file and store metadata in MongoDB.
- `POST /api/products` - create a product and optionally upload an image to Cloudinary.

## Marketplace orders

At checkout, buyers can continue as a guest or sign in/create an account. Guest orders need contact details; orders placed with an account are linked to that buyer for tracking. Signed-in buyers can track orders from **Dashboard → Orders**, download PDF receipts, and remind sellers. Seller accounts see incoming orders on the dashboard **Overview** and can manage them under **Orders**; sellers can update accepted orders as they are prepared, shipped, and delivered. Status changes and buyer reminders are sent to the other account as notifications.

## Local configuration

Copy `backend/.env.example` to `backend/.env` and fill in your values.

## Push notifications

### Android app (Firebase Cloud Messaging)

1. In Firebase Console, register an Android app with package ID `com.classone.cashhub` and download its `google-services.json` into `frontend/android/app/`.
2. Add Firebase Admin credentials for that same Firebase project to the backend environment. Prefer setting `FIREBASE_SERVICE_ACCOUNT` to the service-account JSON as a deployment secret. For local development, you can instead set `FIREBASE_SERVICE_ACCOUNT_FILE` to a credential file path relative to `backend/` (or place it at `backend/serviceAccountKey.json`). Never commit service-account credentials.
3. Install backend requirements and deploy/restart the backend so it can initialize Firebase Admin. Without the server credentials, devices can register tokens but FCM delivery remains disabled.
4. Build and install the Android app with `cd frontend; npm run android:build`. Sign in on a device with Google Play services and allow notification permission when prompted. The app registers its FCM token with the authenticated backend; existing notification events are then delivered to registered Android devices and browser subscribers.

The project includes the Google Services Gradle plugin and Capacitor Push Notifications. Android's Firebase client config (`google-services.json`) is public client configuration, not a service-account credential.

### Browser notifications

The web app uses Web Push for background notifications and authenticated database polling while signed in, so an open web app can receive events across backend instances even when its WebSocket is connected to a different instance. Generate a VAPID key pair with `vapid --gen`, then configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_CLAIMS_EMAIL` in the backend environment for notifications when the browser is closed or in the background. Each browser/device must sign in and allow notifications over HTTPS; `localhost` is also valid for local testing.

Notification preferences are available at `/settings`. Order sound is off by default; users can enable repeating Android order alerts (every minute until opened) and looping in-app/web sound. Other notification types remain silent. New product orders notify the seller. Deposit requests notify treasurers/admins, but not the member who submitted them; deposit approval/rejection updates notify that member. Loan and withdrawal requests notify treasurers/admins and the member involved. Push delivery requires each recipient to sign in on that device and allow notifications. Browser sound while the app is open also requires the user to interact with the page first, as required by browser audio policies.
