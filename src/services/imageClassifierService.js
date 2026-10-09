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
      model: "gpt-5.6-luna",

      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
Analyze this customer image.

Classify it into exactly one type:

PAYMENT_SLIP
- Evidence of a completed bank/payment transaction.
- Must look like payment confirmation, transfer receipt, successful transaction, bank slip, or payment receipt.
- Do NOT classify QR payment screen, invoice, bill, or pre-payment screen as PAYMENT_SLIP.

REVIEW_SCREENSHOT
- Screenshot/photo clearly showing a Google review or Google Maps review.

MAP_SCREENSHOT
- Screenshot/photo mainly showing a Google Maps business profile/map, but not a specific review.

OTHER_IMAGE
- Any other normal image.

UNKNOWN
- Cannot determine reliably.

Return ONLY valid JSON:

{
  "type": "PAYMENT_SLIP | REVIEW_SCREENSHOT | MAP_SCREENSHOT | OTHER_IMAGE | UNKNOWN",
  "confidence": 0.0,
  "reason": "short explanation"
}

If PAYMENT_SLIP, also extract when clearly visible:
{
  "amount": null,
  "bankName": null,
  "transactionDate": null,
  "reference": null
}
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
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Image classifier returned invalid JSON: ${raw}`
    );
  }

  return parsed;
}
