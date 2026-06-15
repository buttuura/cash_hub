import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtUGX = (n) => `UGX ${Number(n || 0).toLocaleString()}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString() : '-';

const addHeader = (doc, title, subtitle) => {
  let y = 18; // ADD THIS - start position for header
  doc.setFontSize(18);
  doc.setTextColor(44, 85, 48); // #2C5530
  doc.text('Class One Savings', 14, y);
  y += 8; // Now works
  doc.setFontSize(12);
  doc.setTextColor(92, 102, 93);
  doc.text(title, 14, y);
  y += 12; // Works
  if (subtitle) {
    doc.setFontSize(9);
    doc.text(subtitle, 14, y);
    y += 6; // Changed this - splitAd doesn't exist here
  }
  y += 10; // Works
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
  y += 15; // Works
  return y; // ADD THIS - return the new y position
};

export const exportDepositsPDF = (deposits, filenamePrefix = 'deposits') => {
  const doc = new jsPDF();
 const startY = addHeader(doc, 'Deposits Report', `Total records: ${deposits.length}`);
autoTable(doc, {
  startY: startY,
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
  const startY = addHeader(doc, 'Loans Report', `Total records: ${loans.length}`);
autoTable(doc, {
  startY: startY,
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
export const exportLoanAgreementPDF = (loanData, officer, options = { download: true }) => {
  const doc = new jsPDF();
console.log('LOAN DATA RECEIVED:', loanData);
console.log('OFFICER RECEIVED:', officer);
const pageWidth = doc.internal.pageSize.width;
  const lineHeight = 7; 
  let y = 45; 
  // 1. LOGO - Your Class One icon
  try {
    doc.addImage('/icons/icon-512.png', 'PNG', pageWidth / 2 - 15, 8, 30, 30);
  } catch (e) {
    console.log('Logo load failed - check /public/icons/icon-512.png exists');
  }
  // 2. H1 - MAIN HEADING
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
 const heading = loanData?.loan_type === 'collateral-backed' 
  ? 'CLASS ONE GROUP - SELLING AGREEMENT'
  : 'CLASS ONE GROUP - LOAN AGREEMENT';
doc.text(heading, pageWidth / 2, y, { align: 'center' });
  y += 8;

  // 3. H3 - ADVERTISING TEXT 
  doc.setFontSize(10);
  doc.setFont(undefined, 'italic');
  const adText = 'Your trusted partner for quick, flexible emergency funds. We are always ready to help you with business, emergencies, and education financing.';
  const splitAd = doc.splitTextToSize(adText, pageWidth - 30);
  doc.text(splitAd, pageWidth / 2, y, { align: 'center' });
  y += splitAd.length * 5 + 6;

  // 4. CONTACT - Only for guaranteed loans with officer
if (loanData?.loan_type === 'guaranteed' && officer && officer.name) {
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(`Contact loans officer: ${officer.name} - ${officer.phone || 'N/A'}`, 14, y);
  y += 12;
}

// 5. AGREEMENT BODY
doc.setFont(undefined, 'bold');
doc.setFontSize(12);
const agreementTitle = loanData?.loan_type === 'collateral-backed' 
  ? 'SELLING AGREEMENT' 
  : 'LOAN AGREEMENT';
doc.text(agreementTitle, 14, y);
y += 10;

  doc.setFont(undefined, 'normal');
  doc.setFontSize(11);

 if (loanData?.loan_type === 'guaranteed') {
  const borrowerName = loanData?.loan_name || '____';
  const loanAmount = fmtUGX(loanData?.amount);
  const loanPurpose = loanData?.loan_purpose || '____';
  
  const p1 = `This loan agreement is made between Class One Group, represented by ${officer?.name || 'the loans officer'}, and Borrower ${borrowerName} for a principal amount of ${loanAmount}.`;
  const p2 = P`urpose of loan: ${loanPurpose}.`;
  const p3 = `The borrower agrees to repay the loan as per the terms set by Class One Group.`;

  doc.text(doc.splitTextToSize(p1, 180), 14, y); y += lineHeight * 2;
  doc.text(doc.splitTextToSize(p2, 180), 14, y); y += lineHeight;
  doc.text(p3, 14, y); y += lineHeight * 2;
} else {
  const sellerName = loanData?.loan_name || loanData?.user_name || '____';
  const sellerAddress = loanData?.loan_phone ||  loanData?.loan_email || '____';
  const itemName = loanData?.collateral || '____';
  const serialNo = loanData?.serial_number ||  loanData?.serialNumber || '';
  const saleAmount = loanData?.amount || 0;
  const buyerName = 'Class One Group';
  
  let p1 = `I, ${sellerName}, of ${sellerAddress}, do hereby declare that I am the rightful owner of ${itemName}`;
  if (String(serialNo).trim() !== '') {
    p1 += ` with Serial No. ${serialNo} `;
  }
  p1 += '.';
  
 const p2 = `I have sold this item to ${buyerName} at a price of ${fmtUGX(saleAmount)}.`;
  const p3 = `In case of any doubts about the item, I am ready to face the courts of law.`;

  doc.text(doc.splitTextToSize(p1, 180), 14, y); y += lineHeight * 3;
  doc.text(doc.splitTextToSize(p2, 180), 14, y); y += lineHeight * 2;
  doc.text(doc.splitTextToSize(p3, 180), 14, y); y += lineHeight * 2;
}

    // If there's a collateral image, insert it
    if (loanData.collateralImage) {
      try {
        const imgType = loanData.collateralImage.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        const maxImgWidth = pageWidth - 28;
        const imgWidth = Math.min(maxImgWidth, 160);
        const imgHeight = imgWidth * 0.75;
        y += 6;
        doc.addImage(loanData.collateralImage, imgType, 14, y, imgWidth, imgHeight);
        y += imgHeight + 6;
      } catch (imgErr) {
        console.warn('Failed to add collateral image to PDF', imgErr);
      }
  }
  // 6. SIGNATURES
  y += 10;
  doc.setFontSize(10);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, y); y += 15;
  
  doc.text('Borrower Signature: ____', 14, y);
  doc.text('Officer Signature: ____', 110, y);

  if (options.download !== false) {
    const loanName = loanData?.loanName || 'Loan'; 
const safeFileName = loanName.toString().replace(/\s/g, '_').replace(/[^\w-]/g, ''); 
const date = new Date().toISOString().split('T')[0];
doc.save(`Loan_Agreement_${safeFileName}-${date}.pdf`);
  }

  return doc;
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
