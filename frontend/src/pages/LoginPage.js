import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { AlertCircle, Users, ArrowRight, Eye, EyeOff, KeyRound, Loader2, CheckCircle, MessageCircle } from 'lucide-react';

const LoginPage = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [sentOpen, setSentOpen] = useState(false);
  const [forgotPhone, setForgotPhone] = useState('');
  const [resetPhone, setResetPhone] = useState('');
  const [sentPhone, setSentPhone] = useState('');
  const [sentTempPassword, setSentTempPassword] = useState('');
  const [sentWhatsAppUrl, setSentWhatsAppUrl] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(identifier, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotLoading(true);
    try {
      const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
      const response = await axios.post(`${API_URL}/api/auth/forgot-password`, {
        phone: forgotPhone,
      });
      setForgotOpen(false);
      setSentPhone(forgotPhone);
      setSentTempPassword(response.data.temp_password || '');
      setSentWhatsAppUrl(response.data.whatsapp_url || '');
      setSentOpen(true);
    } catch (err) {
      setForgotError(err.response?.data?.detail || err.message || 'Failed to send recovery code');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleProceedToReset = () => {
    setSentOpen(false);
    setResetPhone(sentPhone);
    setTempPassword(sentTempPassword);
    setResetOpen(true);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters');
      return;
    }
    setResetLoading(true);
    try {
      const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
      await axios.post(`${API_URL}/api/auth/reset-password`, {
        phone: resetPhone,
        temp_password: tempPassword,
        new_password: newPassword,
      });
      setResetSuccess('Password reset successfully! You can now log in with your new password.');
      setTempPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setResetOpen(false);
        setResetSuccess('');
      }, 3000);
    } catch (err) {
      setResetError(err.response?.data?.detail || err.message || 'Failed to reset password');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Image */}
      <div 
        className="hidden lg:flex lg:w-1/2 relative"
        style={{
          backgroundImage: 'url(https://images.pexels.com/photos/6109006/pexels-photo-6109006.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="absolute inset-0 bg-[#2C5530]/80" />
        <div className="relative z-10 flex flex-col justify-center px-12 text-white">
          <div className="flex items-center gap-3 mb-6">
            <img 
              src="/logo.png" 
              alt="Class One Logo"
              className="w-20 h-20 rounded-full object-cover border-2 border-white/30"
            />
            <h1 className="text-2xl font-bold font-['Manrope']">Class One Savings</h1>
          </div>
          <h2 className="text-4xl font-extrabold font-['Manrope'] mb-4 leading-tight">
            Manage Your Group<br />Savings Together
          </h2>
          <p className="text-white/80 text-lg max-w-md">
            A simple and secure way to manage group finances, track deposits, and handle loans with full transparency.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#FAFAF8]">
        <Card className="w-full max-w-md border border-[#E8EBE8] shadow-sm">
          <CardHeader className="space-y-1">
            <div className="lg:hidden flex items-center gap-2 mb-4">
              <img 
                src="/logo.png" 
                alt="Class One Logo"
                className="w-16 h-16 rounded-full object-cover"
              />
              <span className="text-xl font-bold font-['Manrope'] text-[#1E231F]">Class One Savings</span>
            </div>
            <CardTitle className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">
              Welcome back
            </CardTitle>
            <CardDescription className="text-[#5C665D]">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-[#D05A49]/10 text-[#D05A49] text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-[#1E231F] font-medium">Phone Number <span className="text-[#5C665D] font-normal text-xs">(or email)</span></Label>
                <Input
                  id="identifier"
                  type="text"
                  placeholder="0700000000"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  data-testid="login-identifier-input"
                  className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#1E231F] font-medium">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="login-password-input"
                    className="h-11 pr-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-3 flex items-center text-[#5C665D] hover:text-[#1E231F]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                data-testid="login-submit-button"
                className="w-full h-11 bg-[#2C5530] hover:bg-[#214024] text-white rounded-full font-semibold flex items-center justify-center gap-2"
              >
                {loading ? 'Signing in...' : 'Sign In'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </Button>
            </form>

            <div className="mt-2 text-center">
              <Button
                variant="link"
                className="text-[#2C5530] text-sm font-medium p-0 h-auto"
                onClick={() => { setForgotOpen(true); setForgotError(''); }}
              >
                Forgot password?
              </Button>
            </div>

            <div className="mt-4 flex justify-center">
              <Button
                onClick={() => navigate('/shop')}
                variant="outline"
                className="border-[#2C5530] text-[#2C5530] hover:bg-[#ECF8E9]"
              >
                Browse shop
              </Button>
            </div>

            <div className="mt-6 text-center">
              <p className="text-[#5C665D]">
                Don't have an account?{' '}
                <Link 
                  to="/register" 
                  className="text-[#2C5530] font-semibold hover:underline"
                  data-testid="register-link"
                >
                  Sign up
                </Link>
              </p>
            </div>

            <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-[#1E231F] flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-[#2C5530]" />
                    Recover Password
                  </DialogTitle>
                  <DialogDescription className="text-[#5C665D]">
                    Enter your registered WhatsApp number to receive a temporary password.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleForgotPassword} className="space-y-4 mt-4">
                  {forgotError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-[#D05A49]/10 text-[#D05A49] text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{forgotError}</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="forgot-phone" className="text-[#1E231F] font-medium">WhatsApp Number</Label>
                    <Input
                      id="forgot-phone"
                      type="tel"
                      placeholder="0700000000"
                      value={forgotPhone}
                      onChange={(e) => setForgotPhone(e.target.value)}
                      required
                      className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full h-11 bg-[#2C5530] hover:bg-[#214024] text-white rounded-full font-semibold flex items-center justify-center gap-2"
                  >
                    {forgotLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : 'Send Temporary Password'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={resetOpen} onOpenChange={setResetOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-[#1E231F] flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-[#2C5530]" />
                    Reset Password
                  </DialogTitle>
                  <DialogDescription className="text-[#5C665D]">
                    Enter the temporary password sent to your WhatsApp and choose a new password.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleResetPassword} className="space-y-4 mt-4">
                  {resetError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-[#D05A49]/10 text-[#D05A49] text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{resetError}</span>
                    </div>
                  )}
                  {resetSuccess && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-[#347242]/10 text-[#347242] text-sm">
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{resetSuccess}</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="reset-phone" className="text-[#1E231F] font-medium">WhatsApp Number</Label>
                    <Input
                      id="reset-phone"
                      type="tel"
                      placeholder="0700000000"
                      value={resetPhone}
                      onChange={(e) => setResetPhone(e.target.value)}
                      required
                      className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="temp-password" className="text-[#1E231F] font-medium">Temporary Password</Label>
                    <Input
                      id="temp-password"
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      required
                      maxLength={6}
                      className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password" className="text-[#1E231F] font-medium">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-[#1E231F] font-medium">Confirm New Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full h-11 bg-[#2C5530] hover:bg-[#214024] text-white rounded-full font-semibold flex items-center justify-center gap-2"
                  >
                    {resetLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Resetting...</> : 'Reset Password'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={sentOpen} onOpenChange={setSentOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-[#1E231F] flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-[#25D366]" />
                    Temporary Password Ready
                  </DialogTitle>
                  <DialogDescription className="text-[#5C665D]">
                    Your temporary password has been generated. Open WhatsApp to receive it, then use it below to reset your password.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  {sentTempPassword && (
                    <div className="p-4 bg-[#FAFAF8] rounded-xl border border-[#E8EBE8] text-center">
                      <p className="text-xs text-[#5C665D] mb-1">Your temporary password</p>
                      <p className="text-2xl font-bold text-[#2C5530] font-numbers tracking-widest">{sentTempPassword}</p>
                      <p className="text-xs text-[#D05A49] mt-1">Expires in 3 minutes</p>
                    </div>
                  )}
                  {sentWhatsAppUrl && (
                    <Button
                      type="button"
                      onClick={() => window.open(sentWhatsAppUrl, '_blank')}
                      className="w-full h-11 bg-[#25D366] hover:bg-[#1EA852] text-white rounded-full font-semibold flex items-center justify-center gap-2"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Open WhatsApp
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={handleProceedToReset}
                    className="w-full h-11 bg-[#2C5530] hover:bg-[#214024] text-white rounded-full font-semibold flex items-center justify-center gap-2"
                  >
                    I have the code
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
