const PAYMENT_RECIPIENT_TYPE =
  process.env.PAYMENT_RECIPIENT_TYPE;

const PAYMENT_RECIPIENT_NAME =
  process.env.PAYMENT_RECIPIENT_NAME;

const PAYMENT_RECIPIENT_BILLER_ID =
  process.env.PAYMENT_RECIPIENT_BILLER_ID;

const PAYMENT_RECIPIENT_CARD_LAST4 =
  process.env.PAYMENT_RECIPIENT_CARD_LAST4;


function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


function normalizeDigits(value) {
  return String(value || "")
    .replace(/\D/g, "");
}


function normalizeAmount(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  const cleaned =
    String(value)
      .replace(/[^\d.]/g, "");

  const amount =
    Number(cleaned);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return amount;
}


export function verifyPaymentSlip({
  classification,
  expectedAmount,
}) {
  const reasons = [];

  if (
    !classification ||
    classification.type !== "PAYMENT_SLIP"
  ) {
    return {
      verified: false,
      status: "NOT_PAYMENT_SLIP",
      reasons: [
        "Image is not classified as PAYMENT_SLIP",
      ],
    };
  }


  // -----------------------------------------
  // AMOUNT CHECK
  // -----------------------------------------

  const slipAmount =
    normalizeAmount(
      classification.amount
    );

  const jobAmount =
    normalizeAmount(
      expectedAmount
    );

  const amountMatch =
    slipAmount !== null &&
    jobAmount !== null &&
    Math.abs(
      slipAmount - jobAmount
    ) < 0.01;

  if (!amountMatch) {
    reasons.push(
      "PAYMENT_AMOUNT_MISMATCH"
    );
  }


  // -----------------------------------------
  // RECIPIENT NAME CHECK
  // -----------------------------------------

  const expectedName =
    normalizeText(
      PAYMENT_RECIPIENT_NAME
    );

  const slipRecipientName =
    normalizeText(
      classification.recipientName
    );

  const recipientNameMatch =
    Boolean(expectedName) &&
    Boolean(slipRecipientName) &&
    (
      slipRecipientName.includes(
        expectedName
      ) ||
      expectedName.includes(
        slipRecipientName
      )
    );

  if (!recipientNameMatch) {
    reasons.push(
      "RECIPIENT_NAME_MISMATCH"
    );
  }


  // -----------------------------------------
  // BILLER ID CHECK
  // -----------------------------------------

  const expectedBillerId =
    normalizeDigits(
      PAYMENT_RECIPIENT_BILLER_ID
    );

  const slipBillerId =
    normalizeDigits(
      classification.recipientBillerId
    );

  const billerIdMatch =
    Boolean(expectedBillerId) &&
    Boolean(slipBillerId) &&
    slipBillerId ===
      expectedBillerId;

  if (!billerIdMatch) {
    reasons.push(
      "BILLER_ID_MISMATCH"
    );
  }


  // -----------------------------------------
  // CARD LAST 4 CHECK
  // -----------------------------------------

  const expectedLast4 =
    normalizeDigits(
      PAYMENT_RECIPIENT_CARD_LAST4
    );

  const slipLast4 =
    normalizeDigits(
      classification.recipientCardLast4
    );

  const cardLast4Match =
    Boolean(expectedLast4) &&
    Boolean(slipLast4) &&
    slipLast4 ===
      expectedLast4;

  if (!cardLast4Match) {
    reasons.push(
      "CARD_LAST4_MISMATCH"
    );
  }


  // -----------------------------------------
  // CONFIDENCE CHECK
  // -----------------------------------------

  const confidence =
    Number(
      classification.confidence || 0
    );

  const confidenceOk =
    confidence >= 0.9;

  if (!confidenceOk) {
    reasons.push(
      "LOW_CLASSIFICATION_CONFIDENCE"
    );
  }


  const verified =
    amountMatch &&
    recipientNameMatch &&
    billerIdMatch &&
    cardLast4Match &&
    confidenceOk;


  return {
    verified,

    status:
      verified
        ? "VERIFIED"
        : "NEEDS_REVIEW",

    reasons,

    checks: {
      amountMatch,
      recipientNameMatch,
      billerIdMatch,
      cardLast4Match,
      confidenceOk,
    },

    extracted: {
      amount:
        classification.amount ?? null,

      transactionDate:
        classification.transactionDate ?? null,

      transactionTime:
        classification.transactionTime ?? null,

      reference:
        classification.reference ?? null,

      recipientName:
        classification.recipientName ?? null,

      recipientBillerId:
        classification.recipientBillerId ?? null,

      recipientCardLast4:
        classification.recipientCardLast4 ?? null,
    },

    recipientType:
      PAYMENT_RECIPIENT_TYPE || null,
  };
}
