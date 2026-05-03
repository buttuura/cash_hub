import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
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
  AlertTriangle,
  Calendar,
  Percent,
  UserCheck,
  DoorOpen,
  DollarSign,
  Receipt,
  Trash2,
  BarChart3,
  MessageCircle,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import {
  exportDepositsPDF,
  exportLoansPDF,
  exportWithdrawalsPDF,
  exportPettyCashPDF,
  exportFullGroupReportPDF,
} from '../utils/pdfExport';
import { FileDown } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const formatCurrency = (amount) => {
  return `UGX ${Number(amount || 0).toLocaleString()}`;
};

const getRoleLabel = (role) => {
  if (role === 'super_admin' || role === 'treasurer') return 'Treasurer';
  if (role === 'admin') return 'Admin';
  return 'Member';
};

// Build a wa.me link that opens WhatsApp (Messenger or Business) with pre-typed text.
// Uganda numbers: replace leading 0 with 256. Strips spaces, dashes, +.
const buildWhatsAppUrl = (phone, message) => {
  if (!phone) return null;
  let digits = String(phone).replace(/[^\d]/g, '');
  if (digits.startsWith('0')) digits = '256' + digits.slice(1);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};

const Dashboard = () => {
  const { user, logout, getAuthHeaders, isAdmin, isSuperAdmin, isPremium, refreshUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [rules, setRules] = useState(null);
  const [financials, setFinancials] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [loans, setLoans] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Form states
  const [depositAmount, setDepositAmount] = useState('52000');
  const [depositType, setDepositType] = useState('savings');
  const [depositDescription, setDepositDescription] = useState('');
  const [depositTargetUserId, setDepositTargetUserId] = useState(null);
  const [loanAmount, setLoanAmount] = useState('');
  const [loanGuarantor, setLoanGuarantor] = useState('');
  const [loanReason, setLoanReason] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalType, setWithdrawalType] = useState('savings');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [newGroupBalance, setNewGroupBalance] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [pettyCashAmount, setPettyCashAmount] = useState('');
  const [pettyCashDescription, setPettyCashDescription] = useState('');
  const [pettyCashCategory, setPettyCashCategory] = useState('general');

  // Dialog states
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [pettyCashDialogOpen, setPettyCashDialogOpen] = useState(false);

  const fetchData = async () => {
    try {
      const headers = getAuthHeaders();
      const [statsRes, rulesRes, financialsRes, depositsRes, loansRes, withdrawalsRes, membersRes] = await Promise.all([
        axios.get(`${API_URL}/api/stats/group`, { headers }),
        axios.get(`${API_URL}/api/stats/rules`, { headers }),
        axios.get(`${API_URL}/api/stats/financial`, { headers }),
        axios.get(`${API_URL}/api/deposits`, { headers }),
        axios.get(`${API_URL}/api/loans`, { headers }),
        axios.get(`${API_URL}/api/withdrawals`, { headers }),
        axios.get(`${API_URL}/api/members`, { headers }),
      ]);
      setStats(statsRes.data);
      setRules(rulesRes.data);
      setFinancials(financialsRes.data);
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

  // Calculate user's outstanding loan balance
  const userLoanBalance = loans
    .filter(loan => 
      loan.user_id === user?.id && 
      loan.status === 'approved' && 
      !loan.repaid
    )
    .reduce((total, loan) => {
      const total_repaid = (loan.amount_repaid || 0) + (loan.interest_repaid || 0);
      const outstanding = Math.max(0, (loan.total_due || loan.outstanding_balance || 0) - total_repaid);
      return total + outstanding;
    }, 0);

  const handleDeposit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        amount: parseFloat(depositAmount),
        deposit_type: depositType,
        description: depositDescription,
      };
      if (depositTargetUserId) {
        payload.target_user_id = depositTargetUserId;
      }
      await axios.post(
        `${API_URL}/api/deposits/request`,
        payload,
        { headers: getAuthHeaders() }
      );
      toast.success('Deposit request submitted for approval');
      setDepositDialogOpen(false);
      setDepositTargetUserId(null);
      setDepositAmount('55000');
      setDepositDescription('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit deposit');
    }
  };

  const handleOpenDepositForMember = (memberId) => {
    setDepositTargetUserId(memberId);
    setDepositType('savings');
    setDepositAmount('52000');
    setDepositDescription('');
    setDepositDialogOpen(true);
  };

  const handleLoan = async (e) => {
    e.preventDefault();
    if (!loanGuarantor) {
      toast.error('Please select a guarantor');
      return;
    }
    try {
      await axios.post(
        `${API_URL}/api/loans/request`,
        { 
          amount: parseFloat(loanAmount), 
          guarantor_id: loanGuarantor,
          reason: loanReason 
        },
        { headers: getAuthHeaders() }
      );
      toast.success('Loan request submitted');
      setLoanDialogOpen(false);
      setLoanAmount('');
      setLoanGuarantor('');
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
        { 
          amount: parseFloat(withdrawalAmount), 
          withdrawal_type: withdrawalType,
          reason: withdrawalReason 
        },
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

  const handleUpdateGroupBalance = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API_URL}/api/admin/update-group-balance`,
        { new_balance: parseFloat(newGroupBalance), reason: balanceReason },
        { headers: getAuthHeaders() }
      );
      toast.success('Group balance updated');
      setBalanceDialogOpen(false);
      setNewGroupBalance('');
      setBalanceReason('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update balance');
    }
  };

  const handleAddPettyCash = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API_URL}/api/petty-cash/add`,
        { 
          amount: parseFloat(pettyCashAmount), 
          description: pettyCashDescription,
          category: pettyCashCategory
        },
        { headers: getAuthHeaders() }
      );
      toast.success('Petty cash expense added');
      setPettyCashDialogOpen(false);
      setPettyCashAmount('');
      setPettyCashDescription('');
      setPettyCashCategory('general');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add petty cash');
    }
  };

  const handleDeletePettyCash = async (entryId) => {
    if (!window.confirm('Delete this petty cash entry?')) return;
    try {
      await axios.delete(`${API_URL}/api/petty-cash/${entryId}`, { headers: getAuthHeaders() });
      toast.success('Petty cash entry deleted');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete entry');
    }
  };

  const handleApproveTransaction = async (type, id, approved) => {
    try {
      await axios.post(
        `${API_URL}/api/${type}/approve`,
        { transaction_id: id, approved },
        { headers: getAuthHeaders() }
      );
      toast.success(`${approved ? 'Approved' : 'Rejected'} successfully`);
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

  const handleSetMaxGuarantees = async (userId, maxGuarantees) => {
    try {
      await axios.post(
        `${API_URL}/api/admin/set-max-guarantees`,
        { user_id: userId, max_guarantees: maxGuarantees },
        { headers: getAuthHeaders() }
      );
      toast.success(`Max guarantees updated to ${maxGuarantees}`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update max guarantees');
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

  const handleRepayLoan = async (loanId, amount) => {
    const repayAmount = prompt('Enter repayment amount:');
    if (!repayAmount) return;
    try {
      await axios.post(
        `${API_URL}/api/loans/${loanId}/repay?amount=${parseFloat(repayAmount)}`,
        {},
        { headers: getAuthHeaders() }
      );
      toast.success('Payment recorded');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to record payment');
    }
  };

  const handleGuarantorApproval = async (loanId, approved) => {
    const action = approved ? 'approve' : 'reject';
    if (!window.confirm(`Are you sure you want to ${action} this loan as guarantor?`)) return;
    try {
      await axios.post(
        `${API_URL}/api/loans/guarantor-approve`,
        { loan_id: loanId, approved },
        { headers: getAuthHeaders() }
      );
      toast.success(approved ? 'Loan approved — sent to admin for final approval' : 'Loan rejected');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to process guarantor approval');
    }
  };

  const handleDeleteRecord = async (kind, id) => {
    const labels = { deposits: 'deposit', loans: 'loan', withdrawals: 'withdrawal', 'petty-cash': 'petty cash entry' };
    if (!window.confirm(`Delete this ${labels[kind]}? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API_URL}/api/${kind}/${id}`, { headers: getAuthHeaders() });
      toast.success(`${labels[kind].charAt(0).toUpperCase() + labels[kind].slice(1)} deleted`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to delete ${labels[kind]}`);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending_guarantor: 'bg-[#E8B25C]/20 text-[#E8B25C] border-[#E8B25C]/30',
      pending_admin: 'bg-[#D48C70]/20 text-[#D48C70] border-[#D48C70]/30',
      pending: 'bg-[#E8B25C]/20 text-[#E8B25C] border-[#E8B25C]/30',
      approved: 'bg-[#347242]/20 text-[#347242] border-[#347242]/30',
      rejected: 'bg-[#D05A49]/20 text-[#D05A49] border-[#D05A49]/30',
      rejected_by_guarantor: 'bg-[#D05A49]/20 text-[#D05A49] border-[#D05A49]/30',
      repaid: 'bg-[#2C5530]/20 text-[#2C5530] border-[#2C5530]/30',
    };
    const icons = {
      pending_guarantor: <Clock className="w-3 h-3" />,
      pending_admin: <Clock className="w-3 h-3" />,
      pending: <Clock className="w-3 h-3" />,
      approved: <CheckCircle className="w-3 h-3" />,
      rejected: <XCircle className="w-3 h-3" />,
      rejected_by_guarantor: <XCircle className="w-3 h-3" />,
      repaid: <CheckCircle className="w-3 h-3" />,
    };
    const labels = {
      pending_guarantor: 'Awaiting Guarantor',
      pending_admin: 'Awaiting Admin',
      rejected_by_guarantor: 'Rejected by Guarantor',
    };
    const label = labels[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : '');
    return (
      <Badge className={`${styles[status] || styles.pending} flex items-center gap-1 border`}>
        {icons[status] || icons.pending}
        {label}
      </Badge>
    );
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: Wallet },
    { id: 'financials', label: 'Financials', icon: BarChart3 },
    { id: 'deposits', label: 'Deposits', icon: TrendingUp },
    { id: 'loans', label: 'Loans', icon: CreditCard },
    { id: 'withdrawals', label: 'Withdrawals', icon: TrendingDown },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'rules', label: 'Rules', icon: Shield },
  ];

  if (isAdmin) {
    navItems.push({ id: 'admin', label: 'Admin', icon: Shield });
  }

  // Get eligible guarantors: any member except self, with available guarantee slots
  const eligibleGuarantors = members.filter(m => {
    if (m.id === user?.id) return false;
    const currentGuarantees = loans.filter(l => 
      l.guarantor_id === m.id && 
      ['pending_guarantor', 'pending_admin', 'approved'].includes(l.status) && 
      !l.repaid
    ).length;
    const maxGuarantees = m.max_guarantees || 2;
    return currentGuarantees < maxGuarantees;
  });

  // Loans where current user is the selected guarantor and awaiting their approval
  const pendingGuarantorLoans = loans.filter(l => 
    l.guarantor_id === user?.id && l.status === 'pending_guarantor'
  );

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
              <img 
                src="/logo.jpg" 
                alt="Class One Logo"
                className="w-10 h-10 rounded-full object-cover"
              />
              <span className="text-xl font-bold font-['Manrope'] text-[#1E231F]">Class One Savings</span>
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
                  <Badge
                    className={
                      user?.membership_type === 'premium'
                        ? 'bg-[#2C5530]/10 text-[#2C5530] text-xs'
                        : 'bg-[#5C665D]/10 text-[#5C665D] text-xs'
                    }
                  >
                    {user?.membership_type === 'premium' && <Crown className="w-3 h-3 mr-1" />}
                    {user?.membership_type}
                  </Badge>
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
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              {/* Total Group Balance - Only Treasurer can edit */}
              <Card className="md:col-span-2 lg:col-span-2 bg-[#2C5530] border-none shadow-lg" data-testid="total-balance-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/70 text-sm font-medium uppercase tracking-wide">Total Group Balance</p>
                      <p className="text-4xl font-extrabold text-white font-numbers mt-2">
                        {formatCurrency(stats?.total_group_balance)}
                      </p>
                      <p className="text-white/70 text-sm mt-2">
                        {stats?.total_members} members • Year ends {stats?.year_end_date}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                        <Wallet className="w-8 h-8 text-white" />
                      </div>
                      {isSuperAdmin && (
                        <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="secondary" className="text-xs">
                              Edit Balance
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Update Group Balance</DialogTitle>
                              <DialogDescription>
                                Reset balance for new year or make corrections
                              </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleUpdateGroupBalance} className="space-y-4 mt-4">
                              <div className="space-y-2">
                                <Label>New Balance (UGX)</Label>
                                <Input
                                  type="number"
                                  value={newGroupBalance}
                                  onChange={(e) => setNewGroupBalance(e.target.value)}
                                  placeholder="0"
                                  required
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Reason</Label>
                                <Input
                                  value={balanceReason}
                                  onChange={(e) => setBalanceReason(e.target.value)}
                                  placeholder="Year end reset / Correction"
                                  required
                                />
                              </div>
                              <Button type="submit" className="w-full bg-[#2C5530]">
                                Update Balance
                              </Button>
                            </form>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* My Savings */}
              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
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

              {/* Development Fund */}
              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[#5C665D] text-sm font-medium uppercase tracking-wide">Development Fund</p>
                      <p className="text-2xl font-bold text-[#1E231F] font-numbers mt-2">
                        {formatCurrency(user?.development_fund)}
                      </p>
                      <p className="text-xs text-[#5C665D] mt-1">Non-withdrawable</p>
                    </div>
                    <div className="w-12 h-12 bg-[#D48C70]/10 rounded-full flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-[#D48C70]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Loan Balance */}
              <Card className={`bg-white shadow-sm ${userLoanBalance > 0 ? 'border-[#D05A49]' : 'border-[#E8EBE8]'}`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[#5C665D] text-sm font-medium uppercase tracking-wide">Outstanding Loan</p>
                      <p className={`text-2xl font-bold font-numbers mt-2 ${userLoanBalance > 0 ? 'text-[#D05A49]' : 'text-[#347242]'}`}>
                        {formatCurrency(userLoanBalance)}
                      </p>
                      <p className="text-xs text-[#5C665D] mt-1">
                        {userLoanBalance > 0 ? 'Due for repayment' : 'No active loans'}
                      </p>
                    </div>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${userLoanBalance > 0 ? 'bg-[#D05A49]/10' : 'bg-[#347242]/10'}`}>
                      <CreditCard className={`w-6 h-6 ${userLoanBalance > 0 ? 'text-[#D05A49]' : 'text-[#347242]'}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Dialog open={depositDialogOpen} onOpenChange={(open) => {
                  setDepositDialogOpen(open);
                  if (!open) setDepositTargetUserId(null);
                }}>
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
                    <DialogTitle className="font-['Manrope'] text-[#1E231F]">
                      {depositTargetUserId ? `Deposit for ${members.find((m) => m.id === depositTargetUserId)?.name || 'Member'}` : 'Make Deposit'}
                    </DialogTitle>
                    <DialogDescription className="text-[#5C665D]">
                      {depositTargetUserId
                        ? 'Submitting a deposit request to the selected member account.'
                        : 'Monthly savings: UGX 52,000 | Development fee: UGX 3,000'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleDeposit} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Deposit Type</Label>
                      <Select value={depositType} onValueChange={setDepositType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="savings">Monthly Savings (UGX 52,000)</SelectItem>
                          <SelectItem value="development_fee">Development Fee (UGX 3,000)</SelectItem>
                          <SelectItem value="loan_payment">Pay Back Loan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Amount (UGX)</Label>
                      <Input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder={depositType === 'savings' ? '52000' : depositType === 'development_fee' ? '3000' : '0'}
                        required
                        min={depositType === 'savings' ? 52000 : 1}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description (Optional)</Label>
                      <Textarea
                        value={depositDescription}
                        onChange={(e) => setDepositDescription(e.target.value)}
                        placeholder="Monthly contribution..."
                      />
                    </div>
                    <div className="p-3 bg-[#E8B25C]/10 rounded-lg text-sm text-[#5C665D]">
                      <AlertTriangle className="w-4 h-4 inline mr-2 text-[#E8B25C]" />
                      Late fee: UGX 3,000 per position if paid after 10th
                    </div>
                    <Button type="submit" className="w-full bg-[#2C5530] hover:bg-[#214024] rounded-full">
                      Submit Deposit
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
                      Max: UGX 600,000 • Interest: 3%/month (5% after 4 months)
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleLoan} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Amount (UGX)</Label>
                      <Input
                        type="number"
                        value={loanAmount}
                        onChange={(e) => setLoanAmount(e.target.value)}
                        placeholder="100000"
                        required
                        min="1"
                        max="600000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Select Guarantor</Label>
                      <Select value={loanGuarantor} onValueChange={setLoanGuarantor}>
                        <SelectTrigger data-testid="loan-guarantor-select">
                          <SelectValue placeholder="Choose any group member" />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleGuarantors.map((m) => {
                            const currentGuarantees = loans.filter(l => 
                              l.guarantor_id === m.id && 
                              ['pending_guarantor', 'pending_admin', 'approved'].includes(l.status) && 
                              !l.repaid
                            ).length;
                            const maxGuarantees = m.max_guarantees || 2;
                            const slotsLeft = maxGuarantees - currentGuarantees;
                            return (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name} ({slotsLeft} slots left)
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-[#5C665D]">Any group member can guarantee. They must approve before admin.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Reason</Label>
                      <Textarea
                        value={loanReason}
                        onChange={(e) => setLoanReason(e.target.value)}
                        placeholder="Reason for loan..."
                      />
                    </div>
                    {loanAmount && parseFloat(loanAmount) > 0 && (
                      <div className="p-3 bg-[#2C5530]/10 rounded-lg text-sm text-[#1E231F] space-y-1">
                        <div className="flex justify-between"><span>Loan Amount:</span><span className="font-semibold">{formatCurrency(parseFloat(loanAmount))}</span></div>
                        <div className="flex justify-between"><span>Interest (3%):</span><span className="font-semibold">{formatCurrency(parseFloat(loanAmount) * 0.03)}</span></div>
                        <div className="flex justify-between border-t border-[#2C5530]/20 pt-1 mt-1"><span className="font-bold">Total Due:</span><span className="font-bold text-[#2C5530]">{formatCurrency(parseFloat(loanAmount) * 1.03)}</span></div>
                      </div>
                    )}
                    <div className="p-3 bg-[#E8B25C]/10 rounded-lg text-sm text-[#5C665D]">
                      <Percent className="w-4 h-4 inline mr-2 text-[#E8B25C]" />
                      Return within 4 months at 3% interest/month. Beyond 4 months: 5%/month.
                    </div>
                    <Button type="submit" className="w-full bg-[#D48C70] hover:bg-[#BD7B60] rounded-full">
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
                      Available savings: {formatCurrency(user?.total_savings)}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleWithdrawal} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Withdrawal Type</Label>
                      <Select value={withdrawalType} onValueChange={setWithdrawalType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="savings">Regular Withdrawal (Savings only)</SelectItem>
                          <SelectItem value="leaving_group">Leaving Group (All funds)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Amount (UGX)</Label>
                      <Input
                        type="number"
                        value={withdrawalAmount}
                        onChange={(e) => setWithdrawalAmount(e.target.value)}
                        placeholder="50000"
                        required
                        min="1"
                        max={withdrawalType === 'leaving_group' 
                          ? (user?.total_savings || 0) + (user?.development_fund || 0)
                          : user?.total_savings || 0}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Reason</Label>
                      <Textarea
                        value={withdrawalReason}
                        onChange={(e) => setWithdrawalReason(e.target.value)}
                        placeholder="Reason for withdrawal..."
                      />
                    </div>
                    {withdrawalType === 'leaving_group' && (
                      <div className="p-3 bg-[#D05A49]/10 rounded-lg text-sm text-[#D05A49]">
                        <DoorOpen className="w-4 h-4 inline mr-2" />
                        Leaving requires 2 months notice, no active loans, and not being a guarantor
                      </div>
                    )}
                    <Button type="submit" className="w-full bg-[#2C5530] hover:bg-[#214024] rounded-full">
                      Submit Request
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Recent Activity */}
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-['Manrope'] text-[#1E231F]">My Recent Activity</CardTitle>
                {deposits.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportDepositsPDF(deposits, 'my-activity')}
                    data-testid="export-activity-pdf"
                    className="border-[#E8EBE8] rounded-full text-xs"
                  >
                    <FileDown className="w-3.5 h-3.5 mr-1" />
                    PDF
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {deposits.slice(0, 5).map((d) => {
                    const canDelete = d.user_id === user?.id || isSuperAdmin;
                    return (
                    <div key={d.id} className="flex items-center justify-between py-3 border-b border-[#E8EBE8] last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#347242]/10 rounded-full flex items-center justify-center">
                          <ArrowUpRight className="w-5 h-5 text-[#347242]" />
                        </div>
                        <div>
                          <p className="font-medium text-[#1E231F]">
                            {d.deposit_type === 'development_fee' ? 'Development Fee' : 'Savings Deposit'}
                          </p>
                          <p className="text-sm text-[#5C665D]">{d.description || d.month}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-semibold text-[#347242] font-numbers">{formatCurrency(d.amount)}</p>
                          {getStatusBadge(d.status)}
                        </div>
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteRecord('deposits', d.id)}
                            data-testid={`delete-activity-${d.id}`}
                            title="Delete record"
                            className="p-1.5 rounded-full text-[#D05A49] hover:bg-[#D05A49]/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );})}
                  {deposits.length === 0 && (
                    <p className="text-center text-[#5C665D] py-4">No recent activity</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Deposits Tab */}
        {activeTab === 'deposits' && (
          <div className="space-y-6 animate-fade-in" data-testid="deposits-tab">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Deposits</h2>
              <div className="flex items-center gap-2">
                {deposits.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => exportDepositsPDF(deposits)}
                    data-testid="export-deposits-pdf"
                    className="border-[#E8EBE8] rounded-full"
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                )}
                <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-[#2C5530] hover:bg-[#214024] rounded-full">
                      <Plus className="w-4 h-4 mr-2" />
                      New Deposit
                    </Button>
                  </DialogTrigger>
                </Dialog>
              </div>
            </div>
            
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#E8EBE8] bg-[#FAFAF8]">
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Date</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Type</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Amount</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Late Fee</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Status</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deposits.map((d) => {
                        const canDelete = d.user_id === user?.id || isSuperAdmin;
                        return (
                        <tr key={d.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5] transition-colors">
                          <td className="py-4 px-6 text-[#1E231F]">
                            {new Date(d.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-6 text-[#1E231F]">
                            {d.deposit_type === 'development_fee' ? 'Development' : 'Savings'}
                          </td>
                          <td className="py-4 px-6 font-semibold text-[#347242] font-numbers">
                            {formatCurrency(d.amount)}
                          </td>
                          <td className="py-4 px-6 text-[#D05A49] font-numbers">
                            {d.late_fee > 0 ? formatCurrency(d.late_fee) : '-'}
                          </td>
                          <td className="py-4 px-6">{getStatusBadge(d.status)}</td>
                          <td className="py-4 px-6">
                            {canDelete ? (
                              <button
                                onClick={() => handleDeleteRecord('deposits', d.id)}
                                data-testid={`delete-deposit-${d.id}`}
                                title="Delete record"
                                className="p-1.5 rounded-full text-[#D05A49] hover:bg-[#D05A49]/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="text-[#5C665D] text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      );})}
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

        {/* Loans Tab */}
        {activeTab === 'loans' && (
          <div className="space-y-6 animate-fade-in" data-testid="loans-tab">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Loans</h2>
              <div className="flex items-center gap-2">
                {loans.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => exportLoansPDF(loans)}
                    data-testid="export-loans-pdf"
                    className="border-[#E8EBE8] rounded-full"
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                )}
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
            </div>

            {/* Loans awaiting MY guarantor approval */}
            {pendingGuarantorLoans.length > 0 && (
              <Card className="bg-[#D48C70]/10 border border-[#D48C70]/30" data-testid="guarantor-pending-section">
                <CardHeader>
                  <CardTitle className="text-[#1E231F] flex items-center gap-2 text-lg">
                    <UserCheck className="w-5 h-5 text-[#D48C70]" />
                    Awaiting Your Guarantor Approval
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pendingGuarantorLoans.map((l) => (
                    <div key={l.id} className="bg-white p-4 rounded-xl border border-[#E8EBE8]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#1E231F]">{l.user_name}</p>
                          <p className="text-sm text-[#5C665D]">
                            Amount: <span className="font-bold text-[#D48C70]">{formatCurrency(l.amount)}</span>
                            {' • '}
                            Total Due: <span className="font-bold">{formatCurrency(l.total_due || l.outstanding_balance || l.initial_total_due || l.amount * 1.03)}</span>
                          </p>
                          {l.reason && <p className="text-xs text-[#5C665D] mt-1 italic">"{l.reason}"</p>}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleGuarantorApproval(l.id, true)}
                            data-testid={`guarantor-approve-${l.id}`}
                            className="bg-[#347242] hover:bg-[#2C5530] rounded-full"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleGuarantorApproval(l.id, false)}
                            data-testid={`guarantor-reject-${l.id}`}
                            variant="outline"
                            className="border-[#D05A49] text-[#D05A49] hover:bg-[#D05A49]/10 rounded-full"
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {!isPremium && (
              <Card className="bg-[#E8B25C]/10 border border-[#E8B25C]/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <Crown className="w-5 h-5 text-[#E8B25C]" />
                  <p className="text-[#1E231F]">
                    Only premium members can request loans. Save UGX 55,000 to become premium.
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
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Guarantor</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Interest</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Total Due</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Status</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loans.map((l) => {
                        const guarantor = members.find(m => m.id === l.guarantor_id);
                        const isMyLoan = l.user_id === user?.id;
                        const showNotifyGuarantor = isMyLoan && l.status === 'pending_guarantor' && guarantor?.phone;
                        const waUrl = showNotifyGuarantor ? buildWhatsAppUrl(
                          guarantor.phone,
                          `Hi ${l.guarantor_name}, I (${user?.name}) have requested a UGX ${Number(l.amount).toLocaleString()} loan on Class One Savings with you as my guarantor. Total due will be UGX ${Number(l.total_due || l.outstanding_balance || l.initial_total_due || l.amount * 1.03).toLocaleString()} (3% interest). Please log in at ${window.location.origin} to approve or reject. Thank you!`
                        ) : null;
                        return (
                        <tr key={l.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5] transition-colors">
                          <td className="py-4 px-6 text-[#1E231F]">
                            {new Date(l.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-6 font-semibold text-[#D48C70] font-numbers">
                            {formatCurrency(l.amount)}
                          </td>
                          <td className="py-4 px-6 text-[#1E231F]">
                            <div className="flex items-center gap-1">
                              <UserCheck className="w-4 h-4 text-[#5C665D]" />
                              {l.guarantor_name}
                            </div>
                          </td>
                          <td className="py-4 px-6 text-[#5C665D] font-numbers">
                            {l.current_interest ? formatCurrency(l.current_interest) : '-'}
                            {l.months_elapsed > 4 && (
                              <span className="text-[#D05A49] text-xs ml-1">(5%)</span>
                            )}
                          </td>
                          <td className="py-4 px-6 font-semibold text-[#1E231F] font-numbers">
                            {formatCurrency(l.total_due || l.outstanding_balance || l.initial_total_due || l.amount * 1.03)}
                          </td>
                          <td className="py-4 px-6">{getStatusBadge(l.status)}</td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2">
                              {showNotifyGuarantor ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  data-testid={`whatsapp-notify-${l.id}`}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#25D366] text-white text-xs font-medium hover:bg-[#1EA852] transition-colors"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  Notify
                                </a>
                              ) : null}
                              {(l.user_id === user?.id || isSuperAdmin) && (
                                <button
                                  onClick={() => handleDeleteRecord('loans', l.id)}
                                  data-testid={`delete-loan-${l.id}`}
                                  title="Delete record"
                                  className="p-1.5 rounded-full text-[#D05A49] hover:bg-[#D05A49]/10 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!showNotifyGuarantor && !(l.user_id === user?.id || isSuperAdmin) && (
                                <span className="text-[#5C665D] text-xs">-</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );})}
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

        {/* Withdrawals Tab */}
        {activeTab === 'withdrawals' && (
          <div className="space-y-6 animate-fade-in" data-testid="withdrawals-tab">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Withdrawals</h2>
              <div className="flex items-center gap-2">
                {withdrawals.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => exportWithdrawalsPDF(withdrawals)}
                    data-testid="export-withdrawals-pdf"
                    className="border-[#E8EBE8] rounded-full"
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                )}
                <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-[#E8EBE8] rounded-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Request Withdrawal
                    </Button>
                  </DialogTrigger>
                </Dialog>
              </div>
            </div>
            
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#E8EBE8] bg-[#FAFAF8]">
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Date</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Amount</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Type</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Reason</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Status</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawals.map((w) => {
                        const canDelete = w.user_id === user?.id || isSuperAdmin;
                        return (
                        <tr key={w.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5] transition-colors">
                          <td className="py-4 px-6 text-[#1E231F]">
                            {new Date(w.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-6 font-semibold text-[#D05A49] font-numbers">
                            {formatCurrency(w.amount)}
                          </td>
                          <td className="py-4 px-6 text-[#1E231F]">
                            {w.withdrawal_type === 'leaving_group' ? 'Leaving Group' : 'Regular'}
                          </td>
                          <td className="py-4 px-6 text-[#5C665D]">{w.reason || '-'}</td>
                          <td className="py-4 px-6">{getStatusBadge(w.status)}</td>
                          <td className="py-4 px-6">
                            {canDelete ? (
                              <button
                                onClick={() => handleDeleteRecord('withdrawals', w.id)}
                                data-testid={`delete-withdrawal-${w.id}`}
                                title="Delete record"
                                className="p-1.5 rounded-full text-[#D05A49] hover:bg-[#D05A49]/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="text-[#5C665D] text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      );})}
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

        {/* Members Tab */}
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
                <Card key={m.id} className="bg-white border border-[#E8EBE8] shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 bg-[#2C5530]/10 rounded-full flex items-center justify-center">
                        <span className="text-lg font-bold text-[#2C5530]">
                          {m.name?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <Badge
                        className={
                          m.membership_type === 'premium'
                            ? 'bg-[#2C5530]/10 text-[#2C5530]'
                            : 'bg-[#5C665D]/10 text-[#5C665D]'
                        }
                      >
                        {m.membership_type}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-[#1E231F] mb-1">{m.name}</h3>
                    <p className="text-sm text-[#5C665D] mb-1">
                      {getRoleLabel(m.role)} • {m.phone || 'No phone'}
                    </p>
                    <div className="pt-3 border-t border-[#E8EBE8] grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-[#5C665D]">Savings</p>
                        <p className="text-sm font-bold text-[#347242] font-numbers">
                          {formatCurrency(m.total_savings)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5C665D]">Dev Fund</p>
                        <p className="text-sm font-bold text-[#D48C70] font-numbers">
                          {formatCurrency(m.development_fund)}
                        </p>
                      </div>
                    </div>
                    {isSuperAdmin && m.id !== user?.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-4 w-full"
                        onClick={() => handleOpenDepositForMember(m.id)}
                      >
                        Deposit for Member
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Financials Tab */}
        {activeTab === 'financials' && (
          <div className="space-y-6 animate-fade-in" data-testid="financials-tab">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Group Financials</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {isAdmin && (
                  <Button
                    variant="outline"
                    onClick={() => exportFullGroupReportPDF({ financials, deposits, loans, withdrawals, pettyCash: financials?.petty_cash_items || [], members })}
                    data-testid="export-full-report-pdf"
                    className="border-[#2C5530] text-[#2C5530] rounded-full"
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    Full Group Report
                  </Button>
                )}
                {financials?.petty_cash_items?.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => exportPettyCashPDF(financials.petty_cash_items)}
                    data-testid="export-petty-cash-pdf"
                    className="border-[#E8EBE8] rounded-full"
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    Export Petty Cash
                  </Button>
                )}
                {isAdmin && (
                  <Dialog open={pettyCashDialogOpen} onOpenChange={setPettyCashDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-[#D48C70] hover:bg-[#BD7B60] rounded-full">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Petty Cash
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-[#1E231F]">Add Petty Cash Expense</DialogTitle>
                        <DialogDescription className="text-[#5C665D]">
                          Record group expenses (stationary, transport, etc.)
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddPettyCash} className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label className="text-[#1E231F]">Amount (UGX)</Label>
                        <Input
                          type="number"
                          value={pettyCashAmount}
                          onChange={(e) => setPettyCashAmount(e.target.value)}
                          placeholder="5000"
                          required
                          min="1"
                          className="bg-white border-[#E8EBE8] text-[#1E231F]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[#1E231F]">Category</Label>
                        <Select value={pettyCashCategory} onValueChange={setPettyCashCategory}>
                          <SelectTrigger className="bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="general">General</SelectItem>
                            <SelectItem value="transport">Transport</SelectItem>
                            <SelectItem value="stationary">Stationary</SelectItem>
                            <SelectItem value="refreshments">Refreshments</SelectItem>
                            <SelectItem value="communication">Communication</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[#1E231F]">Description</Label>
                        <Textarea
                          value={pettyCashDescription}
                          onChange={(e) => setPettyCashDescription(e.target.value)}
                          placeholder="What was the expense for?"
                          required
                          className="bg-white border-[#E8EBE8] text-[#1E231F]"
                        />
                      </div>
                      <Button type="submit" className="w-full bg-[#D48C70] hover:bg-[#BD7B60] rounded-full">
                        Add Expense
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
              </div>
            </div>

            {/* Total Group Balance Card */}
            <Card className="bg-[#2C5530] border-none shadow-lg">
              <CardContent className="p-6">
                <div className="text-center">
                  <p className="text-white/70 text-sm font-medium uppercase tracking-wide">Total Group Balance</p>
                  <p className="text-5xl font-extrabold text-white font-numbers mt-2">
                    {formatCurrency(financials?.total_group_balance)}
                  </p>
                  <p className="text-white/70 text-sm mt-2">
                    Auto-calculated from all sources
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Financial Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#347242]/10 rounded-full flex items-center justify-center">
                      <PiggyBank className="w-5 h-5 text-[#347242]" />
                    </div>
                    <div>
                      <p className="text-xs text-[#5C665D]">Member Savings</p>
                      <p className="text-lg font-bold text-[#347242] font-numbers">
                        {formatCurrency(financials?.total_savings)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#2C5530]/10 rounded-full flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-[#2C5530]" />
                    </div>
                    <div>
                      <p className="text-xs text-[#5C665D]">Development Fund</p>
                      <p className="text-lg font-bold text-[#2C5530] font-numbers">
                        {formatCurrency(financials?.total_development_fund)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#D48C70]/10 rounded-full flex items-center justify-center">
                      <Percent className="w-5 h-5 text-[#D48C70]" />
                    </div>
                    <div>
                      <p className="text-xs text-[#5C665D]">Loan Interest</p>
                      <p className="text-lg font-bold text-[#D48C70] font-numbers">
                        {formatCurrency(financials?.total_interest_earned)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#E8B25C]/10 rounded-full flex items-center justify-center">
                      <Clock className="w-5 h-5 text-[#E8B25C]" />
                    </div>
                    <div>
                      <p className="text-xs text-[#5C665D]">Late Fees</p>
                      <p className="text-lg font-bold text-[#E8B25C] font-numbers">
                        {formatCurrency(financials?.total_late_fees)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#D05A49]/10 rounded-full flex items-center justify-center">
                      <Receipt className="w-5 h-5 text-[#D05A49]" />
                    </div>
                    <div>
                      <p className="text-xs text-[#5C665D]">Petty Cash Used</p>
                      <p className="text-lg font-bold text-[#D05A49] font-numbers">
                        -{formatCurrency(financials?.total_petty_cash_used)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Loans Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#5C665D]">Active Loans</p>
                      <p className="text-2xl font-bold text-[#D48C70] font-numbers">
                        {formatCurrency(financials?.active_loans_amount)}
                      </p>
                      <p className="text-xs text-[#5C665D]">{financials?.active_loans_count || 0} loans</p>
                    </div>
                    <CreditCard className="w-10 h-10 text-[#D48C70]/30" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#5C665D]">Repaid Loans</p>
                      <p className="text-2xl font-bold text-[#347242] font-numbers">
                        {formatCurrency(financials?.repaid_loans_amount)}
                      </p>
                      <p className="text-xs text-[#5C665D]">{financials?.repaid_loans_count || 0} loans</p>
                    </div>
                    <CheckCircle className="w-10 h-10 text-[#347242]/30" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[#5C665D]">Total Withdrawals</p>
                      <p className="text-2xl font-bold text-[#5C665D] font-numbers">
                        {formatCurrency(financials?.total_withdrawals)}
                      </p>
                      <p className="text-xs text-[#5C665D]">Approved</p>
                    </div>
                    <ArrowDownRight className="w-10 h-10 text-[#5C665D]/30" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Petty Cash History */}
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardHeader>
                <CardTitle className="font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-[#D48C70]" />
                  Petty Cash Expenses
                </CardTitle>
              </CardHeader>
              <CardContent>
                {financials?.petty_cash_items?.length > 0 ? (
                  <div className="space-y-3">
                    {financials.petty_cash_items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-[#FAFAF8] rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#D05A49]/10 rounded-full flex items-center justify-center">
                            <Receipt className="w-5 h-5 text-[#D05A49]" />
                          </div>
                          <div>
                            <p className="font-medium text-[#1E231F]">{item.description}</p>
                            <p className="text-xs text-[#5C665D]">
                              {item.category} • {item.added_by_name} • {new Date(item.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-[#D05A49] font-numbers">
                            -{formatCurrency(item.amount)}
                          </span>
                          {isSuperAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeletePettyCash(item.id)}
                              className="text-[#D05A49] hover:bg-[#D05A49]/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-[#5C665D] py-8">No petty cash expenses recorded</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Rules Tab */}
        {activeTab === 'rules' && (
          <div className="space-y-6 animate-fade-in" data-testid="rules-tab">
            <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Group Rules</h2>
            
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardContent className="p-6">
                <div className="space-y-4">
                  {rules?.rules?.map((rule, index) => (
                    <div key={index} className="flex items-start gap-3 pb-4 border-b border-[#E8EBE8] last:border-0 last:pb-0">
                      <div className="w-8 h-8 bg-[#2C5530]/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-[#2C5530]">{index + 1}</span>
                      </div>
                      <p className="text-[#1E231F]">{rule}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-[#2C5530]/5 border border-[#2C5530]/20">
                <CardContent className="p-4 text-center">
                  <Calendar className="w-8 h-8 text-[#2C5530] mx-auto mb-2" />
                  <p className="text-sm text-[#5C665D]">Year End Date</p>
                  <p className="font-bold text-[#1E231F]">{rules?.year_end_date}</p>
                </CardContent>
              </Card>
              <Card className="bg-[#D48C70]/5 border border-[#D48C70]/20">
                <CardContent className="p-4 text-center">
                  <CreditCard className="w-8 h-8 text-[#D48C70] mx-auto mb-2" />
                  <p className="text-sm text-[#5C665D]">Max Loan</p>
                  <p className="font-bold text-[#1E231F]">{formatCurrency(rules?.max_loan_amount)}</p>
                </CardContent>
              </Card>
              <Card className="bg-[#347242]/5 border border-[#347242]/20">
                <CardContent className="p-4 text-center">
                  <PiggyBank className="w-8 h-8 text-[#347242] mx-auto mb-2" />
                  <p className="text-sm text-[#5C665D]">Monthly Savings</p>
                  <p className="font-bold text-[#1E231F]">{formatCurrency(rules?.monthly_savings)}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Admin Tab */}
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
                      <p className="text-xs text-[#5C665D] mb-1">{d.deposit_type}</p>
                      {d.late_fee > 0 && (
                        <p className="text-xs text-[#D05A49] mb-2">Late fee: {formatCurrency(d.late_fee)}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveTransaction('deposits', d.id, true)}
                          className="flex-1 bg-[#347242] hover:bg-[#2C5530] text-xs"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApproveTransaction('deposits', d.id, false)}
                          className="flex-1 border-[#D05A49] text-[#D05A49] hover:bg-[#D05A49]/10 text-xs"
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

              {/* Pending Loans - awaiting admin (after guarantor approved) */}
              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-[#D48C70]" />
                    Pending Loans ({loans.filter(l => l.status === 'pending_admin').length})
                  </CardTitle>
                  <p className="text-xs text-[#5C665D]">Only loans already approved by guarantor appear here</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loans.filter(l => l.status === 'pending_admin').map((l) => (
                    <div key={l.id} className="p-3 bg-[#FAFAF8] rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-[#1E231F]">{l.user_name}</span>
                        <span className="font-semibold text-[#D48C70] font-numbers">{formatCurrency(l.amount)}</span>
                      </div>
                      <p className="text-xs text-[#5C665D] mb-1">
                        <UserCheck className="w-3 h-3 inline mr-1" />
                        Guarantor: {l.guarantor_name} <span className="text-[#347242]">(approved)</span>
                      </p>
                      <p className="text-xs text-[#5C665D] mb-2">
                        Total Due: <span className="font-semibold text-[#1E231F]">{formatCurrency(l.total_due || l.outstanding_balance || l.initial_total_due || l.amount * 1.03)}</span>
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveTransaction('loans', l.id, true)}
                          className="flex-1 bg-[#347242] hover:bg-[#2C5530] text-xs"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApproveTransaction('loans', l.id, false)}
                          className="flex-1 border-[#D05A49] text-[#D05A49] hover:bg-[#D05A49]/10 text-xs"
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                  {loans.filter(l => l.status === 'pending_admin').length === 0 && (
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
                      <p className="text-xs text-[#5C665D] mb-2">{w.withdrawal_type}</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveTransaction('withdrawals', w.id, true)}
                          className="flex-1 bg-[#347242] hover:bg-[#2C5530] text-xs"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApproveTransaction('withdrawals', w.id, false)}
                          className="flex-1 border-[#D05A49] text-[#D05A49] hover:bg-[#D05A49]/10 text-xs"
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

            {/* Active Loans */}
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardHeader>
                <CardTitle className="font-['Manrope'] text-[#1E231F]">Active Loans (Record Payments)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {loans.filter(l => l.status === 'approved' && !l.repaid).map((l) => (
                    <div key={l.id} className="flex items-center justify-between p-4 bg-[#FAFAF8] rounded-xl">
                      <div>
                        <p className="font-medium text-[#1E231F]">{l.user_name}</p>
                        <p className="text-sm text-[#5C665D]">
                          Guarantor: {l.guarantor_name} • {l.months_elapsed || 0} months
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-[#D48C70] font-numbers">
                          Due: {formatCurrency(l.total_due)}
                        </p>
                        <p className="text-xs text-[#5C665D]">Paid: {formatCurrency(l.amount_repaid || 0)}</p>
                        <Button
                          size="sm"
                          onClick={() => handleRepayLoan(l.id)}
                          className="mt-2 bg-[#347242] hover:bg-[#2C5530]"
                        >
                          Record Payment
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

            {/* Member Management (Treasurer only) */}
            {isSuperAdmin && (
              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardHeader>
                  <CardTitle className="font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                    <Shield className="w-5 h-5 text-[#D48C70]" />
                    Member Management (Treasurer)
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
                          <th className="text-left py-3 px-4 text-sm font-semibold text-[#5C665D]">Guarantee Slots</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-[#5C665D]">Savings</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-[#5C665D]">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.filter(m => m.id !== user?.id).map((m) => {
                          // Calculate current guarantee count
                          const currentGuarantees = loans.filter(l => 
                            l.guarantor_id === m.id && 
                            ['pending_guarantor', 'pending_admin', 'approved'].includes(l.status) && 
                            !l.repaid
                          ).length;
                          const maxGuarantees = m.max_guarantees || 2;
                          const slotsText = `${currentGuarantees}/${maxGuarantees} slots`;
                          
                          return (
                        <tr key={m.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5]">
                            <td className="py-3 px-4">
                              <p className="font-medium text-[#1E231F]">{m.name}</p>
                              <p className="text-xs text-[#5C665D]">{m.email}</p>
                            </td>
                            <td className="py-3 px-4">
                              <select
                                value={m.role}
                                onChange={(e) => handleSetRole(m.id, e.target.value)}
                                disabled={m.role === 'super_admin' || m.role === 'treasurer'}
                                className="text-sm border border-[#E8EBE8] rounded-lg px-2 py-1 bg-white"
                              >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                                <option value="super_admin" disabled>Treasurer</option>
                                <option value="treasurer" disabled>Treasurer</option>
                              </select>
                            </td>
                            <td className="py-3 px-4">
                              <select
                                value={m.membership_type}
                                onChange={(e) => handleSetMembership(m.id, e.target.value)}
                                className="text-sm border border-[#E8EBE8] rounded-lg px-2 py-1 bg-white"
                              >
                                <option value="ordinary">Ordinary</option>
                                <option value="premium">Premium</option>
                              </select>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium ${
                                  currentGuarantees >= maxGuarantees ? 'text-[#D05A49]' : 'text-[#347242]'
                                }`}>
                                  {slotsText}
                                </span>
                                <input
                                  type="number"
                                  value={maxGuarantees}
                                  onChange={(e) => handleSetMaxGuarantees(m.id, parseInt(e.target.value) || 0)}
                                  min="0"
                                  className="text-sm border border-[#E8EBE8] rounded-lg px-2 py-1 bg-white w-16 text-center"
                                />
                              </div>
                            </td>
                            <td className="py-3 px-4 font-numbers text-[#347242]">
                              {formatCurrency(m.total_savings)}
                            </td>
                            <td className="py-3 px-4 text-right space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenDepositForMember(m.id)}
                                className="border-[#2C5530] text-[#2C5530] hover:bg-[#2C5530]/10"
                              >
                                Deposit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteMember(m.id)}
                                className="border-[#D05A49] text-[#D05A49] hover:bg-[#D05A49]/10"
                              >
                                Delete
                              </Button>
                            </td>
                          </tr>
                          );
                        })}
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
