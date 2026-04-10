import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { AlertCircle, Users, ArrowRight } from 'lucide-react';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
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
              src="/logo.jpg" 
              alt="Class One Logo"
              className="w-16 h-16 rounded-full object-cover border-2 border-white/30"
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
                src="/logo.jpg" 
                alt="Class One Logo"
                className="w-10 h-10 rounded-full object-cover"
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
                <Label htmlFor="email" className="text-[#1E231F] font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="login-email-input"
                  className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#1E231F] font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="login-password-input"
                  className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                />
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
