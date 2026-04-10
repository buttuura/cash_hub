import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { AlertCircle, Users, ArrowRight } from 'lucide-react';

const RegisterPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await register(name, email, password, phone);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Registration failed');
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
          backgroundImage: 'url(https://images.unsplash.com/photo-1775172990797-dac8556f2669?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzl8MHwxfHNlYXJjaHwxfHxjb21tdW5pdHklMjBncm91cCUyMGNvbGxhYm9yYXRpb258ZW58MHx8fHwxNzc1ODE5OTAzfDA&ixlib=rb-4.1.0&q=85)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="absolute inset-0 bg-[#2C5530]/80" />
        <div className="relative z-10 flex flex-col justify-center px-12 text-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold font-['Manrope']">Group Cash Hub</h1>
          </div>
          <h2 className="text-4xl font-extrabold font-['Manrope'] mb-4 leading-tight">
            Join Your<br />Community Savings
          </h2>
          <p className="text-white/80 text-lg max-w-md">
            Start saving with your group today. Track contributions, request loans, and grow together financially.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#FAFAF8]">
        <Card className="w-full max-w-md border border-[#E8EBE8] shadow-sm">
          <CardHeader className="space-y-1">
            <div className="lg:hidden flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-[#2C5530] rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold font-['Manrope'] text-[#1E231F]">Group Cash Hub</span>
            </div>
            <CardTitle className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">
              Create an account
            </CardTitle>
            <CardDescription className="text-[#5C665D]">
              Join the savings group to start your journey
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
                <Label htmlFor="name" className="text-[#1E231F] font-medium">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  data-testid="register-name-input"
                  className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#1E231F] font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="register-email-input"
                  className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-[#1E231F] font-medium">Phone (Optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+256 700 000 000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  data-testid="register-phone-input"
                  className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#1E231F] font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="register-password-input"
                  className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-[#1E231F] font-medium">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  data-testid="register-confirm-password-input"
                  className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                data-testid="register-submit-button"
                className="w-full h-11 bg-[#2C5530] hover:bg-[#214024] text-white rounded-full font-semibold flex items-center justify-center gap-2"
              >
                {loading ? 'Creating account...' : 'Create Account'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-[#5C665D]">
                Already have an account?{' '}
                <Link 
                  to="/login" 
                  className="text-[#2C5530] font-semibold hover:underline"
                  data-testid="login-link"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RegisterPage;
