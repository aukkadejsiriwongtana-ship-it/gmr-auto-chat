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

REVIEW_SCREENSHOT
- A screenshot/photo clearly showing a Google Maps review.

MAP_SCREENSHOT
- A screenshot/photo mainly showing a Google Maps business profile or map.

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
  "recipientAccountMasked": null
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
