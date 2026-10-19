import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BellRing, Camera, Moon, ShoppingCart, Sun, UserRound } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { useTheme } from 'next-themes';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../lib/api';
import { resolveImageUrl } from '../lib/utils';
import { getOrderSoundEnabled, saveOrderSoundEnabled } from '../lib/notificationSettings';

const SettingsPage = () => {
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const { user, getAuthHeaders, refreshUser } = useAuth();
  const userId = user?.id || user?._id;
  const profileImageInput = useRef(null);
  const [profile, setProfile] = useState(user);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profilePictureUploading, setProfilePictureUploading] = useState(false);
  const [orderSoundEnabled, setOrderSoundEnabled] = useState(() => getOrderSoundEnabled(userId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    axios.get(`${API_URL}/api/auth/me`, { headers: getAuthHeaders() })
      .then(({ data }) => {
        if (active) setProfile(data);
      })
      .catch((error) => {
        console.error('Failed to load account profile:', error);
        if (active) toast.error(error.response?.data?.detail || 'Could not load account profile');
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });

    axios.get(`${API_URL}/api/notification-settings`, { headers: getAuthHeaders() })
      .then(({ data }) => {
        if (!active) return;
        const enabled = Boolean(data.order_sound_enabled);
        setOrderSoundEnabled(enabled);
        saveOrderSoundEnabled(userId, enabled);
      })
      .catch((error) => {
        console.error('Failed to load notification settings:', error);
        if (active) toast.error(error.response?.data?.detail || 'Could not load settings');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [getAuthHeaders, userId]);

  const handleProfilePictureChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Choose a JPEG, PNG, or WebP image');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Profile picture must be 5 MB or smaller');
      event.target.value = '';
      return;
    }

    setProfilePictureUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await axios.post(
        `${API_URL}/api/auth/profile-picture`,
        formData,
        { headers: getAuthHeaders() },
      );
      setProfile((current) => ({ ...current, profile_picture_url: data.profile_picture_url }));
      await refreshUser();
      toast.success('Profile picture updated');
    } catch (error) {
      console.error('Failed to upload profile picture:', error);
      toast.error(error.response?.data?.detail || 'Could not update profile picture');
    } finally {
      setProfilePictureUploading(false);
      event.target.value = '';
    }
  };

  const profileDetails = [
    ['Full name', profile?.name],
    ['Phone number', profile?.phone],
    ['Email address', profile?.email],
    ['Member code', profile?.member_code],
    ['Account role', profile?.role?.replace(/_/g, ' ')],
    ['Membership', profile?.membership_type],
    ['Next of kin', profile?.next_of_kin_name],
    ['Next of kin phone', profile?.next_of_kin_phone],
    ['National ID', profile?.national_id],
    ['Joined', profile?.created_at && new Date(profile.created_at).toLocaleDateString()],
  ].filter(([, value]) => value);

  const handleOrderSoundChange = async (enabled) => {
    setSaving(true);
    try {
      const { data } = await axios.put(
        `${API_URL}/api/notification-settings`,
        { order_sound_enabled: enabled },
        { headers: getAuthHeaders() },
      );
      setOrderSoundEnabled(Boolean(data.order_sound_enabled));
      saveOrderSoundEnabled(userId, Boolean(data.order_sound_enabled));
    } catch (error) {
      console.error('Failed to update notification settings:', error);
      toast.error(error.response?.data?.detail || 'Could not save notification setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      <Toaster position="top-right" richColors />
      <header className="sticky top-0 z-40 border-b border-[#E8EBE8] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 text-[#2C5530]">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" aria-label="Open dashboard" onClick={() => navigate('/dashboard')}>
              <BellRing className="h-5 w-5 text-[#5C665D]" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Open shop" onClick={() => navigate('/shop')}>
              <ShoppingCart className="h-5 w-5 text-[#5C665D]" />
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#2C5530]">Account</p>
          <h1 className="mt-1 text-3xl font-bold text-[#1E231F]">Settings</h1>
          <p className="mt-2 text-sm text-[#5C665D]">Manage preferences for your Cash Hub account.</p>
        </div>

        <Card className="border-[#E8EBE8] shadow-sm">
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
            <CardDescription>View your account information and update your profile picture.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#347242]/10 text-[#347242]">
                {profile?.profile_picture_url ? (
                  <img
                    src={resolveImageUrl(profile.profile_picture_url)}
                    alt={`${profile.name || 'Your'} profile`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserRound className="h-10 w-10" aria-hidden="true" />
                )}
              </div>
              <div className="text-center sm:text-left">
                <h2 className="text-lg font-semibold text-[#1E231F]">{profile?.name || 'Your account'}</h2>
                <p className="mt-1 text-sm text-[#5C665D]">Your profile picture is visible with your account.</p>
                <Input
                  ref={profileImageInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Choose profile picture"
                  className="sr-only"
                  onChange={handleProfilePictureChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 gap-2"
                  disabled={profilePictureUploading}
                  onClick={() => profileImageInput.current?.click()}
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  {profilePictureUploading ? 'Uploading...' : 'Change picture'}
                </Button>
                <p className="mt-2 text-xs text-[#5C665D]">JPEG, PNG, or WebP, up to 5 MB.</p>
              </div>
            </div>

            <div className="border-t border-[#E8EBE8] pt-4">
              <h2 className="mb-3 font-semibold text-[#1E231F]">Account information</h2>
              {profileLoading ? (
                <p className="text-sm text-[#5C665D]">Loading account information...</p>
              ) : (
                <dl className="grid gap-4 sm:grid-cols-2">
                  {profileDetails.map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-[#FAFAF8] p-3">
                      <dt className="text-xs font-medium uppercase tracking-wide text-[#5C665D]">{label}</dt>
                      <dd className="mt-1 break-words text-sm font-medium capitalize text-[#1E231F]">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E8EBE8] shadow-sm">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose the theme used throughout Cash Hub.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-5 rounded-xl border border-[#E8EBE8] bg-white p-4">
              <div className="flex items-center gap-3">
                {resolvedTheme === 'dark' ? (
                  <Moon className="h-5 w-5 text-[#5C665D]" aria-hidden="true" />
                ) : (
                  <Sun className="h-5 w-5 text-[#5C665D]" aria-hidden="true" />
                )}
                <div className="space-y-1">
                  <h2 className="font-semibold text-[#1E231F]">Dark theme</h2>
                  <p className="text-sm text-[#5C665D]">Use a darker appearance across the app.</p>
                </div>
              </div>
              <Switch
                aria-label="Dark theme"
                checked={resolvedTheme === 'dark'}
                onCheckedChange={(enabled) => setTheme(enabled ? 'dark' : 'light')}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E8EBE8] shadow-sm">
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Choose how important activity alerts reach you.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-5 rounded-xl border border-[#E8EBE8] bg-white p-4">
              <div className="space-y-1">
                <h2 className="font-semibold text-[#1E231F]">Repeat sound for new orders</h2>
                <p className="text-sm leading-relaxed text-[#5C665D]">
                  Android repeats the order alert every minute until you tap “I received this order”.
                  While Cash Hub or the web app is open, the sound keeps looping until you confirm receipt.
                  Other notifications stay silent.
                </p>
              </div>
              <Switch
                aria-label="Repeat sound for new orders"
                checked={orderSoundEnabled}
                disabled={loading || saving}
                onCheckedChange={handleOrderSoundChange}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default SettingsPage;
