import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { RefreshCw } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from 'sonner';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import ShopPage from './pages/ShopPage';
import CategoryPage from './pages/CategoryPage';
import ProductDetailPage from './pages/ProductDetailPage';
import ServicesManagement from './pages/ServicesManagement';
import NotificationSound from './components/NotificationSound';
import './App.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, initializing } = useAuth();

  const storedToken = typeof window !== 'undefined' && localStorage.getItem('access_token');
  
  if (initializing && !storedToken) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#2C5530] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#5C665D] font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Public Route Component (redirect to dashboard if already logged in)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, initializing } = useAuth();

  if (initializing && isAuthenticated) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      <Route path="/" element={<ShopPage />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/product/:productId" element={<ProductDetailPage />} />
      <Route path="/category/:categoryId" element={<CategoryPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/services-management"
        element={
          <ProtectedRoute>
            <ServicesManagement />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationSound />
        <AppRoutes />
        {Capacitor.getPlatform() === 'android' && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            aria-label="Refresh app"
            title="Refresh app"
            style={{
              position: 'fixed',
              right: 'calc(env(safe-area-inset-right, 0px) + 16px)',
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
              zIndex: 10000,
              display: 'flex',
              width: 48,
              height: 48,
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #E8EBE8',
              borderRadius: '50%',
              background: '#FFFFFF',
              color: '#2C5530',
              boxShadow: '0 2px 8px rgba(30, 35, 31, 0.18)',
            }}
          >
            <RefreshCw size={20} aria-hidden="true" />
          </button>
        )}
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
