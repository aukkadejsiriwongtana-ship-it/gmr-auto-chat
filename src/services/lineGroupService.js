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
  businessName,
  reviewerName,
  reviewUrl,
}) {
  const text = [
    "💰 รอเสนอราคา",
    "",
    `Customer: ${customerName || "-"}`,
    `Business: ${businessName || "-"}`,
    `Reviewer: ${reviewerName || "-"}`,
    "",
    "Review:",
    reviewUrl || "-",
    "",
    "👇 วิธีแจ้งราคา",
    "กด Reply ข้อความนี้ แล้วพิมพ์เฉพาะราคา",
    "เช่น 5900",
  ].join("\n");

  const response = await fetch(
    "https://api.line.me/v2/bot/message/push",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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

  const responseText =
    await response.text();

  let data = {};

  if (responseText) {
    try {
      data =
        JSON.parse(responseText);
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    throw new Error(
      `LINE push failed: ${response.status} ${responseText}`
    );
  }

  const messageId =
    data?.sentMessages?.[0]?.id || null;

  if (!messageId) {
    throw new Error(
      "LINE push succeeded but no sent message ID was returned"
    );
  }

  return {
    ok: true,
    messageId:
      String(messageId),
  };
}
