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
  minimumTransactionDate = null,
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
    classification.recipientName ||
    classification.recipientBankOrBiller
  );

const recipientNameMatch =
  Boolean(expectedName) &&
  Boolean(slipRecipientName) &&
  slipRecipientName === expectedName;

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

// -----------------------------------------
// TRANSACTION DATE CHECK
// -----------------------------------------

let transactionDateOk = true;

if (minimumTransactionDate) {
  const slipDateText =
    String(
      classification.transactionDate || ""
    ).trim();

  const validSlipDate =
    /^\d{4}-\d{2}-\d{2}$/.test(
      slipDateText
    );

  if (!validSlipDate) {
    transactionDateOk = false;

    reasons.push(
      "PAYMENT_DATE_MISSING_OR_INVALID"
    );
  } else {
    const removedDate =
      new Date(minimumTransactionDate);

    if (
      Number.isNaN(
        removedDate.getTime()
      )
    ) {
      transactionDateOk = false;

      reasons.push(
        "PAYMENT_MINIMUM_DATE_INVALID"
      );
    } else {
      // แปลง removed_at เป็นวันที่ประเทศไทย
      const parts =
        new Intl.DateTimeFormat(
          "en-US",
          {
            timeZone:
              "Asia/Bangkok",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }
        ).formatToParts(
          removedDate
        );

      const getPart = (type) =>
        parts.find(
          (part) =>
            part.type === type
        )?.value;

      const year =
        Number(
          getPart("year")
        );

      const month =
        Number(
          getPart("month")
        );

      const day =
        Number(
          getPart("day")
        );

      // ใช้ UTC ตรงนี้เพื่อทำ calendar math
      // โดยไม่ให้ timezone ของ server มารบกวน
      const minimumDate =
        new Date(
          Date.UTC(
            year,
            month - 1,
            day
          )
        );

      // ยอมให้จ่ายก่อน removed_at ได้ 1 วัน
      minimumDate.setUTCDate(
        minimumDate.getUTCDate() - 1
      );

      const minimumDateText =
        minimumDate
          .toISOString()
          .slice(0, 10);

      if (
        slipDateText <
        minimumDateText
      ) {
        transactionDateOk = false;

        reasons.push(
          "PAYMENT_DATE_TOO_OLD"
        );
      }
    }
  }
}

  
const verified =
  amountMatch &&
  recipientNameMatch &&
  billerIdMatch &&
  cardLast4Match &&
  confidenceOk &&
  transactionDateOk;


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
      transactionDateOk,
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
