import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BellRing, ShoppingCart } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../lib/api';
import { getOrderSoundEnabled, saveOrderSoundEnabled } from '../lib/notificationSettings';

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user, getAuthHeaders } = useAuth();
  const userId = user?.id || user?._id;
  const [orderSoundEnabled, setOrderSoundEnabled] = useState(() => getOrderSoundEnabled(userId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
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
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Choose how important activity alerts reach you.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-5 rounded-xl border border-[#E8EBE8] bg-white p-4">
              <div className="space-y-1">
                <h2 className="font-semibold text-[#1E231F]">Repeat sound for new orders</h2>
                <p className="text-sm leading-relaxed text-[#5C665D]">
                  When enabled, Android repeats order alerts every minute until acknowledged.
                  While Cash Hub or the web app is open, the sound loops until you acknowledge the alert.
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
