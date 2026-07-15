import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtUGX = (n) => `UGX ${Number(n || 0).toLocaleString()}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString() : '-';

const fmtCurrency = (n, currency = 'UGX') =>
  `${String(currency || 'UGX').toUpperCase()} ${Number(n || 0).toLocaleString()}`;

// Converts an integer amount into English words (e.g. 600000 -> "Six Hundred Thousand")
// used to render amounts such as "Six Hundred Thousand (600,000)" in the loan agreement.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigitsToWords = (n) => {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const r = n % 10;
  return r ? `${TENS[t]} ${ONES[r]}` : TENS[t];
};

const threeDigitsToWords = (n) => {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let words = '';
  if (h > 0) {
    words += `${ONES[h]} Hundred`;
    if (r > 0) words += ' ';
  }
  if (r > 0) words += twoDigitsToWords(r);
  return words.trim();
};

export const numberToWords = (num) => {
  const n = Math.floor(Number(num || 0));
  if (n === 0) return 'Zero';
  if (n < 0) return `Negative ${numberToWords(-n)}`;
  const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
  let words = '';
  let scaleIndex = 0;
  let remainder = n;
  while (remainder > 0) {
    const chunk = remainder % 1000;
    if (chunk > 0) {
      const chunkWords = threeDigitsToWords(chunk);
      const scaleWord = scales[scaleIndex];
      const part = scaleWord ? `${chunkWords} ${scaleWord}` : chunkWords;
      words = part + (words ? ' ' + words : '');
    }
    remainder = Math.floor(remainder / 1000);
    scaleIndex += 1;
  }
  return words.trim();
};

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
const dataUrlFromBlob = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const getImageFormat = (imageData) => {
  const match = typeof imageData === 'string' ? imageData.match(/^data:image\/(png|jpe?g|webp);/i) : null;
  if (!match) return 'JPEG';
  return match[1].toUpperCase().replace('JPG', 'JPEG');
};

const getImageDataUrl = async (imageSource) => {
  if (!imageSource) return null;

  if (typeof imageSource === 'string') {
    if (imageSource.startsWith('data:image/')) return imageSource;

    try {
      const response = await fetch(imageSource);
      if (!response.ok) throw new Error(`Image load failed (${response.status})`);
      return await dataUrlFromBlob(await response.blob());
    } catch (error) {
      console.warn('Failed to load collateral image for PDF', error);
      return null;
    }
  }

  if (typeof Blob !== 'undefined' && imageSource instanceof Blob) {
    return await dataUrlFromBlob(imageSource);
  }

  return null;
};

// Reads the natural pixel dimensions of a (data URL) image so it can be drawn
// on the PDF without distortion. Falls back to an ID-card ratio if unavailable.
const getImageNaturalSize = (dataUrl) =>
  new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      resolve({ width: STANDARD_ID_WIDTH, height: STANDARD_ID_HEIGHT });
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || STANDARD_ID_WIDTH, height: img.naturalHeight || STANDARD_ID_HEIGHT });
    img.onerror = () => resolve({ width: STANDARD_ID_WIDTH, height: STANDARD_ID_HEIGHT });
    img.src = dataUrl;
  });

// Standard ID-1 card dimensions (mm) used for every uploaded image in the
// quick loan form so all photos are normalised to a uniform ID size on the PDF.
const STANDARD_ID_WIDTH = 85.6;
const STANDARD_ID_HEIGHT = 54;

// Returns a fixed, standard ID-card sized box for every uploaded image so that
// all images in the quick loan agreement PDF share the same dimensions.
// eslint-disable-next-line no-unused-vars
const getImageSize = async (imageDataUrl, pageWidth) => {
  return {
    width: STANDARD_ID_WIDTH,
    height: STANDARD_ID_HEIGHT,
  };
};

export const exportLoanAgreementPDF = async (loanData, officer, options = { download: true }) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const lineHeight = 7;
  let y = 45;

  const collateralImageData = await getImageDataUrl(
    loanData?.collateral_image || loanData?.collateralImage || options.collateralImage
  );
  const isGuaranteed = loanData?.loan_type === 'guaranteed'
    || loanData?.loanType === 'guaranteed'
    || loanData?.is_guaranteed === true
    || loanData?.isGuaranteed === true;
  const isCollateralBacked = !isGuaranteed;

  // Collateral-backed / Selling agreement (unchanged)
  if (isCollateralBacked) {
    try {
      doc.addImage('/icons/icon-512.png', 'PNG', pageWidth / 2 - 15, 8, 30, 30);
    } catch (e) {
      // Logo load failed - icon may be missing
    }
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('CLASS ONE GROUP - SELLING AGREEMENT', pageWidth / 2, y, { align: 'center' });
    y += 8;

    doc.setFontSize(10);
    doc.setFont(undefined, 'italic');
    const adText = 'Your trusted partner for quick, flexible emergency funds. We are always ready to help you with business, emergencies, and education financing.';
    const splitAd = doc.splitTextToSize(adText, pageWidth - 30);
    doc.text(splitAd, pageWidth / 2, y, { align: 'center' });
    y += splitAd.length * 4 + 4;

    doc.setFont(undefined, 'bold');
    doc.setFontSize(12);
    doc.text('SELLING AGREEMENT', 14, y);
    y += 8;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(11);

    const sellerName = loanData?.loan_name || loanData?.user_name || '____';
    const sellerAddress = loanData?.loan_phone || loanData?.loan_email || '____';
    const itemName = loanData?.collateral || '____';
    const serialNo = loanData?.serial_number || loanData?.serialNumber || '';
    const saleAmount = loanData?.amount || 0;
    const buyerName = loanData?.buyer_name || '________________________';

    let p1 = `I, ${sellerName}, of ${sellerAddress}, do hereby declare that I am the rightful owner of ${itemName}`;
    if (String(serialNo).trim() !== '') {
      p1 += ` with Serial No. ${serialNo}`;
    }
    p1 += '.';

    const p2 = `I have sold this item to ${buyerName} at a price of ${fmtUGX(saleAmount)}.`;
    const p3 = `In case of any doubts about the item, I am ready to face the courts of law.`;

    const p1Lines = doc.splitTextToSize(p1, 180);
    doc.text(p1Lines, 14, y); y += lineHeight * (p1Lines.length + 1);
    const p2Lines = doc.splitTextToSize(p2, 180);
    doc.text(p2Lines, 14, y); y += lineHeight * (p2Lines.length + 0.5);
    const p3Lines = doc.splitTextToSize(p3, 180);
    doc.text(p3Lines, 14, y); y += lineHeight * (p3Lines.length + 1.5);

    if (collateralImageData) {
      const imageSize = await getImageSize(collateralImageData, pageWidth);
      const pageHeight = doc.internal.pageSize.height;
      if (y + imageSize.height + 10 > pageHeight) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Item Photo:', 14, y);
      y += 5;
      try {
        doc.addImage(collateralImageData, getImageFormat(collateralImageData), 14, y, imageSize.width, imageSize.height);
        y += imageSize.height + 1;
      } catch (imgErr) {
        console.warn('Failed to add collateral image to PDF', imgErr);
      }
    }

    y += 4;
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, y);
    y += 12;
    doc.text('Seller Signature: ________________________________', 14, y);
    doc.text('Buyer Signature: _________________________________', 14, y + 10);
    y += 20;
    doc.setFontSize(9);
    doc.text('Seller Name: _________________________________', 14, y);
    doc.text('Buyer Name: _________________________________', 14, y + 8);

    if (options.download !== false) {
      const loanName = loanData?.loanName || loanData?.loan_name || 'Agreement';
      const safeFileName = loanName.toString().replace(/\s/g, '_').replace(/[^\w-]/g, '');
      const date = new Date().toISOString().split('T')[0];
      doc.save(`Sell_Agreement_${safeFileName}-${date}.pdf`);
    }
    return doc;
  }

  // GUARANTEED: formal 15-clause Loan Agreement
  const data = loanData || {};
  const opt = options || {};

  const LENDER = {
    name: 'Class One Savings Group',
    address: 'Fort Portal, Uganda',
    city: '',
  };

  const borrowerName = data.loan_name || data.loanName || '________________________';
  const borrowerAddress = data.borrower_address || data.borrowerAddress || opt.borrowerAddress || '';
  const borrowerCity = data.borrower_city || data.borrowerCity || opt.borrowerCity || '';
  const currency = String(data.currency || data.loanCurrency || opt.currency || 'UGX').toUpperCase();
  const amountNum = Math.round(Number(data.amount || 0));
  const amountWords = numberToWords(amountNum);

  const repaymentPeriod = data.repayment_period || data.interest_period || '2_weeks';
  const periodRatePct = amountNum > 50000 ? 10 : (repaymentPeriod === '1_month' ? 20 : 10);
  const termWords = repaymentPeriod === '1_month' ? 'one (1) month' : 'two (2) weeks';
  const termWordsCap = termWords.charAt(0).toUpperCase() + termWords.slice(1);

  const interestRateNum = Math.round(Number(
    data.agreement_interest_rate != null ? data.agreement_interest_rate
      : (data.interest_rate_pct != null ? data.interest_rate_pct
        : (opt.interestRatePct != null ? opt.interestRatePct : periodRatePct))
  ) || 0);
  const interestWords = numberToWords(interestRateNum);
  const interestAmount = Math.round(amountNum * interestRateNum / 100);
  const totalDue = amountNum + interestAmount;
  const totalWords = numberToWords(totalDue);

  const security = data.security_description || data.securityDescription || opt.security
    || data.collateral || 'the property pledged herein';
  const guarantorName = data.guarantor_name || data.guarantorName || opt.guarantorName || '________________________';
  const guarantorAddress = data.guarantor_address || data.guarantorAddress || opt.guarantorAddress || '';
  const jurisdiction = data.jurisdiction || data.loanJurisdiction || opt.jurisdiction || 'Uganda';
  const witnessName = data.witness_name || data.witnessName || opt.witnessName || '';
  const officerName = officer?.name || data.officer_name || '';
  const agreementDate = data.created_at ? fmtDate(data.created_at) : new Date().toLocaleDateString();

  const leftMargin = 18;
  const bottomMargin = 16;
  const contentWidth = pageWidth - leftMargin * 2;
  const lh = 5.2;
  const pageHeight = doc.internal.pageSize.height;

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - bottomMargin) {
      doc.addPage();
      y = 18;
    }
  };

  const writeParagraph = (text, { size = 10.5, bold = false, italic = false, gap = 3, indent = 0 } = {}) => {
    doc.setFontSize(size);
    doc.setFont(undefined, bold ? 'bold' : (italic ? 'italic' : 'normal'));
    const lines = doc.splitTextToSize(text, contentWidth - indent);
    for (const line of lines) {
      ensureSpace(lh);
      doc.text(line, leftMargin + indent, y);
      y += lh;
    }
    y += gap;
  };

  const writeClause = (label, text) => {
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    ensureSpace(lh + 1);
    doc.text(label, leftMargin, y);
    y += lh + 1;
    writeParagraph(text, { gap: 2 });
  };

  const writePartyLine = (text, { bold = true, size = 11, gap = 1 } = {}) => {
    doc.setFont(undefined, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    ensureSpace(lh);
    doc.text(text, leftMargin, y);
    y += lh + gap;
  };

  // Logo
  try {
    doc.addImage('/icons/icon-512.png', 'PNG', pageWidth / 2 - 12, 8, 24, 24);
  } catch (e) {
    // Logo load failed - icon may be missing
  }

  doc.setFont(undefined, 'bold');
  doc.setFontSize(16);
  ensureSpace(10);
  doc.text('LOAN AGREEMENT', pageWidth / 2, y, { align: 'center' });
  y += 12;

  writeParagraph(
    `This Loan Agreement ("Agreement") is made and entered into as of ${agreementDate} by and between:`,
    { gap: 4 }
  );

  // Lender block
  writePartyLine(LENDER.name);
  writePartyLine(LENDER.address, { bold: false, size: 10.5 });
  if (LENDER.city) writePartyLine(LENDER.city, { bold: false, size: 10.5 });
  writePartyLine('(hereinafter referred to as the "Lender")', { bold: false, size: 10.5, italic: true });
  y += 1;
  writePartyLine('AND');
  y += 1;

  // Borrower block
  writePartyLine(borrowerName);
  if (borrowerAddress) writePartyLine(borrowerAddress, { bold: false, size: 10.5 });
  if (borrowerCity) writePartyLine(borrowerCity, { bold: false, size: 10.5 });
  writePartyLine('(hereinafter referred to as the "Borrower")', { bold: false, size: 10.5, italic: true });
  y += 2;

  doc.setFont(undefined, 'normal');
  writeParagraph(
    'WHEREAS, the Lender agrees to lend a certain sum of money to the Borrower, and the Borrower agrees to repay the loan under the terms and conditions set forth herein.',
    { gap: 3 }
  );
  writeParagraph(
    'NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, the parties agree as follows:',
    { gap: 4 }
  );

  writeClause('1. LOAN AMOUNT', `${amountWords} (${fmtCurrency(amountNum, currency)}) The Lender agrees to lend the Borrower the sum of ${fmtCurrency(amountNum, currency)} (the "Loan Amount").`);
  writeClause('2. LOAN TERM', `${termWordsCap} The term of this loan shall be for a period of ${termWords}, commencing on the date of disbursement of the Loan Amount.`);
  writeClause('3. INTEREST RATE', `${interestWords} percent (${interestRateNum}%) The Loan Amount shall bear interest at the rate of ${interestRateNum}% per month, calculated on the outstanding principal balance.`);
  writeClause('4. REPAYMENT', `${totalWords} (${fmtCurrency(totalDue, currency)}) The Borrower agrees to repay the Loan Amount along with accrued interest in full on or before the expiration of the Loan Term. The total amount due at the end of the Loan Term shall be ${fmtCurrency(totalDue, currency)}, which includes the principal and interest.`);
  writeClause('5. SECURITY', `As security for the Loan Amount, the Borrower hereby pledges the following property: ${security}.`);
  writeClause('6. GUARANTOR', `${guarantorName} The Borrower shall provide a guarantor, ${guarantorName}, who agrees to guarantee the repayment of the Loan Amount and any accrued interest in the event that the Borrower fails to make the required payments.`);
  writeClause('7. DEFAULT', `In the event that the Borrower fails to repay the Loan Amount and accrued interest by the end of the Loan Term, the Lender shall have the right to sell the pledged security (${security}) to recover the outstanding balance. The Borrower shall be responsible for any costs associated with the sale of the security.`);
  writeClause('8. NOTICES', 'Any notice required or permitted under this Agreement shall be in writing and shall be deemed to have been duly given when delivered personally or sent by registered or certified mail, return receipt requested, to the addresses set forth above or to such other address as either party may designate in writing.');
  writeClause('9. GOVERNING LAW', `This Agreement shall be governed by and construed in accordance with the laws of ${jurisdiction}. Any disputes arising out of or in connection with this Agreement shall be subject to the exclusive jurisdiction of the courts located in ${jurisdiction}.`);
  writeClause('10. ENTIRE AGREEMENT', 'This Agreement constitutes the entire understanding between the parties with respect to the subject matter hereof and supersedes all prior agreements, understandings, and negotiations, whether written or oral.');
  writeClause('11. AMENDMENTS', 'This Agreement may not be amended or modified except in writing signed by both parties.');
  writeClause('12. SEVERABILITY', 'If any provision of this Agreement is found to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.');
  writeClause('13. ASSIGNMENT', 'The Borrower may not assign or transfer any of its rights or obligations under this Agreement without the prior written consent of the Lender.');
  writeClause('14. WAIVER', 'No waiver of any term or condition of this Agreement shall be deemed or shall constitute a waiver of any other term or condition, nor shall any waiver constitute a continuing waiver.');
  writeClause('15. COUNTERPARTS', 'This Agreement may be executed in counterparts, each of which shall be deemed an original, but all of which together shall constitute one and the same instrument.');

  writeParagraph(
    'IN WITNESS WHEREOF, the parties hereto have executed this Loan Agreement as of the day and year first above written.',
    { gap: 6 }
  );

  const writeSignatureBlock = (label, name) => {
    writePartyLine(label);
    writePartyLine('By: ________________________', { bold: false, size: 10.5 });
    writePartyLine(`Name: ${name}`, { bold: false, size: 10.5 });
    writePartyLine('Title: ________________________', { bold: false, size: 10.5 });
    writePartyLine('Date: ________________________', { bold: false, size: 10.5 });
    y += 2;
  };

  writeSignatureBlock('LENDER:', `${LENDER.name}  (Signed by: ${officerName || 'Authorized Signatory'})`);
  writeSignatureBlock('BORROWER:', borrowerName);
  writeSignatureBlock('GUARANTOR:', guarantorName);
  writeSignatureBlock('WITNESS:', witnessName || '________________________');

  // Security / Pledged Property images at the bottom of the agreement (3-column grid)
  const pledgedImages = options.nationalIdImages || data.national_id_images || [];
  if (Array.isArray(pledgedImages) && pledgedImages.length > 0) {
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    ensureSpace(lh + 2);
    doc.text('SECURITY / PLEDGED PROPERTY IMAGES', leftMargin, y);
    y += lh + 4;

    const columns = 3;
    const gridGap = 6;
    const columnWidth = (contentWidth - (columns - 1) * gridGap) / columns;
    let col = 0;
    let rowMaxHeight = 0;

    for (let i = 0; i < pledgedImages.length; i += 1) {
      const imgData = await getImageDataUrl(pledgedImages[i]);
      if (!imgData) continue;
      const nat = await getImageNaturalSize(imgData);
      const aspect = nat.width && nat.height ? nat.width / nat.height : (STANDARD_ID_WIDTH / STANDARD_ID_HEIGHT);
      let displayHeight = columnWidth / aspect;
      if (displayHeight > 60) displayHeight = 60;

      if (col === 0 && y + displayHeight + 6 > pageHeight - bottomMargin) {
        doc.addPage();
        y = 18;
      }

      const x = leftMargin + col * (columnWidth + gridGap);
      try {
        doc.addImage(imgData, getImageFormat(imgData), x, y, columnWidth, displayHeight);
      } catch (imgErr) {
        console.warn('Failed to add pledged property image to PDF', imgErr);
      }
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text(`Image ${i + 1}`, x, y + displayHeight + 3);

      rowMaxHeight = Math.max(rowMaxHeight, displayHeight + 6);
      col += 1;
      if (col >= columns) {
        col = 0;
        y += rowMaxHeight;
        rowMaxHeight = 0;
      }
    }
    if (col !== 0) y += rowMaxHeight;
  }

  if (options.download !== false) {
    const loanName = data.loanName || data.loan_name || borrowerName || 'Agreement';
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

const drawReceiptLine = (doc, y, text, x = 14, align = 'left', bold = false) => {
  doc.setFontSize(9);
  doc.setFont(undefined, bold ? 'bold' : 'normal');
  doc.text(text, x, y, { align });
  return y + 5;
};

const drawDashedLine = (doc, y) => {
  doc.setDrawColor(180);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(14, y, doc.internal.pageSize.width - 14, y);
  doc.setLineDashPattern([], 0);
  return y + 4;
};

const drawItemRow = (doc, y, item, qty, lineTotal) => {
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  const shortTitle = item.length > 30 ? item.substring(0, 27) + '...' : item;
  doc.text(shortTitle, 14, y);
  doc.text(String(qty), 80, y);
  doc.text(fmtUGX(lineTotal), doc.internal.pageSize.width - 14, y, { align: 'right' });
  return y + 5;
};

export const exportOrderReceiptPDF = (order, buyerName, buyerPhone, buyerEmail) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  let y = 20;

  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(44, 85, 48);
  doc.text('Class One Savings', pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(14);
  doc.setTextColor(44, 85, 48);
  doc.text('RECEIPT', pageWidth / 2, y, { align: 'center' });
  y += 10;

  y = drawDashedLine(doc, y);

  y = drawReceiptLine(doc, y, `Receipt No: ${order.id || 'N/A'}`, 14, 'left', true);
  y = drawReceiptLine(doc, y, `Date: ${fmtDate(order.createdAt || order.created_at)}`, 14, 'left');
  y = drawReceiptLine(doc, y, `Seller: ${order.sellerName || 'N/A'}`, 14, 'left');
  y = drawReceiptLine(doc, y, `Customer: ${buyerName || order.buyerName || 'N/A'}`, 14, 'left');
  if (buyerPhone || order.buyerPhone) {
    y = drawReceiptLine(doc, y, `Phone: ${buyerPhone || order.buyerPhone}`, 14, 'left');
  }
  if (buyerEmail || order.buyerEmail) {
    y = drawReceiptLine(doc, y, `Email: ${buyerEmail || order.buyerEmail}`, 14, 'left');
  }
  y += 2;

  y = drawDashedLine(doc, y);

  doc.setFont(undefined, 'bold');
  doc.setFontSize(9);
  doc.text('Item', 14, y);
  doc.text('Qty', 75, y);
  doc.text('Price', 110, y, { align: 'right' });
  doc.text('Total', pageWidth - 14, y, { align: 'right' });
  y += 2;
  y = drawDashedLine(doc, y);

  const products = order.products && Array.isArray(order.products)
    ? order.products
    : order.productTitle
      ? [{ title: order.productTitle, quantity: 1, price: order.productPrice || order.total || 0 }]
      : [];

  products.forEach((p) => {
    const qty = p.quantity || 1;
    const unitPrice = p.price || 0;
    const lineTotal = unitPrice * qty;
    const title = p.title || 'Item';
    const shortTitle = title.length > 28 ? title.substring(0, 25) + '...' : title;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(shortTitle, 14, y);
    doc.text(String(qty), 75, y);
    doc.text(fmtUGX(unitPrice), 110, y, { align: 'right' });
    doc.text(fmtUGX(lineTotal), pageWidth - 14, y, { align: 'right' });
    y += 5;
  });

  y = drawDashedLine(doc, y);

  const subtotal = order.total || products.reduce((sum, p) => sum + (p.price || 0) * (p.quantity || 1), 0);
  y = drawReceiptLine(doc, y, `Subtotal: ${fmtUGX(subtotal)}`, pageWidth - 14, 'right', true);
  y = drawReceiptLine(doc, y, `TOTAL: ${fmtUGX(subtotal)}`, pageWidth - 14, 'right', true);
  y += 4;

  y = drawDashedLine(doc, y);

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Thank you for your purchase!', pageWidth / 2, y, { align: 'center' });
  y += 5;
  doc.text('For inquiries, contact the seller directly.', pageWidth / 2, y, { align: 'center' });

  doc.save(`receipt-${order.id || 'order'}-${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportCustomerReceiptPDF = (customers, options = {}) => {
  const { singleSeller, dateRange } = options;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  customers.forEach((customer, customerIndex) => {
    const sortedOrders = (customer.orders || []).slice().sort((a, b) => {
      const dateA = new Date(a.createdAt || a.created_at || 0);
      const dateB = new Date(b.createdAt || b.created_at || 0);
      return dateA - dateB;
    });

    let y = 20;
    if (customerIndex > 0) {
      doc.addPage();
    }

    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(44, 85, 48);
    doc.text('Class One Savings', pageWidth / 2, y, { align: 'center' });
    y += 8;

    doc.setFontSize(14);
    doc.setTextColor(44, 85, 48);
    doc.text('Customer Receipt', pageWidth / 2, y, { align: 'center' });
    y += 10;

    y = drawDashedLine(doc, y);

    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
    y += 10;

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(44, 85, 48);
    doc.text(`Customer: ${customer.name}`, 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(80);
    doc.text(`Contact: ${customer.phone || customer.email || '-'}`, 14, y);
    y += 8;

    y = drawDashedLine(doc, y);

    let customerTotal = 0;

    sortedOrders.forEach((o) => {
      if (y > 240) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(44, 85, 48);
      doc.text(`Order: ${o.id || '-'}  |  Date: ${fmtDate(o.createdAt || o.created_at)}  |  Seller: ${o.sellerName || '-'}`, 14, y);
      y += 5;

      const products = o.products && Array.isArray(o.products)
        ? o.products
        : o.productTitle
          ? [{ title: o.productTitle, quantity: 1, price: o.productPrice || o.total || 0 }]
          : [];

      products.forEach((p) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        const qty = p.quantity || 1;
        const lineTotal = (p.price || 0) * qty;
        const title = p.title || 'Item';
        const shortTitle = title.length > 32 ? title.substring(0, 29) + '...' : title;
        y = drawItemRow(doc, y, shortTitle, qty, lineTotal);
      });

      const orderTotal = o.total || products.reduce((sum, p) => sum + (p.price || 0) * (p.quantity || 1), 0);
      customerTotal += orderTotal;
      y = drawReceiptLine(doc, y, `Order Total: ${fmtUGX(orderTotal)}`, pageWidth - 14, 'right', true);
      y = drawDashedLine(doc, y);
      y += 2;
    });

    if (y > 240) {
      doc.addPage();
      y = 20;
    }

    y = drawDashedLine(doc, y);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(212, 140, 112);
    doc.text(`Customer Total: ${fmtUGX(customerTotal)}`, 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(92, 102, 93);
    doc.text(`${sortedOrders.length} order(s)`, 14, y);
  });

  doc.save(`customer-receipt-${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportSellerReceiptPDF = (sellers, options = {}) => {
  const { dateRange } = options;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  let y = 20;

  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(44, 85, 48);
  doc.text('Class One Savings', pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(14);
  doc.setTextColor(44, 85, 48);
  doc.text('Seller Receipts', pageWidth / 2, y, { align: 'center' });
  y += 10;

  y = drawDashedLine(doc, y);

  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
  if (dateRange) {
    doc.text(`Period: ${dateRange}`, 14, y + 5);
  }
  y += 12;

  let grandTotal = 0;

  sellers.forEach((seller) => {
    const sortedOrders = (seller.orders || []).slice().sort((a, b) => {
      const dateA = new Date(a.createdAt || a.created_at || 0);
      const dateB = new Date(b.createdAt || b.created_at || 0);
      return dateA - dateB;
    });

    if (y > 240) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(44, 85, 48);
    doc.text(`Seller: ${seller.name}`, 14, y);
    y += 8;

    y = drawDashedLine(doc, y);

    sortedOrders.forEach((o) => {
      if (y > 240) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(44, 85, 48);
      doc.text(`Order: ${o.id || '-'}  |  Date: ${fmtDate(o.createdAt || o.created_at)}  |  Buyer: ${o.buyerName || '-'}`, 14, y);
      y += 5;

      const products = o.products && Array.isArray(o.products)
        ? o.products
        : o.productTitle
          ? [{ title: o.productTitle, quantity: 1, price: o.productPrice || o.total || 0 }]
          : [];

      products.forEach((p) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        const qty = p.quantity || 1;
        const lineTotal = (p.price || 0) * qty;
        const title = p.title || 'Item';
        const shortTitle = title.length > 32 ? title.substring(0, 29) + '...' : title;
        y = drawItemRow(doc, y, shortTitle, qty, lineTotal);
      });

      const orderTotal = o.total || products.reduce((sum, p) => sum + (p.price || 0) * (p.quantity || 1), 0);
      grandTotal += orderTotal;
      y = drawReceiptLine(doc, y, `Order Total: ${fmtUGX(orderTotal)}`, pageWidth - 14, 'right', true);
      y = drawDashedLine(doc, y);
      y += 2;
    });
  });

  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  y = drawDashedLine(doc, y);
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(212, 140, 112);
  doc.text(`Grand Total Sales: ${fmtUGX(grandTotal)}`, 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(92, 102, 93);
  doc.text(`${sellers.length} seller(s), ${sellers.reduce((sum, s) => sum + s.orders.length, 0)} order(s)`, 14, y);

  doc.save(`seller-receipt-${new Date().toISOString().split('T')[0]}.pdf`);
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
