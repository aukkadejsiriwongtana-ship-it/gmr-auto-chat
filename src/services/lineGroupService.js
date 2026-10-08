const LINE_CHANNEL_ACCESS_TOKEN =
  process.env.LINE_CHANNEL_ACCESS_TOKEN;

const LINE_GROUP_ID =
  process.env.LINE_GROUP_ID;

if (!LINE_CHANNEL_ACCESS_TOKEN) {
  throw new Error(
    "Missing LINE_CHANNEL_ACCESS_TOKEN"
  );
}

if (!LINE_GROUP_ID) {
  throw new Error(
    "Missing LINE_GROUP_ID"
  );
}

export async function sendJobToLineGroup({
  jobId,
  customerName,
  platform,
  phone,
  businessName,
  reviewUrl,
  price,
}) {
  const text = [
    "📥 NEW REVIEW JOB",
    "",
    `Job ID: ${jobId}`,
    `Customer: ${customerName || "-"}`,
    `Platform: ${platform || "-"}`,
    `Phone: ${phone || "-"}`,
    `Business: ${businessName || "-"}`,
    `Price: ${price || "-"} THB`,
    "",
    `Review:`,
    reviewUrl || "-",
  ].join("\n");

  const response = await fetch(
    "https://api.line.me/v2/bot/message/push",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        Authorization:
          `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: LINE_GROUP_ID,
        messages: [
          {
            type: "text",
            text,
          },
        ],
      }),
    }
  );

  const data =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `LINE push failed: ${response.status} ${data}`
    );
  }

  return true;
}
