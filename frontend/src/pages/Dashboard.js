import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
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
  ShoppingCart,
  Copy,
  Check,
  Settings,
  Image as ImageIcon,
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

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const WS_URL = API_URL.replace(/^http/, 'ws');

const formatCurrency = (amount) => {
  return `UGX ${Number(amount || 0).toLocaleString()}`;
};

const getRoleLabel = (role) => {
  if (role === 'super_admin' || role === 'treasurer') return 'Treasurer';
  if (role === 'admin') return 'Admin';
  return 'Member';
};

const PRODUCT_CATEGORIES = [
  { value: 'food', label: 'Food' },
  { value: 'construction-materials', label: 'Construction Materials' },
  { value: 'graphic-material', label: 'Graphic Material' },
  { value: 'electronics', label: 'Electronics' },
];

// Build a wa.me link that opens WhatsApp (Messenger or Business) with pre-typed text.
// Uganda numbers: replace leading 0 with 256. Strips spaces, dashes, +.
const buildWhatsAppUrl = (phone, message) => {
  if (!phone) return null;
  let digits = String(phone).replace(/[^\d]/g, '');
  if (digits.startsWith('0')) digits = '256' + digits.slice(1);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};

const CONTACT_ADMIN_PHONE = '+256776944322';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, logout, getAuthHeaders, isAdmin, isTreasurer, isPremium, isSeller, refreshUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [rules, setRules] = useState(null);
  const [financials, setFinancials] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [loans, setLoans] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [quickLoans, setQuickLoans] = useState([]);
  const [members, setMembers] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copiedMemberCode, setCopiedMemberCode] = useState(false);
  const [activeFinancialTab, setActiveFinancialTab] = useState('overview');

  // Form states
  const [depositAmount, setDepositAmount] = useState('500');
  const [depositType, setDepositType] = useState('savings');
  const [depositTargetUserId, setDepositTargetUserId] = useState(null);
  const [depositDescription, setDepositDescription] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanGuarantor, setLoanGuarantor] = useState('');
  const [loanReason, setLoanReason] = useState('');
  const [repayLoanId, setRepayLoanId] = useState('');
  const [loanRepaymentAmount, setLoanRepaymentAmount] = useState('');
  const [newGroupBalance, setNewGroupBalance] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [distributingInterest, setDistributingInterest] = useState(false);
  const [pettyCashAmount, setPettyCashAmount] = useState('');
  const [pettyCashDescription, setPettyCashDescription] = useState('');
  const [pettyCashCategory, setPettyCashCategory] = useState('general');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalType, setWithdrawalType] = useState('savings');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [myProducts, setMyProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const sellerInitialTabSet = useRef(false);
  const wsRef = useRef(null);

  const audioRef = useRef(null);

  // Dialog states
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [pettyCashDialogOpen, setPettyCashDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    const now = Date.now();
    if (fetchData._cache && (now - fetchData._cache.ts < 15000)) {
      setDataLoading(false);
      return;
    }
    setDataLoading(true);
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

      if (isAdmin || isTreasurer) {
        try {
          const quickLoansRes = await axios.get(`${API_URL}/api/quick-loans`, { headers });
          setQuickLoans(quickLoansRes.data);
        } catch (loanErr) {
          console.warn('Failed to load quick loan requests:', loanErr);
          setQuickLoans([]);
        }
      } else {
        setQuickLoans([]);
      }
      fetchData._cache = { ts: now };
    } catch (err) {
      console.error('Failed to fetch data:', err);
      toast.error('Failed to load data');
    } finally {
      setDataLoading(false);
    }
  }, [getAuthHeaders, isAdmin, isTreasurer]);

  const fetchMyProducts = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/products/me`, {
        headers: getAuthHeaders(),
      });
      const payload = response.data;
      if (Array.isArray(payload)) {
        setMyProducts(payload);
      } else if (Array.isArray(payload?.products)) {
        setMyProducts(payload.products);
      } else {
        console.warn('Unexpected user products payload, defaulting to empty array:', payload);
        setMyProducts([]);
      }
    } catch (err) {
      console.warn('Unable to load user products:', err);
      setMyProducts([]);
    }
  }, [getAuthHeaders]);

  const fetchOrders = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/orders`, {
        headers: getAuthHeaders(),
      });
      setOrders(response.data);
    } catch (err) {
      console.warn('Unable to load orders:', err);
      setOrders([]);
    }
  }, [getAuthHeaders]);


  // WebSocket connection for real-time order notifications
  useEffect(() => {
    if (!user?.name) return;
    
    const connectWebSocket = () => {
      const wsUrl = `${WS_URL}/ws/orders/${encodeURIComponent(user.name)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected for order notifications');
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'new_order') {
          // Add new order to state
          setOrders(prev => [data.order, ...prev]);
          // Play notification sound with loop
          if (audioRef.current) {
            audioRef.current.loop = true;
            audioRef.current.play().catch(() => {});
          }
          // Show toast notification
          toast.info(`New order received from ${data.order.buyerName || 'a buyer'}`);
        }
      };
      
      ws.onclose = () => {
        setTimeout(connectWebSocket, 3000);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
      };
    };
    
    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [user?.name]);

  const getImageUrl = (imageUrl) => {
    if (!imageUrl) return null;
    return imageUrl.startsWith('http') ? imageUrl : `${API_URL}${imageUrl}`;
  };

  const getProductById = (productId) => {
    if (!productId || !Array.isArray(myProducts)) return null;
    return myProducts.find(p => p.id === productId);
  };

  const sellerOrders = user?.name
    ? orders.filter((order) => (order.sellerName || '').toLowerCase() === user.name.toLowerCase())
    : orders;

  const pendingOrdersCount = sellerOrders?.filter((o) => o.status === 'pending').length || 0;
  const isSellerMember = Boolean(isSeller || String(user?.membership_type || '').toLowerCase() === 'seller');

  const handleSellerRestriction = useCallback((action = 'this feature') => {
    const message = `Hello admin, I need help with my seller account access. I was trying to use the ${action} feature and need assistance.`;
    const url = buildWhatsAppUrl(CONTACT_ADMIN_PHONE, message);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    toast.error('Seller accounts can only use Overview and Orders. Please contact the admin on WhatsApp for other access.');
  }, []);

  useEffect(() => {
    if (pendingOrdersCount > 0) {
      if (audioRef.current) {
        audioRef.current.loop = true;
        audioRef.current.play().catch(() => {});
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [pendingOrdersCount, user?.name, orders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === 'marketplace') {
      fetchMyProducts();
      fetchOrders();
    }
  }, [activeTab, fetchMyProducts, fetchOrders]);

  useEffect(() => {
    sellerInitialTabSet.current = false;
  }, [user?.name]);

  useEffect(() => {
    if (isSellerMember && !sellerInitialTabSet.current) {
      setActiveTab('marketplace');
      sellerInitialTabSet.current = true;
    }
  }, [isSellerMember]);

  useEffect(() => {
    if (isSellerMember && !['overview', 'marketplace'].includes(activeTab)) {
      setActiveTab('marketplace');
    }
  }, [activeTab, isSellerMember]);

  const handleOrderStatusChange = async (orderId, status) => {
    try {
      // When rejected, delete the order entirely per product requirement
      if (status === 'rejected') {
        await axios.delete(`${API_URL}/api/orders/${orderId}`, {
          headers: getAuthHeaders(),
        });
        setOrders((prev) => prev.filter((order) => order.id !== orderId));
        toast.success('Order rejected and removed.');
        return;
      }
      await axios.patch(`${API_URL}/api/orders/${orderId}/status`, {
        status,
        notes: '',
      }, {
        headers: getAuthHeaders(),
      });
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId ? { ...order, status } : order
        )
      );
      toast.success(`Order ${status === 'approved' ? 'approved' : status} successfully.`);
    } catch (err) {
      console.error('Failed to update order status:', err);
      toast.error(err.response?.data?.detail || 'Failed to update order status');
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm('Delete this order? This action cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/api/orders/${orderId}`, {
        headers: getAuthHeaders(),
      });
      setOrders((prev) => prev.filter((order) => order.id !== orderId));
      toast.success('Order deleted.');
    } catch (err) {
      console.error('Failed to delete order:', err);
      toast.error(err.response?.data?.detail || 'Failed to delete order');
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!window.confirm('Delete this product? This action cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/api/products/${productId}`, {
        headers: getAuthHeaders(),
      });
      setMyProducts((prev) => prev.filter((p) => p.id !== productId));
      toast.success('Product deleted.');
    } catch (err) {
      console.error('Failed to delete product:', err);
      toast.error(err.response?.data?.detail || 'Failed to delete product');
    }
  };

  const handleToggleSoldOut = async (product) => {
    const newSoldOut = !product.sold_out;
    try {
      const res = await axios.patch(`${API_URL}/api/products/${product.id}`, {
        sold_out: newSoldOut,
      }, {
        headers: getAuthHeaders(),
      });
      setMyProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, ...res.data } : p)));
      toast.success(newSoldOut ? 'Marked as sold out.' : 'Marked as available.');
    } catch (err) {
      console.error('Failed to update product:', err);
      toast.error(err.response?.data?.detail || 'Failed to update product');
    }
  };

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

  const targetDepositMember = depositTargetUserId
    ? members.find((m) => m.id === depositTargetUserId)
    : null;
  const targetMembershipType = targetDepositMember?.membership_type || user?.membership_type || 'ordinary';
  const targetDepositSlots = targetDepositMember?.max_guarantees ?? user?.max_guarantees ?? 1;
  const savingsMinAmount = targetMembershipType === 'premium' ? 52000 * targetDepositSlots : 500;
  const savingsPlaceholder = targetMembershipType === 'premium' ? String(savingsMinAmount) : '500';

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
      setDepositAmount(depositType === 'savings' ? String(savingsMinAmount) : depositType === 'development_fee' ? '3000' : '0');
      setDepositDescription('');
      setRepayLoanId('');
      setLoanRepaymentAmount('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit deposit');
    }
  };

  const handleOpenDepositForMember = (memberId) => {
    const member = members.find((m) => m.id === memberId);
    const minAmount = member?.membership_type === 'premium' ? 52000 * (member?.max_guarantees ?? 1) : 500;
    setDepositTargetUserId(memberId);
    setDepositType('savings');
    setDepositAmount(String(minAmount));
    setDepositDescription('');
    setDepositDialogOpen(true);
  };

  const handleLoan = async (e) => {
    e.preventDefault();
    if (!loanGuarantor) {
      toast.error('Please select a guarantor');
      return;
    }
    const loanAmountValue = parseFloat(loanAmount) || 0;
    const selectedGuarantor = members.find((m) => m.id === loanGuarantor);
    if (!selectedGuarantor) {
      toast.error('Selected guarantor not found');
      return;
    }
      if (((selectedGuarantor.membership_type || '').toLowerCase() !== 'premium') && loanAmountValue > 0) {
      const requiredSavings = loanAmountValue / 2;
      if ((selectedGuarantor.total_savings || 0) < requiredSavings) {
        toast.error('Selected ordinary guarantor must have savings equal to at least 50% of the requested loan');
        return;
      }
    }
    try {
      await axios.post(
        `${API_URL}/api/loans/request`,
        { 
          amount: loanAmountValue, 
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
      setWithdrawalType('savings');
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

  const handleDistributeInterest = async () => {
    try {
      setDistributingInterest(true);
      const headers = getAuthHeaders();
      const res = await axios.post(`${API_URL}/api/stats/distribute-interest`, null, { headers });
      toast.success(res.data?.message || 'Interest distributed successfully');
      await fetchData();
      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to distribute interest');
    } finally {
      setDistributingInterest(false);
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

  const handleApproveQuickLoan = async (id, approved) => {
    try {
      await axios.post(
        `${API_URL}/api/quick-loans/approve`,
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

  const navItems = isSellerMember
    ? [
        { id: 'overview', label: 'Overview', icon: Wallet },
        { id: 'marketplace', label: 'Orders', icon: ShoppingCart },
      ]
    : [
        { id: 'overview', label: 'Overview', icon: Wallet },
        { id: 'financials', label: 'Financials', icon: BarChart3 },
        { id: 'petty-cash', label: 'Petty Cash', icon: Receipt },
        { id: 'members', label: 'Members', icon: Users },
        { id: 'marketplace', label: 'Orders', icon: ShoppingCart },
      ];

  if (!isSellerMember && (isAdmin || isTreasurer)) {
    navItems.push({ id: 'services', label: 'Services', icon: Settings });
  }

  if (!isSellerMember && isAdmin) {
    navItems.push({ id: 'admin', label: 'Admin', icon: Shield });
  }

  const loanAmountValue = parseFloat(loanAmount) || 0;

  // Get eligible guarantors: any member except self, with available guarantee slots.
  // Ordinary guarantors must have at least 50% of the requested loan amount in savings.
  const eligibleGuarantors = members.filter(m => {
    if (m.id === user?.id) return false;
    const currentGuarantees = loans.filter(l => 
      l.guarantor_id === m.id && 
      ['pending_guarantor', 'pending_admin', 'approved'].includes(l.status) && 
      !l.repaid
    ).length;
    const maxGuarantees = m.max_guarantees ?? 2;
    if (currentGuarantees >= maxGuarantees) return false;
    if (((m.membership_type || '').toLowerCase()) === 'premium') return true;
    if (loanAmountValue <= 0) return true;
    return (m.total_savings || 0) >= loanAmountValue / 2;
  });

// Loans where current user is the selected guarantor and awaiting their approval
  const pendingGuarantorLoans = loans.filter(l => 
    l.guarantor_id === user?.id && l.status === 'pending_guarantor'
  );

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <Toaster position="top-right" richColors />
      <audio ref={audioRef} src="/images/app_icons/cart_images/order_ring_tone.m4a" preload="auto" />
      
      {dataLoading && (
        <div className="fixed top-16 left-0 right-0 bg-[#E8B25C]/20 text-[#E8B25C] p-2 text-center text-sm z-40">
          Loading data...
        </div>
      )}
      
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/90 border-b border-[#E8EBE8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img 
                src="/logo.png" 
                alt="Class One Logo"
                className="w-12 h-12 rounded-full object-cover"
              />
              <span className="text-xl font-bold font-['Manrope'] text-[#1E231F]">Class One Savings</span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => item.id === 'services' ? navigate('/services-management') : setActiveTab(item.id)}
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

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#1E231F] leading-tight">{user?.name}</p>
                  {user?.member_code && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(user.member_code);
                          setCopiedMemberCode(true);
                          setTimeout(() => setCopiedMemberCode(false), 1500);
                        } catch {
                          toast.error('Failed to copy member code');
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-[#2C5530] bg-[#ECF8E9] border border-[#2C5530]/20 rounded-full px-1.5 py-0.5 hover:bg-[#2C5530]/10 leading-none"
                      title="Copy member code"
                    >
                      {user.member_code}
                      {copiedMemberCode ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                    </button>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/shop')}
                className="text-[#5C665D] hover:text-[#2C5530] hover:bg-[#ECF8E9]"
              >
                <ShoppingCart className="w-5 h-5" />
              </Button>
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
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
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
                    if (item.id === 'services') {
                      navigate('/services-management');
                    } else {
                      setActiveTab(item.id);
                    }
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
             {isSellerMember ? (
               <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                 <CardContent className="p-8 space-y-4">
                   <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#D48C70]/10 text-[#D48C70]">
                     <Shield className="w-6 h-6" />
                   </div>
                   <div className="space-y-2">
                     <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Seller account access is restricted</h2>
                     <p className="text-[#5C665D]">
                       Seller accounts can only use Overview and Orders. Financial features are hidden and protected.
                     </p>
                   </div>
                   <Button
                     onClick={() => handleSellerRestriction('overview')}
                     className="bg-[#25D366] hover:bg-[#1EA852] text-white"
                   >
                     <MessageCircle className="w-4 h-4 mr-2" />
                     Contact Admin on WhatsApp
                   </Button>
                 </CardContent>
               </Card>
             ) : (
               <>
             {/* Stats Cards */}
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
               {/* Total Group Balance - Only Treasurer can edit */}
               <Card className="md:col-span-2 lg:col-span-2 bg-[#2C5530] border-none shadow-lg" data-testid="total-balance-card">
                 <CardContent className="p-6">
                   <div className="flex items-center justify-between">
                     <div>
                       <p className="text-white/70 text-sm font-medium uppercase tracking-wide">Total Group Balance</p>
                       <p className="text-4xl font-extrabold text-white font-numbers mt-2">
                         {stats ? formatCurrency(stats.total_group_balance) : '—'}
                       </p>
                       <p className="text-white/70 text-sm mt-2">
                         {stats ? `${stats.total_members} members • Year ends ${stats.year_end_date}` : 'Loading...'}
                       </p>
                     </div>
                     <div className="flex flex-col items-end gap-2">
                       <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                         <Wallet className="w-8 h-8 text-white" />
                       </div>
                       {isAdmin && (
                         <div className="flex flex-col gap-2 items-end">
                           {isTreasurer && (
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
                           <Button
                             size="sm"
                             variant="secondary"
                             className="text-xs"
                             onClick={handleDistributeInterest}
                             disabled={distributingInterest}
                           >
                             {distributingInterest ? 'Distributing...' : 'Distribute Interest'}
                           </Button>
                         </div>
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
              <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="h-full bg-[#347242] hover:bg-[#2C5530] rounded-xl flex items-center justify-center gap-2 py-6">
                    <ArrowUpRight className="w-5 h-5" />
                    <span className="font-semibold">New Deposit</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-['Manrope'] text-[#1E231F]">New Deposit</DialogTitle>
                    <DialogDescription className="text-[#5C665D]">Submit a deposit request for approval</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleDeposit} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Deposit Type</Label>
                       <Select value={depositType} onValueChange={setDepositType}>
                         <SelectTrigger>
                           <SelectValue />
                         </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="savings">Savings</SelectItem>
                            <SelectItem value="development_fee">Development Fee</SelectItem>
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
                        placeholder="500"
                        required
                        min="1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={depositDescription}
                        onChange={(e) => setDepositDescription(e.target.value)}
                        placeholder="Optional description..."
                      />
                     </div>
                      {depositType === 'loan_payment' && (
                        <div className="space-y-3 p-3 bg-[#FAFAF8] rounded-lg border border-[#E8EBE8]">
                        <p className="text-xs text-[#5C665D]">Outstanding loan balance: {formatCurrency(userLoanBalance)}</p>
                        {loans.filter(l => l.user_id === user?.id && l.status === 'approved' && !l.repaid).length > 0 ? (
                          <>
                            <div className="space-y-2">
                              <Label>Select Loan</Label>
                              <Select value={repayLoanId} onValueChange={setRepayLoanId}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a loan" />
                                </SelectTrigger>
                                <SelectContent>
                                  {loans.filter(l => l.user_id === user?.id && l.status === 'approved' && !l.repaid).map((l) => {
                                    const total_repaid = (l.amount_repaid || 0) + (l.interest_repaid || 0);
                                    const outstanding = Math.max(0, (l.total_due || l.outstanding_balance || 0) - total_repaid);
                                    return (
                                      <SelectItem key={l.id} value={l.id}>
                                        {formatCurrency(l.amount)} - {l.guarantor_name} (Due: {formatCurrency(outstanding)})
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Repayment Amount (UGX)</Label>
                              <Input
                                type="number"
                                value={loanRepaymentAmount}
                                onChange={(e) => setLoanRepaymentAmount(e.target.value)}
                                placeholder="0"
                                min="1"
                                max={repayLoanId ? (() => {
                                  const loan = loans.find(l => l.id === repayLoanId);
                                  if (!loan) return 0;
                                  const total_repaid = (loan.amount_repaid || 0) + (loan.interest_repaid || 0);
                                  return Math.max(0, (loan.total_due || loan.outstanding_balance || 0) - total_repaid);
                                })() : 0}
                              />
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-[#5C665D]">You have no active loans to repay.</p>
                        )}
                      </div>
                      )}
                      <Button type="submit" className="w-full bg-[#2C5530] hover:bg-[#214024] rounded-full">
                        Submit Request
                      </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="h-full bg-[#D48C70] hover:bg-[#BD7B60] rounded-xl flex items-center justify-center gap-2 py-6" disabled={!isPremium}>
                    <CreditCard className="w-5 h-5" />
                    <span className="font-semibold">Request Loan</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-['Manrope'] text-[#1E231F]">Request Loan</DialogTitle>
                    <DialogDescription className="text-[#5C665D]">Select a guarantor and submit your loan request</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleLoan} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Amount (UGX)</Label>
                      <Input
                        type="number"
                        value={loanAmount}
                        onChange={(e) => setLoanAmount(e.target.value)}
                        placeholder="50000"
                        required
                        min="1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Guarantor</Label>
                      <Select value={loanGuarantor} onValueChange={setLoanGuarantor}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a guarantor" />
                        </SelectTrigger>
                        <SelectContent>
                          {members.filter(m => m.id !== user?.id).map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name} ({m.membership_type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Reason</Label>
                      <Textarea
                        value={loanReason}
                        onChange={(e) => setLoanReason(e.target.value)}
                        placeholder="Reason for loan..."
                      />
                    </div>
                    <Button type="submit" className="w-full bg-[#D48C70] hover:bg-[#BD7B60] rounded-full">
                      Submit Request
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="h-full bg-[#5C665D] hover:bg-[#4A584A] rounded-xl flex items-center justify-center gap-2 py-6 text-white">
                    <ArrowDownRight className="w-5 h-5" />
                    <span className="font-semibold">Request Withdrawal</span>
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
                    const canDelete = d.user_id === user?.id || isTreasurer;
                    return (
                    <div key={d.id} className="flex items-center justify-between py-3 border-b border-[#E8EBE8] last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#347242]/10 rounded-full flex items-center justify-center">
                          <ArrowUpRight className="w-5 h-5 text-[#347242]" />
                        </div>
                        <div>
                          <p className="font-medium text-[#1E231F]">
                             {d.deposit_type === 'development_fee' ? 'Development Fee' : d.deposit_type === 'loan_payment' ? 'Loan Payment' : 'Savings Deposit'}
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
              </>
            )}
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
                   <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="font-['Manrope'] text-[#1E231F]">New Deposit</DialogTitle>
                      <DialogDescription className="text-[#5C665D]">Submit a deposit request for approval</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleDeposit} className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>Deposit Type</Label>
                        <Select value={depositType} onValueChange={setDepositType}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="savings">Savings</SelectItem>
                            <SelectItem value="development_fee">Development Fee</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Amount (UGX)</Label>
                        <Input
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="500"
                          required
                          min="1"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          value={depositDescription}
                          onChange={(e) => setDepositDescription(e.target.value)}
                          placeholder="Optional description..."
                        />
                        </div>
                        {depositType === 'loan_payment' && (
                          <div className="space-y-3 p-3 bg-[#FAFAF8] rounded-lg border border-[#E8EBE8]">
                            <p className="text-xs text-[#5C665D]">Outstanding loan balance: {formatCurrency(userLoanBalance)}</p>
                            {loans.filter(l => l.user_id === user?.id && l.status === 'approved' && !l.repaid).length > 0 ? (
                              <>
                                <div className="space-y-2">
                                  <Label>Select Loan</Label>
                                  <Select value={repayLoanId} onValueChange={setRepayLoanId}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select a loan" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {loans.filter(l => l.user_id === user?.id && l.status === 'approved' && !l.repaid).map((l) => {
                                        const total_repaid = (l.amount_repaid || 0) + (l.interest_repaid || 0);
                                        const outstanding = Math.max(0, (l.total_due || l.outstanding_balance || 0) - total_repaid);
                                        return (
                                          <SelectItem key={l.id} value={l.id}>
                                            {formatCurrency(l.amount)} - {l.guarantor_name} (Due: {formatCurrency(outstanding)})
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Repayment Amount (UGX)</Label>
                                  <Input
                                    type="number"
                                    value={loanRepaymentAmount}
                                    onChange={(e) => setLoanRepaymentAmount(e.target.value)}
                                    placeholder="0"
                                    min="1"
                                    max={repayLoanId ? (() => {
                                      const loan = loans.find(l => l.id === repayLoanId);
                                      if (!loan) return 0;
                                      const total_repaid = (loan.amount_repaid || 0) + (loan.interest_repaid || 0);
                                      return Math.max(0, (loan.total_due || loan.outstanding_balance || 0) - total_repaid);
                                    })() : 0}
                                  />
                                </div>
                              </>
                            ) : (
                              <p className="text-xs text-[#5C665D]">You have no active loans to repay.</p>
                            )}
                          </div>
                        )}
                        <Button type="submit" className="w-full bg-[#2C5530] hover:bg-[#214024] rounded-full">
                          Submit Request
                        </Button>
                    </form>
                  </DialogContent>
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
                        const canDelete = d.user_id === user?.id || isTreasurer;
                        return (
                        <tr key={d.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5] transition-colors">
                          <td className="py-4 px-6 text-[#1E231F]">
                            {new Date(d.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-6 text-[#1E231F]">
                            {d.deposit_type === 'development_fee' ? 'Development' : d.deposit_type === 'loan_payment' ? 'Loan Payment' : 'Savings'}
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
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="font-['Manrope'] text-[#1E231F]">Request Loan</DialogTitle>
                      <DialogDescription className="text-[#5C665D]">Select a guarantor and submit your loan request</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleLoan} className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>Amount (UGX)</Label>
                        <Input
                          type="number"
                          value={loanAmount}
                          onChange={(e) => setLoanAmount(e.target.value)}
                          placeholder="50000"
                          required
                          min="1"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Guarantor</Label>
                        <Select value={loanGuarantor} onValueChange={setLoanGuarantor}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a guarantor" />
                          </SelectTrigger>
                          <SelectContent>
                            {members.filter(m => m.id !== user?.id).map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name} ({m.membership_type})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Reason</Label>
                        <Textarea
                          value={loanReason}
                          onChange={(e) => setLoanReason(e.target.value)}
                          placeholder="Reason for loan..."
                        />
                      </div>
                      <Button type="submit" className="w-full bg-[#D48C70] hover:bg-[#BD7B60] rounded-full">
                        Submit Request
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
                )}
              </div>
            </div>

            {user?.member_code && (              <Card className="bg-[#ECF8E9] border border-[#2C5530]/20">
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#1E231F]">My Member Code</p>
                    <p className="text-xs text-[#5C665D]">Use this as officer/member code for quick loans.</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(user.member_code);
                        setCopiedMemberCode(true);
                        setTimeout(() => setCopiedMemberCode(false), 1500);
                      } catch {
                        toast.error('Failed to copy member code');
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-[#2C5530]/30 bg-white px-3 py-1.5 text-sm font-mono font-semibold text-[#2C5530] hover:bg-[#2C5530]/10"
                  >
                    <span>{user.member_code}</span>
                    {copiedMemberCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </CardContent>
              </Card>
            )}

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
                              {(l.user_id === user?.id || isTreasurer) && (
                                <button
                                  onClick={() => handleDeleteRecord('loans', l.id)}
                                  data-testid={`delete-loan-${l.id}`}
                                  title="Delete record"
                                  className="p-1.5 rounded-full text-[#D05A49] hover:bg-[#D05A49]/10 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!showNotifyGuarantor && !(l.user_id === user?.id || isTreasurer) && (
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
                      <Button className="bg-[#5C665D] hover:bg-[#4A584A] rounded-full text-white">
                        <Plus className="w-4 h-4 mr-2" />
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
                        const canDelete = w.user_id === user?.id || isTreasurer;
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
                    {isTreasurer && m.id !== user?.id && (
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

        {/* Group Rules inside Members */}
        {(activeTab === 'members' || activeTab === 'rules') && (
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

        {/* Marketplace Tab */}
        {activeTab === 'marketplace' && (
          <div className="space-y-6 animate-fade-in" data-testid="marketplace-tab">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Order handling</h2>
                <p className="text-sm text-[#5C665D] max-w-2xl">
                  Review buyer order requests from the shop page and approve or reject them.
                </p>
              </div>
              <Badge className="bg-[#2C5530]/10 text-[#2C5530]">Incoming orders</Badge>
            </div>

            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Order requests</CardTitle>
                <CardDescription>
                  When a buyer places an order, it appears here for you to approve and contact them.
                </CardDescription>
              </CardHeader>
               <CardContent className="space-y-5">
                {sellerOrders.length === 0 ? (
                  <div className="rounded-xl border border-[#E8EBE8] bg-[#F7FCF4] p-6 text-sm text-[#4B5A45]">
                    No order requests found yet. Buyers can place orders from the shop page, and they will appear here for review.
                  </div>
                ) : (
                  sellerOrders.map((order) => {
                    const orderProducts = [];
                    if (order.products && Array.isArray(order.products) && order.products.length > 0) {
                      order.products.forEach((p) => {
                        const known = getProductById(p.productId || p.id);
                        orderProducts.push({
                          id: p.productId || p.id,
                          title: p.title || known?.title || 'Product',
                          price: p.price || known?.price || 0,
                          quantity: p.quantity || 1,
                          image: known?.image_url || known?.image_urls?.[0] || known?.imageUrl || p.image || p.imageUrl || p.imageUrl || null,
                          description: known?.description || '',
                          sellerName: known?.sellerName || order.sellerName || 'Member',
                        });
                      });
                    } else if (order.productId || order.productTitle) {
                      const known = getProductById(order.productId);
                      orderProducts.push({
                        id: order.productId,
                        title: order.productTitle || known?.title || 'Product',
                        price: order.productPrice || known?.price || 0,
                        quantity: 1,
                        image: known?.image_url || known?.image_urls?.[0] || known?.imageUrl || order.productImage || order.productImageUrl || null,
                        description: known?.description || '',
                        sellerName: known?.sellerName || order.sellerName || 'Member',
                      });
                    }

                    const orderTotal = Number(order.total || orderProducts.reduce((sum, p) => sum + p.price * p.quantity, 0) || 0);
                    const requestedDate = new Date(order.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div key={order.id} className="rounded-3xl border border-[#E8EBE8] bg-white p-6 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex-1 space-y-4">
                            <div className="flex items-center gap-2">
                              <p className="text-xs uppercase tracking-[0.25em] text-[#2B6F38]">Request</p>
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${order.status === 'approved' ? 'bg-[#DEF2DD] text-[#2C5530]' : order.status === 'rejected' ? 'bg-[#FBD7D4] text-[#D05A49]' : 'bg-[#FEF6E8] text-[#C57A17]'}`}>
                                {order.status === 'pending' ? 'Pending' : order.status === 'approved' ? 'Approved' : 'Rejected'}
                              </span>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {orderProducts.map((p, idx) => (
                                <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3 flex gap-3">
                                  {p.image ? (
                                    <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-slate-50">
                                      <img src={getImageUrl(p.image)} alt={p.title} className="h-full w-full object-cover" />
                                    </div>
                                  ) : (
                                    <div className="h-16 w-16 shrink-0 rounded-lg bg-slate-100 flex items-center justify-center">
                                      <ImageIcon className="h-6 w-6 text-slate-400" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-[#172B12] line-clamp-2">{p.title}</p>
                                    <p className="text-xs text-[#4B5A45] mt-0.5">UGX {Number(p.price).toLocaleString()} × {p.quantity}</p>
                                    <p className="text-sm font-bold text-[#2B6F38] mt-0.5">UGX {(p.price * p.quantity).toLocaleString()}</p>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <p className="text-sm font-semibold text-[#172B12]">Order total: <span className="text-[#EA580C]">UGX {orderTotal.toLocaleString()}</span></p>

                            <div className="rounded-2xl bg-[#F7F9F5] p-4 text-sm text-[#4B5A45] space-y-2">
                              <p>Buyer: <span className="font-semibold text-[#172B12]">{order.buyerName}</span></p>
                              <p>Phone: <a className="text-[#172B12] underline" href={`tel:${order.buyerPhone}`}>{order.buyerPhone}</a></p>
                              {order.buyerEmail && (
                                <p>Email: <a className="text-[#172B12] underline" href={`mailto:${order.buyerEmail}`}>{order.buyerEmail}</a></p>
                              )}
                              <p className="text-xs text-[#6B7C61]">Requested {requestedDate}</p>
                              <div className="flex flex-wrap gap-2 pt-1">
                                {order.buyerPhone && (
                                  <a
                                    className="inline-flex items-center rounded-full border border-[#2C5530] px-3 py-1 text-sm text-[#2C5530] hover:bg-[#2C5530]/5"
                                    href={buildWhatsAppUrl(order.buyerPhone, `Hello ${order.buyerName}, your order request is being reviewed.`)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Message on WhatsApp
                                  </a>
                                )}
                                {order.buyerEmail && (
                                  <a className="inline-flex items-center rounded-full border border-[#2C5530] px-3 py-1 text-sm text-[#2C5530] hover:bg-[#2C5530]/5" href={`mailto:${order.buyerEmail}`}>
                                    Send email
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 lg:text-right">
                            <p className="text-xs text-[#6B7C61]">Order #{order.id?.slice(-6).toUpperCase()}</p>
                            <p className="text-xs text-[#6B7C61]">{requestedDate}</p>
                          </div>
                        </div>

                        {order.note && (
                          <div className="mt-4 rounded-2xl bg-[#F7F9F5] p-4 text-sm text-[#4B5A45]">
                            <p className="font-semibold text-[#172B12] mb-1">Buyer note</p>
                            <p>{order.note}</p>
                          </div>
                        )}

                        {order.status === 'pending' && (
                          <div className="mt-4 flex flex-wrap gap-3">
                            <Button size="sm" className="bg-[#2C5530] text-white hover:bg-[#1A3B20]" onClick={() => handleOrderStatusChange(order.id, 'approved')}>
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" className="border-[#D05A49] text-[#D05A49] hover:bg-[#FDE8E7]" onClick={() => handleOrderStatusChange(order.id, 'rejected')}>
                              Reject
                            </Button>
                            <Button size="sm" variant="outline" className="border-[#9B9B9B] text-[#5C665D] hover:bg-[#F1F1F1]" onClick={() => handleDeleteOrder(order.id)}>
                              Delete
                            </Button>
                          </div>
                        )}
                        {order.status !== 'pending' && (
                          <div className="mt-4 flex flex-wrap gap-3">
                            <Button size="sm" variant="outline" className="border-[#9B9B9B] text-[#5C665D] hover:bg-[#F1F1F1]" onClick={() => handleDeleteOrder(order.id)}>
                              Delete
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Your listed products</CardTitle>
                <CardDescription>
                  These are the items buyers can order from you on the shop page.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {!Array.isArray(myProducts) || myProducts.length === 0 ? (
                  <div className="rounded-xl border border-[#E8EBE8] bg-[#F7FCF4] p-6 text-sm text-[#4B5A45]">
                    No products found. Your current shop listings will appear here when available.
                  </div>
                ) : myProducts.map((product) => (
                  <Card key={product.id} className="bg-white border border-[#E8EBE8] shadow-sm">
                    {product.image_url && (
                      <div className="overflow-hidden rounded-t-3xl relative">
                        <img
                          src={getImageUrl(product.image_url)}
                          alt={product.title}
                          className={`h-48 w-full object-cover ${product.sold_out ? 'opacity-60 grayscale' : ''}`}
                        />
                        {product.sold_out && (
                          <span className="absolute top-3 left-3 inline-flex items-center rounded-full bg-[#D05A49] px-3 py-1 text-xs font-semibold text-white shadow">
                            Sold Out
                          </span>
                        )}
                      </div>
                    )}
                    <CardContent>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <CardTitle className="text-lg">{product.title}</CardTitle>
                          <p className="text-sm text-[#5C665D]">{PRODUCT_CATEGORIES.find((cat) => cat.value === product.category)?.label || product.category}</p>
                        </div>
                        <Badge variant="secondary">UGX {Number(product.price).toLocaleString()}</Badge>
                      </div>
                      <p className="text-sm text-[#5C665D] mb-3">{product.description || 'No description provided'}</p>
                      <p className="text-xs text-[#6B7C61] mb-3">Uploaded {new Date(product.created_at || product.createdAt).toLocaleDateString()}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className={product.sold_out
                            ? 'border-[#2C5530] text-[#2C5530] hover:bg-[#2C5530]/5'
                            : 'border-[#C57A17] text-[#C57A17] hover:bg-[#FEF6E8]'}
                          onClick={() => handleToggleSoldOut(product)}
                        >
                          {product.sold_out ? 'Mark Available' : 'Mark Sold Out'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[#D05A49] text-[#D05A49] hover:bg-[#FDE8E7]"
                          onClick={() => handleDeleteProduct(product.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
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

            <div className="flex items-center gap-1 bg-[#F5F7F5] p-1 rounded-xl w-fit">
              <button 
                onClick={() => setActiveFinancialTab('overview')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeFinancialTab === 'overview' ? 'bg-white text-[#1E231F] shadow-sm' : 'text-[#5C665D] hover:text-[#1E231F]'}`}
              >
                Financials
              </button>
              <button 
                onClick={() => setActiveFinancialTab('deposits')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeFinancialTab === 'deposits' ? 'bg-white text-[#1E231F] shadow-sm' : 'text-[#5C665D] hover:text-[#1E231F]'}`}
              >
                Deposits
              </button>
              <button 
                onClick={() => setActiveFinancialTab('loans')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeFinancialTab === 'loans' ? 'bg-white text-[#1E231F] shadow-sm' : 'text-[#5C665D] hover:text-[#1E231F]'}`}
              >
                Loans
              </button>
              <button 
                onClick={() => setActiveFinancialTab('withdrawals')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeFinancialTab === 'withdrawals' ? 'bg-white text-[#1E231F] shadow-sm' : 'text-[#5C665D] hover:text-[#1E231F]'}`}
              >
                Withdrawals
              </button>
              {isAdmin && (
                <button 
                  onClick={() => setActiveFinancialTab('petty-cash')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeFinancialTab === 'petty-cash' ? 'bg-white text-[#1E231F] shadow-sm' : 'text-[#5C665D] hover:text-[#1E231F]'}`}
                >
                  Petty Cash
                </button>
              )}
            </div>

            {activeFinancialTab === 'overview' && (
            <div className="space-y-6">
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
                    <div className="w-10 h-10 bg-[#347242]/10 rounded-full flex items-center justify-center">
                      <PiggyBank className="w-5 h-5 text-[#347242]" />
                    </div>
                    <div>
                      <p className="text-xs text-[#5C665D]">Net Member Savings</p>
                      <p className="text-lg font-bold text-[#347242] font-numbers">
                        {formatCurrency(Math.max(0, (financials?.total_savings || 0) - (financials?.active_loans_amount || 0)))}
                      </p>
                      <p className="text-xs text-[#5C665D]">Member savings after active loans</p>
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
                      <p className="text-xs text-[#5C665D] mt-1">Deducted from Member Savings only</p>
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
            </div>
            )}

            {activeFinancialTab === 'deposits' && (
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardHeader>
                <CardTitle className="font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                  <ArrowUpRight className="w-5 h-5 text-[#347242]" />
                  Deposits
                </CardTitle>
              </CardHeader>
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
                      </tr>
                    </thead>
                    <tbody>
                      {deposits.slice(0, 20).map((d) => (
                        <tr key={d.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5] transition-colors">
                          <td className="py-4 px-6 text-[#1E231F]">
                            {new Date(d.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-6 text-[#1E231F]">
                            {d.deposit_type === 'development_fee' ? 'Development' : d.deposit_type === 'loan_payment' ? 'Loan Payment' : 'Savings'}
                          </td>
                          <td className="py-4 px-6 font-semibold text-[#347242] font-numbers">
                            {formatCurrency(d.amount)}
                          </td>
                          <td className="py-4 px-6 text-[#D05A49] font-numbers">
                            {d.late_fee > 0 ? formatCurrency(d.late_fee) : '-'}
                          </td>
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
            )}

            {activeFinancialTab === 'loans' && (
            <div className="space-y-6">
            {/* Loans Awaiting Your Guarantor Approval */}
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
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleGuarantorApproval(l.id, false)}
                            data-testid={`guarantor-reject-${l.id}`}
                            variant="outline"
                            className="border-[#D05A49] text-[#D05A49] hover:bg-[#D05A49]/10 rounded-full"
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Decline
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardHeader>
                <CardTitle className="font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#D48C70]" />
                  Loans
                </CardTitle>
              </CardHeader>
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
                      </tr>
                    </thead>
                    <tbody>
                      {loans.slice(0, 20).map((l) => (
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
                          </td>
                          <td className="py-4 px-6 font-semibold text-[#1E231F] font-numbers">
                            {formatCurrency(l.total_due || l.outstanding_balance || l.initial_total_due || l.amount * 1.03)}
                          </td>
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

            {activeFinancialTab === 'withdrawals' && (
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardHeader>
                <CardTitle className="font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                  <ArrowDownRight className="w-5 h-5 text-[#D05A49]" />
                  Withdrawals
                </CardTitle>
              </CardHeader>
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
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawals.slice(0, 20).map((w) => (
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
            )}

            {activeFinancialTab === 'petty-cash' && isAdmin && (
            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardHeader>
                <CardTitle className="font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-[#D48C70]" />
                  Petty Cash Expenses
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#E8EBE8] bg-[#FAFAF8]">
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Date</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Amount</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Category</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Description</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(financials?.petty_cash_items || []).map((pc) => (
                        <tr key={pc.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5] transition-colors">
                          <td className="py-4 px-6 text-[#1E231F]">
                            {new Date(pc.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-6 font-semibold text-[#D48C70] font-numbers">
                            {formatCurrency(pc.amount)}
                          </td>
                          <td className="py-4 px-6 text-[#1E231F]">
                            {pc.category ? pc.category.charAt(0).toUpperCase() + pc.category.slice(1) : '-'}
                          </td>
                          <td className="py-4 px-6 text-[#5C665D]">{pc.description || '-'}</td>
                          <td className="py-4 px-6">
                            <button
                              onClick={() => handleDeleteRecord('petty-cash', pc.id)}
                              data-testid={`delete-petty-cash-${pc.id}`}
                              title="Delete petty cash entry"
                              className="p-1.5 rounded-full text-[#D05A49] hover:bg-[#D05A49]/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(!financials?.petty_cash_items || financials.petty_cash_items.length === 0) && (
                    <p className="text-center text-[#5C665D] py-8">No petty cash expenses yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
            )}
          </div>
        )}

        {/* Petty Cash Tab */}
        {activeTab === 'petty-cash' && isAdmin && (
          <div className="space-y-6 animate-fade-in" data-testid="petty-cash-tab">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-2xl font-bold font-['Manrope'] text-[#1E231F]">Petty Cash Management</h2>
              <div className="flex items-center gap-2">
                {financials?.petty_cash_items?.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => exportPettyCashPDF(financials.petty_cash_items)}
                    data-testid="export-petty-cash-pdf-tab"
                    className="border-[#E8EBE8] rounded-full"
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                )}
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
              </div>
            </div>

            <Card className="bg-white border border-[#E8EBE8] shadow-sm">
              <CardHeader>
                <CardTitle className="font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-[#D48C70]" />
                  All Petty Cash Expenses
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#E8EBE8] bg-[#FAFAF8]">
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Date</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Amount</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Category</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Description</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-[#5C665D]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(financials?.petty_cash_items || []).map((pc) => (
                        <tr key={pc.id} className="border-b border-[#E8EBE8] hover:bg-[#F5F7F5] transition-colors">
                          <td className="py-4 px-6 text-[#1E231F]">
                            {new Date(pc.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-6 font-semibold text-[#D48C70] font-numbers">
                            {formatCurrency(pc.amount)}
                          </td>
                          <td className="py-4 px-6 text-[#1E231F]">
                            {pc.category ? pc.category.charAt(0).toUpperCase() + pc.category.slice(1) : '-'}
                          </td>
                          <td className="py-4 px-6 text-[#5C665D]">{pc.description || '-'}</td>
                          <td className="py-4 px-6">
                            <button
                              onClick={() => handleDeleteRecord('petty-cash', pc.id)}
                              data-testid={`delete-petty-cash-main-${pc.id}`}
                              title="Delete petty cash entry"
                              className="p-1.5 rounded-full text-[#D05A49] hover:bg-[#D05A49]/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(!financials?.petty_cash_items || financials.petty_cash_items.length === 0) && (
                    <p className="text-center text-[#5C665D] py-8">No petty cash expenses yet</p>
                  )}
                </div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
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
            
              {/* Loans Awaiting Guarantor Approval */}
              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-[#E8B25C]" />
                    Loans Awaiting Guarantor ({loans.filter(l => l.status === 'pending_guarantor').length})
                  </CardTitle>
                  <p className="text-xs text-[#5C665D]">Loans waiting for selected guarantor to approve</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loans.filter(l => l.status === 'pending_guarantor').map((l) => (
                    <div key={l.id} className="p-3 bg-[#FAFAF8] rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-[#1E231F]">{l.user_name}</span>
                        <span className="font-semibold text-[#D48C70] font-numbers">{formatCurrency(l.amount)}</span>
                      </div>
                      <p className="text-xs text-[#5C665D] mb-1">
                        <UserCheck className="w-3 h-3 inline mr-1" />
                        Guarantor: {l.guarantor_name}
                      </p>
                      <p className="text-xs text-[#5C665D] mb-2">
                        Total Due: <span className="font-semibold text-[#1E231F]">{formatCurrency(l.total_due || l.outstanding_balance || l.initial_total_due || l.amount * 1.03)}</span>
                      </p>
                      {l.reason && <p className="text-xs text-[#5C665D] mb-2 italic">Reason: "{l.reason}"</p>}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveTransaction('loans', l.id, true)}
                          className="flex-1 bg-[#347242] hover:bg-[#2C5530] text-xs"
                        >
                          Approve Directly
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
                  {loans.filter(l => l.status === 'pending_guarantor').length === 0 && (
                    <p className="text-center text-[#5C665D] py-4 text-sm">No loans awaiting guarantor</p>
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
            
              {/* Pending Quick Loans */}
              <Card className="bg-white border border-[#E8EBE8] shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-['Manrope'] text-[#1E231F] flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[#D48C70]" />
                    Pending Quick Loans ({quickLoans.filter(q => q.status === 'pending_treasurer').length})
                  </CardTitle>
                  <p className="text-xs text-[#5C665D]">Quick loan service requests awaiting treasurer review</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {quickLoans.filter(q => q.status === 'pending_treasurer').map((q) => (
                    <div key={q.id} className="p-3 bg-[#FAFAF8] rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-[#1E231F]">{q.loan_name}</span>
                        <span className="font-semibold text-[#D48C70] font-numbers">{formatCurrency(q.amount)}</span>
                      </div>
                      <p className="text-xs text-[#5C665D] mb-1">Officer: {q.officer_name || 'Unassigned'}</p>
                      <p className="text-xs text-[#5C665D] mb-2">Purpose: {q.purpose || 'N/A'}</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveQuickLoan(q.id, true)}
                          className="flex-1 bg-[#347242] hover:bg-[#2C5530] text-xs"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApproveQuickLoan(q.id, false)}
                          className="flex-1 border-[#D05A49] text-[#D05A49] hover:bg-[#D05A49]/10 text-xs"
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                  {quickLoans.filter(q => q.status === 'pending_treasurer').length === 0 && (
                    <p className="text-center text-[#5C665D] py-4 text-sm">No pending quick loan requests</p>
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
            {isTreasurer && (
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
                          const maxGuarantees = m.max_guarantees ?? 2;
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
                                <option value="seller">Seller</option>
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
