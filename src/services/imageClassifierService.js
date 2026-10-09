import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function classifyCustomerImage({
  buffer,
  contentType = "image/jpeg",
}) {
  if (!buffer) {
    throw new Error(
      "Missing image buffer"
    );
  }

  const base64 =
    buffer.toString("base64");

  const dataUrl =
    `data:${contentType};base64,${base64}`;

  const response =
    await openai.responses.create({
      model: "gpt-6-luna",

      input: [
        {
          role: "user",

          content: [
            {
              type: "input_text",

              text: `
Classify this customer image into exactly one category:

PAYMENT_SLIP
- A completed bank transfer or payment confirmation.
- Must show evidence that a transaction was completed.
- A QR code, invoice, bill, payment request, or pre-payment screen is NOT a PAYMENT_SLIP.

When the image is a PAYMENT_SLIP, extract these fields if visible:

- amount: numeric payment amount only
- bankName: sender bank or payment app/bank
- transactionDate: transaction date in YYYY-MM-DD format
- transactionTime: transaction time in HH:mm:ss 24-hour format
- reference: transaction/reference number
- recipientName: recipient or biller name
- recipientBankOrBiller: recipient bank or biller/service name
- recipientBillerId: biller ID if shown
- recipientCardMasked: masked destination card number if shown
- recipientCardLast4: last 4 digits of the destination card number if clearly shown

Do not guess missing values. Return null if not clearly visible.

REVIEW_SCREENSHOT
- A screenshot/photo clearly showing a Google Maps review.
- The review can have any star rating from 1 to 5.
- When the image is a REVIEW_SCREENSHOT, extract these fields if clearly visible:

- businessName: Google Maps business/profile name
- reviewerName: name of the person who wrote the review
- rating: numeric star rating from 1 to 5
- reviewText: review content exactly as visible, without rewriting
- reviewDateText: visible review date or relative date such as "2 weeks ago"
- reviewLanguage: primary language of the review text if identifiable

Do not guess missing values.
Return null if a value is not clearly visible.

MAP_SCREENSHOT
- A screenshot/photo mainly showing a Google Maps business profile or map.
- When the image is a MAP_SCREENSHOT, extract businessName if clearly visible.

OTHER_IMAGE
- Any other image.

UNKNOWN
- Cannot determine reliably.

Return ONLY JSON in this exact structure:

{
  "type": "PAYMENT_SLIP",
  "confidence": 0.95,
  "reason": "short explanation",

  "amount": null,
  "bankName": null,
  "transactionDate": null,
  "transactionTime": null,
  "reference": null,
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

Allowed type values:
PAYMENT_SLIP
REVIEW_SCREENSHOT
MAP_SCREENSHOT
OTHER_IMAGE
UNKNOWN
              `.trim(),
            },

            {
              type: "input_image",
              image_url: dataUrl,
            },
          ],
        },
      ],
    });

  const raw =
    response.output_text?.trim();

  if (!raw) {
    throw new Error(
      "Image classifier returned empty response"
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(raw);
  } catch {
    throw new Error(
      `Image classifier returned invalid JSON: ${raw}`
    );
  }

  return parsed;
}
