"""Shared backend configuration, models, database, and helpers."""

from dotenv import load_dotenv
from pathlib import Path
import asyncio
from io import BytesIO
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Form, File, UploadFile, Body, WebSocket, WebSocketDisconnect, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pymongo import ReturnDocument
import os
import re
import math
import logging
import shutil
import secrets
import string
import json
from urllib.parse import quote
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import bcrypt
import jwt
from uuid import uuid4
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import anyio
import cloudinary
import cloudinary.uploader
from PIL import Image, ImageOps, ImageSequence, UnidentifiedImageError
from pywebpush import webpush, WebPushException
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import firebase_admin
from firebase_admin import credentials, messaging
from email_validator import EmailNotValidError, validate_email
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
firebase_app = None
firebase_key_json = os.getenv('FIREBASE_SERVICE_ACCOUNT')
firebase_key_file = os.getenv('FIREBASE_SERVICE_ACCOUNT_FILE')
if firebase_key_json:
    firebase_credential = credentials.Certificate(json.loads(firebase_key_json))
else:
    key_path = Path(firebase_key_file) if firebase_key_file else ROOT_DIR / 'serviceAccountKey.json'
    if not key_path.is_absolute():
        key_path = ROOT_DIR / key_path
    if not key_path.is_file() and (not firebase_key_file):
        legacy_key_path = ROOT_DIR / 'serviceAccounttKey.json'
        if legacy_key_path.is_file():
            key_path = legacy_key_path
    firebase_credential = credentials.Certificate(str(key_path)) if key_path.is_file() else None
if firebase_credential:
    try:
        firebase_app = firebase_admin.initialize_app(firebase_credential)
    except ValueError:
        firebase_app = firebase_admin.get_app()
    logger.info('Firebase Admin initialized')
else:
    logger.warning('Firebase Admin credentials are not configured; Android FCM delivery is disabled.')
mongo_url = os.environ['MONGO_URL']
if not mongo_url:
    raise ValueError('MONGO_URL not found in .env file')
logger.info(f'Connecting to MongoDB: {mongo_url[:25]}...')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
scheduler = None
ORDER_NOTIFICATION_REPEAT_INTERVAL = timedelta(minutes=1)
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_IMAGE_UPLOAD_BYTES = 300 * 1024
JWT_SECRET = os.environ.get('JWT_SECRET', 'default-secret-change-in-production')
JWT_ALGORITHM = 'HS256'
CLOUDINARY_URL = os.environ.get('CLOUDINARY_URL')
if CLOUDINARY_URL:
    cloudinary.config(cloudinary_url=CLOUDINARY_URL)
else:
    logger.warning('CLOUDINARY_URL not set, uploads to Cloudinary are disabled.')
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY')
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY')
VAPID_CLAIMS_EMAIL = os.environ.get('VAPID_CLAIMS_EMAIL', 'mailto:admin@c1group.site')
if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
    logger.warning('VAPID keys are not configured; background Web Push notifications are disabled.')
MONTHLY_SAVINGS = 52000
DEVELOPMENT_FEE = 3000
LATE_FEE_PER_POSITION = 3000
MAX_LOAN_AMOUNT = 600000
LOAN_INTEREST_NORMAL = 0.03
LOAN_INTEREST_EXTENDED = 0.05
LOAN_NORMAL_PERIOD_MONTHS = 4
QUICK_LOAN_INTEREST = 0.1
MAX_GUARANTEES_PER_MEMBER = 2
COMMITTEE_APPRECIATION = 2000
YEAR_END_DATE = '2026-12-20'
OFFICERS: list[dict] = [{'name': 'Ahimbisibwe Alexandar', 'code': 'AA001', 'signature': '/signatures/ahimbisibwe.png'}, {'name': 'Nuabiine Nicholous', 'code': 'NN002', 'signature': '/signatures/nuabiine.png'}, {'name': 'Owayesu Ronald', 'code': 'OR003', 'signature': '/signatures/owayesu.png'}, {'name': 'Buttuura Isaiah', 'code': 'BI004', 'signature': '/signatures/buttuura.png'}]
app = FastAPI(title='Class One Savings API')
CORS_ALLOWED_ORIGINS = ['*']
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_credentials=False, allow_methods=['*'], allow_headers=['*'])
api_router = APIRouter(prefix='/api')

class ConnectionManager:

    def __init__(self):
        self.active_connections = {}

    async def connect(self, websocket: WebSocket, seller_id: str):
        await websocket.accept()
        if seller_id not in self.active_connections:
            self.active_connections[seller_id] = []
        self.active_connections[seller_id].append(websocket)

    def disconnect(self, websocket: WebSocket, seller_id: str):
        if seller_id in self.active_connections:
            self.active_connections[seller_id].remove(websocket)
            if not self.active_connections[seller_id]:
                del self.active_connections[seller_id]

    async def broadcast_to_seller(self, seller_id: str, message: dict):
        import json
        if seller_id in self.active_connections:
            dead = []
            for ws in self.active_connections[seller_id]:
                try:
                    await ws.send_text(json.dumps(message))
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.disconnect(ws, seller_id)
manager = ConnectionManager()
UGANDA_TIMEZONE = timezone(timedelta(hours=3))

class UserCreate(BaseModel):
    phone: str
    password: str
    name: str
    email: Optional[str] = None
    next_of_kin_name: Optional[str] = None
    next_of_kin_phone: Optional[str] = None
    national_id: Optional[str] = None
    membership_type: str = 'seller'

    @field_validator('email')
    @classmethod
    def validate_email_without_changing_case(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        try:
            validate_email(value, check_deliverability=False)
        except EmailNotValidError as error:
            raise ValueError(str(error)) from error
        return value

class UserLogin(BaseModel):
    identifier: str
    password: str

class AnnouncementMessage(BaseModel):
    message: str

class HeroPosterUpdate(BaseModel):
    image_url: str = Field(..., min_length=1, max_length=2048)

class DepositRequest(BaseModel):
    amount: float
    deposit_type: str = 'savings'
    description: Optional[str] = None
    target_user_id: Optional[str] = None
    deduct_late_fee: bool = False

class LoanRequest(BaseModel):
    amount: float
    guarantor_id: str
    reason: Optional[str] = None

class AdminLoanCreate(BaseModel):
    member_id: str
    amount: float
    reason: Optional[str] = None
    guarantor_id: Optional[str] = None

class GuarantorApproval(BaseModel):
    loan_id: str
    approved: bool
    notes: Optional[str] = None

class QuickLoanRequest(BaseModel):
    loan_name: str
    loan_email: Optional[EmailStr] = None
    loan_phone: Optional[str] = None
    amount: float
    purpose: Optional[str] = None
    collateral: Optional[str] = None
    is_guaranteed: bool = True
    officer_code: Optional[str] = None
    officer_name: Optional[str] = None
    collateral_image: Optional[str] = None
    member_code: Optional[str] = None

class WithdrawalRequest(BaseModel):
    amount: float
    withdrawal_type: str = 'savings'
    reason: Optional[str] = None

class RoleUpdate(BaseModel):
    user_id: str
    new_role: str

class MembershipUpdate(BaseModel):
    user_id: str
    membership_type: str

class MaxGuaranteesUpdate(BaseModel):
    user_id: str
    max_guarantees: int

class TransactionApproval(BaseModel):
    transaction_id: str
    approved: bool
    deduct_late_fee: Optional[bool] = None
    notes: Optional[str] = None

class GroupBalanceUpdate(BaseModel):
    new_balance: float
    reason: str

class LeavingRequest(BaseModel):
    reason: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    phone: str

class ResetPasswordRequest(BaseModel):
    phone: str
    temp_password: str
    new_password: str

class PushSubscription(BaseModel):
    endpoint: str
    keys: dict

class FCMTokenRegistration(BaseModel):
    token: str = Field(..., min_length=1, max_length=4096)

class NotificationSettingsUpdate(BaseModel):
    order_sound_enabled: bool = True

class ProductCreate(BaseModel):
    title: str
    description: Optional[str] = None
    price: Optional[float] = None
    category: str
    contact_phone: Optional[str] = None
    image_url: Optional[str] = None

class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = None

class ProjectCommentCreate(BaseModel):
    comment: Optional[str] = None

class ProjectRatingCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)

class OrderCreate(BaseModel):
    products: Optional[List[dict]] = None
    productId: Optional[str] = None
    productTitle: Optional[str] = None
    productPrice: Optional[float] = None
    sellerName: Optional[str] = None
    buyerId: Optional[str] = None
    buyerName: Optional[str] = None
    buyerEmail: Optional[str] = None
    buyerPhone: Optional[str] = None
    note: Optional[str] = None
    total: Optional[float] = None
    status: str = 'pending'

class OrderStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None

class BatchOrderDelete(BaseModel):
    order_ids: List[str]

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(user_id: str, email: str) -> str:
    payload = {'sub': user_id, 'email': email, 'exp': datetime.now(timezone.utc) + timedelta(hours=24), 'type': 'access'}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {'sub': user_id, 'exp': datetime.now(timezone.utc) + timedelta(days=7), 'type': 'refresh'}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get('access_token')
    if not token:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail='Not authenticated')
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get('type') != 'access':
            raise HTTPException(status_code=401, detail='Invalid token type')
        user = await db.users.find_one({'_id': ObjectId(payload['sub'])})
        if not user:
            raise HTTPException(status_code=401, detail='User not found')
        user['id'] = str(user['_id'])
        user.pop('_id', None)
        user.pop('password_hash', None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

async def get_current_user_optional(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException as exc:
        if exc.status_code == 401:
            return None
        raise

async def send_push_to_users(user_ids: list[str], payload: dict):
    normalized_user_ids = list(dict.fromkeys((user_id for user_id in user_ids if user_id)))
    if not normalized_user_ids:
        return
    notification_id = str(payload.get('id') or uuid4().hex)
    notification_type = str(payload.get('type') or 'notification')
    now = datetime.now(timezone.utc)
    order_sound_by_user = {}
    if notification_type == 'new_order':
        object_ids = [ObjectId(user_id) for user_id in normalized_user_ids if is_valid_object_id(user_id)]
        recipients = await db.users.find({'_id': {'$in': object_ids}}, {'notification_settings.order_sound_enabled': 1}).to_list(1000)
        order_sound_by_user = {str(recipient['_id']): bool(recipient.get('notification_settings', {}).get('order_sound_enabled', True)) for recipient in recipients}
    notification = {'event_id': notification_id, 'type': notification_type, 'title': str(payload.get('title') or 'Cash Hub'), 'body': str(payload.get('body') or 'You have a new notification'), 'url': str(payload.get('url') or '/'), 'created_at': now, 'read_at': None}
    notification_documents = []
    for user_id in normalized_user_ids:
        user_notification = {'user_id': user_id, **notification}
        if notification_type == 'new_order':
            sound_enabled = order_sound_by_user.get(user_id, False)
            user_notification['sound_enabled'] = sound_enabled
            if sound_enabled:
                user_notification['next_repeat_at'] = now + ORDER_NOTIFICATION_REPEAT_INTERVAL
        elif notification_type == 'new_deposit' and payload.get('deposit_id'):
            user_notification['deposit_id'] = str(payload['deposit_id'])
            user_notification['sound_enabled'] = True
            user_notification['next_repeat_at'] = now + ORDER_NOTIFICATION_REPEAT_INTERVAL
        elif notification_type in ('new_loan', 'new_withdrawal') and payload.get('pending_transaction_id'):
            user_notification['pending_transaction_id'] = str(payload['pending_transaction_id'])
            user_notification['pending_transaction_collection'] = str(payload['pending_transaction_collection'])
            user_notification['pending_statuses'] = list(payload.get('pending_statuses') or ['pending'])
            user_notification['sound_enabled'] = True
            user_notification['next_repeat_at'] = now + ORDER_NOTIFICATION_REPEAT_INTERVAL
        notification_documents.append(user_notification)
    await db.notifications.insert_many(notification_documents)
    if VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY:
        subscriptions = await db.push_subscriptions.find({'user_id': {'$in': normalized_user_ids}}).to_list(1000)
        for subscription in subscriptions:
            try:
                should_sound = (
                    order_sound_by_user.get(subscription['user_id'], False)
                    if notification_type == 'new_order'
                    else notification_type in ('new_deposit', 'new_loan', 'new_withdrawal')
                )
                await anyio.to_thread.run_sync(lambda: webpush(subscription_info=subscription['subscription'], data=json.dumps({**payload, 'id': notification_id, 'sound_enabled': should_sound}), vapid_private_key=VAPID_PRIVATE_KEY, vapid_claims={'sub': VAPID_CLAIMS_EMAIL}))
            except WebPushException as exc:
                status_code = getattr(exc.response, 'status_code', None)
                if status_code in (404, 410):
                    await db.push_subscriptions.delete_one({'_id': subscription['_id']})
                else:
                    logger.warning('Web Push delivery failed: %s', exc)
            except Exception as exc:
                logger.warning('Web Push delivery failed: %s', exc)
    if firebase_app:
        registrations = await db.fcm_tokens.find({'user_id': {'$in': normalized_user_ids}}).to_list(1000)
        notification = messaging.Notification(title=str(payload.get('title') or 'Cash Hub'), body=str(payload.get('body') or 'You have a new notification'))
        data = {str(key): value if isinstance(value, str) else json.dumps(value) for key, value in payload.items() if value is not None}
        is_order = notification_type == 'new_order'
        is_deposit = notification_type == 'new_deposit'
        is_attention_transaction = notification_type in ('new_loan', 'new_withdrawal')
        for registration in registrations:
            try:
                sound_enabled = (
                    order_sound_by_user.get(registration['user_id'], False)
                    if is_order
                    else is_deposit or is_attention_transaction
                )
                message_data = dict(data)
                if is_order or is_deposit or is_attention_transaction:
                    message_data['sound_enabled'] = str(sound_enabled).lower()
                message = messaging.Message(notification=notification, data=message_data, token=registration['token'], android=messaging.AndroidConfig(priority='high', notification=messaging.AndroidNotification(channel_id='cashhub-orders-v2' if (is_order or is_deposit or is_attention_transaction) and sound_enabled else 'cashhub-silent-v2', icon='ic_stat_notification', tag=notification_id if (is_order or is_deposit or is_attention_transaction) else None, sound='order_ring_tone' if (is_order or is_deposit or is_attention_transaction) and sound_enabled else None)))
                await anyio.to_thread.run_sync(lambda: messaging.send(message, app=firebase_app))
            except messaging.UnregisteredError:
                await db.fcm_tokens.delete_one({'_id': registration['_id']})
            except Exception as exc:
                logger.warning('Firebase push delivery failed: %s', exc)

async def resend_unread_order_notifications():
    if not firebase_app:
        return
    now = datetime.now(timezone.utc)
    due_notifications = await db.notifications.find({'type': 'new_order', 'sound_enabled': True, 'read_at': None, 'next_repeat_at': {'$lte': now}}).to_list(1000)
    for notification in due_notifications:
        claimed = await db.notifications.update_one({'_id': notification['_id'], 'type': 'new_order', 'sound_enabled': True, 'read_at': None, 'next_repeat_at': {'$lte': now}}, {'$set': {'next_repeat_at': now + ORDER_NOTIFICATION_REPEAT_INTERVAL}, '$inc': {'repeat_count': 1}})
        if not claimed.modified_count:
            continue
        registrations = await db.fcm_tokens.find({'user_id': notification['user_id']}).to_list(1000)
        data = {'id': notification['event_id'], 'type': 'new_order', 'title': notification['title'], 'body': notification['body'], 'url': notification.get('url') or '/dashboard', 'sound_enabled': 'true'}
        for registration in registrations:
            try:
                message = messaging.Message(notification=messaging.Notification(title=notification['title'], body=notification['body']), data=data, token=registration['token'], android=messaging.AndroidConfig(priority='high', notification=messaging.AndroidNotification(channel_id='cashhub-orders-v2', tag=notification['event_id'], sound='order_ring_tone')))
                await anyio.to_thread.run_sync(lambda: messaging.send(message, app=firebase_app))
            except messaging.UnregisteredError:
                await db.fcm_tokens.delete_one({'_id': registration['_id']})
            except Exception as exc:
                logger.warning('Repeated order notification delivery failed: %s', exc)

async def stop_deposit_notification_repeats(deposit_id: str):
    result = db.notifications.update_many(
        {'type': 'new_deposit', 'deposit_id': str(deposit_id)},
        {'$set': {'next_repeat_at': None, 'resolved_at': datetime.now(timezone.utc)}},
    )
    if hasattr(result, '__await__'):
        await result

async def resend_pending_deposit_notifications():
    if not firebase_app and (not (VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)):
        return
    now = datetime.now(timezone.utc)
    pending_deposit_notifications = await db.notifications.find({'type': 'new_deposit', 'deposit_id': {'$exists': True}, 'next_repeat_at': {'$lte': now}}).to_list(1000)
    for notification in pending_deposit_notifications:
        deposit_id = str(notification.get('deposit_id') or '')
        if not is_valid_object_id(deposit_id):
            logger.error('Cannot repeat deposit notification with invalid deposit id: %s', deposit_id)
            await db.notifications.update_one({'_id': notification['_id'], 'type': 'new_deposit'}, {'$set': {'next_repeat_at': None}})
            continue
        deposit_query = {'_id': ObjectId(deposit_id)}
        deposit = await db.deposits.find_one(deposit_query)
        if not deposit or deposit.get('status') != 'pending':
            await stop_deposit_notification_repeats(deposit_id)
            continue
        claimed = await db.notifications.update_one({'_id': notification['_id'], 'type': 'new_deposit', 'deposit_id': deposit_id, 'next_repeat_at': {'$lte': now}}, {'$set': {'next_repeat_at': now + ORDER_NOTIFICATION_REPEAT_INTERVAL}, '$inc': {'repeat_count': 1}})
        if not claimed.modified_count:
            continue
        deposit = await db.deposits.find_one(deposit_query)
        if not deposit or deposit.get('status') != 'pending':
            await stop_deposit_notification_repeats(deposit_id)
            continue
        data = {'id': notification['event_id'], 'type': 'new_deposit', 'deposit_id': deposit_id, 'title': notification['title'], 'body': notification['body'], 'url': notification.get('url') or '/dashboard', 'sound_enabled': 'true'}
        if firebase_app:
            registrations = await db.fcm_tokens.find({'user_id': notification['user_id']}).to_list(1000)
            for registration in registrations:
                try:
                    message = messaging.Message(notification=messaging.Notification(title=notification['title'], body=notification['body']), data=data, token=registration['token'], android=messaging.AndroidConfig(priority='high', notification=messaging.AndroidNotification(channel_id='cashhub-orders-v2', tag=notification['event_id'], sound='order_ring_tone')))
                    await anyio.to_thread.run_sync(lambda: messaging.send(message, app=firebase_app))
                except messaging.UnregisteredError:
                    await db.fcm_tokens.delete_one({'_id': registration['_id']})
                except Exception as exc:
                    logger.warning('Repeated deposit notification delivery failed: %s', exc)
        if VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY:
            subscriptions = await db.push_subscriptions.find({'user_id': notification['user_id']}).to_list(1000)
            for subscription in subscriptions:
                try:
                    await anyio.to_thread.run_sync(lambda: webpush(subscription_info=subscription['subscription'], data=json.dumps({**data, 'sound_enabled': True}), vapid_private_key=VAPID_PRIVATE_KEY, vapid_claims={'sub': VAPID_CLAIMS_EMAIL}))
                except WebPushException as exc:
                    status_code = getattr(exc.response, 'status_code', None)
                    if status_code in (404, 410):
                        await db.push_subscriptions.delete_one({'_id': subscription['_id']})
                    else:
                        logger.warning('Repeated deposit Web Push delivery failed: %s', exc)
                except Exception as exc:
                    logger.warning('Repeated deposit Web Push delivery failed: %s', exc)

async def stop_pending_transaction_notification_repeats(transaction_id: str):
    result = db.notifications.update_many(
        {'pending_transaction_id': str(transaction_id)},
        {'$set': {'next_repeat_at': None, 'resolved_at': datetime.now(timezone.utc)}},
    )
    if hasattr(result, '__await__'):
        await result

async def resend_pending_transaction_notifications():
    if not firebase_app and not (VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY):
        return
    now = datetime.now(timezone.utc)
    notifications = await db.notifications.find({
        'pending_transaction_id': {'$exists': True},
        'pending_transaction_collection': {'$exists': True},
        'next_repeat_at': {'$lte': now},
        'read_at': None,
    }).to_list(1000)
    for notification in notifications:
        transaction_id = str(notification.get('pending_transaction_id') or '')
        collection_name = str(notification.get('pending_transaction_collection') or '')
        pending_statuses = list(notification.get('pending_statuses') or ['pending'])
        if not is_valid_object_id(transaction_id) or not hasattr(db, collection_name):
            await db.notifications.update_one(
                {'_id': notification['_id']},
                {'$set': {'next_repeat_at': None}},
            )
            continue
        collection = getattr(db, collection_name)
        transaction = await collection.find_one({'_id': ObjectId(transaction_id)})
        if not transaction or transaction.get('status') not in pending_statuses:
            await stop_pending_transaction_notification_repeats(transaction_id)
            continue
        claimed = await db.notifications.update_one(
            {
                '_id': notification['_id'],
                'pending_transaction_id': transaction_id,
                'read_at': None,
                'next_repeat_at': {'$lte': now},
            },
            {'$set': {'next_repeat_at': now + ORDER_NOTIFICATION_REPEAT_INTERVAL}, '$inc': {'repeat_count': 1}},
        )
        if not claimed.modified_count:
            continue
        data = {
            'id': notification['event_id'],
            'type': notification['type'],
            'pending_transaction_id': transaction_id,
            'title': notification['title'],
            'body': notification['body'],
            'url': notification.get('url') or '/dashboard',
            'sound_enabled': 'true',
        }
        if firebase_app:
            registrations = await db.fcm_tokens.find({'user_id': notification['user_id']}).to_list(1000)
            for registration in registrations:
                try:
                    message = messaging.Message(
                        notification=messaging.Notification(title=notification['title'], body=notification['body']),
                        data=data,
                        token=registration['token'],
                        android=messaging.AndroidConfig(
                            priority='high',
                            notification=messaging.AndroidNotification(
                                channel_id='cashhub-orders-v2',
                                tag=notification['event_id'],
                                sound='order_ring_tone',
                            ),
                        ),
                    )
                    await anyio.to_thread.run_sync(lambda: messaging.send(message, app=firebase_app))
                except messaging.UnregisteredError:
                    await db.fcm_tokens.delete_one({'_id': registration['_id']})
                except Exception as exc:
                    logger.warning('Repeated transaction notification delivery failed: %s', exc)
        if VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY:
            subscriptions = await db.push_subscriptions.find({'user_id': notification['user_id']}).to_list(1000)
            for subscription in subscriptions:
                try:
                    await anyio.to_thread.run_sync(lambda: webpush(
                        subscription_info=subscription['subscription'],
                        data=json.dumps(data),
                        vapid_private_key=VAPID_PRIVATE_KEY,
                        vapid_claims={'sub': VAPID_CLAIMS_EMAIL},
                    ))
                except WebPushException as exc:
                    status_code = getattr(exc.response, 'status_code', None)
                    if status_code in (404, 410):
                        await db.push_subscriptions.delete_one({'_id': subscription['_id']})
                except Exception as exc:
                    logger.warning('Repeated transaction Web Push delivery failed: %s', exc)

async def send_push_to_roles(roles: list[str], payload: dict):
    expanded_roles = set(roles)
    if 'treasurer' in expanded_roles:
        expanded_roles.update({'treasurer', 'super_admin'})
    users = await db.users.find({'role': {'$in': list(expanded_roles)}}, {'_id': 1}).to_list(1000)
    await send_push_to_users([str(user['_id']) for user in users], payload)

async def find_unique_legacy_seller(seller_name: Optional[str]):
    name = (seller_name or '').strip()
    if not name:
        return None
    sellers = await db.users.find({'name': {'$regex': f'^{re.escape(name)}$', '$options': 'i'}}, {'_id': 1, 'name': 1}).limit(2).to_list(2)
    return sellers[0] if len(sellers) == 1 else None

async def order_belongs_to_seller(order: dict, user: dict) -> bool:
    seller_id = order.get('seller_id')
    if seller_id:
        return str(seller_id) == str(user.get('id'))
    legacy_seller = await find_unique_legacy_seller(order.get('sellerName'))
    return bool(legacy_seller and str(legacy_seller['_id']) == str(user.get('id')))

async def send_push_to_seller(seller_name: str, payload: dict, seller_id: Optional[str]=None):
    if seller_id:
        if not is_valid_object_id(seller_id):
            return
        seller = await db.users.find_one({'_id': ObjectId(seller_id)})
    else:
        seller = await find_unique_legacy_seller(seller_name)
    if not seller:
        return
    await send_push_to_users([str(seller['_id'])], payload)

async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get('role') not in ['admin', 'super_admin', 'treasurer']:
        raise HTTPException(status_code=403, detail='Admin access required')
    return user

async def require_treasurer(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get('role') not in ['super_admin', 'treasurer']:
        raise HTTPException(status_code=403, detail='Treasurer access required')
    return user

def save_uploaded_file(upload_file: UploadFile) -> str:
    suffix = Path(upload_file.filename).suffix or ''
    filename = f'{uuid4().hex}{suffix}'
    destination = UPLOAD_DIR / filename
    with destination.open('wb') as buffer:
        shutil.copyfileobj(upload_file.file, buffer)
    return filename

class NamedBytesIO(BytesIO):

    def __init__(self, value: bytes, name: str):
        super().__init__(value)
        self.name = name

def compress_image_upload(upload_file: UploadFile) -> int:
    file_obj = upload_file.file
    file_obj.seek(0, os.SEEK_END)
    original_size = file_obj.tell()
    file_obj.seek(0)
    if original_size <= MAX_IMAGE_UPLOAD_BYTES:
        return original_size
    filename = upload_file.filename or ''
    content_type = (upload_file.content_type or '').lower()
    image_extensions = {'.bmp', '.gif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp'}
    if not content_type.startswith('image/') and Path(filename).suffix.lower() not in image_extensions:
        return original_size
    frames = []
    converted_frames = []
    resized_frames = []
    output = None
    try:
        with Image.open(file_obj) as source:
            is_animated = getattr(source, 'n_frames', 1) > 1
            loop = source.info.get('loop', 0)
            frames = []
            durations = []
            has_alpha = False
            for frame in ImageSequence.Iterator(source):
                frame_image = ImageOps.exif_transpose(frame.copy())
                has_alpha = has_alpha or 'A' in frame_image.getbands() or 'transparency' in frame.info
                frames.append(frame_image)
                durations.append(frame.info.get('duration', source.info.get('duration', 100)))
        if not frames:
            raise HTTPException(status_code=400, detail='The selected image could not be read')
        color_mode = 'RGBA' if has_alpha else 'RGB'
        converted_frames = [frame.convert(color_mode) for frame in frames]
        for frame in frames:
            frame.close()
        frames = []
        for max_edge in (2400, 1800, 1400, 1100, 900, 700, 550, 420, 320, 240, 180, 128):
            resized_frames = []
            for frame in converted_frames:
                resized = frame.copy()
                resized.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
                resized_frames.append(resized)
            try:
                for quality in (82, 72, 62, 52, 42, 32):
                    output = NamedBytesIO(b'', 'compressed.webp')
                    save_options = {'format': 'WEBP', 'quality': quality, 'method': 5}
                    if is_animated:
                        save_options.update({'save_all': True, 'append_images': resized_frames[1:], 'duration': durations, 'loop': loop})
                    resized_frames[0].save(output, **save_options)
                    compressed_size = output.tell()
                    if compressed_size <= MAX_IMAGE_UPLOAD_BYTES:
                        compressed_filename = f"{Path(filename).stem or 'image'}.webp"
                        output.name = compressed_filename
                        output.seek(0)
                        upload_file.file = output
                        upload_file.filename = compressed_filename
                        upload_file.headers['content-type'] = 'image/webp'
                        file_obj.close()
                        logger.info('Compressed image %s from %s to %s bytes', filename, original_size, compressed_size)
                        output = None
                        return compressed_size
                    output.close()
                    output = None
            finally:
                for frame in resized_frames:
                    frame.close()
                resized_frames = []
        raise HTTPException(status_code=422, detail='Could not compress this image below 300 KB')
    except Image.DecompressionBombError as error:
        file_obj.seek(0)
        raise HTTPException(status_code=413, detail='Image dimensions are too large to safely compress') from error
    except (UnidentifiedImageError, OSError, ValueError) as error:
        file_obj.seek(0)
        logger.warning('Could not compress uploaded image %s: %s', filename, error)
        raise HTTPException(status_code=400, detail='Could not process this image for upload') from error
    finally:
        if output is not None:
            output.close()
        for frame in frames + converted_frames + resized_frames:
            frame.close()
        if not file_obj.closed:
            file_obj.seek(0)

async def upload_to_cloudinary(upload_file: UploadFile, folder: str='cash_hub/uploads') -> dict:
    if not CLOUDINARY_URL:
        logger.error('CLOUDINARY_URL not configured')
        raise HTTPException(status_code=500, detail='Cloudinary is not configured')
    logger.info(f'Starting Cloudinary upload for: {upload_file.filename}')
    await anyio.to_thread.run_sync(compress_image_upload, upload_file)
    file_obj = upload_file.file
    size_bytes = None
    if hasattr(file_obj, 'seek') and hasattr(file_obj, 'tell'):
        try:
            file_obj.seek(0, os.SEEK_END)
            size_bytes = file_obj.tell()
            logger.info(f'File size: {size_bytes} bytes')
            file_obj.seek(0)
        except Exception as e:
            logger.warning(f'Could not determine file size: {e}')
            size_bytes = None
    if hasattr(file_obj, 'seek'):
        try:
            file_obj.seek(0)
            logger.info('File pointer reset to beginning')
        except Exception as e:
            logger.warning(f'Could not reset file pointer: {e}')
    upload_options = {'resource_type': 'auto', 'folder': folder, 'use_filename': True, 'unique_filename': True, 'overwrite': False}
    if size_bytes and size_bytes > 500 * 1024:
        logger.info('Large file detected, applying compression')
        upload_options.update({'quality': 'auto:low', 'fetch_format': 'auto', 'flags': 'lossy'})

    def _upload(file_obj):
        logger.info('Calling cloudinary.uploader.upload')
        result = cloudinary.uploader.upload(file_obj, **upload_options)
        logger.info(f'Cloudinary response keys: {result.keys()}')
        return result
    result = None
    try:
        result = await anyio.to_thread.run_sync(_upload, file_obj)
        logger.info(f'Cloudinary upload successful for {upload_file.filename}')
    except Exception as e:
        logger.error(f'Cloudinary upload failed for {upload_file.filename}: {str(e)}', exc_info=True)
        raise HTTPException(status_code=500, detail=f'Cloudinary upload failed: {str(e)}')
    if result is None:
        raise HTTPException(status_code=500, detail='Cloudinary upload returned no result')
    secure_url = result.get('secure_url') or result.get('url')
    if not secure_url:
        logger.error(f'Cloudinary upload returned no URL. Response: {result}')
        raise HTTPException(status_code=500, detail='Cloudinary upload failed: no URL returned')
    logger.info(f'Secure URL obtained: {secure_url}')
    result['secure_url'] = secure_url
    return result

def calculate_late_fee(day_of_month: int, num_slots: int) -> float:
    """Calculate late fee based on payment date and member's slots"""
    if day_of_month <= 10:
        return 0
    return num_slots * LATE_FEE_PER_POSITION

def normalize_phone(phone: str) -> Optional[str]:
    digits = re.sub('\\D', '', phone or '')
    if digits.startswith('256'):
        digits = digits[3:]
    if digits.startswith('0'):
        digits = digits[1:]
    if len(digits) > 9:
        digits = digits[-9:]
    return digits if len(digits) == 9 else None

def generate_member_code(name: Optional[str], phone: str) -> str:
    name_part = ''
    if name:
        parts = name.strip().split()
        first = parts[0] if parts else ''
        name_part = first[:3].lower() if first else ''
    digits = re.sub('\\D', '', phone or '')
    phone_part = digits[-4:] if len(digits) >= 4 else digits
    return f'{name_part}{phone_part}'

async def get_or_create_user_member_code(user: Optional[dict]) -> Optional[str]:
    if not user:
        return None
    if user.get('member_code'):
        return user['member_code']
    code = generate_member_code(user.get('name'), user.get('phone', ''))
    try:
        await db.users.update_one({'_id': ObjectId(user['id'])}, {'$set': {'member_code': code}})
    except Exception:
        pass
    return code

async def migrate_normalized_phone() -> None:
    async for user in db.users.find({'normalized_phone': {'$exists': False}, 'phone': {'$exists': True}}):
        normalized_phone = normalize_phone(user['phone'])
        if normalized_phone:
            await db.users.update_one({'_id': user['_id']}, {'$set': {'normalized_phone': normalized_phone}})

async def get_duplicate_normalized_phones() -> List[dict]:
    pipeline = [{'$match': {'normalized_phone': {'$exists': True}}}, {'$group': {'_id': '$normalized_phone', 'count': {'$sum': 1}, 'ids': {'$push': '$_id'}}}, {'$match': {'count': {'$gt': 1}}}]
    return await db.users.aggregate(pipeline).to_list(100)

def calculate_months_elapsed(start_date: datetime, end_date: Optional[datetime]=None) -> int:
    end_date = end_date or datetime.now(timezone.utc)
    if end_date < start_date:
        return 0
    months = (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month)
    if end_date.day < start_date.day:
        months -= 1
    return max(0, months)

def count_interest_periods(start_date: datetime, end_date: Optional[datetime]=None) -> int:
    end_date = end_date or datetime.now(timezone.utc)
    if end_date < start_date:
        return 0
    current = start_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    periods = 0
    while current < end_date:
        next_month = current.month + 1
        next_year = current.year + (next_month - 1) // 12
        next_month = (next_month - 1) % 12 + 1
        current = current.replace(year=next_year, month=next_month, day=1)
        if current <= end_date:
            periods += 1
    return periods

def get_loan_months_elapsed(loan: dict) -> int:
    approved_at = loan.get('approved_at') or loan.get('created_at')
    if not approved_at:
        return 0
    try:
        approved_date = datetime.fromisoformat(approved_at.replace('Z', '+00:00'))
        today = datetime.now(timezone.utc)
        return count_interest_periods(approved_date, today)
    except ValueError:
        logger.warning('Loan has invalid approved_at date: %s', approved_at)
        return 0

def calculate_loan_interest(loan_amount: float, total_months_elapsed: int, months_to_accrue: int) -> float:
    """Calculate loan interest for a specific accrual period with tiered monthly rates."""
    if months_to_accrue <= 0 or total_months_elapsed < 0:
        return 0.0
    total_interest = 0.0
    for i in range(months_to_accrue):
        month_number = total_months_elapsed + i + 1
        if month_number <= LOAN_NORMAL_PERIOD_MONTHS:
            total_interest += loan_amount * LOAN_INTEREST_NORMAL
        else:
            total_interest += loan_amount * LOAN_INTEREST_EXTENDED
    return total_interest

def get_loan_last_interest_date(loan: dict) -> datetime:
    last_accrual = loan.get('last_interest_accrual_at') or loan.get('approved_at')
    if last_accrual:
        try:
            return datetime.fromisoformat(last_accrual.replace('Z', '+00:00'))
        except ValueError:
            logger.warning('Invalid loan date format for loan %s: %s', loan.get('id') or loan.get('_id'), last_accrual)
    return datetime.now(timezone.utc)

def get_loan_outstanding_balance(loan: dict) -> float:
    stored_balance = loan.get('outstanding_balance')
    if stored_balance is None or float(stored_balance) <= 0:
        for candidate_key in ['total_due', 'initial_total_due', 'amount']:
            candidate = loan.get(candidate_key)
            if candidate is None:
                continue
            candidate_value = float(candidate)
            if candidate_value > 0:
                stored_balance = candidate_value
                break
        if stored_balance is None or float(stored_balance) <= 0:
            stored_balance = max(0, loan.get('amount', 0) - loan.get('amount_repaid', 0))
    else:
        stored_balance = float(stored_balance)
    repaid = float(loan.get('amount_repaid', 0) or 0) + float(loan.get('interest_repaid', 0) or 0)
    if stored_balance is not None and float(stored_balance) > 0:
        if loan.get('outstanding_balance') is None:
            stored_balance = max(0, float(stored_balance) - repaid)
    return float(stored_balance or 0)

async def accrue_loan_interest_on_db(loan: dict) -> dict:
    """Accrue monthly interest on an approved outstanding loan balance."""
    if loan.get('status') != 'approved' or loan.get('repaid'):
        return loan
    approved_at = loan.get('approved_at')
    if not approved_at:
        logger.warning('Skipping interest accrual for approved loan with missing approved_at: %s', loan.get('id') or loan.get('_id'))
        return loan
    try:
        approved_date = datetime.fromisoformat(approved_at.replace('Z', '+00:00'))
    except ValueError:
        logger.warning('Skipping interest accrual for approved loan with invalid approved_at: %s', approved_at)
        return loan
    last_accrual_date = get_loan_last_interest_date(loan)
    months_to_accrue = count_interest_periods(last_accrual_date)
    if months_to_accrue <= 0:
        return loan
    total_months_elapsed = count_interest_periods(approved_date)
    current_balance = get_loan_outstanding_balance(loan)
    principal = float(loan.get('amount', 0) or 0)
    interest = calculate_loan_interest(principal, total_months_elapsed, months_to_accrue)
    new_balance = current_balance + interest
    update_fields = {'outstanding_balance': new_balance, 'last_interest_accrual_at': datetime.now(timezone.utc).isoformat()}
    await db.loans.update_one({'_id': ObjectId(loan['_id'])}, {'$set': update_fields})
    loan.update(update_fields)
    return loan

async def accrue_interest_for_all_loans():
    """Background job: accrue monthly interest for all approved outstanding loans."""
    try:
        cursor = db.loans.find({'status': 'approved', 'repaid': False})
        loans = await cursor.to_list(1000)
        for loan in loans:
            try:
                await accrue_loan_interest_on_db(loan)
            except Exception as e:
                logger.error(f"Failed to accrue interest for loan {loan.get('id') or loan.get('_id')}: {e}")
        logger.info(f'Monthly interest accrual completed for {len(loans)} loans')
    except Exception as e:
        logger.error(f'Monthly interest accrual job failed: {e}')

def is_valid_object_id(value: Optional[str]) -> bool:
    if not value:
        return False
    return ObjectId.is_valid(value)

def serialize_mongo_document(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {k: serialize_mongo_document(v) for k, v in value.items()}
    if isinstance(value, list):
        return [serialize_mongo_document(v) for v in value]
    return value

async def get_member_guarantee_count(member_id: str) -> int:
    """Count how many active loans this member is guaranteeing"""
    count = await db.loans.count_documents({'guarantor_id': member_id, 'status': {'$in': ['pending_guarantor', 'pending_admin', 'approved']}, 'repaid': False})
    return count

async def get_member_remaining_guarantee_slots(member_id: str, max_guarantees: Optional[int]=None) -> int:
    """Return how many guarantee slots remain for a member."""
    active_count = await get_member_guarantee_count(member_id)
    limit = max_guarantees if max_guarantees is not None else MAX_GUARANTEES_PER_MEMBER
    return max(0, limit - active_count)

async def check_can_leave_group(member_id: str) -> dict:
    """Check if member can leave the group"""
    active_loan = await db.loans.find_one({'user_id': member_id, 'status': 'approved', 'repaid': False})
    if active_loan:
        return {'can_leave': False, 'reason': 'You have an active loan'}
    guaranteeing = await db.loans.find_one({'guarantor_id': member_id, 'status': {'$in': ['pending_guarantor', 'pending_admin', 'approved']}, 'repaid': False})
    if guaranteeing:
        return {'can_leave': False, 'reason': 'You are a guarantor for an active loan'}
    leaving_request = await db.leaving_requests.find_one({'user_id': member_id, 'status': 'approved'})
    if not leaving_request:
        return {'can_leave': False, 'reason': 'You must submit a leaving request and wait 2 months'}
    request_date = datetime.fromisoformat(leaving_request['created_at'].replace('Z', '+00:00'))
    two_months_later = request_date + timedelta(days=60)
    if datetime.now(timezone.utc) < two_months_later:
        days_remaining = (two_months_later - datetime.now(timezone.utc)).days
        return {'can_leave': False, 'reason': f'You must wait {days_remaining} more days'}
    return {'can_leave': True, 'reason': 'You can leave the group'}

async def check_and_create_auto_loan(member_id: str) -> dict:
    """Check if member should have auto-loan created (after 20th without deposit this month)"""
    today = datetime.now(timezone.utc)
    day_of_month = today.day
    if day_of_month <= 20:
        return {'auto_loan_created': False, 'reason': 'Not after 20th of month'}
    month_start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    savings_deposit = await db.deposits.find_one({'user_id': member_id, 'deposit_type': 'savings', 'status': 'approved', 'created_at': {'$gte': month_start.isoformat()}})
    if savings_deposit:
        return {'auto_loan_created': False, 'reason': 'Member already deposited this month'}
    member = await db.users.find_one({'_id': ObjectId(member_id)})
    if not member:
        return {'auto_loan_created': False, 'reason': 'Member not found'}
    num_slots = member.get('max_guarantees', MAX_GUARANTEES_PER_MEMBER)
    auto_loan_amount = (MONTHLY_SAVINGS + LATE_FEE_PER_POSITION + DEVELOPMENT_FEE) * num_slots
    existing_auto_loan = await db.loans.find_one({'user_id': member_id, 'auto_created': True, 'month': today.strftime('%Y-%m')})
    if existing_auto_loan:
        return {'auto_loan_created': False, 'reason': 'Auto-loan already exists for this month'}
    loan_doc = {'user_id': member_id, 'user_name': member['name'], 'amount': auto_loan_amount, 'guarantor_id': None, 'status': 'pending_admin', 'auto_created': True, 'month': today.strftime('%Y-%m'), 'interest_rate': LOAN_INTEREST_NORMAL, 'repaid': False, 'amount_repaid': 0, 'outstanding_balance': auto_loan_amount, 'due_date': None, 'created_at': datetime.now(timezone.utc).isoformat(), 'approved_at': None, 'approved_by': None, 'last_interest_accrual_at': None}
    result = await db.loans.insert_one(loan_doc)
    logger.info(f"Auto-loan created for member {member['name']}: UGX {auto_loan_amount:,}")
    return {'auto_loan_created': True, 'loan_id': str(result.inserted_id), 'amount': auto_loan_amount}

def generate_temp_password(length: int=6) -> str:
    return ''.join((secrets.choice(string.digits) for _ in range(length)))

def phone_to_whatsapp(phone: str) -> str:
    digits = re.sub('\\D', '', phone or '')
    if digits.startswith('0'):
        digits = '256' + digits[1:]
    elif not digits.startswith('256'):
        digits = '256' + digits
    return digits

async def send_whatsapp_message(phone: str, message: str) -> bool:
    try:
        wa_number = phone_to_whatsapp(phone)
        wa_url = f'https://wa.me/{wa_number}?text={quote(message)}'
        import webbrowser
        webbrowser.open(wa_url)
        logger.info(f'WhatsApp link opened for {wa_number}: {wa_url}')
        return True
    except Exception as e:
        logger.warning(f'WhatsApp send failed: {e}')
        return False

async def send_email_otp(email: str, temp_password: str) -> bool:
    try:
        smtp_host = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_pass = os.environ.get('SMTP_PASS')
        if not smtp_user or not smtp_pass:
            return False
        msg = MIMEMultipart()
        msg['From'] = smtp_user
        msg['To'] = email
        msg['Subject'] = 'Password Recovery - Class One Savings'
        body = f'Your temporary password is: {temp_password}\n\nThis password expires in 3 minutes. Use it to reset your account password.'
        msg.attach(MIMEText(body, 'plain'))
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, email, msg.as_string())
        return True
    except Exception as e:
        logger.warning(f'Email send failed: {e}')
        return False

def get_shop_hero_poster_urls(poster: Optional[dict]) -> list[str]:
    if not poster:
        return []
    if isinstance(poster.get('image_urls'), list):
        return [url for url in poster['image_urls'] if isinstance(url, str) and url.strip()]
    legacy_url = poster.get('image_url')
    return [legacy_url] if isinstance(legacy_url, str) and legacy_url.strip() else []

class BatchProjectDelete(BaseModel):
    ids: List[str]

async def get_monthly_development_fee_applied(user_id: str, month: str) -> float:
    deposits = await db.deposits.find({'user_id': user_id, 'month': month, 'status': 'approved', 'development_fee_amount': {'$gt': 0}}).to_list(1000)
    return sum((float(d.get('development_fee_amount', 0) or 0) for d in deposits))

async def _process_deposit_approval(approval: TransactionApproval, user: dict):
    deposit = await db.deposits.find_one({'_id': ObjectId(approval.transaction_id)})
    if not deposit:
        raise HTTPException(status_code=404, detail='Deposit not found')
    if deposit['status'] != 'pending':
        raise HTTPException(status_code=400, detail='Deposit already processed')
    new_status = 'approved' if approval.approved else 'rejected'
    deduct_late_fee = approval.deduct_late_fee
    if deduct_late_fee is None:
        deduct_late_fee = deposit.get('deduct_late_fee', False)
    update_fields = {'status': new_status, 'approved_at': datetime.now(timezone.utc).isoformat(), 'approved_by': user['id'], 'notes': approval.notes}
    if approval.approved and deposit.get('deposit_type') == 'savings':
        update_fields['deduct_late_fee'] = deduct_late_fee
        if deduct_late_fee:
            update_fields['late_fee_applied'] = True
    quick_loan = None
    quick_loan_query = None
    quick_loan_payment = 0
    quick_loan_balance = None
    if approval.approved and deposit.get('deposit_type') == 'quick_loan_payment':
        quick_loan_id = deposit.get('quick_loan_id')
        if not quick_loan_id or not is_valid_object_id(str(quick_loan_id)):
            raise HTTPException(status_code=400, detail='Quick loan repayment is missing a valid loan reference')
        quick_loan_query = {'_id': ObjectId(str(quick_loan_id))}
        quick_loan = await db.quick_loans.find_one(quick_loan_query)
        if not quick_loan:
            raise HTTPException(status_code=404, detail='Quick loan for this repayment was not found')
        if quick_loan.get('status') != 'approved' or quick_loan.get('repaid'):
            raise HTTPException(status_code=400, detail='Quick loan is no longer awaiting repayment')
        quick_loan = await accrue_quick_loan_interest(quick_loan)
        quick_loan_balance = float(quick_loan.get('outstanding_balance', quick_loan.get('total_due', quick_loan.get('amount', 0))) or 0)
        quick_loan_payment = min(float(deposit.get('amount') or 0), quick_loan_balance)
        if quick_loan_payment <= 0:
            raise HTTPException(status_code=400, detail='Quick loan has no outstanding balance')
        update_fields['amount_applied'] = quick_loan_payment
        update_fields['quick_loan_balance_before'] = quick_loan_balance
        update_fields['quick_loan_balance_after'] = max(0, quick_loan_balance - quick_loan_payment)
    await db.deposits.update_one({'_id': ObjectId(approval.transaction_id)}, {'$set': update_fields})
    if approval.approved:
        if deposit.get('deposit_type') == 'development_fee':
            await db.users.update_one({'_id': ObjectId(deposit['user_id'])}, {'$inc': {'development_fund': deposit['amount']}})
        elif deposit.get('deposit_type') == 'quick_loan_payment':
            new_balance = max(0, quick_loan_balance - quick_loan_payment)
            await db.quick_loans.update_one(quick_loan_query, {'$set': {'outstanding_balance': new_balance, 'repaid': new_balance <= 0, 'repaid_at': datetime.now(timezone.utc).isoformat() if new_balance <= 0 else None, 'status': 'repaid' if new_balance <= 0 else 'approved'}, '$inc': {'amount_repaid': quick_loan_payment}})
            borrower_id = quick_loan.get('user_id')
            payer_id = deposit.get('user_id')
            if borrower_id and borrower_id != payer_id:
                await send_push_to_users([borrower_id], {'id': f'quick-loan-repayment-status-{approval.transaction_id}', 'type': 'transaction_update', 'title': f'Quick loan repayment {new_status}', 'body': f'UGX {quick_loan_payment:,.0f} repayment for your quick loan was {new_status}. Outstanding balance: UGX {new_balance:,.0f}.', 'url': '/dashboard'})
        elif deposit.get('deposit_type') in ['loan_payment', 'interest_payment']:
            user_loans = await db.loans.find({'user_id': deposit['user_id'], 'status': 'approved', 'repaid': False}).to_list(100)
            remaining_payment = deposit['amount']
            for loan in user_loans:
                if remaining_payment <= 0:
                    break
                loan = await accrue_loan_interest_on_db(loan)
                outstanding_balance = get_loan_outstanding_balance(loan)
                if outstanding_balance <= 0:
                    await db.loans.update_one({'_id': ObjectId(loan['_id'])}, {'$set': {'repaid': True, 'repaid_at': datetime.now(timezone.utc).isoformat(), 'status': 'repaid'}})
                    await db.users.update_one({'_id': ObjectId(loan['guarantor_id'])}, {'$inc': {'guarantees_given': -1}})
                    continue
                payment_to_apply = min(remaining_payment, outstanding_balance)
                new_balance = max(0, outstanding_balance - payment_to_apply)
                update_obj = {'$set': {'outstanding_balance': new_balance}, '$inc': {'amount_repaid': payment_to_apply}}
                if new_balance <= 0:
                    update_obj['$set'].update({'repaid': True, 'repaid_at': datetime.now(timezone.utc).isoformat(), 'status': 'repaid'})
                await db.loans.update_one({'_id': ObjectId(loan['_id'])}, update_obj)
                if new_balance <= 0:
                    await db.users.update_one({'_id': ObjectId(loan['guarantor_id'])}, {'$inc': {'guarantees_given': -1}})
                remaining_payment -= payment_to_apply
            if remaining_payment > 0:
                await db.users.update_one({'_id': ObjectId(deposit['user_id'])}, {'$inc': {'total_savings': remaining_payment}})
        else:
            deduct_late_fee = deduct_late_fee and deposit.get('late_fee', 0) > 0
            late_fee_amount = min(deposit.get('late_fee', 0), deposit['amount']) if deduct_late_fee else 0
            remaining_after_late_fee = max(0, deposit['amount'] - late_fee_amount)
            member = await db.users.find_one({'_id': ObjectId(deposit['user_id'])})
            is_treasurer = member.get('role') in ['super_admin', 'treasurer'] if member else False
            if is_treasurer:
                balance_updates = {'total_savings': remaining_after_late_fee}
                if late_fee_amount > 0:
                    balance_updates['total_late_fees'] = late_fee_amount
                development_fee_amount = 0
                savings_amount = remaining_after_late_fee
            else:
                num_slots = member.get('max_guarantees', MAX_GUARANTEES_PER_MEMBER) if member else MAX_GUARANTEES_PER_MEMBER
                monthly_development_fee_cap = DEVELOPMENT_FEE * num_slots
                monthly_development_fee_applied = await get_monthly_development_fee_applied(deposit['user_id'], deposit.get('month'))
                remaining_development_fee_cap = max(0, monthly_development_fee_cap - monthly_development_fee_applied)
                development_fee_amount = min(remaining_development_fee_cap, remaining_after_late_fee)
                savings_amount = max(0, remaining_after_late_fee - development_fee_amount)
                balance_updates = {'total_savings': savings_amount}
                if late_fee_amount > 0:
                    balance_updates['total_late_fees'] = late_fee_amount
                if development_fee_amount > 0:
                    balance_updates['development_fund'] = development_fee_amount
            await db.users.update_one({'_id': ObjectId(deposit['user_id'])}, {'$inc': balance_updates})
            update_fields['development_fee_amount'] = development_fee_amount
            update_fields['development_fee_applied'] = development_fee_amount > 0
            await db.deposits.update_one({'_id': ObjectId(approval.transaction_id)}, {'$set': update_fields})
        member = await db.users.find_one({'_id': ObjectId(deposit['user_id'])})
        if member and member.get('total_savings', 0) >= MONTHLY_SAVINGS:
            await db.users.update_one({'_id': ObjectId(deposit['user_id'])}, {'$set': {'membership_type': 'premium'}})
    quick_loan_payment_deposit = deposit.get('deposit_type') == 'quick_loan_payment'
    await stop_deposit_notification_repeats(approval.transaction_id)
    await send_push_to_users([deposit['user_id']], {'id': f'deposit-status-{approval.transaction_id}', 'type': 'transaction_update', 'title': f'Quick loan repayment {new_status}' if quick_loan_payment_deposit else f'Deposit {new_status}', 'body': f"Your UGX {float(deposit.get('amount') or 0):,.0f} quick loan repayment was {new_status}." if quick_loan_payment_deposit else f"Your UGX {float(deposit.get('amount') or 0):,.0f} deposit was {new_status}.", 'url': '/dashboard'})
    if quick_loan_payment_deposit and (not approval.approved) and deposit.get('quick_loan_borrower_id'):
        await send_push_to_users([deposit['quick_loan_borrower_id']], {'id': f'quick-loan-repayment-status-{approval.transaction_id}', 'type': 'transaction_update', 'title': 'Quick loan repayment rejected', 'body': 'The administrator rejected the repayment submitted for your quick loan.', 'url': '/dashboard'})
    return {'message': f'Deposit {new_status}'}

async def accrue_quick_loan_interest(quick_loan):
    if quick_loan.get('status') != 'approved' or quick_loan.get('repaid'):
        return quick_loan
    if quick_loan.get('manual_repayment_terms'):
        return quick_loan
    approved_at = quick_loan.get('approved_at')
    if not approved_at:
        return quick_loan
    period = quick_loan.get('interest_period', '2_weeks')
    amount = quick_loan.get('amount', 0)
    interest_rate = 0.2 if period == '1_month' and amount <= 50000 else 0.1
    try:
        approved_date = datetime.fromisoformat(approved_at.replace('Z', '+00:00'))
    except ValueError:
        return quick_loan
    last_accrual_at = quick_loan.get('last_interest_accrual_at')
    if last_accrual_at:
        try:
            last_accrual_date = datetime.fromisoformat(last_accrual_at.replace('Z', '+00:00'))
        except ValueError:
            last_accrual_date = approved_date
    else:
        last_accrual_date = approved_date
    now = datetime.now(timezone.utc)
    if now <= last_accrual_date:
        return quick_loan
    elapsed_days = (now - last_accrual_date).days
    if period == '2_weeks':
        period_days = 14
    else:
        period_days = 30
    periods_elapsed = max(0, elapsed_days // period_days)
    if periods_elapsed <= 0:
        return quick_loan
    current_interest = quick_loan.get('current_interest', quick_loan.get('interest_amount', 0))
    additional_interest = round(amount * interest_rate * periods_elapsed, 2)
    total_interest = round(current_interest + additional_interest, 2)
    total_due = round(amount + total_interest, 2)
    outstanding_balance = max(0, total_due - quick_loan.get('amount_repaid', 0))
    update_fields = {'current_interest': total_interest, 'total_due': total_due, 'outstanding_balance': outstanding_balance, 'last_interest_accrual_at': now.isoformat()}
    if outstanding_balance <= 0 and (not quick_loan.get('repaid')):
        update_fields['repaid'] = True
        update_fields['repaid_at'] = now.isoformat()
        update_fields['status'] = 'repaid'
    quick_loan.update(update_fields)
    loan_id = quick_loan.get('_id')
    if loan_id:
        await db.quick_loans.update_one({'_id': loan_id}, {'$set': update_fields})
    return quick_loan

def ugx_amount_in_words(amount: float) -> str:
    number = int(amount)
    if number == 0:
        return 'Zero Shillings Only'
    ones = ('Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen')
    tens = ('', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety')
    scales = ('', 'Thousand', 'Million', 'Billion', 'Trillion')

    def under_thousand(value: int) -> str:
        parts = []
        hundreds, remainder = divmod(value, 100)
        if hundreds:
            parts.append(f'{ones[hundreds]} Hundred')
        if remainder < 20:
            if remainder:
                parts.append(ones[remainder])
        else:
            ten, unit = divmod(remainder, 10)
            parts.append(tens[ten] + (f' {ones[unit]}' if unit else ''))
        return ' '.join(parts)
    parts = []
    scale_index = 0
    while number:
        chunk = number % 1000
        if chunk:
            words = under_thousand(chunk)
            if scales[scale_index]:
                words = f'{words} {scales[scale_index]}'
            parts.insert(0, words)
        number //= 1000
        scale_index += 1
    return f"{' '.join(parts)} Shillings Only"

async def activate_matured_full_withdrawals():
    now = datetime.now(timezone.utc)
    matured_withdrawals = await db.withdrawals.find({'status': 'waiting_period', 'approval_available_at': {'$lte': now.isoformat()}}).to_list(1000)
    for withdrawal in matured_withdrawals:
        result = await db.withdrawals.update_one({'_id': withdrawal['_id'], 'status': 'waiting_period', 'approval_available_at': withdrawal['approval_available_at']}, {'$set': {'status': 'pending', 'notice_period_completed_at': now.isoformat()}})
        if result.modified_count != 1:
            continue
        notification_withdrawal = {**withdrawal, 'id': str(withdrawal['_id']), 'status': 'pending', 'notice_period_completed_at': now.isoformat()}
        notification_withdrawal.pop('_id', None)
        await send_push_to_roles(['treasurer'], {
            'id': f"withdrawal-{withdrawal['_id']}",
            'type': 'new_withdrawal',
            'pending_transaction_id': str(withdrawal['_id']),
            'pending_transaction_collection': 'withdrawals',
            'pending_statuses': ['pending'],
            'title': 'Full withdrawal ready for approval',
            'body': f"{withdrawal.get('user_name') or 'A member'} completed the 60-day notice and requested UGX {float(withdrawal.get('amount') or 0):,.0f}",
            'url': '/dashboard',
        })
        await send_push_to_users([withdrawal['user_id']], {'id': f"withdrawal-ready-{withdrawal['_id']}", 'type': 'transaction_update', 'title': 'Withdrawal sent for approval', 'body': 'Your 60-day notice period is complete. Your full-balance withdrawal is now awaiting treasurer approval.', 'url': '/dashboard'})

async def calculate_total_interest_earned() -> float:
    """Calculate total interest earned from all repaid and active loans"""
    total_interest = 0
    loans = await db.loans.find({'status': {'$in': ['approved', 'repaid']}}).to_list(1000)
    for loan in loans:
        if loan.get('repaid'):
            amount_repaid = loan.get('amount_repaid', 0)
            principal = loan.get('amount', 0)
            interest = max(0, amount_repaid - principal)
            total_interest += interest
        elif loan.get('approved_at'):
            approved_date = datetime.fromisoformat(loan['approved_at'].replace('Z', '+00:00'))
            months_elapsed = max(1, (datetime.now(timezone.utc) - approved_date).days // 30)
            if months_elapsed <= LOAN_NORMAL_PERIOD_MONTHS:
                interest = loan['amount'] * LOAN_INTEREST_NORMAL * months_elapsed
            else:
                normal_interest = loan['amount'] * LOAN_INTEREST_NORMAL * LOAN_NORMAL_PERIOD_MONTHS
                extended_months = months_elapsed - LOAN_NORMAL_PERIOD_MONTHS
                extended_interest = loan['amount'] * LOAN_INTEREST_EXTENDED * extended_months
                interest = normal_interest + extended_interest
            total_interest += interest
    return total_interest

async def calculate_total_late_fees() -> float:
    """Calculate total late fees collected"""
    pipeline = [{'$match': {'status': 'approved', 'late_fee': {'$gt': 0}, 'late_fee_applied': True}}, {'$group': {'_id': None, 'total': {'$sum': '$late_fee'}}}]
    result = await db.deposits.aggregate(pipeline).to_list(1)
    return result[0]['total'] if result else 0

async def get_total_petty_cash_used() -> float:
    """Get total petty cash expenses"""
    pipeline = [{'$group': {'_id': None, 'total': {'$sum': '$amount'}}}]
    result = await db.petty_cash.aggregate(pipeline).to_list(1)
    return result[0]['total'] if result else 0

async def get_total_group_slots() -> int:
    """Count the total number of slots held by members in the group."""
    pipeline = [{'$match': {'role': {'$nin': ['super_admin', 'treasurer']}}}, {'$group': {'_id': None, 'total_slots': {'$sum': '$max_guarantees'}}}]
    result = await db.users.aggregate(pipeline).to_list(1)
    return int(result[0]['total_slots']) if result else 0

async def get_total_distributed_interest_shares() -> float:
    setting = await db.settings.find_one({'key': 'interest_share_distributed_total'})
    if setting and isinstance(setting.get('value'), (int, float)):
        return float(setting['value'])
    return 0.0

async def calculate_pending_interest_share_pool() -> float:
    """Calculate interest share pool pending distribution."""
    total_interest = await calculate_total_interest_earned()
    total_late_fees = await calculate_total_late_fees()
    total_petty_cash = await get_total_petty_cash_used()
    distributed_amount = await get_total_distributed_interest_shares()
    current_pool = total_interest + total_late_fees - total_petty_cash
    pending_amount = max(0.0, current_pool - distributed_amount)
    return float(round(pending_amount, 2))

async def record_interest_share_distribution(amount: float) -> None:
    await db.settings.update_one({'key': 'interest_share_distributed_total'}, {'$inc': {'value': amount}}, upsert=True)

async def distribute_interest_shares_internal() -> dict:
    pending_amount = await calculate_pending_interest_share_pool()
    if pending_amount <= 0:
        return {'message': 'No distributable interest available', 'distributed_amount': 0, 'pending_amount': 0, 'total_slots': await get_total_group_slots()}
    total_slots = await get_total_group_slots()
    if total_slots <= 0:
        return {'message': 'No group slots available for distribution', 'distributed_amount': 0, 'pending_amount': pending_amount, 'total_slots': 0}
    per_slot_share = pending_amount / total_slots
    members = await db.users.find({'role': {'$nin': ['super_admin', 'treasurer']}}).to_list(1000)
    total_distributed = 0
    for member in members:
        num_slots = member.get('max_guarantees', MAX_GUARANTEES_PER_MEMBER)
        share = int(round(per_slot_share * num_slots))
        if share <= 0:
            continue
        await db.users.update_one({'_id': member['_id']}, {'$inc': {'total_savings': share}})
        total_distributed += share
    if total_distributed > 0:
        await record_interest_share_distribution(total_distributed)
    return {'message': 'Interest shared to members', 'distributed_amount': total_distributed, 'per_slot_share': float(round(per_slot_share, 2)), 'total_slots': total_slots}

class PettyCashEntry(BaseModel):
    amount: float
    description: str
    category: Optional[str] = 'general'

async def seed_treasurer():
    admin_email = os.environ.get('SUPER_ADMIN_EMAIL', 'treasurer@savingsgroup.com')
    admin_password = os.environ.get('SUPER_ADMIN_PASSWORD', 'Treasurer@123')
    admin_phone = os.environ.get('SUPER_ADMIN_PHONE', '0700000000')
    admin_name = os.environ.get('SUPER_ADMIN_NAME', 'Treasurer')
    admin_role = os.environ.get('SUPER_ADMIN_ROLE', 'super_admin')
    if admin_role not in ['super_admin', 'treasurer']:
        admin_role = 'super_admin'
    normalized_admin_phone = normalize_phone(admin_phone)
    existing = await db.users.find_one({'$or': [{'email': admin_email}, {'phone': admin_phone}, {'normalized_phone': normalized_admin_phone}]})
    if existing is None:
        await db.users.insert_one({'email': admin_email, 'password_hash': hash_password(admin_password), 'name': admin_name, 'phone': admin_phone, 'normalized_phone': normalized_admin_phone, 'role': admin_role, 'membership_type': 'premium', 'total_savings': 0, 'development_fund': 0, 'total_late_fees': 0, 'guarantees_given': 0, 'leaving_requested': False, 'created_at': datetime.now(timezone.utc).isoformat()})
        logger.info(f"{admin_role.replace('_', ' ').title()} created: {admin_email} / {admin_phone}")
    else:
        update_fields = {'email': admin_email, 'phone': admin_phone, 'normalized_phone': normalized_admin_phone, 'role': admin_role, 'membership_type': 'premium', 'password_hash': hash_password(admin_password)}
        await db.users.update_one({'_id': existing['_id']}, {'$set': update_fields})
        logger.info(f"{admin_role.replace('_', ' ').title()} account normalized: {admin_email} / {admin_phone}")

@app.on_event('startup')
async def startup_event():
    global scheduler
    if scheduler is None or not scheduler.running:
        scheduler = AsyncIOScheduler()
        scheduler.add_job(accrue_interest_for_all_loans, 'cron', hour=0, minute=0, timezone='UTC')
        scheduler.add_job(resend_unread_order_notifications, 'interval', seconds=60, max_instances=1, coalesce=True)
        scheduler.add_job(resend_pending_deposit_notifications, 'interval', seconds=60, max_instances=1, coalesce=True)
        scheduler.add_job(resend_pending_transaction_notifications, 'interval', seconds=60, max_instances=1, coalesce=True)
        scheduler.add_job(activate_matured_full_withdrawals, 'interval', seconds=60, max_instances=1, coalesce=True)
        scheduler.start()
        logger.info('Monthly interest accrual scheduler started')
    try:
        await client.admin.command('ping')
        logger.info('MongoDB connected successfully')
        try:
            await db.users.drop_index('email_1')
        except Exception:
            pass
        await db.users.create_index('email', unique=True, sparse=True)
        await db.users.create_index('phone', unique=True, sparse=True)
        await migrate_normalized_phone()
        duplicates = await get_duplicate_normalized_phones()
        if duplicates:
            logger.error('Found duplicate normalized_phone values when creating unique index, please clean the following duplicates first: %s', [{'normalized_phone': dup['_id'], 'count': dup['count'], 'ids': [str(i) for i in dup['ids']]} for dup in duplicates])
        else:
            await db.users.create_index('normalized_phone', unique=True, sparse=True)
        await db.deposits.create_index('user_id')
        await db.loans.create_index('user_id')
        await db.loans.create_index('guarantor_id')
        await db.withdrawals.create_index('user_id')
        await db.leaving_requests.create_index('user_id')
        await db.password_resets.create_index('expires_at', expireAfterSeconds=0)
        await db.notifications.create_index('created_at', expireAfterSeconds=30 * 24 * 60 * 60)
        await db.notifications.create_index([('user_id', 1), ('created_at', 1)])
        await db.notifications.create_index([('type', 1), ('read_at', 1), ('next_repeat_at', 1)])
        await db.fcm_tokens.create_index('user_id')
        await db.users.update_many({'max_guarantees': {'$exists': False}}, {'$set': {'max_guarantees': 2}})
        logger.info('Migration completed: Added max_guarantees field to existing users')
        await seed_treasurer()
    except Exception as e:
        logger.error(f'Database connection failed: {e}')
    logger.info('Application started successfully')

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f'Unhandled exception: {exc}')
    origin = request.headers.get('origin', '')
    allow_origin = origin if origin in CORS_ALLOWED_ORIGINS else '*'
    return JSONResponse(status_code=500, content={'detail': str(exc)}, headers={'Access-Control-Allow-Origin': allow_origin, 'Access-Control-Allow-Credentials': 'true' if allow_origin != '*' else 'false', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*'})

@app.on_event('shutdown')
async def shutdown_db_client():
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown()
    client.close()
static_dir = ROOT_DIR / 'static'

@app.websocket('/ws/orders/{seller_channel}')
async def websocket_endpoint(websocket: WebSocket, seller_channel: str):
    if seller_channel == '__group__' or is_valid_object_id(seller_channel):
        seller_id = seller_channel
    else:
        legacy_seller = await find_unique_legacy_seller(seller_channel)
        if not legacy_seller:
            await websocket.close(code=1008)
            return
        seller_id = str(legacy_seller['_id'])
    await manager.connect(websocket, seller_id)
    try:
        while True:
            data = await websocket.receive_text()
    except Exception:
        manager.disconnect(websocket, seller_id)
