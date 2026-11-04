// GMR KTC payment slip verification
// IMPORTANT: This validates extracted slip information, not settlement with KTC/bank.

const PAYMENT_RECIPIENT_TYPE = String(
  process.env.PAYMENT_RECIPIENT_TYPE || 'KTC_BILLER'
).trim().toUpperCase();

const PAYMENT_RECIPIENT_NAME = process.env.PAYMENT_RECIPIENT_NAME;
const PAYMENT_RECIPIENT_BILLER_ID = process.env.PAYMENT_RECIPIENT_BILLER_ID;
const PAYMENT_RECIPIENT_CARD_LAST4 = process.env.PAYMENT_RECIPIENT_CARD_LAST4;
const PAYMENT_KTC_CARD_LAST4 = process.env.PAYMENT_KTC_CARD_LAST4;

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeAmount(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const cleaned = String(value).replace(/,/g, '').replace(/[^\d.]/g, '');
  if (!cleaned || !/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function looksLikeKtcRecipient(value) {
  const text = normalizeText(value);
  return /\bktc\b|krungthai\s+card|บัตร\s*กรุงไทย/i.test(text);
}

function getBangkokCalendarDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (key) => parts.find((p) => p.type === key)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function isRealISODate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

export function verifyPaymentSlip({ classification, expectedAmount, minimumTransactionDate = null }) {
  if (!classification || classification.type !== 'PAYMENT_SLIP') {
    return {
      verified: false,
      status: 'NOT_PAYMENT_SLIP',
      reasons: ['Image is not classified as PAYMENT_SLIP'],
    };
  }

  const reasons = [];
  const isKtcMethod = PAYMENT_RECIPIENT_TYPE === 'KTC_BILLER';

  const slipAmount = normalizeAmount(classification.amount);
  const jobAmount = normalizeAmount(expectedAmount);
  const amountMatch = slipAmount !== null && jobAmount !== null &&
    Math.abs(slipAmount - jobAmount) < 0.01;
  if (!amountMatch) reasons.push('PAYMENT_AMOUNT_MISMATCH');

  // Align the verifier and server KTC override on the same last-four setting.
  // Refuse automatic verification if both configured values disagree.
  const last4A = normalizeDigits(PAYMENT_KTC_CARD_LAST4);
  const last4B = normalizeDigits(PAYMENT_RECIPIENT_CARD_LAST4);
  const cardConfigConflict = Boolean(last4A && last4B && last4A !== last4B);
  if (cardConfigConflict) reasons.push('PAYMENT_CARD_CONFIG_CONFLICT');
  const expectedLast4 = last4A || last4B;
  const slipLast4 = normalizeDigits(classification.recipientCardLast4);
  const cardLast4Match = !cardConfigConflict && expectedLast4.length === 4 &&
    slipLast4.length >= 4 && slipLast4.slice(-4) === expectedLast4;
  if (!cardLast4Match) reasons.push('CARD_LAST4_MISMATCH');

  const expectedName = normalizeText(PAYMENT_RECIPIENT_NAME);
  const slipRecipientName = normalizeText(
    classification.recipientName || classification.recipientBankOrBiller
  );
  const knownKtcRecipient = looksLikeKtcRecipient(slipRecipientName);
  const recipientNameMatch = Boolean(slipRecipientName) && (
    (Boolean(expectedName) && slipRecipientName === expectedName) ||
    (isKtcMethod && knownKtcRecipient && cardLast4Match)
  );
  if (!recipientNameMatch) reasons.push('RECIPIENT_NAME_MISMATCH');

  const expectedBillerId = normalizeDigits(PAYMENT_RECIPIENT_BILLER_ID);
  const slipBillerId = normalizeDigits(classification.recipientBillerId);
  let billerIdMatch = false;
  let billerIdVerification = 'UNVERIFIED';

  if (expectedBillerId && slipBillerId) {
    // An explicitly extracted different ID must NEVER be silently bypassed.
    billerIdMatch = expectedBillerId === slipBillerId;
    billerIdVerification = billerIdMatch ? 'EXACT_ID' : 'ID_MISMATCH';
    if (!billerIdMatch) reasons.push('BILLER_ID_MISMATCH');
  } else if (
    isKtcMethod && knownKtcRecipient && cardLast4Match && !cardConfigConflict
  ) {
    // KTC card-payment slips can show issuer + last four but omit biller ID.
    // This is a limited fallback when NO conflicting biller ID was extracted.
    billerIdMatch = true;
    billerIdVerification = 'KTC_CARD_LAST4_FALLBACK';
  } else {
    billerIdMatch = false;
    billerIdVerification = !expectedBillerId
      ? 'EXPECTED_ID_NOT_CONFIGURED'
      : 'SLIP_ID_NOT_FOUND';
    reasons.push(!expectedBillerId
      ? 'BILLER_ID_NOT_CONFIGURED'
      : 'BILLER_ID_MISSING');
  }

  const confidence = Number(classification.confidence || 0);
  const confidenceOk = Number.isFinite(confidence) && confidence >= 0.9;
  if (!confidenceOk) reasons.push('LOW_CLASSIFICATION_CONFIDENCE');

  // Prevent automatic approval of images without a usable transaction reference.
  // The caller must still check uniqueness against verified payments in the DB.
  const transactionReference = String(classification.reference || '').trim();
  const transactionReferencePresent = transactionReference.length >= 6;
  if (!transactionReferencePresent) reasons.push('PAYMENT_REFERENCE_MISSING');

  let transactionDateOk = true;
  if (minimumTransactionDate) {
    const slipDateText = String(classification.transactionDate || '').trim();
    if (!isRealISODate(slipDateText)) {
      transactionDateOk = false;
      reasons.push('PAYMENT_DATE_MISSING_OR_INVALID');
    } else {
      const minDayText = getBangkokCalendarDate(minimumTransactionDate);
      if (!minDayText) {
        transactionDateOk = false;
        reasons.push('PAYMENT_MINIMUM_DATE_INVALID');
      } else {
        const minDay = new Date(`${minDayText}T00:00:00.000Z`);
        minDay.setUTCDate(minDay.getUTCDate() - 1);
        if (slipDateText < minDay.toISOString().slice(0, 10)) {
          transactionDateOk = false;
          reasons.push('PAYMENT_DATE_TOO_OLD');
        }
      }
    }
  }

  const verified = reasons.length === 0 && amountMatch &&
    recipientNameMatch && billerIdMatch && cardLast4Match &&
    confidenceOk && transactionDateOk && transactionReferencePresent;

  return {
    verified,
    status: verified ? 'VERIFIED' : 'NEEDS_REVIEW',
    reasons,
    checks: {
      amountMatch,
      recipientNameMatch,
      billerIdMatch,
      billerIdVerification,
      cardLast4Match,
      cardConfigConflict,
      confidenceOk,
      transactionDateOk,
      transactionReferencePresent,
    },
    extracted: {
      amount: classification.amount ?? null,
      transactionDate: classification.transactionDate ?? null,
      transactionTime: classification.transactionTime ?? null,
      reference: classification.reference ?? null,
      recipientName: classification.recipientName ?? null,
      recipientBillerId: classification.recipientBillerId ?? null,
      recipientCardLast4: classification.recipientCardLast4 ?? null,
    },
    recipientType: PAYMENT_RECIPIENT_TYPE,
  };
}
