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
  jobType,
  customerName,
  businessName,
  reviewerName = null,
  reviewAgeDays = null,
  reviewText = null,
  reviewUrl = null,
  mapUrl = null,
}) {
  let typeLabel = "";
  let extraLines = [];

  // ==========================================
  // 1. REVIEW ใหม่
  // ==========================================
  if (jobType === "recent_review") {
    typeLabel =
      "🟢 รีวิวใหม่";

    extraLines = [
      `Reviewer: ${reviewerName || "-"}`,
      `อายุรีวิว: ${
        reviewAgeDays !== null &&
        reviewAgeDays !== undefined
          ? `${reviewAgeDays} วัน`
          : "-"
      }`,
      "",
      "Review:",
      reviewUrl || "-",
    ];
  }
// ==========================================
// 2. DIRECT REVIEW LINK
// ==========================================
else if (jobType === "direct_review") {
  typeLabel =
    "🔵 ลิงก์รีวิวโดยตรง";

  extraLines = [
    `Reviewer: ${reviewerName || "-"}`,
    "",
    "ข้อความรีวิว:",
    reviewText || "-",
    "",
    "Review:",
    reviewUrl || "-",
  ];
}
    
  // ==========================================
  // 3. REVIEW เก่า
  // ==========================================
  else if (jobType === "old_review") {
    typeLabel =
      "🟠 รีวิวเก่า (>14 วัน)";

    extraLines = [
      "⚠️ ไม่พบรีวิวใหม่ในช่วง 14 วัน",
    ];

    if (reviewUrl) {
      extraLines.push(
        "",
        "Review:",
        reviewUrl
      );
    }
  }

  // ==========================================
  // 3. 1 ดาวไม่มีข้อความ / Hidden
  // ==========================================
  else if (
    jobType === "hidden_one_star"
  ) {
    typeLabel =
      "🔴 1 ดาวไม่มีข้อความ / Hidden";

    extraLines = [
      "⚠️ ไม่พบรีวิว 1 ดาวที่มองเห็นได้",
      "เคสนี้เป็นงาน 1 ดาวไม่มีข้อความ / Hidden",
    ];
  }

  // ==========================================
  // UNKNOWN TYPE
  // ==========================================
  else {
    typeLabel =
      `⚪ ${jobType || "ไม่ระบุประเภท"}`;
  }


  const text = [
    "💰 รอเสนอราคา",
    "",
    `ประเภทงาน: ${typeLabel}`,
    `Customer: ${customerName || "-"}`,
    `Business: ${businessName || "-"}`,
    "",
    ...extraLines,
    "",
    "Map:",
    mapUrl || "-",
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

export async function sendPaymentReviewToLineGroup({
  paymentId,
  jobId,
  slipImageUrl = null,
  customerName,
  businessName,
  amount,
  transactionDate = null,
  transactionTime = null,
  recipientName = null,
  recipientCardLast4 = null,
  reasons = [],
}) {
  const reasonLines =
    Array.isArray(reasons) &&
    reasons.length > 0
      ? reasons.map(
          (reason) =>
            `- ${reason}`
        )
      : [
          "- ไม่ระบุ",
        ];


  const text = [
    "⚠️ ตรวจสอบสลิปด้วยคน",
    "",
    `Customer: ${customerName || "-"}`,
    `Business: ${businessName || "-"}`,
    `ยอด: ${
      Number(amount || 0)
        .toLocaleString("th-TH")
    } บาท`,
    "",
    `วันที่: ${transactionDate || "-"}`,
    `เวลา: ${transactionTime || "-"}`,
    `ผู้รับ: ${recipientName || "-"}`,
    `เลขท้าย: ${recipientCardLast4 || "-"}`,
    "",
    "เหตุผลที่ระบบไม่มั่นใจ:",
    ...reasonLines,
    "",
    `Job ID: ${jobId}`,
    `Payment ID: ${paymentId}`,
    "",
    "👇 ถ้าตรวจแล้วถูกต้อง",
    'กด Reply ข้อความนี้ แล้วพิมพ์ "ok"',
  ].join("\n");


  // ==========================================
  // MESSAGE LIST
  // ถ้ามีรูป → ส่งรูปก่อน แล้วตามด้วยข้อความ
  // ถ้าไม่มีรูป → ส่งเฉพาะข้อความ
  // ==========================================

  const messages = [];


  if (slipImageUrl) {
    messages.push({
      type: "image",

      originalContentUrl:
        slipImageUrl,

      previewImageUrl:
        slipImageUrl,
    });
  }


  messages.push({
    type: "text",
    text,
  });


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
        to:
          LINE_GROUP_ID,

        messages,
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


  // ==========================================
  // IMPORTANT:
  // เราต้องเก็บ messageId ของ "ข้อความ"
  // ไม่ใช่ messageId ของรูป
  //
  // ถ้ามีรูป:
  // sentMessages[0] = รูป
  // sentMessages[1] = ข้อความ
  //
  // ถ้าไม่มีรูป:
  // sentMessages[0] = ข้อความ
  // ==========================================

  const textMessageIndex =
    slipImageUrl
      ? 1
      : 0;


  const messageId =
    data?.sentMessages?.[
      textMessageIndex
    ]?.id ||
    null;


  if (!messageId) {
    throw new Error(
      "LINE push succeeded but no text message ID was returned"
    );
  }


  return {
    ok: true,

    messageId:
      String(messageId),
  };
}
