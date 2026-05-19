import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { AlertCircle, Users, ArrowRight, Eye, EyeOff } from 'lucide-react';

const RegisterPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nextOfKinName, setNextOfKinName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

    if (!phone || phone.trim().length < 7) {
      setError('Phone number is required');
      return;
    }

    if (!nextOfKinName.trim()) {
      setError('Next of kin name is required');
      return;
    }

    if (nationalId.trim() && nationalId.trim().length !== 14) {
      setError('National ID must be exactly 14 characters if provided');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await register(
        name,
        phone.trim(),
        password,
        email.trim() || null,
        nextOfKinName.trim(),
        nationalId.trim() || null
      );
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
            <img 
              src="/logo.jpg" 
              alt="Class One Logo"
              className="w-16 h-16 rounded-full object-cover border-2 border-white/30"
            />
            <h1 className="text-2xl font-bold font-['Manrope']">Class One Savings</h1>
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
              <img 
                src="/logo.jpg" 
                alt="Class One Logo"
                className="w-10 h-10 rounded-full object-cover"
              />
              <span className="text-xl font-bold font-['Manrope'] text-[#1E231F]">Class One Savings</span>
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
                <Label htmlFor="phone" className="text-[#1E231F] font-medium">Phone Number <span className="text-[#D05A49]">*</span></Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0700000000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  data-testid="register-phone-input"
                  className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nextOfKinName" className="text-[#1E231F] font-medium">Next of kin's name <span className="text-[#D05A49]">*</span></Label>
                <Input
                  id="nextOfKinName"
                  type="text"
                  placeholder="Jane Doe"
                  value={nextOfKinName}
                  onChange={(e) => setNextOfKinName(e.target.value)}
                  required
                  data-testid="register-next-of-kin-input"
                  className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nationalId" className="text-[#1E231F] font-medium">National ID <span className="text-[#5C665D] font-normal text-xs">(optional)</span></Label>
                <Input
                  id="nationalId"
                  type="text"
                  placeholder="14 characters"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  data-testid="register-national-id-input"
                  className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                />
                <p className="text-xs text-[#5C665D]">If provided, National ID must be exactly 14 characters.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#1E231F] font-medium">Email <span className="text-[#5C665D] font-normal text-xs">(optional)</span></Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="register-email-input"
                  className="h-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#1E231F] font-medium">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="register-password-input"
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

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-[#1E231F] font-medium">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    data-testid="register-confirm-password-input"
                    className="h-11 pr-11 border-[#E8EBE8] focus:ring-[#2C5530] focus:border-[#2C5530]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-3 flex items-center text-[#5C665D] hover:text-[#1E231F]"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
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
