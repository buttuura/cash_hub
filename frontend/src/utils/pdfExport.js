import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtUGX = (n) => `UGX ${Number(n || 0).toLocaleString()}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString() : '-';

const addHeader = (doc, title, subtitle) => {
  doc.setFontSize(18);
  doc.setTextColor(44, 85, 48); // #2C5530
  doc.text('Class One Savings', 14, 18);
  doc.setFontSize(12);
  doc.setTextColor(92, 102, 93);
  doc.text(title, 14, 26);
  if (subtitle) {
    doc.setFontSize(9);
    doc.text(subtitle, 14, 32);
  }
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 38);
};

export const exportDepositsPDF = (deposits, filenamePrefix = 'deposits') => {
  const doc = new jsPDF();
  addHeader(doc, 'Deposits Report', `Total records: ${deposits.length}`);
  autoTable(doc, {
    startY: 44,
    head: [['Date', 'Member', 'Type', 'Amount', 'Late Fee', 'Status']],
    body: deposits.map(d => [
      fmtDate(d.created_at),
      d.user_name || '-',
      d.deposit_type || 'savings',
      fmtUGX(d.amount),
      fmtUGX(d.late_fee),
      d.status,
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [44, 85, 48] },
  });
  doc.save(`${filenamePrefix}-${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportLoansPDF = (loans, filenamePrefix = 'loans') => {
  const doc = new jsPDF();
  addHeader(doc, 'Loans Report', `Total records: ${loans.length}`);
  autoTable(doc, {
    startY: 44,
    head: [['Date', 'Borrower', 'Amount', 'Guarantor', 'Interest', 'Total Due', 'Status']],
    body: loans.map(l => [
      fmtDate(l.created_at),
      l.user_name || '-',
      fmtUGX(l.amount),
      l.guarantor_name || '-',
      fmtUGX(l.current_interest || l.initial_interest || 0),
      fmtUGX(l.total_due || l.outstanding_balance || l.initial_total_due || l.amount),
      (l.status || '').replace(/_/g, ' '),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [212, 140, 112] },
  });
  doc.save(`${filenamePrefix}-${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportWithdrawalsPDF = (withdrawals, filenamePrefix = 'withdrawals') => {
  const doc = new jsPDF();
  addHeader(doc, 'Withdrawals Report', `Total records: ${withdrawals.length}`);
  autoTable(doc, {
    startY: 44,
    head: [['Date', 'Member', 'Type', 'Amount', 'Reason', 'Status']],
    body: withdrawals.map(w => [
      fmtDate(w.created_at),
      w.user_name || '-',
      w.withdrawal_type || 'savings',
      fmtUGX(w.amount),
      w.reason || '-',
      w.status,
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [208, 90, 73] },
  });
  doc.save(`${filenamePrefix}-${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportPettyCashPDF = (items, filenamePrefix = 'petty-cash') => {
  const doc = new jsPDF();
  addHeader(doc, 'Petty Cash Report', `Total records: ${items.length}`);
  autoTable(doc, {
    startY: 44,
    head: [['Date', 'Category', 'Description', 'Amount', 'Added By']],
    body: items.map(p => [
      fmtDate(p.created_at),
      p.category || 'general',
      p.description || '-',
      fmtUGX(p.amount),
      p.added_by_name || '-',
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [232, 178, 92] },
  });
  doc.save(`${filenamePrefix}-${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportFullGroupReportPDF = ({ financials, deposits, loans, withdrawals, pettyCash, members }) => {
  const doc = new jsPDF();
  addHeader(doc, 'Full Group Report', `Comprehensive record for admin`);
  
  // Financial summary
  doc.setFontSize(12);
  doc.setTextColor(30, 35, 31);
  doc.text('Financial Summary', 14, 48);
  autoTable(doc, {
    startY: 52,
    body: [
      ['Total Group Balance', fmtUGX(financials?.total_group_balance)],
      ['Member Savings', fmtUGX(financials?.total_savings)],
      ['Development Fund', fmtUGX(financials?.total_development_fund)],
      ['Loan Interest Earned', fmtUGX(financials?.total_interest_earned)],
      ['Late Fees Collected', fmtUGX(financials?.total_late_fees)],
      ['Petty Cash Used', fmtUGX(financials?.total_petty_cash_used)],
      ['Active Loans', `${fmtUGX(financials?.active_loans_amount)} (${financials?.active_loans_count || 0} loans)`],
      ['Total Withdrawals', fmtUGX(financials?.total_withdrawals)],
    ],
    styles: { fontSize: 9 },
    theme: 'grid',
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
  });
  
  // Members
  doc.addPage();
  addHeader(doc, 'Members', `Total: ${members?.length || 0}`);
  autoTable(doc, {
    startY: 44,
    head: [['Name', 'Phone', 'Email', 'Membership', 'Savings', 'Dev Fund']],
    body: (members || []).map(m => [
      m.name, m.phone || '-', m.email || '-', m.membership_type,
      fmtUGX(m.total_savings), fmtUGX(m.development_fund),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [44, 85, 48] },
  });
  
  // Deposits
  doc.addPage();
  addHeader(doc, 'All Deposits', `Total: ${deposits?.length || 0}`);
  autoTable(doc, {
    startY: 44,
    head: [['Date', 'Member', 'Type', 'Amount', 'Late Fee', 'Status']],
    body: (deposits || []).map(d => [
      fmtDate(d.created_at), d.user_name, d.deposit_type,
      fmtUGX(d.amount), fmtUGX(d.late_fee), d.status,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [52, 114, 66] },
  });
  
  // Loans
  doc.addPage();
  addHeader(doc, 'All Loans', `Total: ${loans?.length || 0}`);
  autoTable(doc, {
    startY: 44,
    head: [['Date', 'Borrower', 'Amount', 'Guarantor', 'Total Due', 'Status']],
    body: (loans || []).map(l => [
      fmtDate(l.created_at), l.user_name, fmtUGX(l.amount),
      l.guarantor_name, fmtUGX(l.total_due || l.initial_total_due || l.amount),
      (l.status || '').replace(/_/g, ' '),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [212, 140, 112] },
  });
  
  // Withdrawals
  doc.addPage();
  addHeader(doc, 'All Withdrawals', `Total: ${withdrawals?.length || 0}`);
  autoTable(doc, {
    startY: 44,
    head: [['Date', 'Member', 'Type', 'Amount', 'Status']],
    body: (withdrawals || []).map(w => [
      fmtDate(w.created_at), w.user_name, w.withdrawal_type,
      fmtUGX(w.amount), w.status,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [208, 90, 73] },
  });
  
  // Petty Cash
  if (pettyCash && pettyCash.length) {
    doc.addPage();
    addHeader(doc, 'Petty Cash Expenses', `Total: ${pettyCash.length}`);
    autoTable(doc, {
      startY: 44,
      head: [['Date', 'Category', 'Description', 'Amount', 'Added By']],
      body: pettyCash.map(p => [
        fmtDate(p.created_at), p.category, p.description,
        fmtUGX(p.amount), p.added_by_name,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [232, 178, 92] },
    });
  }
  
  doc.save(`group-report-${new Date().toISOString().split('T')[0]}.pdf`);
};
