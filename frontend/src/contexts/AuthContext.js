import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

const API_URL = process.env.REACT_APP_BACKEND_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000');
const BIOMETRIC_SERVER = 'cash-hub-auth';

const AuthContext = createContext(null);

const getBackendErrorMessage = (error, defaultMsg) => {
  const isNetworkError = error?.code === 'ERR_NETWORK' ||
    error?.message?.includes('Network Error') ||
    error?.message?.includes('Connection refused') ||
    (!error?.response && !!error?.message);

  if (!API_URL) {
    return 'Backend URL is not configured. Add REACT_APP_BACKEND_URL=http://localhost:8000 to frontend/.env.local and restart the app.';
  }

  if (isNetworkError) {
    return `Cannot reach backend at ${API_URL}. Make sure the backend server is running and refresh the page.`;
  }

  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((e) => e.msg).join(', ');
  return defaultMsg;
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export const AuthProvider = ({ children }) => {
  const hasToken = typeof window !== 'undefined' && localStorage.getItem('access_token');
  const [user, setUser] = useState(() => {
    const storedUser = hasToken && localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser) : null;
  });
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(!!hasToken);
  const [error, setError] = useState(null);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setInitializing(false);
      return;
    }

    if (!API_URL) {
      setError('Backend URL is not configured. Add REACT_APP_BACKEND_URL=http://localhost:8000 to frontend/.env.local.');
      setInitializing(false);
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/api/auth/me`, {
        headers: getAuthHeaders(),
      });
      setUser(response.data);
      localStorage.setItem('user', JSON.stringify(response.data));
    } catch (err) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      setUser(null);
      setError(getBackendErrorMessage(err, 'Session validation failed'));
    } finally {
      setInitializing(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (identifier, password) => {
    setError(null);
    try {
      if (!API_URL) {
        const missingUrlError = 'Backend URL is not configured. Add REACT_APP_BACKEND_URL=http://localhost:8000 to frontend/.env.local and restart the app.';
        setError(missingUrlError);
        throw new Error(missingUrlError);
      }

      const response = await axios.post(`${API_URL}/api/auth/login`, {
        identifier,
        password,
      });
      const { access_token, refresh_token, ...userData } = response.data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      return userData;
    } catch (err) {
      const errorMsg = getBackendErrorMessage(err, 'Login failed');
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  };

  const getBiometricStatus = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return { available: false, configured: false };

    try {
      const availability = await NativeBiometric.isAvailable();
      if (!availability.isAvailable) return { available: false, configured: false };

      try {
        await NativeBiometric.getCredentials({ server: BIOMETRIC_SERVER });
        return { available: true, configured: true };
      } catch {
        return { available: true, configured: false };
      }
    } catch {
      return { available: false, configured: false };
    }
  }, []);

  const enableBiometric = async (identifier, password) => {
    if (!Capacitor.isNativePlatform()) return;

    await NativeBiometric.verifyIdentity({
      reason: 'Enable biometric login for your Class One Savings account',
      title: 'Enable biometric login',
      subtitle: 'Confirm your identity to continue',
      description: 'Use your fingerprint or face unlock next time',
    });

    await NativeBiometric.setCredentials({
      server: BIOMETRIC_SERVER,
      username: identifier,
      password,
    });
  };

  const loginWithBiometric = async () => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Biometric login is available only in the Android app');
    }

    await NativeBiometric.verifyIdentity({
      reason: 'Unlock your Class One Savings account',
      title: 'Biometric login',
      subtitle: 'Confirm your identity to continue',
      description: 'Use your fingerprint or face unlock',
    });

    const credentials = await NativeBiometric.getCredentials({ server: BIOMETRIC_SERVER });
    return login(credentials.username, credentials.password);
  };

  const register = async (name, phone, password, email, nextOfKinName, nextOfKinPhone, nationalId) => {
    setError(null);
    try {
      if (!API_URL) {
        const missingUrlError = 'Backend URL is not configured. Add REACT_APP_BACKEND_URL=http://localhost:8000 to frontend/.env.local and restart the app.';
        setError(missingUrlError);
        throw new Error(missingUrlError);
      }
      const payload = {
        name,
        phone,
        password,
        next_of_kin_name: nextOfKinName,
        next_of_kin_phone: nextOfKinPhone,
        membership_type: 'seller',
      };
      if (email) payload.email = email;
      if (nationalId) payload.national_id = nationalId;
      const response = await axios.post(`${API_URL}/api/auth/register`, payload);
      const { access_token, refresh_token, ...userData } = response.data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      return userData;
    } catch (err) {
      const errorMsg = getBackendErrorMessage(err, 'Registration failed');
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const refreshUser = async () => {
    await checkAuth();
  };

  const forgotPassword = async (phone) => {
    setError(null);
    try {
      if (!API_URL) {
        const missingUrlError = 'Backend URL is not configured. Add REACT_APP_BACKEND_URL=http://localhost:8000 to frontend/.env.local and restart the app.';
        setError(missingUrlError);
        throw new Error(missingUrlError);
      }
      await axios.post(`${API_URL}/api/auth/forgot-password`, { phone });
    } catch (err) {
      const errorMsg = getBackendErrorMessage(err, 'Failed to send recovery code');
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  };

  const resetPassword = async (phone, tempPassword, newPassword) => {
    setError(null);
    try {
      if (!API_URL) {
        const missingUrlError = 'Backend URL is not configured. Add REACT_APP_BACKEND_URL=http://localhost:8000 to frontend/.env.local and restart the app.';
        setError(missingUrlError);
        throw new Error(missingUrlError);
      }
      const response = await axios.post(`${API_URL}/api/auth/reset-password`, {
        phone,
        temp_password: tempPassword,
        new_password: newPassword,
      });
      return response.data;
    } catch (err) {
      const errorMsg = getBackendErrorMessage(err, 'Failed to reset password');
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  };

  const value = {
    user,
    loading,
    initializing,
    error,
    login,
    getBiometricStatus,
    enableBiometric,
    loginWithBiometric,
    register,
    logout,
    refreshUser,
    forgotPassword,
    resetPassword,
    getAuthHeaders,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'treasurer',
    isTreasurer: user?.role === 'super_admin' || user?.role === 'treasurer',
    isPremium: user?.membership_type === 'premium',
    isSeller: String(user?.membership_type || '').toLowerCase() === 'seller' || user?.role === 'seller',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
