import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { toast } from 'sonner';

// Base64 in small chunks. Building the whole payload with btoa() on a joined
// string, or spreading a huge array into String.fromCharCode, overflows the
// WebView stack on large PDFs and gets the app killed by Android.
const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x4000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

export const withPdfProgress = (generatePdf) => async (...args) => {
  const toastId = toast.loading('Preparing your PDF for download... Please wait.');
  await new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });

  try {
    return await generatePdf(...args);
  } finally {
    toast.dismiss(toastId);
  }
};

export const savePdf = async (doc, filename) => {
  if (!Capacitor.isNativePlatform()) {
    doc.save(filename);
    return;
  }

  try {
    // Use an ArrayBuffer rather than a data URI to avoid an extra encoded copy.
    const buffer = doc.output('arraybuffer');
    const base64Data = arrayBufferToBase64(buffer);

    // Android: Directory.Documents maps to the public Documents folder, which
    // scoped storage blocks without MANAGE_EXTERNAL_STORAGE. The app cache dir
    // is always writable, has no permission requirement, and is already
    // exposed to the FileProvider via <cache-path> in file_paths.xml.
    const directory = Capacitor.getPlatform() === 'android'
      ? Directory.Cache
      : Directory.Documents;

    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory,
      recursive: true,
    });

    await Share.share({
      title: filename,
      text: 'Choose an app or location to save this PDF.',
      files: [uri],
      dialogTitle: 'Save or share PDF',
    });
  } catch (error) {
    console.error('Failed to save PDF', error);
    toast.error('Could not create the PDF. Please try again.');
    throw new Error(
      `Could not create the PDF. ${error?.message || ''}`.trim()
    );
  }
};

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

const createDepositsPDF = async (deposits, filenamePrefix = 'deposits') => {
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
  await savePdf(doc, `${filenamePrefix}-${new Date().toISOString().split('T')[0]}.pdf`);
};

const createLoansPDF = async (loans, filenamePrefix = 'loans') => {
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
  await savePdf(doc, `${filenamePrefix}-${new Date().toISOString().split('T')[0]}.pdf`);
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

// Downscales uploaded photos before embedding them so PDFs stay manageable on
// both mobile WebViews and desktop browsers.
const MAX_IMAGE_EDGE = 1000;
const JPEG_QUALITY = 0.75;

const shrinkImage = async (dataUrl) => {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return dataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxEdge = Math.max(img.naturalWidth || 0, img.naturalHeight || 0);
      if (!maxEdge || maxEdge <= MAX_IMAGE_EDGE) {
        resolve(dataUrl);
        return;
      }
      try {
        const scale = MAX_IMAGE_EDGE / maxEdge;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round((img.naturalWidth || 0) * scale);
        canvas.height = Math.round((img.naturalHeight || 0) * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch (error) {
        console.warn('Could not downscale image for PDF', error);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

const resizeBlobForPdf = async (blob) => {
  let image;
  let objectUrl;
  let canvas;

  try {
    if (typeof createImageBitmap === 'function') {
      image = await createImageBitmap(blob);
    } else {
      objectUrl = URL.createObjectURL(blob);
      image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not decode image for PDF'));
        img.src = objectUrl;
      });
    }

    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare image for PDF');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const resizedBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('Could not compress image for PDF'));
      }, 'image/jpeg', JPEG_QUALITY);
    });
    return await dataUrlFromBlob(resizedBlob);
  } finally {
    if (typeof image?.close === 'function') image.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
};

const getImageDataUrl = async (imageSource) => {
  if (!imageSource) return null;

  let dataUrl = null;

  if (typeof imageSource === 'string') {
    if (imageSource.startsWith('data:image/')) {
      dataUrl = imageSource;
    } else {
      try {
        const response = await fetch(imageSource);
        if (!response.ok) throw new Error(`Image load failed (${response.status})`);
        dataUrl = await dataUrlFromBlob(await response.blob());
      } catch (error) {
        console.warn('Failed to load image for PDF', error);
        return null;
      }
    }
  }

  if (!dataUrl && typeof Blob !== 'undefined' && imageSource instanceof Blob) {
    return await resizeBlobForPdf(imageSource);
  }

  if (!dataUrl) return null;

  return await shrinkImage(dataUrl);
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

const STANDARD_ID_WIDTH = 85.6;
const STANDARD_ID_HEIGHT = 54;

const createLoanAgreementPDF = async (loanData, officer, options = { download: true }) => {
  const doc = new jsPDF({ compress: true, putOnlyUsedFonts: true });
  const opt = options || {};
  const pageWidth = doc.internal.pageSize.width;
  let y = 45;

  const isGuaranteed = loanData?.loan_type === 'guaranteed'
    || loanData?.loanType === 'guaranteed'
    || loanData?.is_guaranteed === true
    || loanData?.isGuaranteed === true;

  if (opt.summary !== true) {
    const margin = 18;
    const contentWidth = pageWidth - margin * 2;
    const pageHeight = doc.internal.pageSize.height;
    const bottomMargin = 16;
    y = 40;

    try {
      doc.addImage('/icons/icon-512.png', 'PNG', pageWidth / 2 - 12, 8, 24, 24);
    } catch (error) {
      console.warn('Could not add the logo to the terms PDF', error);
    }

    doc.setFont(undefined, 'bold');
    doc.setFontSize(14);
    doc.text('CLASS ONE SAVINGS GROUP - LOAN TERMS AND CONDITIONS', pageWidth / 2, y, { align: 'center' });
    y += 8;
    doc.setFont(undefined, 'italic');
    doc.setFontSize(9);
    doc.text('Please read carefully before you apply for a loan.', pageWidth / 2, y, { align: 'center' });
    y += 10;

    const writeTermsText = (text, { size = 9.5, bold = false, gap = 2, indent = 0 } = {}) => {
      doc.setFontSize(size);
      doc.setFont(undefined, bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(text, contentWidth - indent);
      for (const line of lines) {
        if (y + 5.2 > pageHeight - bottomMargin) {
          doc.addPage();
          y = 18;
        }
        doc.text(line, margin + indent, y);
        y += 5.2;
      }
      y += gap;
    };
    const terms = [
      ['1. WHO CAN BORROW', 'You must be a fully registered member of Class One Savings Group, must have saved with the group consistently, and must have a good record of attending meetings and repaying past loans.'],
      ['2. HOW TO APPLY', 'Fill in the Loan Application Form. State clearly how much you want and what you want to use it for. Your application must be approved by the group leaders or loan committee before money is given.'],
      ['3. LOAN AMOUNT', 'The amount you get depends on your savings, your ability to repay, and what the group has available. The group has the right to approve a smaller amount than what you requested.'],
      ['4. LOAN TERM / PERIOD', 'Guaranteed loans must be repaid within 12 weeks (3 months) from the date you receive the money, unless the group agrees otherwise in writing. For collateral-backed loans, the applicant and seller/guarantor agree to a repayment period of 2 months, 4 months, 6 months, or 1 year.'],
      ['5. INTEREST RATE', 'For guaranteed loans managed by a loans officer, interest is 10%. For loans below UGX 60,000, the 10% applies to each 2-week repayment cycle. For loans of UGX 60,000 and above, the 10% applies per month and is calculated on the outstanding balance. For collateral-backed loans, the seller/guarantor and applicant agree the total repayment amount manually; the agreed amount and interest plan are recorded in the loan agreement.'],
      ['6. REPAYMENT', 'A) Guaranteed loans below UGX 60,000 (UGX 1 - UGX 59,999): repayment is every 2 weeks (bi-weekly), with 10% interest per cycle. B) Guaranteed loans of UGX 60,000 and above: repayment is monthly, with 10% interest per month. Pay each installment on or before its agreed date until the loan is fully cleared. Early payment is allowed. For collateral-backed loans, the applicant and seller/guarantor manually agree the total repayment amount and choose a repayment period of 2, 4, 6, or 12 months. For all loans, inform the group immediately if you miss a payment and agree how to catch up. Late interest continues as specified in the applicable loan agreement.'],
      ['7. SECURITY / COLLATERAL', 'To get a loan, you must provide security (property or an item pledged). This security will be held by the group until the loan is fully repaid. If you fail to repay, the group has the right to sell the security to recover the money.'],
      ['8. GUARANTOR', 'You must bring a guarantor - a trusted member who agrees to stand for you. If you fail to repay, your guarantor will be responsible for repaying the loan and any interest. Your guarantor must be approved by the group.'],
      ['9. DEFAULT / FAILURE TO PAY', 'If you fail to repay on time, the group will: (1) remind you and give you a short time to pay; (2) contact your guarantor; (3) use your savings and/or your security to recover the money; and (4) take legal action if necessary. You will also be responsible for any costs the group spends to recover the money.'],
      ['10. YOUR RESPONSIBILITIES AS A BORROWER', 'Use the loan for the purpose you stated. Repay on time, every 2 weeks or every month as per your loan category. Attend meetings and keep the group updated if you have a problem. Do not transfer your loan to another person without group permission.'],
      ["11. THE GROUP'S RESPONSIBILITIES", 'The group will keep your information confidential, give you a clear record of how much you borrowed, how much interest you owe, and how much you have paid, and treat all members fairly.'],
      ['12. CHANGES TO THESE TERMS', 'These terms may be changed by the group leaders with agreement of members. Members will be informed before any change takes effect.'],
      ['13. GOVERNING LAW', 'These terms are governed by the laws of Uganda.'],
      ['14. IF YOU DO NOT HAVE A GUARANTOR', 'If you do not have a guarantor, you can still get a loan by getting a group member to act as your guarantor. You and that group member will write an agreement between the two of you. The agreement will show that you have sold your property to your guarantor at the price agreed by the members. The property, agreed price, and loan details must be clearly written in the agreement. The group will only act as witness and will not be a party to the sale. The agreement must be signed by you and your guarantor, and witnessed by group members. If you fail to pay the loan, your guarantor will take the property as agreed to recover the loan and interest. Once you fully repay the loan, the agreement is cancelled and the property remains yours.'],
    ];

    terms.forEach(([heading, text]) => {
      writeTermsText(heading, { bold: true, size: 10, gap: 1 });
      writeTermsText(text, { indent: 2, gap: 3 });
    });
    writeTermsText('By applying for a loan, you confirm that you have read and understood these Terms and Conditions.', { bold: true, gap: 4 });

    if (opt.download !== false) {
      const date = new Date().toISOString().split('T')[0];
      await savePdf(doc, `Loan_Terms_and_Conditions-${date}.pdf`);
    }
    return doc;
  }

  // Build the short, personalized loan agreement.
  const data = loanData || {};
  const collateralImageSources = Array.isArray(opt.collateralImages) && opt.collateralImages.length
    ? opt.collateralImages
    : Array.isArray(data.collateral_images) && data.collateral_images.length
      ? data.collateral_images
      : [opt.collateralImage || data.collateral_image || data.collateralImage].filter(Boolean);
  const collateralImageData = (await Promise.all(collateralImageSources.map(getImageDataUrl))).filter(Boolean);
  const LENDER = {
    name: 'Class One Savings Group',
  };

  const borrowerName = data.loan_name || data.loanName || '________________________';
  const currency = (isGuaranteed ? String(data.currency || data.loanCurrency || opt.currency || 'UGX') : 'UGX').toUpperCase();
  const amountNum = Math.round(Number(data.amount || 0));
  const sellerName = data.seller_name || data.sellerName || data.buyer_name || '________________________';
  const agreedPrice = Number(data.agreed_price || data.amount || 0);

  const repaymentFrequency = amountNum < 60000 ? 'every two weeks (bi-weekly)' : 'monthly';
  const security = data.security_description || data.securityDescription || opt.security
    || data.collateral || 'the property pledged herein';
  const guarantorName = data.guarantor_name || data.guarantorName || data.buyer_name || data.buyerName || opt.guarantorName || '________________________';
  const agreementDate = isGuaranteed
    ? (data.created_at ? fmtDate(data.created_at) : new Date().toLocaleDateString())
    : fmtDate(data.sale_date || data.created_at || new Date().toISOString());

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

  const writePartyLine = (text, { bold = true, size = 11, gap = 1 } = {}) => {
    doc.setFont(undefined, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    ensureSpace(lh);
    doc.text(text, leftMargin, y);
    y += lh + gap;
  };

  try {
    doc.addImage('/icons/icon-512.png', 'PNG', pageWidth / 2 - 12, 8, 24, 24);
  } catch (e) {
    // Logo load failed - icon may be missing
  }

  doc.setFont(undefined, 'bold');
  doc.setFontSize(14);
  doc.text(
    isGuaranteed ? 'CLASS ONE SAVINGS GROUP - LOAN AGREEMENT' : 'CLASS ONE GROUP - SELLING AGREEMENT',
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 9;

  if (isGuaranteed) {
    writeParagraph(`Borrower: ${borrowerName}`, { size: 9.5, gap: 1 });
    writeParagraph(`Phone: ${data.loan_phone || data.loanPhone || opt.borrowerPhone || '________________'} | Email: ${data.loan_email || data.loanEmail || opt.borrowerEmail || '________________'}`, { size: 9.5, gap: 1 });
    if (data.nin_number || data.ninNumber) {
      writeParagraph(`NIN: ${data.nin_number || data.ninNumber}`, { size: 9.5, gap: 1 });
    }
    writeParagraph(`Loan type: Guaranteed | Loan amount: ${fmtCurrency(amountNum, currency)} | Purpose: ${data.purpose || data.loan_purpose || 'Not specified'}`, { size: 9.5, gap: 1 });
    writeParagraph(`Interest: 10% ${amountNum < 60000 ? 'per two-week repayment cycle' : 'per month'} on the outstanding balance | Repayment: ${repaymentFrequency} | Maximum term: 12 weeks`, { size: 9.5, gap: 1 });
    writeParagraph(`Security: ${security} | Guarantor: ${guarantorName}`, { size: 9.5, gap: 1 });
    writeParagraph(`Loan officer: ${officer?.name || data.officer_name || 'Not specified'}`, { size: 9.5, gap: 1 });
    writeParagraph('By signing, I confirm that I have read and understood the Loan Terms and Conditions.', { size: 9, bold: true, gap: 2 });
  } else {
    const paymentSentence = data.payment_status === 'paid'
      ? 'The Buyer has paid the full amount as agreed by both parties.'
      : 'The Buyer will pay the full amount as agreed by both parties.';
    const handoverSentence = data.handover_status === 'handed_over'
      ? 'The Seller has handed over the property to the Buyer, and from today the property belongs to the Buyer.'
      : 'The Seller will hand over the property to the Buyer as agreed by both parties.';

    writeParagraph('Between Two Members of the Same Group', { size: 10, bold: true, gap: 1 });
    writeParagraph(`Date: ${agreementDate}`, { size: 9.5, gap: 1 });
    writeParagraph('DECLARATION', { size: 10, bold: true, gap: 1 });
    writeParagraph(`I, ${sellerName} (Seller), do hereby declare that I have sold my property described below to ${borrowerName} (Buyer), at the price agreed by both of us.`, { size: 9.5, gap: 1 });
    writeParagraph('I declare that the property is truly mine, it has no dispute, no debt, and no other claim, and I have not sold it to anyone else. In case of any doubt about this property, I am ready to face the courts of law.', { size: 9.5, gap: 1 });
    if (data.members_confirmed) {
      writeParagraph('Both the Seller and Buyer confirm that they are members of Class One Savings Group.', { size: 9.5, gap: 1 });
    }
    writeParagraph(`Seller phone: ${data.seller_phone || '________________'} | Buyer phone: ${data.loan_phone || data.loanPhone || opt.borrowerPhone || '________________'}`, { size: 9.5, gap: 1 });
    writeParagraph(`1. Property Sold: ${data.collateral || '________________'}`, { size: 9.5, gap: 1 });
    writeParagraph(`Description: ${data.property_description || '________________'}`, { size: 9.5, gap: 1 });
    writeParagraph(`2. Agreed Price: ${fmtCurrency(agreedPrice, currency)}`, { size: 9.5, gap: 1 });
    writeParagraph(`In words: ${numberToWords(agreedPrice)} Shillings Only`, { size: 9.5, gap: 1 });
    writeParagraph(`3. Payment: ${paymentSentence}`, { size: 9.5, gap: 1 });
    writeParagraph(`4. Handover: ${handoverSentence}`, { size: 9.5, gap: 1 });
    writeParagraph('5. Role of Group: Class One Savings Group is only a witness to this sale. The Group is not a party to the sale.', { size: 9.5, gap: 1 });
  }

  const providedImages = Array.isArray(opt.nationalIdImages) && opt.nationalIdImages.length
    ? opt.nationalIdImages
    : (Array.isArray(data.national_id_images) ? data.national_id_images : []);
  const imageSources = (isGuaranteed ? providedImages : collateralImageData).filter(Boolean);
  const imageData = (await Promise.all(imageSources.map(getImageDataUrl))).filter(Boolean);
  if (imageData.length) {
    ensureSpace(isGuaranteed ? 12 : 44);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(10);
    doc.text(isGuaranteed ? 'Borrower National ID photos (front and back) - age verification (18+):' : 'Property photos:', leftMargin, y);
    y += 7;
    if (isGuaranteed) {
      writeParagraph('Check the National ID date of birth to confirm the borrower is at least 18 years old.', { size: 9, gap: 2 });
      const columns = 2;
      const gap = 6;
      const cellWidth = (contentWidth - gap) / columns;
      const cellHeight = 42;
      for (let start = 0; start < imageData.length; start += columns) {
        ensureSpace(cellHeight + 10);
        const rowY = y;
        const rowImages = imageData.slice(start, start + columns);
        for (let column = 0; column < rowImages.length; column += 1) {
          const image = rowImages[column];
          const dimensions = await getImageNaturalSize(image);
          const scale = Math.min(cellWidth / dimensions.width, cellHeight / dimensions.height);
          const imageWidth = dimensions.width * scale;
          const imageHeight = dimensions.height * scale;
          const x = leftMargin + column * (cellWidth + gap) + (cellWidth - imageWidth) / 2;
          const imageY = rowY + 5 + (cellHeight - imageHeight) / 2;
          const imageIndex = start + column;
          const label = imageIndex === 0 ? 'Front' : imageIndex === 1 ? 'Back' : `Additional photo ${imageIndex + 1}`;
          doc.setFont(undefined, 'bold');
          doc.setFontSize(8);
          doc.text(label, leftMargin + column * (cellWidth + gap), rowY);
          try {
            doc.addImage(image, getImageFormat(image), x, imageY, imageWidth, imageHeight);
          } catch (imgErr) {
            console.warn('Failed to add National ID image to PDF', imgErr);
          }
        }
        y += cellHeight + 8;
      }
    } else {
      const columns = 5;
      const gap = 3;
      const cellWidth = (contentWidth - gap * (columns - 1)) / columns;
      const cellHeight = 30;
      for (let start = 0; start < imageData.length; start += columns) {
        ensureSpace(cellHeight + 4);
        const rowY = y;
        const rowImages = imageData.slice(start, start + columns);
        for (let column = 0; column < rowImages.length; column += 1) {
          const image = rowImages[column];
          const dimensions = await getImageNaturalSize(image);
          const scale = Math.min(cellWidth / dimensions.width, cellHeight / dimensions.height);
          const imageWidth = dimensions.width * scale;
          const imageHeight = dimensions.height * scale;
          const x = leftMargin + column * (cellWidth + gap) + (cellWidth - imageWidth) / 2;
          const imageY = rowY + (cellHeight - imageHeight) / 2;
          try {
            doc.addImage(image, getImageFormat(image), x, imageY, imageWidth, imageHeight);
          } catch (imgErr) {
            console.warn('Failed to add loan image to PDF', imgErr);
          }
        }
        y += cellHeight + gap;
      }
    }
  }

  ensureSpace(isGuaranteed ? 40 : 55);
  y += 2;
  if (isGuaranteed) {
    writePartyLine(`Lender: ${LENDER.name}`);
    writePartyLine('Signature: ______________________________', { bold: false, size: 9.5 });
    writePartyLine(`Borrower: ${borrowerName}`);
    writePartyLine('Signature: ______________________________', { bold: false, size: 9.5 });
    writePartyLine(`Guarantor: ${guarantorName}`);
    writePartyLine('Signature: ______________________________', { bold: false, size: 9.5 });
    writePartyLine('Witness: ________________________________');
    writePartyLine('Signature: ______________________________', { bold: false, size: 9.5 });
    writePartyLine(`Date: ${agreementDate}`, { bold: false, size: 9.5 });
  } else {
    writePartyLine('Seller Signature: ______________________________', { bold: false, size: 9.5 });
    writePartyLine('Buyer Signature: _______________________________', { bold: false, size: 9.5 });
    writePartyLine('Witnesses - Group Members:');
    writePartyLine(`1. Name: ${data.witness_1_name || '________________'}  Signature: __________________`, { bold: false, size: 9.5 });
    writePartyLine(`2. Name: ${data.witness_2_name || '________________'}  Signature: __________________`, { bold: false, size: 9.5 });
  }

  if (opt.download !== false) {
    const safeFileName = borrowerName.toString().replace(/\s/g, '_').replace(/[^\w-]/g, '') || 'Agreement';
    const date = new Date().toISOString().split('T')[0];
    const documentPrefix = isGuaranteed ? 'Loan_Agreement' : 'Selling_Agreement';
    await savePdf(doc, `${documentPrefix}_${safeFileName}-${date}.pdf`);
  }
  return doc;
};

const createWithdrawalsPDF = async (withdrawals, filenamePrefix = 'withdrawals') => {
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
  await savePdf(doc, `${filenamePrefix}-${new Date().toISOString().split('T')[0]}.pdf`);
};

const createPettyCashPDF = async (items, filenamePrefix = 'petty-cash') => {
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
  await savePdf(doc, `${filenamePrefix}-${new Date().toISOString().split('T')[0]}.pdf`);
};

const drawReceiptLine = (doc, y, text, x = 14, align = 'left', bold = false) => {
  doc.setFontSize(9);
  doc.setFont(undefined, bold ? 'bold' : 'normal');
  doc.setTextColor(...RECEIPT_GREEN);
  doc.text(text, x, y, { align });
  return y + 5;
};

const drawDashedLine = (doc, y) => {
  doc.setDrawColor(...RECEIPT_GOLD);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(14, y, doc.internal.pageSize.width - 14, y);
  doc.setLineDashPattern([], 0);
  return y + 4;
};

const drawSummaryItemsHeader = (doc, y) => {
  const pageWidth = doc.internal.pageSize.width;
  doc.setFillColor(...RECEIPT_GREEN);
  doc.rect(14, y - 4, pageWidth - 28, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont(undefined, 'bold');
  doc.text('DESCRIPTION', 17, y + 1);
  doc.text('QTY', 104, y + 1, { align: 'center' });
  doc.text('PRICE', 145, y + 1, { align: 'right' });
  doc.text('TOTAL', pageWidth - 17, y + 1, { align: 'right' });
  return y + 10;
};

const drawItemRow = (doc, y, item, qty, unitPrice) => {
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(45, 45, 45);
  const shortTitle = item.length > 52 ? item.substring(0, 49) + '...' : item;
  doc.text(shortTitle, 17, y);
  doc.text(String(qty), 104, y, { align: 'center' });
  doc.text(fmtUGX(unitPrice), 145, y, { align: 'right' });
  doc.text(fmtUGX(unitPrice * qty), doc.internal.pageSize.width - 17, y, { align: 'right' });
  return y + 5;
};

const RECEIPT_GREEN = [10, 46, 31];
const RECEIPT_GOLD = [212, 175, 55];

const getOrderReceiptNumber = (order) => {
  const storedNumber = String(order.receipt_number || '');
  const storedMatch = storedNumber.match(/^C1SG-(\d{8})-(\d+)$/i);
  if (storedMatch) {
    return `C1SG-${storedMatch[1]}-${storedMatch[2].padStart(3, '0')}`;
  }

  const date = new Date(order.created_at || order.createdAt || Date.now());
  const datePart = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10).replace(/-/g, '')
    : `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const idDigits = String(order.id || '').replace(/\D/g, '').slice(-3);
  const sequence = idDigits && Number(idDigits) ? idDigits.padStart(3, '0') : '001';
  return `C1SG-${datePart}-${sequence}`;
};

const loadReceiptLogo = () => getImageDataUrl(`${process.env.PUBLIC_URL || ''}/classOne-logo.png`);

const drawReceiptHeader = (doc, title = 'RECEIPT', logo = null) => {
  const pageWidth = doc.internal.pageSize.width;
  doc.setFillColor(...RECEIPT_GREEN);
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setFillColor(...RECEIPT_GOLD);
  doc.rect(0, 34, pageWidth, 1.5, 'F');

  if (logo) {
    doc.addImage(logo, getImageFormat(logo), 14, 4, 20, 26, undefined, 'FAST');
  }

  doc.setTextColor(...RECEIPT_GOLD);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.text('Class One Savings Group', 42, 11);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  doc.text('Supporting Savings & Financial Growth', 42, 17);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(20);
  doc.text(title, 42, 28);
};

const RECEIPT_FOOTER_HEIGHT = 33;

const drawReceiptFooter = (doc, y, receiptLabel) => {
  const pageWidth = doc.internal.pageSize.width;
  const left = 0;
  const width = pageWidth;
  doc.setFillColor(...RECEIPT_GOLD);
  doc.rect(left, y, width, 1, 'F');
  doc.setFillColor(...RECEIPT_GREEN);
  doc.rect(left, y + 1, width, 13, 'F');
  doc.setTextColor(...RECEIPT_GOLD);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(14);
  doc.text('Thank you for your purchase.', pageWidth / 2, y + 9.5, { align: 'center' });

  doc.setFillColor(255, 255, 255);
  doc.rect(left, y + 14, width, 17, 'F');
  doc.setTextColor(85, 85, 85);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text('Class One Savings Group · Fort Portal, Uganda', pageWidth / 2, y + 18.5, { align: 'center' });
  doc.setTextColor(136, 136, 136);
  doc.setFontSize(8.5);
  doc.text(
    'This is a computer-generated receipt. No signature required.',
    pageWidth / 2,
    y + 22.5,
    { align: 'center' }
  );
  doc.setTextColor(...RECEIPT_GREEN);
  doc.setFontSize(8);
  doc.text(receiptLabel, pageWidth / 2, y + 27, { align: 'center', maxWidth: width - 8 });
  doc.setFillColor(...RECEIPT_GOLD);
  doc.rect(left, y + 31, width, 1, 'F');
};

const createOrderReceiptPDF = async (order, buyerName, buyerPhone, buyerEmail) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const receiptLogo = await loadReceiptLogo();
  drawReceiptHeader(doc, 'RECEIPT', receiptLogo);
  const createdAt = order.created_at || order.createdAt;
  const receiptDate = createdAt ? new Date(createdAt) : new Date();
  let y = 44;

  doc.setTextColor(...RECEIPT_GREEN);
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text('Receipt No:', 14, y);
  doc.text('Date:', pageWidth - 65, y);
  doc.setFont(undefined, 'normal');
  doc.text(getOrderReceiptNumber(order), 14, y + 5);
  doc.text(
    Number.isNaN(receiptDate.getTime()) ? '-' : receiptDate.toLocaleDateString('en-GB'),
    pageWidth - 65,
    y + 5
  );
  doc.setDrawColor(220);
  doc.line(14, y + 9, pageWidth - 14, y + 9);

  y += 17;
  doc.setFont(undefined, 'bold');
  doc.text('Seller:', 14, y);
  doc.text('Customer:', pageWidth / 2 + 4, y);
  doc.setFont(undefined, 'normal');
  doc.text(order.sellerName || 'N/A', 14, y + 5);
  doc.text(buyerName || order.buyerName || 'N/A', pageWidth / 2 + 4, y + 5);
  const sellerPhone = order.sellerPhone || order.seller_phone;
  const customerPhone = buyerPhone || order.buyerPhone;
  const customerEmail = buyerEmail || order.buyerEmail;
  if (sellerPhone) doc.text(String(sellerPhone), 14, y + 10);
  if (customerPhone) doc.text(String(customerPhone), pageWidth / 2 + 4, y + 10);
  if (customerEmail) doc.text(String(customerEmail), pageWidth / 2 + 4, y + 15);

  const products = order.products && Array.isArray(order.products)
    ? order.products
    : order.productTitle
      ? [{ title: order.productTitle, quantity: order.quantity || 1, price: order.productPrice || order.total || 0 }]
      : [];
  const normalizedProducts = products.map((product) => ({
    title: product.title || 'Item',
    quantity: Number(product.quantity || 1),
    price: Number(product.price || 0),
  }));
  const subtotal = Number(order.total ?? normalizedProducts.reduce(
    (sum, product) => sum + product.price * product.quantity,
    0
  ));

  autoTable(doc, {
    startY: y + (customerEmail ? 20 : customerPhone ? 15 : 10),
    margin: { left: 14, right: 14, bottom: 22 },
    head: [['DESCRIPTION', 'QTY', 'PRICE', 'TOTAL']],
    body: normalizedProducts.map((product) => [
      product.title,
      String(product.quantity),
      fmtUGX(product.price),
      fmtUGX(product.price * product.quantity),
    ]),
    styles: { fontSize: 9, cellPadding: 3, textColor: [45, 45, 45], lineColor: [220, 220, 220] },
    headStyles: { fillColor: RECEIPT_GREEN, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 246] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 38, halign: 'right' },
      3: { cellWidth: 38, halign: 'right' },
    },
  });

  y = doc.lastAutoTable.finalY + 9;
  if (y + 30 + RECEIPT_FOOTER_HEIGHT > doc.internal.pageSize.height - 5) {
    doc.addPage();
    drawReceiptHeader(doc, 'RECEIPT', receiptLogo);
    y = 48;
  }
  const totalsX = pageWidth * 0.36;
  const totalsWidth = pageWidth - totalsX - 14;
  doc.setDrawColor(...RECEIPT_GOLD);
  doc.setLineWidth(0.7);
  doc.rect(totalsX, y, totalsWidth, 28);
  doc.setTextColor(45, 45, 45);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text('Subtotal:', totalsX + 4, y + 7);
  doc.text(fmtUGX(subtotal), pageWidth - 18, y + 7, { align: 'right' });
  doc.setTextColor(...RECEIPT_GREEN);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', totalsX + 4, y + 15);
  doc.text(fmtUGX(subtotal), pageWidth - 18, y + 15, { align: 'right' });
  doc.setTextColor(90, 90, 90);
  doc.setFont(undefined, 'italic');
  doc.setFontSize(7);
  const amountWords = `${numberToWords(subtotal)} Only`;
  doc.text(doc.splitTextToSize(amountWords, totalsWidth - 8), pageWidth - 18, y + 22, { align: 'right' });
  drawReceiptFooter(doc, y + 30, `Receipt No: ${getOrderReceiptNumber(order)}`);

  await savePdf(doc, `receipt-${getOrderReceiptNumber(order)}.pdf`);
};

const createCustomerReceiptPDF = async (customers, options = {}) => {
  const { singleSeller, dateRange } = options;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const receiptLogo = await loadReceiptLogo();

  customers.forEach((customer, customerIndex) => {
    const sortedOrders = (customer.orders || []).slice().sort((a, b) => {
      const dateA = new Date(a.createdAt || a.created_at || 0);
      const dateB = new Date(b.createdAt || b.created_at || 0);
      return dateA - dateB;
    });

    let y = 45;
    if (customerIndex > 0) {
      doc.addPage();
    }

    drawReceiptHeader(doc, 'CUSTOMER RECEIPT', receiptLogo);

    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
    if (dateRange) doc.text(`Period: ${dateRange}`, pageWidth - 14, y, { align: 'right' });
    y += 8;

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...RECEIPT_GREEN);
    doc.text(`Customer: ${customer.name}`, 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(80);
    doc.text(`Contact: ${customer.phone || customer.email || '-'}`, 14, y);
    y += 8;

    doc.setDrawColor(...RECEIPT_GOLD);
    doc.setLineWidth(0.6);
    doc.line(14, y, pageWidth - 14, y);
    y += 6;

    let customerTotal = 0;

    sortedOrders.forEach((o) => {
      if (y + 26 + RECEIPT_FOOTER_HEIGHT > doc.internal.pageSize.height - 5) {
        doc.addPage();
        drawReceiptHeader(doc, 'CUSTOMER RECEIPT', receiptLogo);
        y = 45;
      }

      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...RECEIPT_GREEN);
      doc.text(`Receipt: ${getOrderReceiptNumber(o)}  |  Date: ${fmtDate(o.createdAt || o.created_at)}  |  Seller: ${o.sellerName || '-'}`, 14, y);
      y += 6;
      y = drawSummaryItemsHeader(doc, y);

      const products = o.products && Array.isArray(o.products)
        ? o.products
        : o.productTitle
          ? [{ title: o.productTitle, quantity: o.quantity || 1, price: o.productPrice || o.total || 0 }]
          : [];

      products.forEach((p) => {
        if (y > 270) {
          doc.addPage();
          drawReceiptHeader(doc, 'CUSTOMER RECEIPT', receiptLogo);
          y = drawSummaryItemsHeader(doc, 45);
        }
        const qty = p.quantity || 1;
        const title = p.title || 'Item';
        y = drawItemRow(doc, y, title, qty, Number(p.price || 0));
      });

      if (y > 265) {
        doc.addPage();
        drawReceiptHeader(doc, 'CUSTOMER RECEIPT', receiptLogo);
        y = 45;
      }
      const orderTotal = o.total || products.reduce((sum, p) => sum + (p.price || 0) * (p.quantity || 1), 0);
      customerTotal += orderTotal;
      y = drawReceiptLine(doc, y, `Order Total: ${fmtUGX(orderTotal)}`, pageWidth - 14, 'right', true);
      y = drawDashedLine(doc, y);
      y += 2;
    });

    if (y + 24 + RECEIPT_FOOTER_HEIGHT > doc.internal.pageSize.height - 8) {
      doc.addPage();
      drawReceiptHeader(doc, 'CUSTOMER RECEIPT', receiptLogo);
      y = 45;
    }

    const totalsX = pageWidth * 0.36;
    const totalsWidth = pageWidth - totalsX - 14;
    doc.setDrawColor(...RECEIPT_GOLD);
    doc.setLineWidth(0.7);
    doc.rect(totalsX, y, totalsWidth, 24);
    doc.setTextColor(...RECEIPT_GREEN);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(`Customer Total: ${fmtUGX(customerTotal)}`, pageWidth - 18, y + 8, { align: 'right' });
    doc.setFontSize(8);
    doc.setFont(undefined, 'italic');
    doc.setTextColor(90, 90, 90);
    doc.text(`${numberToWords(customerTotal)} Only · ${sortedOrders.length} order(s)`, pageWidth - 18, y + 17, { align: 'right' });
    const receiptNumbers = sortedOrders.map(getOrderReceiptNumber);
    const shownReceiptNumbers = receiptNumbers.slice(0, 3).join(', ');
    const remainingReceipts = receiptNumbers.length - 3;
    const receiptLabel = receiptNumbers.length > 3
      ? `Receipt Nos: ${shownReceiptNumbers} +${remainingReceipts} more (listed above)`
      : `Receipt Nos: ${shownReceiptNumbers || 'None'}`;
    drawReceiptFooter(doc, y + 26, receiptLabel);
  });

  await savePdf(doc, `customer-receipt-${new Date().toISOString().split('T')[0]}.pdf`);
};

const createSellerReceiptPDF = async (sellers, options = {}) => {
  const { dateRange } = options;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const receiptLogo = await loadReceiptLogo();
  drawReceiptHeader(doc, 'SELLER RECEIPTS', receiptLogo);
  let y = 45;

  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
  if (dateRange) {
    doc.text(`Period: ${dateRange}`, pageWidth - 14, y, { align: 'right' });
  }
  y += 10;

  let grandTotal = 0;

  sellers.forEach((seller) => {
    const sortedOrders = (seller.orders || []).slice().sort((a, b) => {
      const dateA = new Date(a.createdAt || a.created_at || 0);
      const dateB = new Date(b.createdAt || b.created_at || 0);
      return dateA - dateB;
    });

    if (y + 26 + RECEIPT_FOOTER_HEIGHT > doc.internal.pageSize.height - 5) {
      doc.addPage();
      drawReceiptHeader(doc, 'SELLER RECEIPTS', receiptLogo);
      y = 45;
    }

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...RECEIPT_GREEN);
    doc.text(`Seller: ${seller.name}`, 14, y);
    y += 8;

    y = drawDashedLine(doc, y);

    sortedOrders.forEach((o) => {
      if (y + 24 + RECEIPT_FOOTER_HEIGHT > doc.internal.pageSize.height - 8) {
        doc.addPage();
        drawReceiptHeader(doc, 'SELLER RECEIPTS', receiptLogo);
        y = 45;
      }

      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...RECEIPT_GREEN);
      doc.text(`Receipt: ${getOrderReceiptNumber(o)}  |  Date: ${fmtDate(o.createdAt || o.created_at)}  |  Buyer: ${o.buyerName || '-'}`, 14, y);
      y += 6;
      y = drawSummaryItemsHeader(doc, y);

      const products = o.products && Array.isArray(o.products)
        ? o.products
        : o.productTitle
          ? [{ title: o.productTitle, quantity: o.quantity || 1, price: o.productPrice || o.total || 0 }]
          : [];

      products.forEach((p) => {
        if (y > 270) {
          doc.addPage();
          drawReceiptHeader(doc, 'SELLER RECEIPTS', receiptLogo);
          y = drawSummaryItemsHeader(doc, 45);
        }
        const qty = p.quantity || 1;
        const title = p.title || 'Item';
        y = drawItemRow(doc, y, title, qty, Number(p.price || 0));
      });

      if (y > 265) {
        doc.addPage();
        drawReceiptHeader(doc, 'SELLER RECEIPTS', receiptLogo);
        y = 45;
      }
      const orderTotal = o.total || products.reduce((sum, p) => sum + (p.price || 0) * (p.quantity || 1), 0);
      grandTotal += orderTotal;
      y = drawReceiptLine(doc, y, `Order Total: ${fmtUGX(orderTotal)}`, pageWidth - 14, 'right', true);
      y = drawDashedLine(doc, y);
      y += 2;
    });
  });

  if (y > 240) {
    doc.addPage();
    drawReceiptHeader(doc, 'SELLER RECEIPTS', receiptLogo);
    y = 45;
  }

  const totalsX = pageWidth * 0.36;
  const totalsWidth = pageWidth - totalsX - 14;
  doc.setDrawColor(...RECEIPT_GOLD);
  doc.setLineWidth(0.7);
  doc.rect(totalsX, y, totalsWidth, 24);
  doc.setTextColor(...RECEIPT_GREEN);
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(`Grand Total Sales: ${fmtUGX(grandTotal)}`, pageWidth - 18, y + 8, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont(undefined, 'italic');
  doc.setTextColor(90, 90, 90);
  doc.text(
    `${numberToWords(grandTotal)} Only · ${sellers.length} seller(s), ${sellers.reduce((sum, seller) => sum + seller.orders.length, 0)} order(s)`,
    pageWidth - 18,
    y + 17,
    { align: 'right' }
  );
  const receiptNumbers = sellers.flatMap((seller) => seller.orders.map(getOrderReceiptNumber));
  const shownReceiptNumbers = receiptNumbers.slice(0, 3).join(', ');
  const remainingReceipts = receiptNumbers.length - 3;
  const receiptLabel = receiptNumbers.length > 3
    ? `Receipt Nos: ${shownReceiptNumbers} +${remainingReceipts} more (listed above)`
    : `Receipt Nos: ${shownReceiptNumbers || 'None'}`;
  drawReceiptFooter(doc, y + 26, receiptLabel);

  await savePdf(doc, `seller-receipt-${new Date().toISOString().split('T')[0]}.pdf`);
};

const createFullGroupReportPDF = async ({ financials, deposits, loans, withdrawals, pettyCash, members }) => {
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
  
  await savePdf(doc, `group-report-${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportDepositsPDF = withPdfProgress(createDepositsPDF);
export const exportLoansPDF = withPdfProgress(createLoansPDF);
export const exportLoanAgreementPDF = withPdfProgress(createLoanAgreementPDF);
export const exportWithdrawalsPDF = withPdfProgress(createWithdrawalsPDF);
export const exportPettyCashPDF = withPdfProgress(createPettyCashPDF);
export const exportOrderReceiptPDF = withPdfProgress(createOrderReceiptPDF);
export const exportCustomerReceiptPDF = withPdfProgress(createCustomerReceiptPDF);
export const exportSellerReceiptPDF = withPdfProgress(createSellerReceiptPDF);
export const exportFullGroupReportPDF = withPdfProgress(createFullGroupReportPDF);
