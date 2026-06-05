import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      return;
    }

    if (!API_URL) {
      setError('Backend URL is not configured. Add REACT_APP_BACKEND_URL=http://localhost:8000 to frontend/.env.local.');
      setLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/api/auth/me`, {
        headers: getAuthHeaders(),
      });
      setUser(response.data);
    } catch (err) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      setUser(null);
      setError(getBackendErrorMessage(err, 'Session validation failed'));
    } finally {
      setLoading(false);
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
      setUser(userData);
      return userData;
    } catch (err) {
      const errorMsg = getBackendErrorMessage(err, 'Login failed');
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  };

  const register = async (name, phone, password, email, nextOfKinName, nationalId) => {
    setError(null);
    try {
      if (!API_URL) {
        const missingUrlError = 'Backend URL is not configured. Add REACT_APP_BACKEND_URL=http://localhost:8000 to frontend/.env.local and restart the app.';
        setError(missingUrlError);
        throw new Error(missingUrlError);
      }
      const payload = { name, phone, password, next_of_kin_name: nextOfKinName };
      if (email) payload.email = email;
      if (nationalId) payload.national_id = nationalId;
      const response = await axios.post(`${API_URL}/api/auth/register`, payload);
      const { access_token, refresh_token, ...userData } = response.data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
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
    setUser(null);
  };

  const refreshUser = async () => {
    await checkAuth();
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    refreshUser,
    getAuthHeaders,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'treasurer',
    isTreasurer: user?.role === 'super_admin' || user?.role === 'treasurer',
    isPremium: user?.membership_type === 'premium',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
