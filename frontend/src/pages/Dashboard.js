import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Users,
  PiggyBank,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  LogOut,
  Menu,
  X,
  Shield,
  Crown,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const formatCurrency = (amount) => {
  return `UGX ${Number(amount || 0).toLocaleString()}`;
};

const Dashboard = () => {
  const { user, logout, getAuthHeaders, isAdmin, isSuperAdmin, isPremium, refreshUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [loans, setLoans] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Form states
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDescription, setDepositDescription] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanReason, setLoanReason] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');

  // Dialog states
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);

  const fetchData = async () => {
    try {
      const headers = getAuthHeaders();
      const [statsRes, depositsRes, loansRes, withdrawalsRes, membersRes] = await Promise.all([
        axios.get(`${API_URL}/api/stats/group`, { headers }),
        axios.get(`${API_URL}/api/deposits`, { headers }),
        axios.get(`${API_URL}/api/loans`, { headers }),
        axios.get(`${API_URL}/api/withdrawals`, { headers }),
        axios.get(`${API_URL}/api/members`, { headers }),
      ]);
      setStats(statsRes.data);
      setDeposits(depositsRes.data);
      setLoans(loansRes.data);
      setWithdrawals(withdrawalsRes.data);
      setMembers(membersRes.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeposit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API_URL}/api/deposits/request`,
        { amount: parseFloat(depositAmount), description: depositDescription },
        { headers: getAuthHeaders() }
      );
      toast.success('Deposit request submitted');
      setDepositDialogOpen(false);
      setDepositAmount('');
      setDepositDescription('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit deposit');
    }
  };

  const handleLoan = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API_URL}/api/loans/request`,
        { amount: parseFloat(loanAmount), reason: loanReason },
        { headers: getAuthHeaders() }
      );
      toast.success('Loan request submitted');
      setLoanDialogOpen(false);
      setLoanAmount('');
      setLoanReason('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit loan request');
    }
  };

  const handleWithdrawal = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API_URL}/api/withdrawals/request`,
        { amount: parseFloat(withdrawalAmount), reason: withdrawalReason },
        { headers: getAuthHeaders() }
      );
      toast.success('Withdrawal request submitted');
      setWithdrawalDialogOpen(false);
      setWithdrawalAmount('');
      setWithdrawalReason('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit withdrawal');
    }
  };

  const handleApproveTransaction = async (type, id, approved) => {
    try {
      await axios.post(
        `${API_URL}/api/${type}/approve`,
        { transaction_id: id, approved },
        { headers: getAuthHeaders() }
      );
      toast.success(`${type.slice(0, -1)} ${approved ? 'approved' : 'rejected'}`);
      fetchData();
      refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    }
  };

  const handleSetRole = async (userId, newRole) => {
    try {
      await axios.post(
        `${API_URL}/api/admin/set-role`,
        { user_id: userId, new_role: newRole },
        { headers: getAuthHeaders() }
      );
      toast.success(`Role updated to ${newRole}`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update role');
    }
  };

  const handleSetMembership = async (userId, membershipType) => {
    try {
      await axios.post(
        `${API_URL}/api/admin/set-membership`,
        { user_id: userId, membership_type: membershipType },
        { headers: getAuthHeaders() }
      );
      toast.success(`Membership updated to ${membershipType}`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update membership');
    }
  };

  const handleDeleteMember = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this member?')) return;
    try {
      await axios.delete(`${API_URL}/api/members/${userId}`, { headers: getAuthHeaders() });
      toast.success('Member deleted');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete member');
    }
  };

  const handleMarkLoanRepaid = async (loanId) => {
    try {
      await axios.post(`${API_URL}/api/loans/${loanId}/repay`, {}, { headers: getAuthHeaders() });
      toast.success('Loan marked as repaid');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to mark loan as repaid');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-[#E8B25C]/20 text-[#E8B25C] border-[#E8B25C]/30',
      approved: 'bg-[#347242]/20 text-[#347242] border-[#347242]/30',
      rejected: 'bg-[#D05A49]/20 text-[#D05A49] border-[#D05A49]/30',
      repaid: 'bg-[#2C5530]/20 text-[#2C5530] border-[#2C5530]/30',
    };
    const icons = {
      pending: <Clock className="w-3 h-3" />,
      approved: <CheckCircle className="w-3 h-3" />,
      rejected: <XCircle className="w-3 h-3" />,
      repaid: <CheckCircle className="w-3 h-3" />,
    };
    return (
      <Badge className={`${styles[status]} flex items-center gap-1 border`}>
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: Wallet },
    { id: 'deposits', label: 'Deposits', icon: TrendingUp },
    { id: 'loans', label: 'Loans', icon: CreditCard },
    { id: 'withdrawals', label: 'Withdrawals', icon: TrendingDown },
    { id: 'members', label: 'Members', icon: Users },
  ];

  if (isAdmin) {
    navItems.push({ id: 'admin', label: 'Admin Panel', icon: Shield });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="text-[#5C665D]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <Toaster position="top-right" richColors />
      
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/90 border-b border-[#E8EBE8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2C5530] rounded-full flex items-center justify-center">
                <PiggyBank className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold font-['Manrope'] text-[#1E231F]">Group Cash Hub</span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  data-testid={`nav-${item.id}`}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    activeTab === item.id
                      ? 'bg-[#2C5530] text-white'
                      : 'text-[#5C665D] hover:bg-[#E8EBE8]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2">
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#1E231F]">{user?.name}</p>
                  <div className="flex items-center gap-1">
                    <Badge
                      className={
                        user?.membership_type === 'premium'
                          ? 'bg-[#2C5530]/10 text-[#2C5530] text-xs'
                          : 'bg-[#5C665D]/10 text-[#5C665D] text-xs'
                      }
                    >
                      {user?.membership_type === 'premium' ? (
                        <Crown className="w-3 h-3 mr-1" />
                      ) : null}
                      {user?.membership_type}
                    </Badge>
                    {(user?.role === 'admin' || user?.role === 'super_admin') && (
                      <Badge className="bg-[#D48C70]/10 text-[#D48C70] text-xs">
                        {user?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                data-testid="logout-button"
                className="text-[#5C665D] hover:text-[#D05A49] hover:bg-[#D05A49]/10"
              >
                <LogOut className="w-5 h-5" />
              </Button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-[#5C665D]"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#E8EBE8] bg-white p-4">
            <div className="flex flex-col gap-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activeTab === item.id
                      ? 'bg-[#2C5530] text-white'
                      : 'text-[#5C665D] hover:bg-[#E8EBE8]'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Group Balance */}
              <Card className="md:col-span-2 bg-[#2C5530] border-none shadow-lg card-hover" data-testid="total-balance-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/70 text-sm font-medium uppercase tracking-wide">Total Group Balance</p>
                      <p className="text-4xl font-extrabold text-white font-numbers mt-2">
                        {formatCurrency(stats?.total_group_balance)}
                      </p>
                      <p className="text-white/70 text-sm mt-2">
                        {stats?.total_members} members contributing
                      </p>
                    </div>
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                      <Wallet className="w-8 h-8 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* My Savings */}
              <Card className="bg-white border border-[#E8EBE8] shadow-sm card-hover" data-testid="my-savings-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[#5C665D] text-sm font-medium uppercase tracking-wide">My Savings</p>
                      <p className="text-2xl font-bold text-[#1E231F] font-numbers mt-2">
                        {formatCurrency(user?.total_savings)}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-[#347242]/10 rounded-full flex items-center justify-center">
                      <PiggyBank className="w-6 h-6 text-[#347242]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Active Loans */}
              <Card className="bg-white border border-[#E8EBE8] shadow-sm card-hover" data-testid="active-loans-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[#5C665D] text-sm font-medium uppercase tracking-wide">Active Loans</p>
                      <p className="text-2xl font-bold text-[#1E231F] font-numbers mt-2">
                        {formatCurrency(stats?.active_loans_amount)}
                      </p>
                      <p className="text-[#5C665D] text-xs mt-1">
                        {stats?.active_loans_count} active
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-[#D48C70]/10 rounded-full flex items-center justify-center">
                      <CreditCard className="w-6 h-6 text-[#D48C70]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    data-testid="deposit-button"
                    className="h-14 bg-[#2C5530] hover:bg-[#214024] text-white rounded-xl font-semibold flex items-center justify-center gap-2"
                  >
                    <ArrowUpRight className="w-5 h-5" />
                    Make Deposit
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-['Manrope'] text-[#1E231F]">Request Deposit</DialogTitle>
                    <DialogDescription className="text-[#5C665D]">
                      Submit a deposit request for admin approval
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleDeposit} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="depositAmount">Amount (UGX)</Label>
                      <Input
                        id="depositAmount"
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="55000"
                        required
                        min="1"
                        data-testid="deposit-amount-input"
                        className="border-[#E8EBE8]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="depositDescription">Description (Optional)</Label>
                      <Textarea
                        id="depositDescription"
                        value={depositDescription}
                        onChange={(e) => setDepositDescription(e.target.value)}
                        placeholder="Monthly contribution..."
                        data-testid="deposit-description-input"
                        className="border-[#E8EBE8]"
                      />
                    </div>
                    <Button
                      type="submit"
                      data-testid="deposit-submit"
                      className="w-full bg-[#2C5530] hover:bg-[#214024] rounded-full"
                    >
                      Submit Request
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    data-testid="loan-button"
                    disabled={!isPremium}
                    className={`h-14 rounded-xl font-semibold flex items-center justify-center gap-2 ${
                      isPremium
                        ? 'bg-[#D48C70] hover:bg-[#BD7B60] text-white'
                        : 'bg-[#E8EBE8] text-[#5C665D] cursor-not-allowed'
                    }`}
                  >
                    <CreditCard className="w-5 h-5" />
                    Request Loan
                    {!isPremium && <span className="text-xs">(Premium Only)</span>}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-['Manrope'] text-[#1E231F]">Request Loan</DialogTitle>
                    <DialogDescription className="text-[#5C665D]">
                      Maximum loan amount: UGX 600,000
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleLoan} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="loanAmount">Amount (UGX)</Label>
                      <Input
                        id="loanAmount"
                        type="number"
                        value={loanAmount}
                        onChange={(e) => setLoanAmount(e.target.value)}
                        placeholder="100000"
                        required
                        min="1"
                        max="600000"
                        data-testid="loan-amount-input"
                        className="border-[#E8EBE8]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loanReason">Reason</Label>
                      <Textarea
                        id="loanReason"
                        value={loanReason}
                        onChange={(e) => setLoanReason(e.target.value)}
                        placeholder="Reason for loan..."
                        data-testid="loan-reason-input"
                        className="border-[#E8EBE8]"
                      />
                    </div>
                    <Button
                      type="submit"
                      data-testid="loan-submit"
                      className="w-full bg-[#D48C70] hover:bg-[#BD7B60] rounded-full"
                    >
                      Submit Request
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    data-testid="withdrawal-button"
                    variant="outline"
                    className="h-14 border-[#E8EBE8] text-[#1E231F] hover:bg-[#E8EBE8] rounded-xl font-semibold flex items-center justify-center gap-2"
                  >
                    <ArrowDownRight className="w-5 h-5" />
                    Request Withdrawal
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-['Manrope'] text-[#1E231F]">Request Withdrawal</DialogTitle>
                    <DialogDescription className="text-[#5C665D]">
                      Your available balance: {formatCurrency(user?.total_savings)}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleWithdrawal} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="withdrawalAmount">Amount (UGX)</Label>
                      <Input
                        id="withdrawalAmount"
                        type="number"
                        value={withdrawalAmount}
                        onChange={(e) => setWithdrawalAmount(e.target.value)}
                        placeholder="50000"
                        required
                        min="1"
                        max={user?.total_savings || 0}
                        data-testid="withdrawal-amount-input"
                        className="border-[#E8EBE8]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="withdrawalReason">Reason</Label>
                      <Textarea
                        id="withdrawalReason"
                        value={withdrawalReason}
                        onChange={(e) => setWithdrawalReason(e.target.value)}
                        placeholder="Reason for withdrawal..."
                        data-testid="withdrawal-reason-input"
                        className="border-[#E8EBE8]"
                      />
                    </div>
                    <Button
                      type="submit"
                      data-testid="withdrawal-submit"
                      className="w-full bg-[#2C5530] hover:bg-[#214024] rounded-full"
                    >
                      Submit Request
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Recent Activity */}
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardHeader>
                <CardTitle className="font-['Manrope'] text-[#1E231F]">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {deposits.slice(0, 5).map((d) => (
                    <div key={d.id} className="flex items-center justify-between py-3 border-b border-[#E8EBE8] last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#347242]/10 rounded-full flex items-center justify-center">
                          <ArrowUpRight className="w-5 h-5 text-[#347242]" />
                        </div>
                        <div>
                          <p className="font-medium text-[#1E231F]">Deposit</p>
                          <p className="text-sm text-[#5C665D]">{d.description || 'No description'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-[#347242] font-numbers">{formatCurrency(d.amount)}</p>
                        {getStatusBadge(d.status)}
                      </div>
                    </div>
                  ))}
                  {deposits.length === 0 && (
                    <p className="text-center text-[#5C665D] py-4">No recent activity</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'deposits' && (
          <div className="space-y-6 animate-fade-in" data-testid="deposits-tab">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Deposits</h2>
              <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-[#2C5530] hover:bg-[#214024] rounded-full">
                    <Plus className="w-4 h-4 mr-2" />
                    New Deposit
                  </Button>
                </DialogTrigger>
              </Dialog>
            </div>
            
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#E8EBE8] bg-[#FAFAF8]">
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Date</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Amount</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Description</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deposits.map((d) => (
                        <tr key={d.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5] transition-colors">
                          <td className="py-4 px-6 text-[#1E231F]">
                            {new Date(d.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-6 font-semibold text-[#347242] font-numbers">
                            {formatCurrency(d.amount)}
                          </td>
                          <td className="py-4 px-6 text-[#5C665D]">{d.description || '-'}</td>
                          <td className="py-4 px-6">{getStatusBadge(d.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {deposits.length === 0 && (
                    <p className="text-center text-[#5C665D] py-8">No deposits yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'loans' && (
          <div className="space-y-6 animate-fade-in" data-testid="loans-tab">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Loans</h2>
              {isPremium && (
                <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-[#D48C70] hover:bg-[#BD7B60] rounded-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Request Loan
                    </Button>
                  </DialogTrigger>
                </Dialog>
              )}
            </div>

            {!isPremium && (
              <Card className="bg-[#E8B25C]/10 border border-[#E8B25C]/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <Crown className="w-5 h-5 text-[#E8B25C]" />
                  <p className="text-[#1E231F]">
                    Only premium members can request loans. Contact an admin to upgrade your membership.
                  </p>
                </CardContent>
              </Card>
            )}
            
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#E8EBE8] bg-[#FAFAF8]">
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Date</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Amount</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Reason</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loans.map((l) => (
                        <tr key={l.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5] transition-colors">
                          <td className="py-4 px-6 text-[#1E231F]">
                            {new Date(l.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-6 font-semibold text-[#D48C70] font-numbers">
                            {formatCurrency(l.amount)}
                          </td>
                          <td className="py-4 px-6 text-[#5C665D]">{l.reason || '-'}</td>
                          <td className="py-4 px-6">{getStatusBadge(l.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {loans.length === 0 && (
                    <p className="text-center text-[#5C665D] py-8">No loans yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'withdrawals' && (
          <div className="space-y-6 animate-fade-in" data-testid="withdrawals-tab">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Withdrawals</h2>
              <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-[#E8EBE8] rounded-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Request Withdrawal
                  </Button>
                </DialogTrigger>
              </Dialog>
            </div>
            
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#E8EBE8] bg-[#FAFAF8]">
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Date</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Amount</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Reason</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawals.map((w) => (
                        <tr key={w.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5] transition-colors">
                          <td className="py-4 px-6 text-[#1E231F]">
                            {new Date(w.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-6 font-semibold text-[#D05A49] font-numbers">
                            {formatCurrency(w.amount)}
                          </td>
                          <td className="py-4 px-6 text-[#5C665D]">{w.reason || '-'}</td>
                          <td className="py-4 px-6">{getStatusBadge(w.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {withdrawals.length === 0 && (
                    <p className="text-center text-[#5C665D] py-8">No withdrawals yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-6 animate-fade-in" data-testid="members-tab">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Members</h2>
              <div className="flex items-center gap-2 text-sm text-[#5C665D]">
                <Users className="w-4 h-4" />
                {members.length} members
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {members.map((m) => (
                <Card key={m.id} className="bg-white border border-[#E8EBE8] shadow-sm card-hover">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 bg-[#2C5530]/10 rounded-full flex items-center justify-center">
                        <span className="text-lg font-bold text-[#2C5530]">
                          {m.name?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          className={
                            m.membership_type === 'premium'
                              ? 'bg-[#2C5530]/10 text-[#2C5530]'
                              : 'bg-[#5C665D]/10 text-[#5C665D]'
                          }
                        >
                          {m.membership_type}
                        </Badge>
                        {(m.role === 'admin' || m.role === 'super_admin') && (
                          <Badge className="bg-[#D48C70]/10 text-[#D48C70]">
                            {m.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <h3 className="font-semibold text-[#1E231F] mb-1">{m.name}</h3>
                    <p className="text-sm text-[#5C665D] mb-3">{m.email}</p>
                    <div className="pt-3 border-t border-[#E8EBE8]">
                      <p className="text-sm text-[#5C665D]">Total Savings</p>
                      <p className="text-lg font-bold text-[#347242] font-numbers">
                        {formatCurrency(m.total_savings)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'admin' && isAdmin && (
          <div className="space-y-8 animate-fade-in" data-testid="admin-tab">
            <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Admin Panel</h2>

            {/* Pending Approvals */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Pending Deposits */}
              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                    <ArrowUpRight className="w-5 h-5 text-[#347242]" />
                    Pending Deposits ({stats?.pending_deposits || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {deposits.filter(d => d.status === 'pending').map((d) => (
                    <div key={d.id} className="p-3 bg-[#FAFAF8] rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-[#1E231F]">{d.user_name}</span>
                        <span className="font-semibold text-[#347242] font-numbers">{formatCurrency(d.amount)}</span>
                      </div>
                      <p className="text-xs text-[#5C665D] mb-2">{d.description || 'No description'}</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveTransaction('deposits', d.id, true)}
                          className="flex-1 bg-[#347242] hover:bg-[#2C5530] text-xs"
                          data-testid={`approve-deposit-${d.id}`}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApproveTransaction('deposits', d.id, false)}
                          className="flex-1 border-[#D05A49] text-[#D05A49] hover:bg-[#D05A49]/10 text-xs"
                          data-testid={`reject-deposit-${d.id}`}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                  {deposits.filter(d => d.status === 'pending').length === 0 && (
                    <p className="text-center text-[#5C665D] py-4 text-sm">No pending deposits</p>
                  )}
                </CardContent>
              </Card>

              {/* Pending Loans */}
              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-[#D48C70]" />
                    Pending Loans ({stats?.pending_loans || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loans.filter(l => l.status === 'pending').map((l) => (
                    <div key={l.id} className="p-3 bg-[#FAFAF8] rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-[#1E231F]">{l.user_name}</span>
                        <span className="font-semibold text-[#D48C70] font-numbers">{formatCurrency(l.amount)}</span>
                      </div>
                      <p className="text-xs text-[#5C665D] mb-2">{l.reason || 'No reason'}</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveTransaction('loans', l.id, true)}
                          className="flex-1 bg-[#347242] hover:bg-[#2C5530] text-xs"
                          data-testid={`approve-loan-${l.id}`}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApproveTransaction('loans', l.id, false)}
                          className="flex-1 border-[#D05A49] text-[#D05A49] hover:bg-[#D05A49]/10 text-xs"
                          data-testid={`reject-loan-${l.id}`}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                  {loans.filter(l => l.status === 'pending').length === 0 && (
                    <p className="text-center text-[#5C665D] py-4 text-sm">No pending loans</p>
                  )}
                </CardContent>
              </Card>

              {/* Pending Withdrawals */}
              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                    <ArrowDownRight className="w-5 h-5 text-[#D05A49]" />
                    Pending Withdrawals ({stats?.pending_withdrawals || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {withdrawals.filter(w => w.status === 'pending').map((w) => (
                    <div key={w.id} className="p-3 bg-[#FAFAF8] rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-[#1E231F]">{w.user_name}</span>
                        <span className="font-semibold text-[#D05A49] font-numbers">{formatCurrency(w.amount)}</span>
                      </div>
                      <p className="text-xs text-[#5C665D] mb-2">{w.reason || 'No reason'}</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveTransaction('withdrawals', w.id, true)}
                          className="flex-1 bg-[#347242] hover:bg-[#2C5530] text-xs"
                          data-testid={`approve-withdrawal-${w.id}`}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApproveTransaction('withdrawals', w.id, false)}
                          className="flex-1 border-[#D05A49] text-[#D05A49] hover:bg-[#D05A49]/10 text-xs"
                          data-testid={`reject-withdrawal-${w.id}`}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                  {withdrawals.filter(w => w.status === 'pending').length === 0 && (
                    <p className="text-center text-[#5C665D] py-4 text-sm">No pending withdrawals</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Active Loans (for marking as repaid) */}
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardHeader>
                <CardTitle className="font-['Manrope'] text-[#1E231F]">Active Loans</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {loans.filter(l => l.status === 'approved' && !l.repaid).map((l) => (
                    <div key={l.id} className="flex items-center justify-between p-4 bg-[#FAFAF8] rounded-xl">
                      <div>
                        <p className="font-medium text-[#1E231F]">{l.user_name}</p>
                        <p className="text-sm text-[#5C665D]">{l.user_email}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-[#D48C70] font-numbers">{formatCurrency(l.amount)}</p>
                        <Button
                          size="sm"
                          onClick={() => handleMarkLoanRepaid(l.id)}
                          className="mt-2 bg-[#347242] hover:bg-[#2C5530]"
                          data-testid={`repay-loan-${l.id}`}
                        >
                          Mark as Repaid
                        </Button>
                      </div>
                    </div>
                  ))}
                  {loans.filter(l => l.status === 'approved' && !l.repaid).length === 0 && (
                    <p className="text-center text-[#5C665D] py-4">No active loans</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Member Management (Super Admin only) */}
            {isSuperAdmin && (
              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardHeader>
                  <CardTitle className="font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                    <Shield className="w-5 h-5 text-[#D48C70]" />
                    Member Management (Super Admin)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#E8EBE8] bg-[#FAFAF8]">
                          <th className="text-left py-3 px-4 text-sm font-semibold text-[#5C665D]">Member</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-[#5C665D]">Role</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-[#5C665D]">Membership</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-[#5C665D]">Savings</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-[#5C665D]">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.filter(m => m.role !== 'super_admin').map((m) => (
                          <tr key={m.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5]">
                            <td className="py-3 px-4">
                              <p className="font-medium text-[#1E231F]">{m.name}</p>
                              <p className="text-xs text-[#5C665D]">{m.email}</p>
                            </td>
                            <td className="py-3 px-4">
                              <select
                                value={m.role}
                                onChange={(e) => handleSetRole(m.id, e.target.value)}
                                className="text-sm border border-[#E8EBE8] rounded-lg px-2 py-1 bg-white"
                                data-testid={`role-select-${m.id}`}
                              >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                              </select>
                            </td>
                            <td className="py-3 px-4">
                              <select
                                value={m.membership_type}
                                onChange={(e) => handleSetMembership(m.id, e.target.value)}
                                className="text-sm border border-[#E8EBE8] rounded-lg px-2 py-1 bg-white"
                                data-testid={`membership-select-${m.id}`}
                              >
                                <option value="ordinary">Ordinary</option>
                                <option value="premium">Premium</option>
                              </select>
                            </td>
                            <td className="py-3 px-4 font-numbers text-[#347242]">
                              {formatCurrency(m.total_savings)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteMember(m.id)}
                                className="border-[#D05A49] text-[#D05A49] hover:bg-[#D05A49]/10"
                                data-testid={`delete-member-${m.id}`}
                              >
                                Delete
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
