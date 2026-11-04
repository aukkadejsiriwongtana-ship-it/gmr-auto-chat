import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// This prompt deliberately does NOT disclose the expected destination card
// or amount. The model must read the actual image, not copy an expected value.
const IMAGE_CLASSIFIER_PROMPT = `
Classify this customer image into exactly one category:
PAYMENT_SLIP, REVIEW_SCREENSHOT, MAP_SCREENSHOT, OTHER_IMAGE, UNKNOWN.

PAYMENT_SLIP RULES:
- Must be a completed bank transfer or payment confirmation, showing a successful transaction.
- A QR code alone, invoice, bill, payment request, or pre-payment screen is NOT a PAYMENT_SLIP.
- Read the visible image carefully; do not invent or infer missing characters.

CRITICAL: IDENTIFY THE DIRECTION OF PAYMENT CORRECTLY.
Many Thai payment slips display two parties in vertical order:
  FROM / จาก = SENDER / PAYER (the customer paying us)
  TO / ไปยัง = RECIPIENT / BENEFICIARY / BILLER (the destination receiving money)
- The top account, sender's bank/account, customer's name and sender's account last 4 are NOT the destination.
- For K PLUS / KBank and other Thai slips, names beside the FIRST bank logo usually belong to the sender, while the SECOND institution below the downward arrow is the recipient.
- Never fill any recipient* field using information from the FROM/จาก section.
- Extract senderName and senderAccountLast4 separately, even though these are diagnostic-only fields.
- Extract recipientName ONLY from TO/ไปยัง/Payee/Biller/Beneficiary section.
- Extract recipientBankOrBiller ONLY from the TO/ไปยัง section.
- If the TO section says KRUNGTHAI CARD PUBLIC COMPANY LIMITED, KRUNGTHAI CARD, KTC, or บริษัท บัตรกรุงไทย จำกัด (มหาชน), that is the recipient/biller; do not copy the sending shop's name into recipientName.
- recipientCardLast4 is the last four digits of a CARD NUMBER in the RECIPIENT/TO section, not the last four digits of the sender's BANK ACCOUNT. A card number may be unmasked (e.g. 16 digits) or partially masked. If shown, return only the last 4 digits, NOT the full card number.
- recipientCardMasked may describe the displayed destination card, but redact all digits except its final 4. Never return a complete card number.
- recipientBillerId is an explicitly labeled BILLER ID / Biller code only. A destination card number, sender account number, bank reference, transaction ID, and QR data are NOT biller IDs. If no explicit Biller ID label/value is visible, return null.
- If there is any doubt which party owns a field, return null for that field and reduce confidence. DO NOT GUESS.
- transactionDate must be YYYY-MM-DD, transactionTime HH:mm:ss in 24-hour time (if time displayed without seconds, use :00).
- reference must be the transfer's displayed transaction reference, NOT the card number, account number, or biller ID.
- amount is the numeric payment amount, not fees or balance.
- A high confidence score requires that you are confident about the direction (FROM vs TO), not just that the image is clearly a slip.

REVIEW_SCREENSHOT:
- A screenshot/photo clearly showing a Google Maps review of any star rating from 1 to 5.
- Extract businessName, reviewerName, rating (numeric 1 to 5), reviewText (verbatim), reviewDateText, reviewLanguage only if clearly visible.

MAP_SCREENSHOT:
- A screenshot/photo mainly showing a Google Maps business profile/map. Extract businessName if clearly visible.

OTHER_IMAGE: Any other image.
UNKNOWN: Cannot determine reliably.

Return ONLY a valid JSON object (no Markdown, no code fences) with ALL keys:
{
  "type": "PAYMENT_SLIP",
  "confidence": 0.95,
  "reason": "short explanation of what is seen and which section is recipient",
  "amount": null,
  "bankName": null,
  "transactionDate": null,
  "transactionTime": null,
  "reference": null,
  "senderName": null,
  "senderAccountLast4": null,
  "recipientName": null,
  "recipientBankOrBiller": null,
  "recipientBillerId": null,
  "recipientCardMasked": null,
  "recipientCardLast4": null,
  "businessName": null,
  "reviewerName": null,
  "rating": null,
  "reviewText": null,
  "reviewDateText": null,
  "reviewLanguage": null
}

Allowed type values: PAYMENT_SLIP, REVIEW_SCREENSHOT, MAP_SCREENSHOT, OTHER_IMAGE, UNKNOWN.
Use null for anything not clearly visible. Do not copy example values from these instructions into extracted fields.
`.trim();

function nullableText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function lastFourDigitsOrNull(value) {
  const text = nullableText(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  return digits.length === 4 ? digits : null;
}

function normalizedPersonOrBusiness(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s.,()\[\]{}\-]/g, "");
}

// Exported for offline tests and incident diagnosis; no network/API call.
// Do NOT assume these checks constitute bank-side confirmation of payment.
export function sanitizeImageClassification(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Image classifier returned an invalid object");
  }

  const allowedTypes = new Set([
    "PAYMENT_SLIP",
    "REVIEW_SCREENSHOT",
    "MAP_SCREENSHOT",
    "OTHER_IMAGE",
    "UNKNOWN",
  ]);
  const type = allowedTypes.has(parsed.type) ? parsed.type : "UNKNOWN";
  const confidenceValue = Number(parsed.confidence);
  let confidence = Number.isFinite(confidenceValue)
    ? Math.max(0, Math.min(1, confidenceValue))
    : 0;

  const result = {
    ...parsed,
    type,
    confidence,
    reason: nullableText(parsed.reason) || "",
    amount: parsed.amount ?? null,
    bankName: nullableText(parsed.bankName),
    transactionDate: nullableText(parsed.transactionDate),
    transactionTime: nullableText(parsed.transactionTime),
    reference: nullableText(parsed.reference),
    senderName: nullableText(parsed.senderName),
    senderAccountLast4: lastFourDigitsOrNull(parsed.senderAccountLast4),
    recipientName: nullableText(parsed.recipientName),
    recipientBankOrBiller: nullableText(parsed.recipientBankOrBiller),
    recipientBillerId: nullableText(parsed.recipientBillerId),
    recipientCardMasked: null,
    recipientCardLast4: lastFourDigitsOrNull(parsed.recipientCardLast4),
    businessName: nullableText(parsed.businessName),
    reviewerName: nullableText(parsed.reviewerName),
    rating: parsed.rating ?? null,
    reviewText: nullableText(parsed.reviewText),
    reviewDateText: nullableText(parsed.reviewDateText),
    reviewLanguage: nullableText(parsed.reviewLanguage),
  };

  if (type !== "PAYMENT_SLIP") return result;

  // Never retain unmasked destination card digits in our application output.
  const rawCard = nullableText(parsed.recipientCardMasked);
  const rawCardDigits = rawCard ? rawCard.replace(/\D/g, "") : "";
  const maskedCardLast4 = rawCardDigits.length >= 4
    ? rawCardDigits.slice(-4)
    : null;
  if (maskedCardLast4) {
    result.recipientCardMasked = `****${maskedCardLast4}`;
  }

  const issues = [];

  // Model inconsistencies must not be silently "fixed" to a guessed value.
  if (maskedCardLast4 && result.recipientCardLast4 &&
      maskedCardLast4 !== result.recipientCardLast4) {
    issues.push("DESTINATION_CARD_DIGITS_CONFLICT");
    result.recipientCardMasked = null;
    result.recipientCardLast4 = null;
  }

  if (result.senderAccountLast4 && result.recipientCardLast4 &&
      result.senderAccountLast4 === result.recipientCardLast4) {
    issues.push("SENDER_ACCOUNT_MAY_HAVE_BEEN_USED_AS_RECIPIENT_CARD");
    result.recipientCardMasked = null;
    result.recipientCardLast4 = null;
  }

  if (result.senderName && result.recipientName &&
      normalizedPersonOrBusiness(result.senderName) ===
        normalizedPersonOrBusiness(result.recipientName)) {
    // Could also be an own-account transfer; either way require review.
    issues.push("SENDER_AND_RECIPIENT_NAMES_IDENTICAL");
  }

  // A full card number accidentally placed into billerId is NOT biller ID.
  const billerDigits = String(result.recipientBillerId || "").replace(/\D/g, "");
  if (billerDigits && (
    (rawCardDigits.length >= 8 && billerDigits === rawCardDigits) ||
    (result.senderAccountLast4 && billerDigits === result.senderAccountLast4) ||
    (result.recipientCardLast4 && billerDigits === result.recipientCardLast4)
  )) {
    issues.push("BILLER_ID_COPIED_FROM_ANOTHER_FIELD");
    result.recipientBillerId = null;
  }

  // Missing destination identity is not proof of recipient validity.
  if (!result.recipientName && !result.recipientBankOrBiller) {
    issues.push("RECIPIENT_IDENTITY_NOT_EXTRACTED");
  }

  if (issues.length > 0) {
    confidence = Math.min(confidence, 0.7);
    result.confidence = confidence;
    result.reason = [result.reason, `Requires manual review: ${issues.join(", ")}`]
      .filter(Boolean).join("; ");
  }

  return result;
}

export async function classifyCustomerImage({
  buffer,
  contentType = "image/jpeg",
}) {
  if (!buffer) {
    throw new Error("Missing image buffer");
  }

  const base64 = buffer.toString("base64");
  const dataUrl = `data:${contentType};base64,${base64}`;

  const response = await openai.responses.create({
    // Preserve the model configured by the existing working deployment.
    model: "gpt-6-luna",
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: IMAGE_CLASSIFIER_PROMPT },
        { type: "input_image", image_url: dataUrl },
      ],
    }],
  });

  const raw = response.output_text?.trim();
  if (!raw) {
    throw new Error("Image classifier returned empty response");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Image classifier returned invalid JSON: ${raw}`);
  }

  return sanitizeImageClassification(parsed);
}
