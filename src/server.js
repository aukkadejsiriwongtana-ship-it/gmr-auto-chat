import crypto from "crypto";

import {
  uploadPaymentSlip,
  deletePaymentSlip,
} from "./services/paymentSlipStorageService.js";

import {
  classifyCustomerImage,
} from "./services/imageClassifierService.js";

import {
  verifyPaymentSlip,
} from "./services/paymentVerificationService.js";

import "dotenv/config";
import express from "express";

import {
  sendMessageToCustomer,
  replyLineTextMessage,
  downloadLineMessageContent,
  getLineUserProfile,
} from "./services/customerMessagingService.js";


import {
  appendJobToGoogleSheet,
  updateJobInGoogleSheet,
} from "./services/googleSheetsService.js";

import {
  sendJobToLineGroup,
  sendPaymentReviewToLineGroup,
} from "./services/lineGroupService.js";

import {
  getCustomerByPlatformUserId,
  getCustomerById,
  getConversationByCustomerId,
  getOrCreateCustomer,
  getOrCreateConversation,
  getTemplate,
  saveMessage,
  updateConversationState,
  updateLastUserMessage,
  updateLastBotMessage,
  createJob,
  getLatestJobByCustomerId,
  hasPaymentByCustomerId,
isPaymentReferenceUsed,
createPayment,
getLatestJobWithMapByCustomerId,
  getJobByLineGroupMessageId,
getPendingCreditApprovalJobs,
updateJob,
  saveReviewCandidate,
  getReviewCandidatesByJobId,
  getReviewsByJobId,
  selectReviewCandidate,
  createQuote,
  updateQuote,
  updateCustomerPhone,
  updateCustomerLanguage,
  createPendingPayment,
getPaymentByLineGroupMessageId,
  getJobById,
updatePayment,
} from "./repositories/gmrRepository.js";

import {
  GMR_STATES,
  transitionState,
} from "./flows/gmrStateMachine.js";

import {
  classifyInput,
  INPUT_TYPES,
} from "./services/inputClassifier.js";

import {
  searchPlaceByText,
} from "./services/googleMapsService.js";
function detectCustomerLanguage(
  message,
  currentLanguage = "th"
) {
  const text =
    String(message || "")
      .replace(
        /https?:\/\/\S+/gi,
        " "
      )
      .trim();

  if (!text) {
    return (
      currentLanguage ||
      "th"
    );
  }

  const thaiMatches =
    text.match(
      /[\u0E00-\u0E7F]/g
    ) || [];

  if (
    thaiMatches.length > 0
  ) {
    return "th";
  }

  const englishWords =
    text.match(
      /[A-Za-z]+/g
    ) || [];

  const commonEnglish =
    /\b(hi|hello|hey|price|review|remove|removal|google|map|maps|how|much|can|you|please|interested|want|need|delete|help|thanks|thank)\b/i;

  if (
    commonEnglish.test(text) ||
    englishWords.length >= 4
  ) {
    return "en";
  }

  return (
    currentLanguage ||
    "th"
  );
}

function isThailandPlace(place) {
  const countryCode =
    String(
      place?.countryCode || ""
    )
      .trim()
      .toUpperCase();

  if (countryCode) {
    return countryCode === "TH";
  }


  const address =
    String(
      place?.formattedAddress ||
      ""
    ).toLowerCase();


  if (!address) {
    return null;
  }


  if (
    address.includes("thailand") ||
    address.includes("ประเทศไทย")
  ) {
    return true;
  }


  // fallback:
  // ถ้าที่อยู่มีอักษรไทย
  // ให้ถือว่าเป็นประเทศไทย
  if (
    /[\u0E00-\u0E7F]/.test(
      address
    )
  ) {
    return true;
  }


  return false;
}

function getCustomerText(
  customer,
  thaiText,
  englishText
) {
  return (
    customer?.language === "en"
      ? englishText
      : thaiText
  );
}

function extractGoogleMapsUrl(
  message
) {
  const text =
    String(message || "");

  const match =
    text.match(
      /https?:\/\/(?:www\.)?(?:maps\.google\.com|google\.[^\s/]+\/maps|maps\.app\.goo\.gl)\/?[^\s]*/i
    );

  return match
    ? match[0]
    : null;
}

function isServiceInquiryMessage(
  message
) {
  const text =
    String(message || "")
      .trim()
      .toLowerCase();


  const patterns = [
    "สนใจ",
    "สนใจครับ",
    "สนใจค่ะ",
    "สอบถาม",
    "สอบถามครับ",
    "สอบถามค่ะ",
    "สนใจบริการ",
    "ต้องการใช้บริการ",
    "อยากลบรีวิว",
    "ต้องการลบรีวิว",
    "ลบรีวิว",
    "google map review",
    "google maps review",
    "remove review",
    "remove a review",
    "remove google review",
    "remove a google review",
    "delete review",
    "delete a review",
    "review removal",
    "i want to remove",
    "i need to remove",
    "interested in",
  ];


  return patterns.some(
    (pattern) =>
      text === pattern ||
      text.startsWith(
        `${pattern} `
      ) ||
      text.startsWith(
        `${pattern}ครับ`
      ) ||
      text.startsWith(
        `${pattern}ค่ะ`
      )
  );
}


import {
  getPlaceReviews,
} from "./services/googleReviewService.js";

import {
  getNewestReviews,
  getLowestReviews,
  getRecentReviews,
  getOneStarReviews,
  getReviewFromDirectUrl,
  getReviewAgeDays,
} from "./services/reviewProvider.js";

import {
  createReviewEvidenceImage,
  uploadReviewEvidence,
  createReviewEvidenceSignedUrl,
} from "./services/reviewEvidenceService.js";

import {
  createReviewScreenshot,
} from "./services/reviewScreenshotService.js";

const app = express();
const PORT = process.env.PORT || 10000;

function getPlatformLabel(
  customer
) {
  const platform =
    String(
      customer?.platform || ""
    )
      .trim()
      .toLowerCase();

  if (platform === "line") {
    return "LINE";
  }

  if (
    platform === "facebook_th" ||
    platform === "fb_th"
  ) {
    return "Facebook เพจไทย";
  }

  if (
    platform === "facebook_en" ||
    platform === "fb_en"
  ) {
    return "Facebook เพจต่างประเทศ";
  }

  if (platform === "facebook") {
    return "Facebook";
  }

  return (
    customer?.platform ||
    "ไม่ทราบช่องทาง"
  );
}



async function getCustomerStage({
  customer,
  conversation,
}) {
  const latestJob =
    await getLatestJobByCustomerId(
      customer.id
    );

  const jobStatus =
    String(
      latestJob?.status || ""
    )
      .trim()
      .toLowerCase();


  // ========================================
  // มีงานกำลังดำเนินการอยู่
  // ========================================

  const activeJobStatuses = [
    "processing",
    "removed",
    "waiting_payment",
    "removed_waiting_payment",
  ];

  if (
    conversation?.state ===
      GMR_STATES.IN_PROGRESS ||
    conversation?.state ===
      GMR_STATES.REMOVED_WAITING_PAYMENT ||
    activeJobStatuses.includes(
      jobStatus
    )
  ) {
    return "ระหว่างดำเนินงาน";
  }


  // ========================================
  // งานยังไม่เริ่ม
  // ========================================

  const preStartStatuses = [
    "draft",
    "waiting_price",
    "waiting_confirm",
    "waiting_phone",
    "waiting_credit_approval",
    "credit_rejected",
  ];

  if (
    preStartStatuses.includes(
      jobStatus
    )
  ) {
    return "ก่อนเริ่มงาน";
  }


  // ========================================
  // เคยชำระแล้ว + ไม่มีงานใหม่กำลังทำ
  // ========================================

  const hasPaymentHistory =
    await hasPaymentByCustomerId(
      customer.id
    );

  if (hasPaymentHistory) {
    return "ลูกค้าเก่า / ยังไม่มีงานใหม่";
  }


  return "ก่อนเริ่มงาน";
}

async function triggerHumanAttention({
  customer,
  conversation,
  message,
  reason,
}) {
  const token =
    process.env.LINE_CHANNEL_ACCESS_TOKEN;

  const groupId =
    process.env.LINE_GROUP_ID;

  if (!token || !groupId) {
    console.error(
      "HUMAN ATTENTION FAILED: Missing LINE config"
    );

    return {
      sent: false,
    };
  }

  const customerName =
    customer?.display_name ||
    "ไม่ทราบชื่อ";

const state =
  conversation?.state ||
  "UNKNOWN";

const platformLabel =
  getPlatformLabel(
    customer
  );

const stageLabel =
  await getCustomerStage({
    customer,
    conversation,
  });


const text = [
  "⚠️ ต้องตรวจแชทลูกค้า",
  "",
  `ลูกค้า: ${customerName}`,
  `Platform: ${platformLabel}`,
  `Stage: ${stageLabel}`,
  `State: ${state}`,
    "",
    "ข้อความล่าสุด:",
    `"${String(message || "").trim()}"`,
    "",
    `เหตุผล: ${reason}`,
    "",
    "Bot ยังไม่ตอบลูกค้า",
    "State เดิมยังคงอยู่",
    "เมื่อลูกค้าตอบใหม่ ระบบจะลองเข้า Flow ต่อให้อัตโนมัติครับ",
  ].join("\n");

  try {
    const response =
      await fetch(
        "https://api.line.me/v2/bot/message/push",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${token}`,

            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            to: groupId,

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


if (!response.ok) {
  throw new Error(
    `LINE push failed ${response.status}: ${responseText}`
  );
}


let responseData = {};

if (responseText) {
  try {
    responseData =
      JSON.parse(responseText);
  } catch {
    responseData = {};
  }
}


const messageId =
  responseData
    ?.sentMessages
    ?.[0]
    ?.id ||
  null;


// ========================================
// ถ้าลูกค้ากำลังรอราคา
// ให้ข้อความ Human Attention นี้
// สามารถ Reply ราคาได้ทันที
// ========================================

if (
  messageId &&
  conversation?.state ===
    GMR_STATES.WAITING_PRICE
) {
  const latestJob =
    await getLatestJobByCustomerId(
      customer.id
    );

  if (latestJob) {
    await updateJob(
      latestJob.id,
      {
        line_group_message_id:
          messageId,
      }
    );

    console.log(
      "WAITING PRICE ATTENTION LINKED TO JOB:",
      {
        jobId:
          latestJob.id,

        messageId,
      }
    );
  }
}


return {
  sent: true,
  messageId,
};
  } catch (error) {
    console.error(
      "HUMAN ATTENTION LINE ERROR:",
      error
    );

    return {
      sent: false,
      error:
        error.message,
    };
  }
}

async function sendCreditApprovalRequestToLineGroup({
  customer,
  job,
  phone,
}) {
  const token =
    process.env.LINE_CHANNEL_ACCESS_TOKEN;

  const groupId =
    process.env.LINE_GROUP_ID;

  if (!token || !groupId) {
    throw new Error(
      "Missing LINE config for credit approval"
    );
  }


  const formattedPrice =
    Number(
      job.price || 0
    ).toLocaleString("th-TH");


  const text = [
    "⚠️ ขออนุมัติเครดิตลูกค้าใหม่",
    "",
    `ลูกค้า: ${
      customer.display_name ||
      "ไม่ทราบชื่อ"
    }`,
    `Platform: ${
      String(
        customer.platform ||
        "line"
      ).toUpperCase()
    }`,
    `เบอร์: ${
      phone || "-"
    }`,
    "",
    `ธุรกิจ: ${
      job.business_name ||
      "-"
    }`,
    `มูลค่างาน: ${formattedPrice} บาท`,
    "",
    "ลูกค้ารายนี้ยังไม่มีประวัติชำระเงินในระบบ",
    "กรุณาเข้าไปตรวจสอบ Account / Profile และประเมินความเสี่ยงก่อนเริ่มงาน",
    "",
    "Reply ข้อความนี้:",
    "✅ อนุมัติ",
    "❌ ไม่อนุมัติ",
  ].join("\n");


  const response =
    await fetch(
      "https://api.line.me/v2/bot/message/push",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            to: groupId,

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


  if (!response.ok) {
    throw new Error(
      `CREDIT APPROVAL LINE PUSH FAILED ${response.status}: ${responseText}`
    );
  }


  let responseData = {};

  if (responseText) {
    try {
      responseData =
        JSON.parse(
          responseText
        );
    } catch {
      responseData = {};
    }
  }


  const messageId =
    responseData
      ?.sentMessages
      ?.[0]
      ?.id ||
    null;


  if (!messageId) {
    throw new Error(
      "Credit approval LINE messageId missing"
    );
  }


  return {
    messageId,
    text,
  };
}


async function startApprovedJob({
  customer,
  conversation,
  job,
  platform,
  phone,
}) {
  const template =
    await getTemplate(
      "script_5_started",
      customer.language || "th"
    );


  if (!template) {
    throw new Error(
      "script_5_started template not found"
    );
  }


  const formattedPrice =
    Number(
      job.price || 0
    ).toLocaleString(
      customer.language === "en"
        ? "en-US"
        : "th-TH"
    );


  const botReply =
    template.content.replace(
      "{{price}}",
      formattedPrice
    );


  const startedAt =
    new Date().toISOString();


  await updateConversationState({
    customerId:
      customer.id,

    state:
      GMR_STATES.IN_PROGRESS,

    handoff:
      false,

    handoffReason:
      null,
  });


  const updatedJob =
    await updateJob(
      job.id,
      {
        status:
          "processing",

        started_at:
          startedAt,
      }
    );


  try {
    await appendJobToGoogleSheet({
      jobId:
        updatedJob.id,

      customerId:
        customer.id,

      customerName:
        customer.display_name ||
        "",

      platform,

      phone:
        phone || "",

      businessName:
        updatedJob.business_name ||
        "",

      reviewUrl:
        updatedJob.review_url ||
        "",

      price:
        updatedJob.price ||
        "",

      status:
        updatedJob.status ||
        "processing",

      startedAt,

      removedAt:
        "",

      paidAt:
        "",
    });

  } catch (error) {
    console.error(
      "GOOGLE SHEET NOTIFY FAILED:",
      error
    );
  }


  await saveMessage({
    customerId:
      customer.id,

    platform,

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  return {
    updatedJob,
    botReply,
    startedAt,
  };
}

function getGlobalFaqReply(
  message,
  language = "th"
) {
  const text =
    String(message || "")
      .trim()
      .toLowerCase();

  if (!text) {
    return null;
  }

  const isEnglish =
    language === "en";


  // ========================================
  // ระยะเวลาดำเนินการ
  // ========================================

  if (
    text.includes("กี่วัน") ||
    text.includes("ใช้เวลากี่วัน") ||
    text.includes("นานไหม") ||
    text.includes("นานมั้ย") ||
    text.includes("ระยะเวลา") ||
    text.includes("กี่ชั่วโมง") ||
    text.includes("how long") ||
    text.includes("how many days") ||
    text.includes("processing time")
  ) {
    return isEnglish
      ? "The process usually takes around 1–14 days, depending on Google's review process."
      : "ระยะเวลาดำเนินการประมาณ 1–14 วันครับ ขึ้นอยู่กับการตรวจสอบของระบบ Google";
  }


  // ========================================
  // ชำระหลังลบได้ไหม
  // ========================================

  if (
    text.includes("จ่ายหลัง") ||
    text.includes("ชำระหลัง") ||
    text.includes("ลบก่อนจ่าย") ||
    text.includes("จ่ายทีหลัง") ||
    text.includes("pay after") ||
    text.includes("pay later") ||
    text.includes("payment after")
  ) {
    return isEnglish
      ? "Yes. Payment can be made after the review has been successfully removed and you have verified it on Google Maps."
      : "ได้ครับ สามารถชำระหลังดำเนินการสำเร็จ และตรวจสอบหน้า Google Map แล้วได้ครับ";
  }


  // ========================================
  // มีผลต่อ Google Map ไหม
  // ========================================

  if (
    text.includes("มีผลกับแมพ") ||
    text.includes("มีผลต่อแมพ") ||
    text.includes("กระทบแมพ") ||
    text.includes("กระทบ map") ||
    text.includes("โดนแบน") ||
    text.includes("มีปัญหากับ google") ||
    text.includes("affect the map") ||
    text.includes("affect my map") ||
    text.includes("risk to my business") ||
    text.includes("get banned")
  ) {
    return isEnglish
      ? "It does not negatively affect your Google Maps listing. We submit the review for Google's assessment through the proper review process."
      : "ไม่มีผลต่อ Google Map ครับ ทางเราดำเนินการโดยยื่นเรื่องให้ Google ตรวจสอบตามขั้นตอน";
  }


  // ========================================
  // ราคาต่อกี่รีวิว
  // ========================================

  if (
    text.includes("ราคาต่อกี่รีวิว") ||
    text.includes("ต่อกี่รีวิว") ||
    text.includes("ราคานี้กี่รีวิว") ||
    text.includes("กี่รีวิวต่อราคา") ||
    text.includes("per review") ||
    text.includes("for one review")
  ) {
    return isEnglish
      ? "The quoted price is per review."
      : "ราคาที่แจ้งเป็นราคาต่อ 1 รีวิวครับ";
  }


  // ========================================
  // รีวิวจะกลับมาไหม
  // ========================================

  if (
    text.includes("กลับมาไหม") ||
    text.includes("กลับมาอีกไหม") ||
    text.includes("รีวิวกลับมา") ||
    text.includes("ซ่อนรีวิว") ||
    text.includes("แค่ซ่อน") ||
    text.includes("come back") ||
    text.includes("return later") ||
    text.includes("temporary") ||
    text.includes("hidden")
  ) {
    return isEnglish
      ? "The review is submitted to Google for assessment and removal. It is not simply temporarily hidden."
      : "เป็นการยื่นให้ระบบ Google ตรวจสอบและนำรีวิวออกครับ ไม่ใช่การซ่อนรีวิวชั่วคราว";
  }


  // ========================================
  // ขอราคา
  // ========================================

  if (
    text === "ราคา" ||
    text.includes("ราคาเท่าไหร่") ||
    text.includes("ราคาเท่าไร") ||
    text.includes("ค่าบริการเท่าไหร่") ||
    text.includes("ค่าบริการเท่าไร") ||
    text.includes("how much") ||
    text.includes("price") ||
    text.includes("cost")
  ) {
    return isEnglish
      ? "The price depends on the age and details of the review. Please send the Google Maps business name, map link, or review link so I can check it first."
      : "ราคาจะขึ้นอยู่กับอายุและลักษณะของรีวิวครับ รบกวนส่งชื่อ Google Map หรือลิงก์รีวิวมาให้ตรวจสอบก่อนครับ";
  }


  // ========================================
  // ขอส่วนลด
  // ========================================

  if (
    text.includes("ลดได้ไหม") ||
    text.includes("ลดได้มั้ย") ||
    text.includes("ลดหน่อย") ||
    text.includes("มีส่วนลดไหม") ||
    text.includes("มีส่วนลดมั้ย") ||
    text.includes("ขอส่วนลด") ||
    text.includes("แพงไป") ||
    text.includes("ลดราคา") ||
    text.includes("discount") ||
    text.includes("cheaper") ||
    text.includes("lower price")
  ) {
    return isEnglish
      ? (
          "The quoted price is for removal from the system, not temporary hiding.\n\n" +
          "Payment can be made after the process is completed.\n\n" +
          'If you would like to proceed, reply "Confirm" to start. ✅'
        )
      : (
          "ราคาที่แจ้งเป็นการนำออกจากระบบ ไม่ใช่การซ่อนนะครับ\n\n" +
          "ชำระหลังดำเนินการเสร็จได้\n\n" +
          "หากโอเค พิมพ์ “ยืนยัน” เริ่มงานได้เลย ✅"
        );
  }


  return null;
}

async function sendGlobalFaqIfMatched({
  customer,
  conversation,
  platform,
  message,
}) {
  const faqReply =
  getGlobalFaqReply(
    message,
    customer?.language || "th"
  );

  if (!faqReply) {
    return {
      matched: false,
      botReply: null,
    };
  }

  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "outbound",
    messageType: "text",
    messageText: faqReply,
  });

  await updateLastBotMessage(
    customer.id,
    faqReply
  );

  return {
    matched: true,
    botReply: faqReply,
  };
}

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
// =========================================================
// HEALTH CHECK
// =========================================================

app.get("/", async (req, res) => {
  res.status(200).json({
    ok: true,
    service: "gmr-auto-chat",
  });
});


// =========================================================
// SUPABASE TEST
// =========================================================

app.get("/test-supabase", async (req, res) => {
  try {
    const customer = await getOrCreateCustomer({
      platform: "line",
      platformUserId: "TEST_USER_001",
      displayName: "Test User",
      language: "th",
    });

    const conversation =
      await getOrCreateConversation(customer.id);

    const template = await getTemplate(
      "welcome",
      "th"
    );

    res.status(200).json({
      ok: true,
      customer,
      conversation,
      template,
    });

  } catch (error) {
    console.error("SUPABASE TEST ERROR:", error);

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});


// =========================================================
// CORE TEST MESSAGE HANDLER
// =========================================================

async function processTestMessage({
  platform,
  platformUserId,
  message,
  messageType = "text",
  displayName = "Test User",
}) {

  if (!platform) {
    throw new Error("Missing platform");
  }

  if (!platformUserId) {
    throw new Error("Missing platformUserId");
  }

  if (!message && messageType === "text") {
    throw new Error("Missing message");
  }



  
  // -------------------------------------------------------
  // 1. CUSTOMER
  // -------------------------------------------------------
const existingCustomer =
  await getCustomerByPlatformUserId(
    platform,
    platformUserId
  );


const detectedLanguage =
  detectCustomerLanguage(
    message,
    existingCustomer?.language ||
      "th"
  );


let customer =
  await getOrCreateCustomer({
    platform,
    platformUserId,
    displayName,
    language:
      detectedLanguage,
  });


if (
  customer.language !==
  detectedLanguage
) {

  customer =
    await updateCustomerLanguage(
      customer.id,
      detectedLanguage
    );

}


console.log(
  "CUSTOMER LANGUAGE:",
  {
    customerId:
      customer.id,

    detectedLanguage,

    savedLanguage:
      customer.language,
  }
);


  // -------------------------------------------------------
  // 2. CONVERSATION
  // -------------------------------------------------------
const conversation =
  await getOrCreateConversation(customer.id);


let autoConfirmDirectMap =
  false;


// -------------------------------------------------------
// 3. SAVE INBOUND MESSAGE
// -------------------------------------------------------

  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "inbound",
    messageType,
    messageText: message || null,
  });


  if (message) {
    await updateLastUserMessage(
      customer.id,
      message
    );
  }

// -------------------------------------------------------
// EXISTING CUSTOMER HISTORY CHECK
// -------------------------------------------------------

const normalizedMessage =
  String(message || "")
    .trim()
    .toLowerCase();

const restartWords = [
  "สนใจบริการ",
  "สนใจ",
  "สอบถามบริการ",
  "ต้องการใช้บริการ",
  "เริ่มใหม่",
  "start",
  "start over",
];

const isExplicitRestart =
  restartWords.some(
    (word) =>
      normalizedMessage === word ||
      normalizedMessage.startsWith(
        `${word} `
      ) ||
      normalizedMessage.startsWith(
        `${word}ครับ`
      ) ||
      normalizedMessage.startsWith(
        `${word}ค่ะ`
      )
  );


if (
  existingCustomer &&
  conversation.state === GMR_STATES.NEW &&
  !isExplicitRestart
) {
  const hasPayment =
    await hasPaymentByCustomerId(
      customer.id
    );

  // เคยมี payment แล้ว
  // → ถือเป็นลูกค้าเก่า
  // → ตอนนี้ AI ยังไม่ตอบ
  if (hasPayment) {
    console.log(
      "OLD CUSTOMER - PAYMENT HISTORY:",
      {
        customerId: customer.id,
        platformUserId,
      }
    );

    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      oldCustomer: true,
      hasPayment: true,
      botReply: null,
      note:
        "Existing customer with payment history. Old-customer flow not implemented yet.",
    };
  }

  // ยังไม่เคยจ่าย
  // → เช็กว่าเคยมี Map เดิมหรือไม่
  const previousMapJob =
    await getLatestJobWithMapByCustomerId(
      customer.id
    );

  if (previousMapJob) {
    console.log(
      "EXISTING CUSTOMER - MAP HISTORY:",
      {
        customerId: customer.id,
        jobId: previousMapJob.id,
        mapUrl: previousMapJob.map_url,
      }
    );

    await updateConversationState({
      customerId: customer.id,
      state:
        GMR_STATES.MAP_FOUND_WAITING_CONFIRMATION,
      handoff: false,
      handoffReason: null,
    });

    const template =
      await getTemplate(
        "confirm_map",
        customer.language || "th"
      );

    if (!template) {
      throw new Error(
        "confirm_map template not found"
      );
    }

    const botReply =
      template.content.replace(
        "{{map_url}}",
        previousMapJob.map_url
      );

    await saveMessage({
      customerId: customer.id,
      platform,
      direction: "outbound",
      messageType: "text",
      messageText: botReply,
    });

    await updateLastBotMessage(
      customer.id,
      botReply
    );

    return {
      ok: true,
      customerId: customer.id,
      jobId: previousMapJob.id,
      stateBefore: conversation.state,
      stateAfter:
        GMR_STATES.MAP_FOUND_WAITING_CONFIRMATION,
      resumedFromHistory: true,
      botReply,
    };
  }

    // -------------------------------------------------------
  // EXISTING CUSTOMER WITHOUT IMPORTED HISTORY
  // -------------------------------------------------------
  // ลูกค้ามี record อยู่ก่อนแล้ว แต่ไม่มี payment/map
  // อาจเป็นลูกค้าเก่าก่อนเริ่มระบบใหม่
  // เพื่อกัน bot ส่ง Welcome ทับแชทเก่า → ให้เงียบไว้ก่อน

  console.log(
    "EXISTING CUSTOMER - NO IMPORTED HISTORY:",
    {
      customerId: customer.id,
      platformUserId,
    }
  );

  return {
    ok: true,
    customerId: customer.id,
    stateBefore: conversation.state,
    stateAfter: conversation.state,
    oldCustomer: true,
    hasPayment: false,
    resumedFromHistory: false,
    botReply: null,
    note:
      "Existing customer without imported history. Bot suppressed to avoid restarting old conversation.",
  };
  
}

  
  // -------------------------------------------------------
  // 4. HANDOFF CHECK
  // -------------------------------------------------------

  if (
    conversation.handoff === true ||
    conversation.state === GMR_STATES.HANDOFF
  ) {
    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      handoff: true,
      botReply: null,
      note:
        "Conversation is currently in human handoff mode",
    };
  }


  // -------------------------------------------------------
// 5. NEW CUSTOMER
// -------------------------------------------------------

if (
  conversation.state ===
  GMR_STATES.NEW
) {

 const initialMapUrl =
  extractGoogleMapsUrl(
    message
  );

const initialClassification =
  initialMapUrl
    ? {
        type:
          INPUT_TYPES.MAP_URL,

        confidence:
          1,
      }
    : classifyInput({
        messageType,
        text:
          message || "",
      });

const initialText =
  String(message || "")
    .trim()
    .toLowerCase();


const serviceInquiryPatterns = [
  "สนใจ",
  "สอบถาม",
  "ลบรีวิว",
  "อยากลบรีวิว",
  "ต้องการลบรีวิว",
  "google map review",
  "google maps review",
  "remove review",
  "remove a review",
  "remove google review",
  "remove a google review",
  "delete review",
  "delete a review",
  "review removal",
  "i want to remove",
  "i need to remove",
  "interested in",
];


const isServiceInquiry =
  serviceInquiryPatterns.some(
    (pattern) =>
      initialText.includes(
        pattern
      )
  );


const hasActionableInput =
  [
    INPUT_TYPES.MAP_URL,
    INPUT_TYPES.REVIEW_URL,
    INPUT_TYPES.IMAGE_REVIEW,
  ].includes(
    initialClassification.type
  ) ||
  (
    initialClassification.type ===
      INPUT_TYPES.BUSINESS_NAME &&
    !isServiceInquiry
  );


  // -----------------------------------------------------
  // ลูกค้าส่งข้อมูลที่ใช้ต่อได้ทันที
  // เช่น Map URL / Review URL / ชื่อธุรกิจ / รูปรีวิว
  // → ไม่ต้องถามซ้ำ
  // → เปลี่ยนเป็น WAITING_MAP แล้วให้ flow ด้านล่างทำต่อ
  // -----------------------------------------------------

  if (hasActionableInput) {

    const nextState =
      transitionState(
        conversation.state,
        GMR_STATES.WAITING_MAP
      );


    await updateConversationState({
      customerId:
        customer.id,

      state:
        nextState,

      handoff:
        false,

      handoffReason:
        null,
    });


    // สำคัญ:
    // อัปเดต object ใน memory
    // เพื่อให้ request เดิมไหลเข้า WAITING_MAP ต่อได้ทันที
    conversation.state =
      nextState;

  } else {

    // -----------------------------------------------------
    // ยังไม่ได้ส่งข้อมูลที่ใช้ดำเนินการ
    // → ส่ง Welcome ตามปกติ
    // -----------------------------------------------------

    // ========================================
// SUPPRESS STALE WELCOME
// ถ้าลูกค้าส่งข้อความใหม่เข้ามาแล้ว
// ไม่ต้องส่ง Welcome ของข้อความเก่า
// ========================================

await new Promise(
  (resolve) =>
    setTimeout(
      resolve,
      800
    )
);


const freshConversation =
  await getConversationByCustomerId(
    customer.id
  );


const latestUserMessage =
  String(
    freshConversation?.last_user_message ||
    ""
  ).trim();


const currentRequestMessage =
  String(
    message ||
    ""
  ).trim();


if (
  latestUserMessage &&
  latestUserMessage !==
    currentRequestMessage
) {
  console.log(
    "STALE WELCOME SUPPRESSED:",
    {
      customerId:
        customer.id,

      originalMessage:
        currentRequestMessage,

      latestUserMessage,
    }
  );


  return {
    ok: true,

    customerId:
      customer.id,

    stateBefore:
      conversation.state,

    stateAfter:
      freshConversation?.state ||
      conversation.state,

    botReply:
      null,

    superseded:
      true,
  };
}
    
    const template =
      await getTemplate(
        "welcome",
        customer.language || "th"
      );


    if (!template) {
      throw new Error(
        "Welcome template not found"
      );
    }


    const botReply =
      template.content;


    const nextState =
      transitionState(
        conversation.state,
        GMR_STATES.WAITING_MAP
      );


    await updateConversationState({
      customerId:
        customer.id,

      state:
        nextState,

      handoff:
        false,

      handoffReason:
        null,
    });


    await saveMessage({
      customerId:
        customer.id,

      platform,

      direction:
        "outbound",

      messageType:
        "text",

      messageText:
        botReply,
    });


    await updateLastBotMessage(
      customer.id,
      botReply
    );


    return {
      ok:
        true,

      customerId:
        customer.id,

      stateBefore:
        GMR_STATES.NEW,

      stateAfter:
        nextState,

      inputType:
        initialClassification.type,

      botReply,
    };
  }
}


  // -------------------------------------------------------
  // 6. WAITING_MAP
  // -------------------------------------------------------

  if (
    conversation.state ===
    GMR_STATES.WAITING_MAP
  ) {

const detectedMapUrl =
  extractGoogleMapsUrl(
    message
  );

const classification =
  detectedMapUrl
    ? {
        type:
          INPUT_TYPES.MAP_URL,

        confidence:
          1,
      }
    : classifyInput({
        messageType,
        text:
          message || "",
      });


    // -----------------------------------------------------
    // MAP URL
    // -----------------------------------------------------

   if (
  classification.type ===
  INPUT_TYPES.MAP_URL
) {

  const mapUrl =
  detectedMapUrl ||
  extractGoogleMapsUrl(
    message
  ) ||
  String(message || "")
    .trim();

     
  const places =
    await searchPlaceByText(
      mapUrl
    );


  if (!places.length) {

   const botReply =
  getCustomerText(
    customer,
    "ลิงก์นี้เข้าไม่ได้ครับ รบกวนแจ้งชื่อธุรกิจมาได้เลยครับ",
    "We couldn't enter this Google Maps link. Please send me the business name instead."
  );

    await saveMessage({
      customerId:
        customer.id,

      platform,

      direction:
        "outbound",

      messageType:
        "text",

      messageText:
        botReply,
    });


    await updateLastBotMessage(
      customer.id,
      botReply
    );


    return {
      ok:
        true,

      customerId:
        customer.id,

      stateBefore:
        conversation.state,

      stateAfter:
        conversation.state,

      inputType:
        classification.type,

      confidence:
        classification.confidence,

      placeFound:
        false,

      botReply,
    };
  }


 const place =
  places[0];


const messageHasThai =
  /[\u0E00-\u0E7F]/.test(
    String(message || "")
  );


const thailandPlace =
  isThailandPlace(place);


if (
  !messageHasThai &&
  thailandPlace === false &&
  customer.language !== "en"
) {
  customer =
    await updateCustomerLanguage(
      customer.id,
      "en"
    );

  console.log(
    "FOREIGN MAP -> LANGUAGE EN:",
    {
      customerId:
        customer.id,

      formattedAddress:
        place.formattedAddress,
    }
  );
}


// -----------------------------------------
// ลูกค้าเป็นคนส่ง Map link มาเอง
  // ถือว่าเป็น Map ที่ต้องการตรวจ
  // ไม่ถามยืนยันซ้ำ
  // -----------------------------------------

  await createJob({
    customerId:
      customer.id,

    businessName:
      place.businessName,

    placeId:
      place.placeId,

    mapUrl:
      place.mapUrl,

    status:
      "draft",
  });


  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES
        .MAP_FOUND_WAITING_CONFIRMATION
    );


  await updateConversationState({
    customerId:
      customer.id,

    state:
      nextState,

    handoff:
      false,

    handoffReason:
      null,
  });


  // ทำให้ request ปัจจุบัน
  // ไหลลง confirmation flow ต่อทันที
  conversation.state =
    nextState;


  autoConfirmDirectMap =
    true;


  console.log(
    "DIRECT MAP AUTO CONFIRMED:",
    {
      customerId:
        customer.id,

      placeId:
        place.placeId,

      businessName:
        place.businessName,

      mapUrl:
        place.mapUrl,
    }
  );

  // สำคัญ:
  // ห้าม return ตรงนี้
  // ต้องปล่อยให้ flow ลงไปด้านล่าง
}


  // -----------------------------------------------------
// REVIEW URL
// DIRECT REVIEW FLOW 3.2
// -----------------------------------------------------

if (
  classification.type ===
  INPUT_TYPES.REVIEW_URL
) {
  const reviewUrl =
    String(message || "").trim();

  let directResult;

  try {
    directResult =
      await getReviewFromDirectUrl(
        reviewUrl
      );
  } catch (error) {
    console.error(
      "DIRECT REVIEW LOOKUP FAILED:",
      error
    );

    await triggerHumanAttention({
      customer,
      conversation,
      message,
      reason:
        "DIRECT_REVIEW_LOOKUP_FAILED",
    });

    return {
      ok: true,
      customerId:
        customer.id,
      stateBefore:
        conversation.state,
      stateAfter:
        conversation.state,
      botReply: null,
      softHandoff: true,
    };
  }


  // ========================================
  // หารีวิวไม่เจอ
  // → Bot ไม่เดา
  // → แจ้ง Sales
  // → คง State เดิม
  // ========================================

  if (
    !directResult?.found ||
    !directResult?.review
  ) {
    await triggerHumanAttention({
      customer,
      conversation,
      message,
      reason:
        `DIRECT_REVIEW_NOT_FOUND_${directResult?.reason || "UNKNOWN"}`,
    });

    return {
      ok: true,
      customerId:
        customer.id,
      stateBefore:
        conversation.state,
      stateAfter:
        conversation.state,
      botReply: null,
      softHandoff: true,
    };
  }


  const directReview =
    directResult.review;


// ========================================
// รีวิวที่ลูกค้าส่งมาโดยตรง
// รับดำเนินการได้ทุก Rating
// ========================================

const directRating =
  Number(
    directReview.rating
  ) || null;

  // ========================================
  // รีวิวถูกต้อง → สร้าง Job
  // ========================================

  const businessName =
    directResult.businessName ||
    null;

  const canonicalReviewUrl =
    directReview.reviewUrl ||
    reviewUrl;

  const job =
    await createJob({
      customerId:
        customer.id,

      businessName,

      reviewUrl:
        canonicalReviewUrl,

      reviewCase:
        "direct_review",

      reviewVisible:
        true,

      reviewHasText:
        Boolean(
          directReview.text &&
          directReview.text.trim()
        ),

      status:
        "waiting_price",
    });


  // ========================================
  // เก็บ Review จริงลง gmr_reviews
  // ========================================

  await saveReviewCandidate({
    customerId:
      customer.id,

    jobId:
      job.id,

    businessName,

    reviewerName:
      directReview.reviewerName,

    rating:
directRating,
    
    reviewText:
      directReview.text,

    reviewDate:
      directReview.isoDate,

    reviewUrl:
      canonicalReviewUrl,

    providerReviewId:
      directReview.reviewId,

    isRecent:
      (
        getReviewAgeDays(
          directReview
        ) !== null &&
        getReviewAgeDays(
          directReview
        ) <= 14
      ),

    isVisible:
      true,

    hasText:
      Boolean(
        directReview.text &&
        directReview.text.trim()
      ),
  });


  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES.WAITING_PRICE
    );

  await updateConversationState({
    customerId:
      customer.id,

    state:
      nextState,

    handoff:
      false,

    handoffReason:
      null,
  });


const botReply =
  getCustomerText(
    customer,
    "เช็คแล้วดำเนินการได้ครับ",
    "Checked. We can proceed with this review."
  );

await saveMessage({
  customerId:
    customer.id,

  platform,

  direction:
    "outbound",

  messageType:
    "text",

  messageText:
    botReply,
});

await updateLastBotMessage(
  customer.id,
  botReply
);


  // ========================================
  // ส่งให้ Sales ตั้งราคา
  // ========================================

  try {
    const lineGroupResult =
      await sendJobToLineGroup({
        jobId:
          job.id,

        jobType:
          "direct_review",

        customerName:
          customer.display_name ||
          "",

        businessName:
          businessName ||
          "",

        reviewerName:
          directReview.reviewerName ||
          "",

        reviewAgeDays:
          getReviewAgeDays(
            directReview
          ),

        reviewText:
          directReview.text ||
          "",

        reviewUrl:
          canonicalReviewUrl,

        mapUrl:
          "",
      });


    if (
      lineGroupResult?.messageId
    ) {
      await updateJob(
        job.id,
        {
          line_group_message_id:
            lineGroupResult.messageId,
        }
      );
    }

  } catch (error) {
    console.error(
      "DIRECT REVIEW PRICE REQUEST FAILED:",
      error
    );
  }


  return {
    ok: true,

    customerId:
      customer.id,

    jobId:
      job.id,

    stateBefore:
      conversation.state,

    stateAfter:
      nextState,

    directReview:
      true,

    accepted:
      true,

    businessName,

    reviewerName:
      directReview.reviewerName,

    rating:
  directRating,

    botReply,
  };
}


    // -----------------------------------------------------
    // IMAGE REVIEW
    // -----------------------------------------------------

    if (
      classification.type ===
      INPUT_TYPES.IMAGE_REVIEW
    ) {
      return {
        ok: true,
        customerId: customer.id,
        stateBefore: conversation.state,
        stateAfter: conversation.state,
        inputType: classification.type,
        confidence: classification.confidence,
        botReply: null,
        nextAction:
          "IMAGE_REVIEW_FLOW_3_3",
      };
    }


    // -----------------------------------------------------
    // BUSINESS NAME
    // -----------------------------------------------------

    if (
  classification.type ===
  INPUT_TYPES.BUSINESS_NAME
) {

  // 1. ค้นชื่อธุรกิจใน Google Places
  const places =
    await searchPlaceByText(message);

  if (!places.length) {
  const botReply =
  getCustomerText(
    customer,
    "ยังหา Google Map จากชื่อนี้ไม่เจอครับ รบกวนส่งชื่อธุรกิจให้ละเอียดขึ้น หรือส่งลิงก์ Google Map มาได้เลยครับ",
    "I couldn't find the Google Maps listing from this business name. Please send the full business name or the Google Maps link."
  );


  await saveMessage({
    customerId:
      customer.id,

    platform,

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  return {
    ok:
      true,

    customerId:
      customer.id,

    stateBefore:
      conversation.state,

    stateAfter:
      conversation.state,

    inputType:
      classification.type,

    botReply,

    placeFound:
      false,
  };
}


  // 2. ตอนนี้เลือกผลลัพธ์อันดับแรกจาก Google
const place = places[0];


const businessNameHasThai =
  /[\u0E00-\u0E7F]/.test(
    String(message || "")
  );


const thailandPlace =
  isThailandPlace(place);


if (
  !businessNameHasThai &&
  thailandPlace === false &&
  customer.language !== "en"
) {
  customer =
    await updateCustomerLanguage(
      customer.id,
      "en"
    );

  console.log(
    "FOREIGN BUSINESS -> LANGUAGE EN:",
    {
      customerId:
        customer.id,

      businessName:
        place.businessName,

      formattedAddress:
        place.formattedAddress,
    }
  );
}


// 3. ดึง Template "ใช่ Google Map นี้ไหมครับ"
      
  // 3. ดึง Template "ใช่ Google Map นี้ไหมครับ"
  const template =
    await getTemplate(
      "confirm_map",
      customer.language || "th"
    );

  if (!template) {
    throw new Error(
      "confirm_map template not found"
    );
  }


  // 4. แทน {{map_url}} ด้วย URL จริง
  const botReply =
    template.content.replace(
      "{{map_url}}",
      place.mapUrl
    );


  // 5. สร้าง Draft Job เก็บข้อมูล Map ไว้
  const job = await createJob({
    customerId: customer.id,
    businessName:
      place.businessName,
    placeId:
      place.placeId,
    mapUrl:
      place.mapUrl,
    status: "draft",
  });


  // 6. เปลี่ยน State
  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES.MAP_FOUND_WAITING_CONFIRMATION
    );


  await updateConversationState({
    customerId: customer.id,
    state: nextState,
    handoff: false,
    handoffReason: null,
  });


  // 7. บันทึกข้อความ Bot
  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "outbound",
    messageType: "text",
    messageText: botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  // 8. ส่งผลกลับ
  return {
    ok: true,

    customerId:
      customer.id,

    jobId:
      job.id,

    stateBefore:
      conversation.state,

    stateAfter:
      nextState,

    inputType:
      classification.type,

    placeFound: true,

    place: {
      placeId:
        place.placeId,

      businessName:
        place.businessName,

      formattedAddress:
        place.formattedAddress,

      mapUrl:
        place.mapUrl,

      rating:
        place.rating,

      userRatingCount:
        place.userRatingCount,
    },

    botReply,
  };
}

// -----------------------------------------------------
// SERVICE INQUIRY
// เช่น สนใจ / สอบถาม / อยากลบรีวิว
// -----------------------------------------------------

if (
  isServiceInquiryMessage(
    message
  )
) {

  const template =
    await getTemplate(
      "welcome",
      customer.language || "th"
    );


  if (!template) {
    throw new Error(
      "Welcome template not found"
    );
  }


  const botReply =
    template.content;


  await saveMessage({
    customerId:
      customer.id,

    platform,

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  return {
    ok: true,

    customerId:
      customer.id,

    stateBefore:
      conversation.state,

    stateAfter:
      conversation.state,

    serviceInquiry:
      true,

    botReply,

    softHandoff:
      false,
  };
}
    
    // -----------------------------------------------------
    // OTHER TEXT
    // -----------------------------------------------------

    const faqResult =
  await sendGlobalFaqIfMatched({
    customer,
    conversation,
    platform,
    message,
  });

if (faqResult.matched) {
  return {
    ok: true,
    customerId: customer.id,
    stateBefore: conversation.state,
    stateAfter: conversation.state,
    inputType: classification.type,
    confidence: classification.confidence,
    faqMatched: true,
    botReply:
      faqResult.botReply,
    note:
      "Global FAQ answered while waiting for map. State preserved.",
  };
}

if (!autoConfirmDirectMap) {

  const botReply =
    getCustomerText(
      customer,
      "ส่งลิงก์ Google Map หรือชื่อธุรกิจมาได้เลยครับ เดี๋ยวผมตรวจสอบให้ครับ",
      "Please send the Google Maps link or business name and I'll check it for you."
    );


  await saveMessage({
    customerId:
      customer.id,

    platform,

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  return {
    ok: true,

    customerId:
      customer.id,

    stateBefore:
      conversation.state,

    stateAfter:
      conversation.state,

    inputType:
      classification.type,

    confidence:
      classification.confidence,

    botReply,

    softHandoff:
      false,

    note:
      "Waiting for Google Maps link or business name.",
  };
}
  }

// -------------------------------------------------------
// 7. MAP_FOUND_WAITING_CONFIRMATION
// -------------------------------------------------------

if (
  conversation.state ===
  GMR_STATES.MAP_FOUND_WAITING_CONFIRMATION
) {
  const normalized =
  autoConfirmDirectMap
    ? "ใช่"
    : String(message || "")
        .trim()
        .toLowerCase();
  const yesWords = [
    "ใช่",
    "ใช่ครับ",
    "ใช่ค่ะ",
    "ถูกต้อง",
    "ถูกครับ",
    "ถูกค่ะ",
    "yes",
    "y",
    "yeah",
    "yep",
    "ok",
    "okay",
  ];

  const noWords = [
    "ไม่ใช่",
    "ไม่ใช่ครับ",
    "ไม่ใช่ค่ะ",
    "ผิด",
    "ผิดร้าน",
    "no",
    "n",
    "nope",
  ];

  const cleanedNormalized =
  normalized
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

const isNo =
  noWords.includes(cleanedNormalized) ||
  cleanedNormalized.startsWith("ไม่ใช่");

const isYes =
  !isNo &&
  (
    yesWords.includes(cleanedNormalized) ||
    cleanedNormalized.startsWith("ใช่") ||
    cleanedNormalized.startsWith("ถูกต้อง")
  );

  // -----------------------------------------------------
  // ลูกค้าตอบ "ใช่"
  // -----------------------------------------------------

  if (isYes) {

  // -----------------------------------------------------
  // 1. หา Job ล่าสุดของลูกค้า
  // -----------------------------------------------------

 const latestJob =
  await getLatestJobWithMapByCustomerId(
    customer.id
  );

  if (!latestJob) {
    throw new Error(
      "No job found for confirmed map"
    );
  }

  if (!latestJob.place_id) {
    throw new Error(
      "Job has no place_id"
    );
  }

// =====================================================
// IMAGE REVIEW CONFIRMED
// ใช้รีวิวจากรูปโดยตรง ไม่ค้นเฉพาะ 1 ดาวใหม่
// =====================================================

if (
  latestJob.review_case ===
  "image_review_pending"
) {
const imageReviews =
  await getReviewsByJobId(
    latestJob.id
  );

  const imageReview =
    imageReviews[0] ||
    null;


  if (!imageReview) {
    await triggerHumanAttention({
      customer,
      conversation,

      message:
        "ลูกค้ายืนยัน Map จากรูปรีวิว",

      reason:
        "IMAGE_REVIEW_CANDIDATE_NOT_FOUND",
    });

    return {
      ok: true,
      customerId:
        customer.id,

      stateBefore:
        conversation.state,

      stateAfter:
        conversation.state,

      botReply:
        null,

      softHandoff:
        true,
    };
  }


  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES.WAITING_PRICE
    );


  await updateConversationState({
    customerId:
      customer.id,

    state:
      nextState,

    handoff:
      false,

    handoffReason:
      null,
  });


  const updatedJob =
    await updateJob(
      latestJob.id,
      {
        review_case:
          "image_review",

        status:
          "waiting_price",
      }
    );


 const botReply =
  getCustomerText(
    customer,
    "เช็คแล้วดำเนินการได้ครับ",
    "Checked. We can proceed with this review."
  );


  await saveMessage({
    customerId:
      customer.id,

    platform,

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  try {
    const lineGroupResult =
      await sendJobToLineGroup({
        jobId:
          updatedJob.id,

        jobType: "image_review",

        customerName:
          customer.display_name ||
          "",

        businessName:
          updatedJob.business_name ||
          "",

        reviewerName:
          imageReview.reviewer_name ||
          "",

        reviewAgeDays:
          null,

        reviewText:
          imageReview.review_text ||
          "",

        reviewUrl:
          imageReview.review_url ||
          "",

        mapUrl:
          updatedJob.map_url ||
          "",
      });


    if (
      lineGroupResult?.messageId
    ) {
      await updateJob(
        updatedJob.id,
        {
          line_group_message_id:
            lineGroupResult.messageId,
        }
      );
    }

  } catch (error) {
    console.error(
      "IMAGE REVIEW PRICE REQUEST FAILED:",
      error
    );
  }


  return {
    ok:
      true,

    customerId:
      customer.id,

    jobId:
      updatedJob.id,

    stateBefore:
      conversation.state,

    stateAfter:
      nextState,

    mapConfirmed:
      true,

    reviewCase:
      "image_review",

    reviewerName:
      imageReview.reviewer_name ||
      null,

    rating:
      imageReview.rating ||
      null,

    botReply,
  };
}
    
  // -----------------------------------------------------
  // 2. ตรวจรีวิวล่าสุด
  // -----------------------------------------------------

  const [
  newestResult,
  lowestResult,
] =
  await Promise.all([
    getNewestReviews(
      latestJob.place_id
    ),

    getLowestReviews(
      latestJob.place_id
    ),
  ]);

    console.log(
  "NEWEST REVIEWS DEBUG:",
  {
    placeId:
      latestJob.place_id,

    total:
      newestResult.reviews.length,

    reviews:
      newestResult.reviews.map(
        (review) => ({
          reviewerName:
            review.reviewerName,

          rating:
            review.rating,

          dateText:
            review.dateText,

          isoDate:
            review.isoDate,

          ageDays:
            getReviewAgeDays(
              review
            ),

          reviewUrl:
            review.reviewUrl,
        })
      ),
  }
);

const recentOneStarReviews =
  getRecentReviews(
    newestResult.reviews.filter(
      (review) =>
        Number(review.rating) === 1
    ),
    14
  );

    console.log(
  "RECENT 1 STAR DEBUG:",
  {
    count:
      recentOneStarReviews.length,

    reviews:
      recentOneStarReviews.map(
        (review) => ({
          reviewerName:
            review.reviewerName,

          rating:
            review.rating,

          dateText:
            review.dateText,

          isoDate:
            review.isoDate,

          ageDays:
            getReviewAgeDays(
              review
            ),
        })
      ),
  }
);


  // -----------------------------------------------------
  // 3. ถ้ามีรีวิวใหม่ <= 14 วัน
  // → Script 2
  // → WAITING_REVIEW_SELECTION
  // -----------------------------------------------------

if (recentOneStarReviews.length > 0) {

    const template =
      await getTemplate(
        "script_2_recent_reviews",
        customer.language || "th"
      );

    if (!template) {
      throw new Error(
        "script_2_recent_reviews template not found"
      );
    }


    let botReply =
      template.content.replace(
        "{{review_count}}",
        String(
          recentOneStarReviews.length
        )
      );

  if (
  recentOneStarReviews.length === 1
) {
  botReply =
    getCustomerText(
      customer,
      "จากที่เช็คจะมีรีวิวที่เพิ่งลงและดำเนินการได้เลย 1 รีวิวครับ\n\n" +
        "เอาเป็นรีวิวนี้เลยไหมครับ",
      "I found 1 recently posted review that can be processed.\n\n" +
        "Would you like to proceed with this review?"
    );
}


    // ต่อท้ายลิงก์รีวิวทุกอัน
    const reviewLines =
      recentOneStarReviews
        .map(
          (review, index) => {

           const reviewer =
  review.reviewerName ||
  getCustomerText(
    customer,
    "ไม่ทราบชื่อ",
    "Unknown reviewer"
  );

            const rating =
              review.rating ||
              "-";

            const dateText =
              review.dateText ||
              "";

            const reviewUrl =
              review.reviewUrl ||
              "";

            return [
              `${index + 1}. ${reviewer}`,
              `⭐ ${rating}`,
              dateText,
              reviewUrl,
            ]
              .filter(Boolean)
              .join("\n");
          }
        )
        .join("\n\n");


    if (reviewLines) {
      botReply +=
        `\n\n${reviewLines}`;
    }

// =====================================================
// เก็บ Review ลง DB ก่อน
// ไม่รอ Screenshot
// =====================================================

for (
  const review of
    recentOneStarReviews
) {

  await saveReviewCandidate({
    customerId:
      customer.id,

    jobId:
      latestJob.id,

    businessName:
      latestJob.business_name,

    placeId:
      latestJob.place_id,

    mapUrl:
      latestJob.map_url,

    reviewerName:
      review.reviewerName,

    rating:
      review.rating,

    reviewText:
      review.text,

    reviewDate:
      review.isoDate,

    reviewUrl:
      review.reviewUrl,

    providerReviewId:
      review.reviewId,

    isRecent:
      true,

    isVisible:
      true,

    hasText:
      Boolean(
        review.text &&
        review.text.trim()
      ),

    evidenceImagePath:
      null,
  });
}
 

    const nextState =
      transitionState(
        conversation.state,
        GMR_STATES.WAITING_REVIEW_SELECTION
      );


    await updateConversationState({
      customerId:
        customer.id,

      state:
        nextState,

      handoff:
        false,

      handoffReason:
        null,
    });


    await updateJob(
      latestJob.id,
      {
        review_case:
          "recent_review",

        status:
          "draft",
      }
    );


    await saveMessage({
      customerId:
        customer.id,

      platform,

      direction:
        "outbound",

      messageType:
        "text",

      messageText:
        botReply,
    });

    await updateLastBotMessage(
      customer.id,
      botReply
    );


    return {
      ok: true,

      customerId:
        customer.id,

      jobId:
        latestJob.id,

      stateBefore:
        conversation.state,

      stateAfter:
        nextState,

      mapConfirmed:
        true,

      reviewCase:
        "recent_review",

      recentCount:
       recentOneStarReviews.length,

      botReply,
    };
  }

// ========================================
// ส่งข้อความให้ลูกค้าทันที
// ก่อนเริ่มสร้าง Screenshot
// ========================================

try {

  await sendMessageToCustomer({
    platform,
    platformUserId,
    text:
      botReply,
  });

} catch (error) {

  console.error(
    "RECENT REVIEW TEXT SEND FAILED:",
    error
  );
}

    // ========================================
// SCREENSHOT BACKGROUND TASK
// ไม่ block การตอบลูกค้า
// ========================================

void (
  async () => {

    for (
      let index = 0;
      index <
        recentOneStarReviews.length;
      index += 1
    ) {

      const review =
        recentOneStarReviews[index];


      try {

        if (!review.reviewUrl) {
          continue;
        }


        const evidenceBuffer =
          await createReviewScreenshot({
            reviewUrl:
              review.reviewUrl,
          });


        const evidenceUpload =
          await uploadReviewEvidence({
            buffer:
              evidenceBuffer,

            customerId:
              customer.id,

            jobId:
              latestJob.id,

            reviewId:
              review.reviewId ||
              null,

            index:
              index + 1,
          });


        const evidenceImageUrl =
          await createReviewEvidenceSignedUrl(
            evidenceUpload.filePath
          );


        await sendMessageToCustomer({
          platform,
          platformUserId,

          imageUrl:
            evidenceImageUrl,
        });


        console.log(
          "REVIEW SCREENSHOT SENT ASYNC:",
          {
            jobId:
              latestJob.id,

            reviewerName:
              review.reviewerName,

            reviewUrl:
              review.reviewUrl,

            evidenceImagePath:
              evidenceUpload.filePath,
          }
        );

      } catch (error) {

        console.error(
          "ASYNC REVIEW SCREENSHOT FAILED:",
          {
            jobId:
              latestJob.id,

            reviewerName:
              review.reviewerName,

            error:
              error.message,
          }
        );
      }
    }

  }
)();
    

  // -----------------------------------------------------
  // 4. ไม่มีรีวิวใหม่
  // ตรวจ Lowest ต่อ
  // -----------------------------------------------------

  const oneStarReviews =
    getOneStarReviews(
      lowestResult.reviews
    );


  // -----------------------------------------------------
  // 5. พบ 1 ดาว
  // → Script 1
  // → WAITING_MAP
// → รอลูกค้าส่ง Review link / Screenshot
  // -----------------------------------------------------

const recentOneStarFromLowest =
  getRecentReviews(
    oneStarReviews,
    14
  );


console.log(
  "RECENT 1 STAR FROM LOWEST DEBUG:",
  {
    count:
      recentOneStarFromLowest.length,

    reviews:
      recentOneStarFromLowest.map(
        (review) => ({
          reviewerName:
            review.reviewerName,

          rating:
            review.rating,

          dateText:
            review.dateText,

          isoDate:
            review.isoDate,

          ageDays:
            getReviewAgeDays(
              review
            ),

          reviewUrl:
            review.reviewUrl,
        })
      ),
  }
);

if (
  recentOneStarFromLowest.length > 0
) {

  const recentReviews =
    recentOneStarFromLowest;


  let botReply =
    getCustomerText(
      customer,
      `จากที่เช็คพบรีวิว 1 ดาวที่เพิ่งลงภายใน 14 วัน จำนวน ${recentReviews.length} รีวิวครับ`,
      `I found ${recentReviews.length} recent 1-star review(s) posted within the last 14 days.`
    );


  const reviewLines =
    recentReviews
      .map(
        (review, index) => {

          const reviewer =
            review.reviewerName ||
            getCustomerText(
              customer,
              "ไม่ทราบชื่อ",
              "Unknown reviewer"
            );


          return [
            `${index + 1}. ${reviewer}`,
            `⭐ ${review.rating || 1}`,
            review.dateText || "",
            review.reviewUrl || "",
          ]
            .filter(Boolean)
            .join("\n");
        }
      )
      .join("\n\n");


  if (reviewLines) {
    botReply +=
      `\n\n${reviewLines}`;
  }


  for (
    const review of recentReviews
  ) {

    await saveReviewCandidate({
      customerId:
        customer.id,

      jobId:
        latestJob.id,

      businessName:
        latestJob.business_name,

      placeId:
        latestJob.place_id,

      mapUrl:
        latestJob.map_url,

      reviewerName:
        review.reviewerName,

      rating:
        review.rating,

      reviewText:
        review.text,

      reviewDate:
        review.isoDate,

      reviewUrl:
        review.reviewUrl,

      providerReviewId:
        review.reviewId,

      isRecent:
        true,

      isVisible:
        true,

      hasText:
        Boolean(
          review.text &&
          review.text.trim()
        ),
    });
  }


  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES.WAITING_REVIEW_SELECTION
    );


  await updateConversationState({
    customerId:
      customer.id,

    state:
      nextState,

    handoff:
      false,

    handoffReason:
      null,
  });


  await updateJob(
    latestJob.id,
    {
      review_case:
        "recent_review",

      status:
        "draft",
    }
  );


  await saveMessage({
    customerId:
      customer.id,

    platform,

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  return {
    ok: true,

    customerId:
      customer.id,

    jobId:
      latestJob.id,

    stateBefore:
      conversation.state,

    stateAfter:
      nextState,

    mapConfirmed:
      true,

    reviewCase:
      "recent_review",

    recentCount:
      recentReviews.length,

    botReply,
  };
}
    
 if (oneStarReviews.length > 0) {

  const template =
    await getTemplate(
      "script_1_old_review",
      customer.language || "th"
    );

  if (!template) {
    throw new Error(
      "script_1_old_review template not found"
    );
  }


 const botReply1 =
  getCustomerText(
    customer,
    "จากที่เช็คบนแมพมี รีวิว 1 ดาวที่มีอายุงานนานแล้ว (> 2 สัปดาห์)\n\n" +
      "ขั้นตอนการยื่นตรวจสอบจะทำได้ยากกว่า\n\n" +
      "หากมีรีวิวเพิ่งลงภายใน 2 สัปดาห์ แนะนำส่งมาให้เช็คทันที จะดำเนินการได้ง่ายกว่าครับ",
    "I found a 1-star review on the map that is older than 2 weeks.\n\n" +
      "Older reviews are generally more difficult to submit for assessment.\n\n" +
      "If you receive a new review within 2 weeks, I recommend sending it to us as soon as possible."
  );


const specificReviewProvided =
  [
    "image_review_pending",
    "image_review",
    "direct_review",
  ].includes(
    latestJob.review_case
  ) ||
  Boolean(
    latestJob.review_url
  );


const botReply2 =
  specificReviewProvided
    ? getCustomerText(
        customer,
        'หากยังต้องการลบตัวที่ส่งมาจริงๆ พิมพ์ "ยืนยัน" ทางเราจะเช็คราคาให้ครับ',
        'If you would still like to remove the review you sent, reply "Confirm" and we will check the price for you.'
      )
    : getCustomerText(
        customer,
          "ส่งลิงก์รีวิว หรือรูปรีวิวที่ต้องการลบมาได้เลยครับ เดี๋ยวเช็คราคาให้ก่อน",
        "If you would still like to proceed with the current 1-star review,\n\n" +
          "please send the review link or a screenshot of the review and I'll check the price first."
      );


  const botReply =
    null;


const nextState =
  GMR_STATES.WAITING_MAP;


await updateConversationState({
  customerId:
    customer.id,

  state:
    nextState,

  handoff:
    false,

  handoffReason:
    null,
});


await updateJob(
  latestJob.id,
  {
    review_case:
      "old_review",

    status:
      "draft",
  }
);
   
  await sendMessageToCustomer({
    platform,
    platformUserId,
    text:
      botReply1,
  });


  await sendMessageToCustomer({
    platform,
    platformUserId,
    text:
      botReply2,
  });



  await saveMessage({
    customerId:
      customer.id,

    platform,

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      botReply1,
  });


  await saveMessage({
    customerId:
      customer.id,

    platform,

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      botReply2,
  });


  await updateLastBotMessage(
    customer.id,
    botReply2
  );


  return {
    ok:
      true,

    customerId:
      customer.id,

    jobId:
      latestJob.id,

    stateBefore:
      conversation.state,

    stateAfter:
      nextState,

    mapConfirmed:
      true,

    reviewCase:
      "old_review",

    oneStarCount:
      oneStarReviews.length,

    botReply,
  };
}

  // -----------------------------------------------------
  // 6. Lowest แล้วไม่พบ 1 ดาว
  // → Script 3.4
  // → WAITING_PRICE
  // -----------------------------------------------------

  const template =
    await getTemplate(
      "script_3_4_hidden_one_star",
      customer.language || "th"
    );

  if (!template) {
    throw new Error(
      "script_3_4_hidden_one_star template not found"
    );
  }

  const botReply =
    template.content;


  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES.WAITING_PRICE
    );


  await updateConversationState({
    customerId:
      customer.id,

    state:
      nextState,

    handoff:
      false,

    handoffReason:
      null,
  });


 const updatedJob =
  await updateJob(
    latestJob.id,
    {
      review_case:
        "hidden_one_star",

      review_visible:
        false,

      review_has_text:
        false,

      status:
        "waiting_price",
    }
  );

  await saveMessage({
    customerId:
      customer.id,

    platform,

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      botReply,
  });

try {
  const lineGroupResult =
    await sendJobToLineGroup({
      jobId:
        updatedJob.id,

      jobType:
        "hidden_one_star",

     customerName:
  customer.display_name ||
  "",

      businessName:
        updatedJob.business_name || "",

      mapUrl:
        updatedJob.map_url || "",
    });

  if (lineGroupResult?.messageId) {
    await updateJob(
      updatedJob.id,
      {
        line_group_message_id:
          lineGroupResult.messageId,
      }
    );
  }

} catch (error) {
  console.error(
    "HIDDEN REVIEW PRICE REQUEST FAILED:",
    error
  );
}

    
  await updateLastBotMessage(
    customer.id,
    botReply
  );


  return {
    ok: true,

    customerId:
      customer.id,

    jobId:
      latestJob.id,

    stateBefore:
      conversation.state,

    stateAfter:
      nextState,

    mapConfirmed:
      true,

    reviewCase:
      "hidden_one_star",

    oneStarCount: 0,

    botReply,
  };
}

  // -----------------------------------------------------
  // ลูกค้าตอบ "ไม่ใช่"
  // → HANDOFF
  // -----------------------------------------------------

  if (isNo) {
    const nextState = transitionState(
      conversation.state,
      GMR_STATES.HANDOFF
    );

    await updateConversationState({
      customerId: customer.id,
      state: nextState,
      handoff: true,
      handoffReason: "CUSTOMER_REJECTED_MAP",
    });

    const botReply =
      "รับทราบครับ เดี๋ยวให้เจ้าหน้าที่ช่วยตรวจสอบ Google Map ที่ถูกต้องให้อีกครั้งครับ";

    await saveMessage({
      customerId: customer.id,
      platform,
      direction: "outbound",
      messageType: "text",
      messageText: botReply,
    });

    await updateLastBotMessage(
      customer.id,
      botReply
    );

    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: nextState,
      mapConfirmed: false,
      handoff: true,
      botReply,
    };
  }

  // -----------------------------------------------------
  // ลูกค้าพิมพ์อย่างอื่น
  // -----------------------------------------------------

const faqResult =
  await sendGlobalFaqIfMatched({
    customer,
    conversation,
    platform,
    message,
  });

if (faqResult.matched) {
  return {
    ok: true,
    customerId: customer.id,
    stateBefore: conversation.state,
    stateAfter: conversation.state,
    faqMatched: true,
    botReply:
      faqResult.botReply,
    note:
      "Global FAQ answered. State preserved.",
  };
}

await triggerHumanAttention({
  customer,
  conversation,
  message,
  reason:
    "UNHANDLED_MESSAGE_IN_MAP_CONFIRMATION",
});

return {
  ok: true,
  customerId: customer.id,
  stateBefore: conversation.state,
  stateAfter: conversation.state,
  botReply: null,
  softHandoff: true,
  note:
    "Human attention requested. State preserved.",
};
}
  
  if (
  conversation.state ===
  GMR_STATES.WAITING_REVIEW_SELECTION
) {
  const latestJob =
    await getLatestJobByCustomerId(
      customer.id
    );

  if (!latestJob) {
    throw new Error(
      "No job found while waiting for review selection"
    );
  }

  const candidates =
    await getReviewCandidatesByJobId(
      latestJob.id
    );

  if (!candidates.length) {
    throw new Error(
      "No review candidates found"
    );
  }

  const normalized =
    String(message || "").trim();

  let selectedReview = null;

// -----------------------------------------------------
// ถ้ามีรีวิวเดียว
// ลูกค้าตอบ "ใช่" = เลือกรีวิวนั้นทันที
// -----------------------------------------------------

const normalizedLower =
  normalized.toLowerCase();

const singleReviewYesWords = [
  "ใช่",
  "ใช่ครับ",
  "ได้",
   "ได้ครับ",
  "ใช่ค่ะ",
  "เอาครับ",
  "เอาค่ะ",
  "เอา",
  "รีวิวนี้",
  "อันนี้",
  "yes",
  "y",
  "ok",
  "okay",
];

if (
  candidates.length === 1 &&
  singleReviewYesWords.includes(
    normalizedLower
  )
) {
  selectedReview =
    candidates[0];
}
    
  // ลูกค้าพิมพ์ 1 / 2 / 3
  const numericChoice =
    Number(normalized);

  if (
    Number.isInteger(numericChoice) &&
    numericChoice >= 1 &&
    numericChoice <= candidates.length
  ) {
    selectedReview =
      candidates[numericChoice - 1];
  }

  // ลูกค้าส่งลิงก์รีวิวกลับมา
  if (
    !selectedReview &&
    normalized.startsWith("http")
  ) {
    selectedReview =
      candidates.find(
        (review) =>
          review.review_url === normalized
      ) || null;
  }

 // ยังเลือกไม่สำเร็จ
if (!selectedReview) {
  const faqResult =
    await sendGlobalFaqIfMatched({
      customer,
      conversation,
      platform,
      message,
    });

  if (faqResult.matched) {
    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      selected: false,
      faqMatched: true,
      botReply:
        faqResult.botReply,
      note:
        "Global FAQ answered while waiting for review selection. State preserved.",
    };
  }

  await triggerHumanAttention({
    customer,
    conversation,
    message,
    reason:
      "UNHANDLED_MESSAGE_IN_REVIEW_SELECTION",
  });

  return {
    ok: true,
    customerId: customer.id,
    stateBefore: conversation.state,
    stateAfter: conversation.state,
    selected: false,
    botReply: null,
    softHandoff: true,
    note:
      "Human attention requested while waiting for review selection",
  };
}
  // mark ว่าเลือกแล้ว
  const selected =
    await selectReviewCandidate(
      selectedReview.id
    );

  // update job ให้ผูกกับ review ที่เลือก
  const updatedJob =
  await updateJob(
    latestJob.id,
    {
      review_url:
        selected.review_url,

      review_case:
        "recent_review",

      status:
        "waiting_price",
    }
  );

  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES.WAITING_PRICE
    );

  await updateConversationState({
    customerId: customer.id,
    state: nextState,
    handoff: false,
    handoffReason: null,
  });

  try {
    
  const lineGroupResult =
  await sendJobToLineGroup({
    jobId:
      updatedJob.id,

    jobType:
      "recent_review",

  customerName:
  customer.display_name ||
  "",

    businessName:
      updatedJob.business_name || "",

    reviewerName:
      selected.reviewer_name || "",

    reviewAgeDays:
      null,

    reviewUrl:
      selected.review_url || "",

    mapUrl:
      updatedJob.map_url || "",
  });

  if (lineGroupResult?.messageId) {
    await updateJob(
      updatedJob.id,
      {
        line_group_message_id:
          lineGroupResult.messageId,
      }
    );
  }

} catch (error) {
  console.error(
    "PRICE REQUEST LINE GROUP FAILED:",
    error
  );
}

  const botReply =
  getCustomerText(
    customer,
    "รับทราบครับ เดี๋ยวเจ้าหน้าที่ตรวจสอบและแจ้งราคาสำหรับรีวิวนี้ให้ครับ",
    "Got it. We'll check this review and send you the price shortly."
  );

  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "outbound",
    messageType: "text",
    messageText: botReply,
  });

  await updateLastBotMessage(
    customer.id,
    botReply
  );

  return {
    ok: true,
    customerId: customer.id,
    jobId: latestJob.id,
    stateBefore: conversation.state,
    stateAfter: nextState,
    selected: true,
    selectedReview: {
      reviewerName:
        selected.reviewer_name,

      rating:
        selected.rating,

      reviewText:
        selected.review_text,

      reviewUrl:
        selected.review_url,
    },
    botReply,
  };
}

if (
  conversation.state ===
  GMR_STATES.WAITING_CONFIRM
) {
  const normalized =
    String(message || "")
      .trim()
      .toLowerCase();

  const confirmWords = [
    "ยืนยัน",
    "ยืนยันครับ",
    "ยืนยันค่ะ",
    "ok",
    "okay",
    "ตกลง",
    "เริ่มได้เลย",
    "เริ่มงานได้เลย",
    "จัดการเลย",
    "confirm",
    "confirmed",
    "go ahead",
    "proceed",
  ];

  const isConfirmed =
    confirmWords.includes(normalized);

 if (!isConfirmed) {
  const faqResult =
    await sendGlobalFaqIfMatched({
      customer,
      conversation,
      platform,
      message,
    });

  if (faqResult.matched) {
    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      confirmed: false,
      faqMatched: true,
      botReply:
        faqResult.botReply,
      note:
        "Global FAQ answered while waiting for confirmation. State preserved.",
    };
  }

  await triggerHumanAttention({
    customer,
    conversation,
    message,
    reason:
      "UNHANDLED_MESSAGE_IN_WAITING_CONFIRM",
  });

  return {
    ok: true,
    customerId: customer.id,
    stateBefore: conversation.state,
    stateAfter: conversation.state,
    confirmed: false,
    botReply: null,
    softHandoff: true,
    note:
      "Human attention requested while waiting for confirmation",
  };
}
  const template =
    await getTemplate(
      "script_4_request_phone",
      customer.language || "th"
    );

  if (!template) {
    throw new Error(
      "script_4_request_phone template not found"
    );
  }

  const botReply =
    template.content;

  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES.WAITING_PHONE
    );

  await updateConversationState({
    customerId: customer.id,
    state: nextState,
    handoff: false,
    handoffReason: null,
  });

  const latestJob =
    await getLatestJobByCustomerId(
      customer.id
    );

  if (latestJob) {
    await updateJob(
      latestJob.id,
      {
        status: "waiting_phone",
      }
    );
  }

  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "outbound",
    messageType: "text",
    messageText: botReply,
  });

  await updateLastBotMessage(
    customer.id,
    botReply
  );

  return {
    ok: true,
    customerId: customer.id,
    jobId: latestJob?.id || null,
    stateBefore: conversation.state,
    stateAfter: nextState,
    confirmed: true,
    botReply,
  };
}

if (
  conversation.state ===
  GMR_STATES.WAITING_PHONE
) {
  const rawPhone =
    String(message || "").trim();

  const normalizedPhone =
  rawPhone.replace(
    /[^\d+]/g,
    ""
  );


const localPhonePattern =
  /^\d{10}$/;

const internationalPhonePattern =
  /^\+[1-9]\d{7,14}$/;

const isValidPhone =
  localPhonePattern.test(
    normalizedPhone
  ) ||
  internationalPhonePattern.test(
    normalizedPhone
  );


if (!isValidPhone) {
  const faqResult =
    await sendGlobalFaqIfMatched({
      customer,
      conversation,
      platform,
      message,
    });

  if (faqResult.matched) {
    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      phoneAccepted: false,
      faqMatched: true,
      botReply:
        faqResult.botReply,
      note:
        "Global FAQ answered while waiting for phone. State preserved.",
    };
  }

  const botReply =
  getCustomerText(
    customer,
    "รบกวนส่งเบอร์โทรศัพท์ให้ครบ 10 หลักครับ เช่น 0812345678",
    "Please send a 10-digit phone number, for example 0812345678."
  );
  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "outbound",
    messageType: "text",
    messageText: botReply,
  });

  await updateLastBotMessage(
    customer.id,
    botReply
  );

  return {
    ok: true,
    customerId: customer.id,
    stateBefore: conversation.state,
    stateAfter: conversation.state,
    phoneAccepted: false,
    botReply,
  };
}


  // แปลง 0812345678 -> +66812345678
  let phoneForDb =
    normalizedPhone;

  if (
    phoneForDb.startsWith("0")
  ) {
    phoneForDb =
      "+66" +
      phoneForDb.slice(1);
  }


  await updateCustomerPhone(
    customer.id,
    phoneForDb
  );


  const latestJob =
    await getLatestJobByCustomerId(
      customer.id
    );


if (!latestJob) {
  throw new Error(
    "No active job found while receiving phone"
  );
}


const hasPaymentHistory =
  await hasPaymentByCustomerId(
    customer.id
  );


const needsCreditApproval =
  Number(
    latestJob.price || 0
  ) > 3000 &&
  !hasPaymentHistory;


if (needsCreditApproval) {

  const creditRequest =
    await sendCreditApprovalRequestToLineGroup({
      customer,

      job:
        latestJob,

      phone:
        phoneForDb,
    });


  await updateJob(
    latestJob.id,
    {
      status:
        "waiting_credit_approval",

      line_group_message_id:
        creditRequest.messageId,
    }
  );


  await updateConversationState({
    customerId:
      customer.id,

    state:
      GMR_STATES.HANDOFF,

    handoff:
      true,

    handoffReason:
      "CREDIT_APPROVAL_PENDING",
  });


  const botReply =
    getCustomerText(
      customer,
      "ได้รับเบอร์เรียบร้อยครับ ขณะนี้กำลังตรวจสอบข้อมูลก่อนเริ่มดำเนินการครับ",
      "Thank you. We have received your phone number and are completing a quick verification before starting the service."
    );


  await saveMessage({
    customerId:
      customer.id,

    platform,

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  return {
    ok: true,

    customerId:
      customer.id,

    jobId:
      latestJob.id,

    stateBefore:
      conversation.state,

    stateAfter:
      GMR_STATES.HANDOFF,

    phoneAccepted:
      true,

    phone:
      phoneForDb,

    creditApprovalPending:
      true,

    botReply,
  };
}


// ========================================
// ไม่ต้องตรวจเครดิต
// ราคา <= 3,000
// หรือมีประวัติชำระเงินแล้ว
// → เริ่มงานทันที
// ========================================

const startResult =
  await startApprovedJob({
    customer,

    conversation,

    job:
      latestJob,

    platform,

    phone:
      phoneForDb,
  });


return {
  ok: true,

  customerId:
    customer.id,

  jobId:
    latestJob.id,

  stateBefore:
    conversation.state,

  stateAfter:
    GMR_STATES.IN_PROGRESS,

  phoneAccepted:
    true,

  phone:
    phoneForDb,

  creditApprovalPending:
    false,

  botReply:
    startResult.botReply,
};
 }
  
 // -------------------------------------------------------
// OTHER STATES → SOFT HANDOFF
// -------------------------------------------------------

const faqResult =
  await sendGlobalFaqIfMatched({
    customer,
    conversation,
    platform,
    message,
  });

if (faqResult.matched) {
  return {
    ok: true,
    customerId: customer.id,
    stateBefore: conversation.state,
    stateAfter: conversation.state,
    faqMatched: true,
    botReply:
      faqResult.botReply,
    note:
      "Global FAQ answered in unhandled state. State preserved.",
  };
}

await triggerHumanAttention({
  customer,
  conversation,
  message,
  reason:
    `UNHANDLED_MESSAGE_IN_STATE_${conversation.state}`,
});

return {
  ok: true,
  customerId: customer.id,
  stateBefore: conversation.state,
  stateAfter: conversation.state,
  botReply: null,
  softHandoff: true,
  note:
    "Human attention requested for unhandled state",
};
}


// =========================================================
// POST TEST MESSAGE
// =========================================================

app.post("/test-message", async (req, res) => {
  try {

    const result =
      await processTestMessage({
        platform:
          req.body.platform || "line",

        platformUserId:
          req.body.platformUserId ||
          "TEST_USER_001",

        displayName:
          req.body.displayName ||
          "Test User",

        message:
          req.body.message || "",

        messageType:
          req.body.messageType || "text",
      });

    res.status(200).json(result);

  } catch (error) {

    console.error(
      "TEST MESSAGE ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});


// =========================================================
// GET TEST MESSAGE
// =========================================================

app.get("/test-message", async (req, res) => {
  try {

    const result =
      await processTestMessage({
        platform:
          req.query.platform || "line",

        platformUserId:
          req.query.platformUserId ||
          "TEST_USER_001",

        displayName:
          req.query.displayName ||
          "Test User",

        message:
          req.query.message ||
          "สนใจบริการครับ",

        messageType:
          req.query.messageType ||
          "text",
      });

    res.status(200).json(result);

  } catch (error) {

    console.error(
      "TEST MESSAGE GET ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// =========================================================
// GOOGLE MAPS TEST
// =========================================================

app.get("/test-map-search", async (req, res) => {
  try {

    const query =
      req.query.q;

    if (!query) {
      return res.status(400).json({
        ok: false,
        error:
          "Missing q parameter",
      });
    }

    const results =
      await searchPlaceByText(
        query
      );

    res.status(200).json({
      ok: true,
      query,
      count:
        results.length,
      results,
    });

  } catch (error) {

    console.error(
      "TEST MAP SEARCH ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error.message,
    });
  }
});

app.get("/test-place-reviews", async (req, res) => {
  try {
    const placeId = req.query.placeId;

    if (!placeId) {
      return res.status(400).json({
        ok: false,
        error: "Missing placeId",
      });
    }

    const result =
      await getPlaceReviews(placeId);

    res.status(200).json({
      ok: true,
      result,
    });

  } catch (error) {
    console.error(
      "TEST PLACE REVIEWS ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// =========================================================
// TEST NEWEST REVIEWS
// =========================================================

app.get("/test-newest-reviews", async (req, res) => {
  try {

    const placeId =
      req.query.placeId;

    if (!placeId) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Missing placeId",
        });
    }

    const result =
      await getNewestReviews(
        placeId
      );

    const recentOneStarReviews =
  getRecentReviews(
    result.reviews.filter(
      (review) =>
        Number(review.rating) === 1
    ),
    14
  );

    res.status(200).json({
      ok: true,

      totalReturned:
        result.reviews.length,

      recentCount:
        recentOneStarReviews.length,

     recentOneStarReviews,

      reviews:
        result.reviews,
    });

  } catch (error) {

    console.error(
      "TEST NEWEST REVIEWS ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error.message,
    });
  }
});


// =========================================================
// TEST LOWEST REVIEWS
// =========================================================

app.get("/test-lowest-reviews", async (req, res) => {
  try {

    const placeId =
      req.query.placeId;

    if (!placeId) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Missing placeId",
        });
    }

    const result =
      await getLowestReviews(
        placeId
      );

    const oneStarReviews =
      getOneStarReviews(
        result.reviews
      );

    res.status(200).json({
      ok: true,

      totalReturned:
        result.reviews.length,

      oneStarCount:
        oneStarReviews.length,

      oneStarReviews,

      reviews:
        result.reviews,
    });

  } catch (error) {

    console.error(
      "TEST LOWEST REVIEWS ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error.message,
    });
  }
});

// =========================================================
// SALES QUOTE TEST
// =========================================================

app.get("/test-sales-quote", async (req, res) => {
  try {

    const platform =
      req.query.platform || "line";

    const platformUserId =
      req.query.platformUserId;

    const amount =
      Number(req.query.amount);

    if (!platformUserId) {
      return res.status(400).json({
        ok: false,
        error: "Missing platformUserId",
      });
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        ok: false,
        error: "Invalid amount",
      });
    }


    // หา customer
    const customer =
      await getCustomerByPlatformUserId(
        platform,
        platformUserId
      );

    if (!customer) {
      return res.status(404).json({
        ok: false,
        error: "Customer not found",
      });
    }


    // หา conversation
    const conversation =
      await getConversationByCustomerId(
        customer.id
      );

    if (!conversation) {
      throw new Error(
        "Conversation not found"
      );
    }


    if (
      conversation.state !==
      GMR_STATES.WAITING_PRICE
    ) {
      return res.status(400).json({
        ok: false,
        error:
          `Customer is not waiting for price. Current state: ${conversation.state}`,
      });
    }


    // หา job ล่าสุด
    const latestJob =
      await getLatestJobByCustomerId(
        customer.id
      );

    if (!latestJob) {
      throw new Error(
        "No active job found"
      );
    }


    const formattedAmount =
  amount.toLocaleString(
    customer.language === "en"
      ? "en-US"
      : "th-TH"
  );


const salesMessage =
  getCustomerText(
    customer,
    `สำหรับรีวิวดังกล่าว ราคา ${formattedAmount} บาท/รีวิว`,
    `For this review, the price is THB ${formattedAmount} per review.`
  );


    // บันทึกราคาใน Job
    await updateJob(
      latestJob.id,
      {
        price: amount,
        currency: "THB",
        status: "waiting_confirm",
      }
    );


    // สร้าง quote
    const quote =
      await createQuote({
        jobId: latestJob.id,
        amount,
        currency: "THB",
        quotedBy: "sales",
        quoteMessage: salesMessage,
        script3Sent: false,
      });


    // อ่าน Script 3
    const template =
      await getTemplate(
        "script_3_after_quote",
        customer.language || "th"
      );

    if (!template) {
      throw new Error(
        "script_3_after_quote template not found"
      );
    }


    const script3 =
      template.content;


    // Bot reply = ราคาจาก Sales + Script 3
    const botReply =
      `${salesMessage}\n\n${script3}`;


    // เปลี่ยน State
    const nextState =
      transitionState(
        conversation.state,
        GMR_STATES.WAITING_CONFIRM
      );


    await updateConversationState({
      customerId: customer.id,
      state: nextState,
      handoff: false,
      handoffReason: null,
    });


    await updateQuote(
      quote.id,
      {
        script3_sent: true,
      }
    );


    await saveMessage({
      customerId: customer.id,
      platform,
      direction: "outbound",
      messageType: "text",
      messageText: botReply,
    });


    await updateLastBotMessage(
      customer.id,
      botReply
    );


    return res.status(200).json({
      ok: true,

      customerId:
        customer.id,

      jobId:
        latestJob.id,

      quoteId:
        quote.id,

      amount,

      stateBefore:
        conversation.state,

      stateAfter:
        nextState,

      botReply,
    });

  } catch (error) {

    console.error(
      "TEST SALES QUOTE ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});


// =========================================================
// START SERVER
// =========================================================

app.get("/test-google-sheet", async (req, res) => {
  try {

    const result =
      await appendJobToGoogleSheet({
        jobId:
          "TEST_JOB_001",

        customerId:
          "TEST_CUSTOMER_001",

        customerName:
          "Test Customer",

        platform:
          "line",

        phone:
          "+66812345678",

        businessName:
          "Wraptor Thailand",

        reviewUrl:
          "https://www.google.com/maps/reviews/test",

        price:
          5000,

        status:
          "processing",

        startedAt:
          new Date().toISOString(),

        removedAt:
          "",

        paidAt:
          "",
      });

    res.status(200).json({
      ok: true,
      sheetResult: result,
    });

  } catch (error) {

    console.error(
      "TEST GOOGLE SHEET ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error.message,
    });
  }
});

async function processLineGroupPrice({
  quotedMessageId,
  text,
}) {
  if (!quotedMessageId) {
    return {
      ok: false,
      handled: false,
      reason: "NOT_A_REPLY",
    };
  }

  // รองรับ:
  // 5900
  // 5,900
  // 5900 บาท
  // 5,900 บาท
  const normalizedText =
    String(text || "")
      .trim()
      .replace(/,/g, "");

  const priceMatch =
    normalizedText.match(
      /^(\d+(?:\.\d{1,2})?)\s*(?:บาท|thb)?$/i
    );

  if (!priceMatch) {
    return {
      ok: false,
      handled: true,
      reason: "INVALID_PRICE",
    };
  }

  const amount =
    Number(priceMatch[1]);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return {
      ok: false,
      handled: true,
      reason: "INVALID_PRICE",
    };
  }


  // หา Job จากข้อความที่เซลล์กด Reply
  const job =
    await getJobByLineGroupMessageId(
      quotedMessageId
    );

  

  if (!job) {
    return {
      ok: false,
      handled: true,
      reason: "JOB_NOT_FOUND",
    };
  }


  if (
    job.status !== "waiting_price"
  ) {
    return {
      ok: false,
      handled: true,
      reason: "JOB_NOT_WAITING_PRICE",
      jobId: job.id,
    };
  }


  // หา Customer ของ Job นี้
  const customer =
    await getCustomerById(
      job.customer_id
    );

  if (!customer) {
    throw new Error(
      "Customer not found for price job"
    );
  }


  const conversation =
    await getConversationByCustomerId(
      customer.id
    );

  if (!conversation) {
    throw new Error(
      "Conversation not found for price job"
    );
  }


  if (
    conversation.state !==
    GMR_STATES.WAITING_PRICE
  ) {
    return {
      ok: false,
      handled: true,
      reason: "CUSTOMER_NOT_WAITING_PRICE",
      currentState:
        conversation.state,
    };
  }


  const formattedAmount =
  amount.toLocaleString(
    customer.language === "en"
      ? "en-US"
      : "th-TH"
  );


const salesMessage =
  getCustomerText(
    customer,
    `สำหรับรีวิวดังกล่าว ราคา ${formattedAmount} บาท/รีวิว`,
    `For this review, the price is THB ${formattedAmount} per review.`
  );

  // บันทึกราคา
  await updateJob(
    job.id,
    {
      price: amount,
      currency: "THB",
      status: "waiting_confirm",
    }
  );


  // สร้าง Quote
  const quote =
    await createQuote({
      jobId: job.id,
      amount,
      currency: "THB",
      quotedBy:
        "line_group_sales",
      quoteMessage:
        salesMessage,
      script3Sent:
        false,
    });


  // ดึง Script 3
  const template =
    await getTemplate(
      "script_3_after_quote",
      customer.language || "th"
    );

  if (!template) {
    throw new Error(
      "script_3_after_quote template not found"
    );
  }


  const botReply =
    `${salesMessage}\n\n${template.content}`;


  // WAITING_PRICE -> WAITING_CONFIRM
  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES.WAITING_CONFIRM
    );


  await updateConversationState({
    customerId:
      customer.id,
    state:
      nextState,
    handoff:
      false,
    handoffReason:
      null,
  });


  await updateQuote(
    quote.id,
    {
      script3_sent:
        true,
    }
  );


  // ส่งหาลูกค้าจริง
  await sendMessageToCustomer({
    platform:
      customer.platform,
    platformUserId:
      customer.platform_user_id,
    text:
      botReply,
  });


  // เก็บ outbound log
  await saveMessage({
    customerId:
      customer.id,
    platform:
      customer.platform,
    direction:
      "outbound",
    messageType:
      "text",
    messageText:
      botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  return {
    ok: true,
    handled: true,
    jobId:
      job.id,
    customerId:
      customer.id,
    amount,
    stateBefore:
      conversation.state,
    stateAfter:
      nextState,
  };
}

app.post("/line/webhook", async (req, res) => {
  try {
    const LINE_CHANNEL_SECRET =
      process.env.LINE_CHANNEL_SECRET;

    if (!LINE_CHANNEL_SECRET) {
      console.error(
        "Missing LINE_CHANNEL_SECRET"
      );

      return res.sendStatus(500);
    }

    // ==========================================
    // VERIFY LINE SIGNATURE
    // ==========================================

    const signature =
      req.get("x-line-signature");

    if (
      !signature ||
      !req.rawBody
    ) {
      return res.sendStatus(401);
    }

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          LINE_CHANNEL_SECRET
        )
        .update(req.rawBody)
        .digest("base64");

    const receivedBuffer =
      Buffer.from(signature);

    const expectedBuffer =
      Buffer.from(expectedSignature);

    const validSignature =
      receivedBuffer.length ===
        expectedBuffer.length &&
      crypto.timingSafeEqual(
        receivedBuffer,
        expectedBuffer
      );

    if (!validSignature) {
      console.error(
        "INVALID LINE SIGNATURE"
      );

      return res.sendStatus(401);
    }


    // LINE ต้องได้รับ 200 เร็ว
    res.sendStatus(200);


    const events =
      req.body?.events || [];


    for (const event of events) {

      // ========================================
      // GROUP MESSAGE
      // ไม่ส่งเข้าระบบลูกค้า
      // ========================================

    if (
  event.source?.type === "group"
) {
  const LINE_GROUP_ID =
    process.env.LINE_GROUP_ID;

  // รับคำสั่งเฉพาะ Group ของทีมเรา
  if (
    event.source.groupId !==
    LINE_GROUP_ID
  ) {
    continue;
  }


  // รับเฉพาะข้อความ text
  if (
    event.type !== "message" ||
    event.message?.type !== "text"
  ) {
    continue;
  }


  const groupText =
    event.message.text || "";

  const quotedMessageId =
    event.message
      ?.quotedMessageId || null;


  console.log(
    "LINE SALES GROUP PRICE:",
    {
      text:
        groupText,
      quotedMessageId,
    }
  );


  try {

    const normalizedGroupText =
  String(groupText || "")
    .trim()
    .toLowerCase();

// ========================================
// CREDIT APPROVAL
// ลูกค้าใหม่ + งาน > 3,000 บาท
// ต้อง Reply ข้อความ Credit Check เท่านั้น
// ========================================


if (
  quotedMessageId &&
  [
    "อนุมัติ",
    "ไม่อนุมัติ",
  ].includes(
    normalizedGroupText
  )
) {

  let creditJob =
    await getJobByLineGroupMessageId(
      quotedMessageId
    );


  console.log(
    "CREDIT APPROVAL LOOKUP:",
    {
      quotedMessageId,

      directJobId:
        creditJob?.id ||
        null,

      directStatus:
        creditJob?.status ||
        null,
    }
  );


  // ========================================
  // FALLBACK
  // ถ้า Reply ID จับคู่ไม่ได้
  // แต่มีงานรออนุมัติเพียง 1 งาน
  // ========================================

  if (
    !creditJob ||
    creditJob.status !==
      "waiting_credit_approval"
  ) {

    const pendingCreditJobs =
      await getPendingCreditApprovalJobs();


    console.log(
      "CREDIT APPROVAL FALLBACK:",
      {
        pendingCount:
          pendingCreditJobs.length,

        pendingJobIds:
          pendingCreditJobs.map(
            (job) =>
              job.id
          ),
      }
    );


    if (
      pendingCreditJobs.length === 1
    ) {

      creditJob =
        pendingCreditJobs[0];


      console.log(
        "CREDIT APPROVAL FALLBACK MATCHED:",
        {
          jobId:
            creditJob.id,

          customerId:
            creditJob.customer_id,
        }
      );

    } else if (
      pendingCreditJobs.length === 0
    ) {

      await replyLineTextMessage(
        event.replyToken,
        "⚠️ ไม่พบงานที่กำลังรออนุมัติเครดิตครับ"
      );

      continue;

    } else {

      await replyLineTextMessage(
        event.replyToken,
        "⚠️ ขณะนี้มีหลายงานรออนุมัติเครดิต ระบบไม่สามารถเลือกงานให้อัตโนมัติได้ กรุณาตรวจสอบก่อนครับ"
      );

      continue;
    }
  }


  const creditCustomer =
    await getCustomerById(
      creditJob.customer_id
    );

  const creditCustomer =
    await getCustomerById(
      creditJob.customer_id
    );


  if (!creditCustomer) {

    await replyLineTextMessage(
      event.replyToken,
      "❌ ไม่พบข้อมูลลูกค้าครับ"
    );

    continue;
  }


  const creditConversation =
    await getConversationByCustomerId(
      creditCustomer.id
    );


  if (!creditConversation) {

    await replyLineTextMessage(
      event.replyToken,
      "❌ ไม่พบ Conversation ของลูกค้าครับ"
    );

    continue;
  }


  // ========================================
  // ไม่อนุมัติ
  // ========================================

  if (
    normalizedGroupText ===
      "ไม่อนุมัติ"
  ) {

    await updateJob(
      creditJob.id,
      {
        status:
          "credit_rejected",
      }
    );


    await updateConversationState({
      customerId:
        creditCustomer.id,

      state:
        GMR_STATES.HANDOFF,

      handoff:
        true,

      handoffReason:
        "CREDIT_REJECTED",
    });


    await replyLineTextMessage(
      event.replyToken,
      "❌ ไม่อนุมัติเครดิต งานยังไม่ถูกเริ่ม และยังไม่ส่งเข้า Google Sheet ครับ"
    );


    continue;
  }


  // ========================================
  // อนุมัติ
  // → เริ่มงาน
  // → ลง Google Sheet
  // → แจ้งลูกค้า
  // ========================================

  const startResult =
    await startApprovedJob({
      customer:
        creditCustomer,

      conversation:
        creditConversation,

      job:
        creditJob,

      platform:
        creditCustomer.platform ||
        "line",

      phone:
        creditCustomer.phone ||
        "",
    });


  await sendMessageToCustomer({
    platform:
      creditCustomer.platform ||
      "line",

    platformUserId:
      creditCustomer.platform_user_id,

    text:
      startResult.botReply,
  });


  await replyLineTextMessage(
    event.replyToken,
    "✅ อนุมัติเครดิตแล้ว เริ่มงานและส่งเข้า Google Sheet เรียบร้อยครับ"
  );


  continue;
}

    
// ========================================
// MANUAL PAYMENT APPROVAL
// Reply ข้อความตรวจสลิป แล้วพิมพ์ ok
// ========================================

if (
  quotedMessageId &&
  [
    "ok",
    "okay",
    "ยืนยัน",
  ].includes(
    normalizedGroupText
  )
) {
  const pendingPayment =
    await getPaymentByLineGroupMessageId(
      quotedMessageId
    );

  if (pendingPayment) {

if (
  pendingPayment.payment_verified === true ||
  pendingPayment.review_status ===
    "approved"
) {
  await replyLineTextMessage(
    event.replyToken,
    "✅ สลิปนี้ถูกยืนยันไปแล้วครับ"
  );

  continue;
}
    
if (
  pendingPayment.review_status ===
  "rejected"
) {
  await replyLineTextMessage(
    event.replyToken,
    "❌ สลิปนี้ถูกปฏิเสธไปแล้ว ไม่สามารถยืนยันย้อนหลังได้ครับ"
  );

  continue;
}
    
    const paymentJob =
      await getJobById(
        pendingPayment.job_id
      );

    if (!paymentJob) {
      await replyLineTextMessage(
        event.replyToken,
        "❌ ไม่พบงานของ Payment นี้"
      );

      continue;
    }


    const paymentCustomer =
      await getCustomerById(
        paymentJob.customer_id
      );

    if (!paymentCustomer) {
      await replyLineTextMessage(
        event.replyToken,
        "❌ ไม่พบข้อมูลลูกค้าของ Payment นี้"
      );

      continue;
    }


    const verifiedAt =
      new Date().toISOString();


    await updatePayment(
      pendingPayment.id,
      {
        payment_verified:
          true,

        verified_at:
          verifiedAt,

        review_status:
          "approved",
      }
    );

if (pendingPayment.slip_file_path) {
  try {
    await deletePaymentSlip(
      pendingPayment.slip_file_path
    );
  } catch (error) {
    console.error(
      "MANUAL APPROVED SLIP DELETE FAILED:",
      error
    );
  }
}
    
    await updateJob(
      paymentJob.id,
      {
        status:
          "paid",

        paid_at:
          verifiedAt,
      }
    );

    await updateConversationState({
  customerId:
    paymentCustomer.id,

  state:
    GMR_STATES.WAITING_MAP,

  handoff:
    false,

  handoffReason:
    null,
});

    try {
      await updateJobInGoogleSheet({
        jobId:
          paymentJob.id,

        status:
          "paid",

        paidAt:
          verifiedAt,
      });
    } catch (error) {
      console.error(
        "PAYMENT SHEET UPDATE FAILED:",
        error
      );
    }


    const customerReply =
      "ขอบคุณครับ หากมีรีวิวอื่นต้องการลบ แจ้งได้เลยนะครับ";


    try {
      await sendMessageToCustomer({
        platform:
          paymentCustomer.platform,

        platformUserId:
          paymentCustomer.platform_user_id,

        text:
          customerReply,
      });
    } catch (error) {
      console.error(
        "PAYMENT CUSTOMER REPLY FAILED:",
        error
      );
    }


    await replyLineTextMessage(
      event.replyToken,
      "✅ ยืนยันสลิปเรียบร้อยแล้ว และแจ้งลูกค้าแล้วครับ"
    );


    console.log(
      "PAYMENT MANUALLY APPROVED:",
      {
        paymentId:
          pendingPayment.id,

        jobId:
          paymentJob.id,
      }
    );


    continue;
  }
}

    // ========================================
// MANUAL PAYMENT REJECTION
// Reply ข้อความตรวจสลิป แล้วพิมพ์ no
// ========================================

if (
  quotedMessageId &&
  [
    "no",
    "ไม่ผ่าน",
    "reject",
    "rejected",
  ].includes(
    normalizedGroupText
  )
) {
  const pendingPayment =
    await getPaymentByLineGroupMessageId(
      quotedMessageId
    );

  if (pendingPayment) {

    if (
  pendingPayment.payment_verified === true ||
  pendingPayment.review_status ===
    "approved"
) {
  await replyLineTextMessage(
    event.replyToken,
    "✅ สลิปนี้ถูกยืนยันไปแล้ว ไม่สามารถปฏิเสธย้อนหลังได้ครับ"
  );

  continue;
}

    if (
      pendingPayment.review_status ===
      "rejected"
    ) {
      await replyLineTextMessage(
        event.replyToken,
        "❌ สลิปนี้ถูกปฏิเสธไปแล้วครับ"
      );

      continue;
    }


    const paymentJob =
      await getJobById(
        pendingPayment.job_id
      );

    if (!paymentJob) {
      await replyLineTextMessage(
        event.replyToken,
        "❌ ไม่พบงานของ Payment นี้"
      );

      continue;
    }


    const paymentCustomer =
      await getCustomerById(
        paymentJob.customer_id
      );

    if (!paymentCustomer) {
      await replyLineTextMessage(
        event.replyToken,
        "❌ ไม่พบข้อมูลลูกค้าของ Payment นี้"
      );

      continue;
    }


    await updatePayment(
      pendingPayment.id,
      {
        payment_verified:
          false,

        verified_at:
          null,

        review_status:
          "rejected",
      }
    );

    if (pendingPayment.slip_file_path) {
  try {
    await deletePaymentSlip(
      pendingPayment.slip_file_path
    );
  } catch (error) {
    console.error(
      "MANUAL REJECTED SLIP DELETE FAILED:",
      error
    );
  }
}


    const customerReply =
      "ตรวจสอบแล้วสลิปนี้ยังไม่สามารถยืนยันการชำระได้ครับ รบกวนตรวจสอบและส่งสลิปที่ถูกต้องอีกครั้งครับ";


    try {
      await sendMessageToCustomer({
        platform:
          paymentCustomer.platform,

        platformUserId:
          paymentCustomer.platform_user_id,

        text:
          customerReply,
      });

      await saveMessage({
        customerId:
          paymentCustomer.id,

        platform:
          paymentCustomer.platform,

        direction:
          "outbound",

        messageType:
          "text",

        messageText:
          customerReply,
      });

      await updateLastBotMessage(
        paymentCustomer.id,
        customerReply
      );

    } catch (error) {
      console.error(
        "PAYMENT REJECTION CUSTOMER REPLY FAILED:",
        error
      );
    }


    await replyLineTextMessage(
      event.replyToken,
      "❌ สลิปไม่ผ่านการตรวจสอบ และแจ้งลูกค้าแล้วครับ"
    );


    console.log(
      "PAYMENT MANUALLY REJECTED:",
      {
        paymentId:
          pendingPayment.id,

        jobId:
          paymentJob.id,
      }
    );


    continue;
  }
}
    const priceResult =
      await processLineGroupPrice({
        quotedMessageId,
        text:
          groupText,
      });


    // ไม่ได้กด Reply
    if (
      priceResult.reason ===
      "NOT_A_REPLY"
    ) {
      continue;
    }


    // Reply ถูกงาน แต่พิมพ์ราคาไม่ถูก
    if (
      priceResult.reason ===
      "INVALID_PRICE"
    ) {
      await replyLineTextMessage(
        event.replyToken,
        "⚠️ กรุณาพิมพ์เฉพาะราคา เช่น 5900"
      );

      continue;
    }


    // หา Job จาก Reply นี้ไม่เจอ
    if (
      priceResult.reason ===
      "JOB_NOT_FOUND"
    ) {
      await replyLineTextMessage(
        event.replyToken,
        "⚠️ หางานนี้ไม่เจอ กรุณา Reply ข้อความ 💰 รอเสนอราคา ของงานนั้นครับ"
      );

      continue;
    }


    // งานนี้ถูกเสนอราคาไปแล้ว
    if (
      priceResult.reason ===
      "JOB_NOT_WAITING_PRICE"
    ) {
      await replyLineTextMessage(
        event.replyToken,
        "⚠️ งานนี้ไม่ได้อยู่ในสถานะรอราคาแล้วครับ"
      );

      continue;
    }


    if (
      priceResult.reason ===
      "CUSTOMER_NOT_WAITING_PRICE"
    ) {
      await replyLineTextMessage(
        event.replyToken,
        "⚠️ ลูกค้ารายนี้ไม่ได้อยู่ในขั้นตอนรอราคาแล้วครับ"
      );

      continue;
    }


    // สำเร็จ
    if (priceResult.ok) {
      await replyLineTextMessage(
        event.replyToken,
        `✅ แจ้งราคาลูกค้าแล้ว\nราคา ${priceResult.amount.toLocaleString("th-TH")} บาท/รีวิว`
      );
    }

  } catch (error) {
    console.error(
      "LINE GROUP PRICE ERROR:",
      error
    );

    try {
      await replyLineTextMessage(
        event.replyToken,
        "❌ ระบบแจ้งราคาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      );
    } catch {
      // ไม่ต้อง throw ซ้ำ
    }
  }


  continue;
}


      // ========================================
      // รับเฉพาะ USER chat
      // ========================================

      if (
        event.source?.type !== "user"
      ) {
        continue;
      }


      if (
        event.type !== "message"
      ) {
        continue;
      }


      const platformUserId =
        event.source.userId;

      let lineDisplayName =
  "LINE User";

try {
  const lineProfile =
    await getLineUserProfile(
      platformUserId
    );

  if (
    lineProfile?.displayName
  ) {
    lineDisplayName =
      lineProfile.displayName;
  }
} catch (error) {
  console.error(
    "LINE PROFILE FETCH FAILED:",
    error
  );
}

      const replyToken =
        event.replyToken;


      let messageType =
  event.message?.type || "unknown";

let message = "";

if (
  messageType === "text"
) {
  message =
    event.message.text || "";
}

 // ========================================
// FAST MAP ACK
// ลูกค้าส่ง Google Maps link
// → ตอบรับทันที ก่อนเริ่มงานหนัก
// ========================================

if (
  messageType === "text"
) {
  const detectedMapUrl =
    extractGoogleMapsUrl(
      message
    );

  if (detectedMapUrl) {

    try {
      const existingCustomer =
        await getCustomerByPlatformUserId(
          "line",
          platformUserId
        );

      const ackText =
        getCustomerText(
          existingCustomer,
          "ได้รับลิงก์แล้วครับ กำลังตรวจสอบรีวิวใน Google Map ให้อยู่ครับ",
          "I've received the link. I'm checking the reviews on Google Maps now."
        );

      await replyLineTextMessage(
        replyToken,
        ackText
      );

    } catch (error) {
      console.error(
        "FAST MAP ACK FAILED:",
        error
      );
    }
  }
}     


// ========================================
// IMAGE MESSAGE
// ดาวน์โหลดรูปจาก LINE ก่อน
// ========================================

if (
  messageType === "image"
) {
  const messageId =
    event.message?.id;

  try {
    const imageContent =
      await downloadLineMessageContent(
        messageId
      );

   console.log(
  "LINE IMAGE DOWNLOADED:",
  {
    messageId,
    contentType:
      imageContent.contentType,
    bufferLength:
      imageContent.buffer.length,
  }
);


// ========================================
// CLASSIFY IMAGE WITH AI
// ========================================

const imageClassification =
  await classifyCustomerImage({
    buffer:
      imageContent.buffer,

    contentType:
      imageContent.contentType,
  });


console.log(
  "LINE IMAGE CLASSIFICATION:",
  {
    messageId,
    classification:
      imageClassification,
  }
);

// ========================================
// REVIEW SCREENSHOT
// IMAGE REVIEW FLOW 3.3
// ========================================

if (
  imageClassification.type ===
  "REVIEW_SCREENSHOT"
) {
  const existingCustomer =
  await getCustomerByPlatformUserId(
    "line",
    platformUserId
  );


const customer =
  await getOrCreateCustomer({
    platform:
      "line",

    platformUserId,

    displayName:
      lineDisplayName,

    language:
      existingCustomer?.language ||
      "th",
  });


  const conversation =
    await getOrCreateConversation(
      customer.id
    );

const businessName =
  String(
    imageClassification.businessName ||
    ""
  ).trim();


const screenshotReviewerName =
  String(
    imageClassification.reviewerName ||
    ""
  ).trim();


const screenshotRating =
  Number(
    imageClassification.rating
  ) ||
  null;


const screenshotReviewText =
  String(
    imageClassification.reviewText ||
    ""
  ).trim();


// ========================================
// STEP 1
// หา Map ที่ลูกค้ากำลังคุยอยู่ก่อน
// ห้ามเดา Map ใหม่จากข้อความใน Screenshot
// ถ้ามี Map เดิมใน Job ให้ใช้ Map นั้นทันที
// ========================================

let mapJob =
  await getLatestJobWithMapByCustomerId(
    customer.id
  );


// ========================================
// RACE CONDITION GUARD
// ลูกค้าอาจส่งรูปต่อทันที
// ขณะที่ Map ก่อนหน้ายัง resolve ไม่เสร็จ
// ========================================

if (!mapJob) {

  for (
    let retry = 0;
    retry < 35;
    retry += 1
  ) {

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          1000
        )
    );


    mapJob =
      await getLatestJobWithMapByCustomerId(
        customer.id
      );


    if (mapJob) {
      console.log(
        "IMAGE REVIEW FOUND MAP AFTER RETRY:",
        {
          customerId:
            customer.id,

          retry:
            retry + 1,

          jobId:
            mapJob.id,

          placeId:
            mapJob.place_id,
        }
      );

      break;
    }
  }
}

let placeId =
  mapJob?.place_id ||
  null;


let mapUrl =
  mapJob?.map_url ||
  null;


let resolvedBusinessName =
  mapJob?.business_name ||
  null;


// ========================================
// ไม่มี Map เดิม
// → ค่อยใช้ businessName ที่อ่านจาก Screenshot
// ========================================

if (!placeId) {

  if (!businessName) {

    await updateConversationState({
      customerId:
        customer.id,

      state:
        GMR_STATES.WAITING_MAP,

      handoff:
        false,

      handoffReason:
        null,
    });


    const botReply =
      getCustomerText(
        customer,
        "รบกวนส่งลิงก์ Google Map ของธุรกิจมาก่อนครับ แล้วผมจะค้นหารีวิวในแมพให้",
        "Please send the Google Maps link for the business first, and I'll locate this review on the map."
      );


    await saveMessage({
      customerId:
        customer.id,

      platform:
        "line",

      direction:
        "outbound",

      messageType:
        "text",

      messageText:
        botReply,
    });


    await updateLastBotMessage(
      customer.id,
      botReply
    );


    await replyLineTextMessage(
      replyToken,
      botReply
    );


    continue;
  }


  const places =
    await searchPlaceByText(
      businessName
    );


  if (!places.length) {

    await triggerHumanAttention({
      customer,
      conversation,

      message:
        `รูปรีวิว: ${businessName}`,

      reason:
        "REVIEW_SCREENSHOT_MAP_NOT_FOUND",
    });


    continue;
  }


  const place =
    places[0];


  placeId =
    place.placeId;


  mapUrl =
    place.mapUrl;


  resolvedBusinessName =
    place.businessName ||
    businessName;
}


// ========================================
// STEP 2
// ต้องมีชื่อ Reviewer เพื่อใช้ค้น Review จริง
// ========================================

// ========================================
// STEP 2
// ต้องมีข้อมูลอย่างน้อย:
// Reviewer Name หรือ Review Text
// ========================================

if (
  !screenshotReviewerName &&
  !screenshotReviewText
) {

  const botReply =
    getCustomerText(
      customer,
      "ยังอ่านรายละเอียดรีวิวจากรูปนี้ไม่ได้ครับ รบกวนส่งรูปรีวิวอีกครั้ง หรือส่งลิงก์รีวิวมาได้เลยครับ",
      "I couldn't read enough review details from this screenshot. Please send the screenshot again or send the direct review link."
    );


  await saveMessage({
    customerId:
      customer.id,

    platform:
      "line",

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  await replyLineTextMessage(
    replyToken,
    botReply
  );


  continue;
}


// ========================================
// STEP 3
// ดึง Review จาก Map จริง
//
// newest = ช่วยหารีวิวใหม่
// lowest = ช่วยหารีวิวดาวต่ำ/เก่า
//
// รวมสองชุดแล้ว Match
// ========================================

let newestReviews = [];

let lowestReviews = [];


try {

  const newestResult =
    await getNewestReviews(
      placeId
    );


  newestReviews =
    Array.isArray(
      newestResult?.reviews
    )
      ? newestResult.reviews
      : [];

} catch (error) {

  console.error(
    "IMAGE REVIEW NEWEST LOOKUP FAILED:",
    error
  );
}


try {

  const lowestResult =
    await getLowestReviews(
      placeId
    );


  lowestReviews =
    Array.isArray(
      lowestResult?.reviews
    )
      ? lowestResult.reviews
      : [];

} catch (error) {

  console.error(
    "IMAGE REVIEW LOWEST LOOKUP FAILED:",
    error
  );
}


// ========================================
// รวม + ตัด Review ซ้ำ
// ========================================

const reviewMap =
  new Map();


for (
  const review of [
    ...newestReviews,
    ...lowestReviews,
  ]
) {

  const key =
    review.reviewId ||
    review.reviewUrl ||
    [
      review.reviewerName,
      review.rating,
      review.text,
    ].join("|");


  if (!reviewMap.has(key)) {
    reviewMap.set(
      key,
      review
    );
  }
}


const availableReviews =
  Array.from(
    reviewMap.values()
  );


// ========================================
// Normalize สำหรับ Match
// ========================================

const normalizeMatchText =
  (value) =>
    String(value || "")
      .toLowerCase()
      .replace(
        /\s+/g,
        " "
      )
      .trim();


const targetReviewer =
  normalizeMatchText(
    screenshotReviewerName
  );


const targetText =
  normalizeMatchText(
    screenshotReviewText
  );


// ========================================
// ให้คะแนนแต่ละ Review
//
// Reviewer ตรง = เงื่อนไขสำคัญที่สุด
// Rating ตรง = เพิ่มคะแนน
// Text ตรง/ใกล้เคียง = เพิ่มความมั่นใจ
// ========================================

const rankedReviews =
  availableReviews
    .map(
      (review) => {

        const reviewer =
          normalizeMatchText(
            review.reviewerName
          );


        const reviewText =
          normalizeMatchText(
            review.text
          );


        let score = 0;


        // --------------------------------
        // Reviewer
        // --------------------------------

        if (
          reviewer &&
          reviewer === targetReviewer
        ) {
          score += 100;
        } else if (
          reviewer &&
          targetReviewer &&
          (
            reviewer.includes(
              targetReviewer
            ) ||
            targetReviewer.includes(
              reviewer
            )
          )
        ) {
          score += 70;
        }


        // --------------------------------
        // Rating
        // --------------------------------

        if (
          screenshotRating &&
          Number(
            review.rating
          ) === screenshotRating
        ) {
          score += 25;
        }



// --------------------------------
// Review text
// --------------------------------

if (
  targetText &&
  reviewText
) {

  if (
    reviewText ===
    targetText
  ) {
    score += 120;

  } else if (
    reviewText.includes(
      targetText
    ) ||
    targetText.includes(
      reviewText
    )
  ) {
    score += 90;

  } else {

    const targetPrefix =
      targetText.slice(
        0,
        80
      );


    if (
      targetPrefix.length >= 20 &&
      reviewText.includes(
        targetPrefix
      )
    ) {
      score += 70;
    }
  }
}

        
        return {
          review,
          score,
        };
      }
    )
    .sort(
      (a, b) =>
        b.score -
        a.score
    );


// ========================================
// ต้อง Match reviewer อย่างน้อย
//
// score >= 70
// ป้องกันหยิบ Review คนอื่นมั่ว
// ========================================

const bestMatch =
  rankedReviews.find(
    (item) =>
      item.score >= 70 &&
      item.review?.reviewUrl
  ) ||
  null;


// ========================================
// หา Review จริงไม่เจอ
// → ไม่เดา
// → แจ้งลูกค้าให้ส่งลิงก์หรือรูปชัดขึ้น
// ========================================

if (!bestMatch) {

  console.log(
    "IMAGE REVIEW REAL REVIEW NOT FOUND:",
    {
      customerId:
        customer.id,

      placeId,

      reviewerName:
        screenshotReviewerName,

      rating:
        screenshotRating,

      newestCount:
        newestReviews.length,

      lowestCount:
        lowestReviews.length,
    }
  );


  const botReply =
    getCustomerText(
      customer,
      `ยังหารีวิวของ ${screenshotReviewerName} บน Google Map นี้ไม่เจอครับ\n\nรบกวนส่งลิงก์รีวิวโดยตรง หรือส่งรูปที่เห็นชื่อและข้อความรีวิวชัดขึ้นได้เลยครับ`,
      `I couldn't locate the review from ${screenshotReviewerName} on this Google Maps listing.\n\nPlease send the direct review link or a clearer screenshot showing the reviewer name and review text.`
    );


  await saveMessage({
    customerId:
      customer.id,

    platform:
      "line",

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  await replyLineTextMessage(
    replyToken,
    botReply
  );


  continue;
}


const matchedReview =
  bestMatch.review;


// ========================================
// STEP 4
// ใช้ Job เดิมถ้ามี Map อยู่แล้ว
// ไม่สร้าง Job ซ้ำโดยไม่จำเป็น
// ========================================

let job;


if (mapJob) {

  job =
    await updateJob(
      mapJob.id,
      {
        review_url:
          matchedReview.reviewUrl,

        review_case:
          "image_review_pending",

        review_visible:
          true,

        review_has_text:
          Boolean(
            matchedReview.text
          ),

        status:
          "draft",
      }
    );

} else {

  job =
    await createJob({
      customerId:
        customer.id,

      businessName:
        resolvedBusinessName ||
        businessName,

      placeId,

      mapUrl,

      reviewUrl:
        matchedReview.reviewUrl,

      reviewCase:
        "image_review_pending",

      reviewVisible:
        true,

      reviewHasText:
        Boolean(
          matchedReview.text
        ),

      status:
        "draft",
    });
}


// ========================================
// STEP 5
// บันทึก Review จริง
// ไม่ใช้ reviewUrl = null แล้ว
// ========================================

await saveReviewCandidate({
  customerId:
    customer.id,

  jobId:
    job.id,

  businessName:
    resolvedBusinessName ||
    businessName,

  placeId,

  mapUrl,

  reviewerName:
    matchedReview.reviewerName ||
    screenshotReviewerName,

  rating:
    Number(
      matchedReview.rating
    ) ||
    screenshotRating,

  reviewText:
    matchedReview.text ||
    screenshotReviewText ||
    null,

  reviewDate:
    matchedReview.isoDate ||
    null,

  reviewUrl:
    matchedReview.reviewUrl,

  providerReviewId:
    matchedReview.reviewId ||
    null,

  isRecent:
    (
      getReviewAgeDays(
        matchedReview
      ) !== null &&
      getReviewAgeDays(
        matchedReview
      ) <= 14
    ),

  isVisible:
    true,

  hasText:
    Boolean(
      matchedReview.text ||
      screenshotReviewText
    ),
});

// ========================================
// STEP 6
// พบ Review จริงจาก Screenshot แล้ว
// → ไม่ต้องถามลูกค้ายืนยันซ้ำ
// → ส่งเข้ากลุ่มเพื่อให้ Sales ตั้งราคาเลย
// ========================================

const nextState =
  GMR_STATES.WAITING_PRICE;


await updateConversationState({
  customerId:
    customer.id,

  state:
    nextState,

  handoff:
    false,

  handoffReason:
    null,
});


const updatedJob =
  await updateJob(
    job.id,
    {
      review_url:
        matchedReview.reviewUrl,

      review_case:
        "image_review",

      review_visible:
        true,

      review_has_text:
        Boolean(
          matchedReview.text ||
          screenshotReviewText
        ),

      status:
        "waiting_price",
    }
  );


// ========================================
// ส่งงานเข้ากลุ่มเพื่อเช็คราคา
// ========================================

try {

  const lineGroupResult =
    await sendJobToLineGroup({
      jobId:
        updatedJob.id,

      jobType:
        "image_review",

      customerName:
        customer.display_name ||
        "",

      businessName:
        updatedJob.business_name ||
        resolvedBusinessName ||
        businessName ||
        "",

      reviewerName:
        matchedReview.reviewerName ||
        screenshotReviewerName ||
        "",

      reviewAgeDays:
        getReviewAgeDays(
          matchedReview
        ),

      reviewText:
        matchedReview.text ||
        screenshotReviewText ||
        "",

      reviewUrl:
        matchedReview.reviewUrl ||
        "",

      mapUrl:
        updatedJob.map_url ||
        mapUrl ||
        "",
    });


  if (
    lineGroupResult?.messageId
  ) {

    await updateJob(
      updatedJob.id,
      {
        line_group_message_id:
          lineGroupResult.messageId,
      }
    );
  }

} catch (error) {

  console.error(
    "IMAGE REVIEW PRICE REQUEST FAILED:",
    error
  );
}


// ========================================
// แจ้งลูกค้าว่ากำลังเช็คราคา
// ========================================

const botReply =
  getCustomerText(
    customer,
    "รับข้อมูลรีวิวเรียบร้อยครับ เดี๋ยวทางเราตรวจสอบและแจ้งราคาให้ครับ",
    "We've received the review. We'll check it and send you the price shortly."
  );


await saveMessage({
  customerId:
    customer.id,

  platform:
    "line",

  direction:
    "outbound",

  messageType:
    "text",

  messageText:
    botReply,
});


await updateLastBotMessage(
  customer.id,
  botReply
);


await replyLineTextMessage(
  replyToken,
  botReply
);


console.log(
  "IMAGE REVIEW REAL REVIEW MATCHED:",
  {
    customerId:
      customer.id,

    jobId:
      job.id,

    placeId,

    businessName:
      resolvedBusinessName ||
      businessName,

    screenshotReviewerName,

    matchedReviewerName:
      matchedReview.reviewerName,

    rating:
      matchedReview.rating,

    score:
      bestMatch.score,

    reviewUrl:
      matchedReview.reviewUrl,
  }
);


continue;
}


// ========================================
// PAYMENT SLIP
// ========================================

if (
  imageClassification.type ===
  "PAYMENT_SLIP"
) {
  const customer =
    await getCustomerByPlatformUserId(
      "line",
      platformUserId
    );

  if (!customer) {
    console.log(
      "PAYMENT SLIP - CUSTOMER NOT FOUND"
    );

    continue;
  }

  const latestJob =
    await getLatestJobByCustomerId(
      customer.id
    );

  if (!latestJob) {
    console.log(
      "PAYMENT SLIP - NO JOB FOUND",
      {
        customerId:
          customer.id,
      }
    );

    continue;
  }

let paymentSlipUpload =
  null;

if (
  imageClassification.type ===
  "PAYMENT_SLIP"
) {
  try {
    paymentSlipUpload =
      await uploadPaymentSlip({
        buffer:
          imageContent.buffer,

        contentType:
          imageContent.contentType,

        customerId:
          customer.id,

        jobId:
          latestJob.id,

        messageId,
      });

    console.log(
      "PAYMENT SLIP UPLOADED:",
      {
        jobId:
          latestJob.id,

        filePath:
          paymentSlipUpload.filePath,
      }
    );
  } catch (error) {
    console.error(
      "PAYMENT SLIP UPLOAD FAILED:",
      error
    );
  }
}
  
  const paymentVerification =
  verifyPaymentSlip({
    classification:
      imageClassification,

    expectedAmount:
      latestJob.price,

    minimumTransactionDate:
      latestJob.removed_at || null,
  });

  const transactionReference =
  imageClassification.reference
    ? String(
        imageClassification.reference
      ).trim()
    : null;

let referenceAlreadyUsed = false;

if (transactionReference) {
  referenceAlreadyUsed =
    await isPaymentReferenceUsed(
      transactionReference
    );
}

  // -----------------------------------------
// DUPLICATE PAYMENT SLIP
// แจ้งลูกค้าทันที และหยุด flow
// -----------------------------------------

if (referenceAlreadyUsed) {
  const duplicateSlipReply =
    "ตรวจพบว่าสลิปนี้เคยถูกใช้ยืนยันการชำระแล้วครับ รบกวนส่งสลิปรายการใหม่อีกครั้งครับ";

  try {
    await sendMessageToCustomer({
      platform:
        customer.platform,

      platformUserId:
        customer.platform_user_id,

      text:
        duplicateSlipReply,
    });

    await saveMessage({
      customerId:
        customer.id,

      platform:
        customer.platform,

      direction:
        "outbound",

      messageType:
        "text",

      messageText:
        duplicateSlipReply,
    });

    await updateLastBotMessage(
      customer.id,
      duplicateSlipReply
    );

  } catch (error) {
    console.error(
      "DUPLICATE SLIP CUSTOMER REPLY FAILED:",
      error
    );
  }

  console.log(
    "DUPLICATE PAYMENT SLIP REJECTED:",
    {
      customerId:
        customer.id,

      jobId:
        latestJob.id,

      transactionReference,
    }
  );

  continue;
}

  // -----------------------------------------
// CUSTOMER-CORRECTABLE PAYMENT ERRORS
// วันที่เก่า / ชื่อผู้รับไม่ตรง
// แจ้งลูกค้าทันที และไม่ส่งเข้ากลุ่ม
// -----------------------------------------

const verificationReasons =
  Array.isArray(
    paymentVerification.reasons
  )
    ? paymentVerification.reasons
    : [];

const recipientNameMismatch =
  verificationReasons.includes(
    "RECIPIENT_NAME_MISMATCH"
  );

const paymentDateTooOld =
  verificationReasons.includes(
    "PAYMENT_DATE_TOO_OLD"
  );


if (
  recipientNameMismatch ||
  paymentDateTooOld
) {
  let invalidSlipReply = "";

  if (
    recipientNameMismatch &&
    paymentDateTooOld
  ) {
    invalidSlipReply =
      "ตรวจสอบแล้วข้อมูลผู้รับเงินและวันที่ทำรายการในสลิปไม่ตรงกับงานนี้ครับ รบกวนตรวจสอบและส่งสลิปที่ถูกต้องอีกครั้งครับ";
  } else if (
    recipientNameMismatch
  ) {
    invalidSlipReply =
      "ข้อมูลผู้รับเงินในสลิปไม่ตรงกับบัญชีที่กำหนดครับ รบกวนตรวจสอบและส่งสลิปที่ถูกต้องอีกครั้งครับ";
  } else {
    invalidSlipReply =
      "วันที่ทำรายการในสลิปไม่ตรงกับรอบงานนี้ครับ รบกวนตรวจสอบและส่งสลิปที่ชำระสำหรับงานนี้อีกครั้งครับ";
  }


  try {
    await sendMessageToCustomer({
      platform:
        customer.platform,

      platformUserId:
        customer.platform_user_id,

      text:
        invalidSlipReply,
    });

    await saveMessage({
      customerId:
        customer.id,

      platform:
        customer.platform,

      direction:
        "outbound",

      messageType:
        "text",

      messageText:
        invalidSlipReply,
    });

    await updateLastBotMessage(
      customer.id,
      invalidSlipReply
    );

  } catch (error) {
    console.error(
      "INVALID SLIP CUSTOMER REPLY FAILED:",
      error
    );
  }


  console.log(
    "PAYMENT SLIP REJECTED BEFORE REVIEW:",
    {
      customerId:
        customer.id,

      jobId:
        latestJob.id,

      reasons:
        verificationReasons,
    }
  );

  continue;
}

// -----------------------------------------
// REFERENCE CHECK
// -----------------------------------------

if (!transactionReference) {
  paymentVerification.verified = false;
  paymentVerification.status =
    "NEEDS_REVIEW";

  paymentVerification.reasons.push(
    "PAYMENT_REFERENCE_MISSING"
  );

  paymentVerification.checks.referenceUnique =
    false;
} else {
  paymentVerification.checks.referenceUnique =
    true;
}

  // -----------------------------------------
// SAVE VERIFIED PAYMENT
// -----------------------------------------

const paymentAllowed =
  [
    "waiting_payment",
    "removed_waiting_payment",
  ].includes(
    latestJob.status
  );

if (!paymentAllowed) {
  paymentVerification.verified = false;
  paymentVerification.status =
    "NEEDS_REVIEW";

  if (
    !paymentVerification.reasons.includes(
      "JOB_NOT_WAITING_PAYMENT"
    )
  ) {
    paymentVerification.reasons.push(
      "JOB_NOT_WAITING_PAYMENT"
    );
  }

  paymentVerification.checks.jobWaitingPayment =
    false;
} else {
  paymentVerification.checks.jobWaitingPayment =
    true;
}


if (paymentVerification.verified) {
  const verifiedAt =
    new Date().toISOString();

  const payment =
    await createPayment({
      jobId:
        latestJob.id,

      amount:
        latestJob.price,

      paymentMethod:
        process.env.PAYMENT_RECIPIENT_TYPE ||
        "KTC_BILLER",

      slipReceived:
        true,

      slipUrl:
        null,

      paymentVerified:
        true,

      verifiedAt,

      transactionReference:
        transactionReference,

      transactionDate:
        imageClassification.transactionDate ||
        null,

      transactionTime:
        imageClassification.transactionTime ||
        null,

      recipientName:
        imageClassification.recipientName ||
        imageClassification.recipientBankOrBiller ||
        null,

      recipientBillerId:
        imageClassification.recipientBillerId ||
        null,

      recipientCardLast4:
        imageClassification.recipientCardLast4 ||
        null,
    });


  
await updateJob(
  latestJob.id,
  {
    status:
      "paid",

    paid_at:
      verifiedAt,
  }
);


try {
  await updateJobInGoogleSheet({
    jobId:
      latestJob.id,

    status:
      "paid",

    paidAt:
      verifiedAt,
  });
} catch (error) {
  console.error(
    "AUTO PAYMENT SHEET UPDATE FAILED:",
    error
  );
}


const customerReply =
  "ขอบคุณครับ ได้รับชำระเรียบร้อยแล้วครับ หากมีรีวิวอื่นต้องการลบ แจ้งได้เลยนะครับ";


try {
  await sendMessageToCustomer({
    platform:
      customer.platform,

    platformUserId:
      customer.platform_user_id,

    text:
      customerReply,
  });

  await saveMessage({
    customerId:
      customer.id,

    platform:
      customer.platform,

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      customerReply,
  });

  await updateLastBotMessage(
    customer.id,
    customerReply
  );

} catch (error) {
  console.error(
    "AUTO PAYMENT CUSTOMER REPLY FAILED:",
    error
  );
}


// งานนี้จบแล้ว
// เตรียมรับงานใหม่จากลูกค้าคนเดิมได้ทันที
await updateConversationState({
  customerId:
    customer.id,

  state:
    GMR_STATES.WAITING_MAP,

  handoff:
    false,

  handoffReason:
    null,
});

if (paymentSlipUpload?.filePath) {
  try {
    await deletePaymentSlip(
      paymentSlipUpload.filePath
    );
  } catch (error) {
    console.error(
      "AUTO PAYMENT SLIP DELETE FAILED:",
      error
    );
  }
}
  
  console.log(
    "PAYMENT SAVED:",
    {
      paymentId:
        payment.id,

      jobId:
        latestJob.id,

      verified:
        true,
    }
  );
}

if (
  !paymentVerification.verified &&
  paymentVerification.status ===
    "NEEDS_REVIEW"
) {
  const pendingPayment =
    await createPendingPayment({
      jobId:
        latestJob.id,

      amount:
        imageClassification.amount ||
        latestJob.price ||
        0,

      paymentMethod:
        process.env.PAYMENT_RECIPIENT_TYPE ||
        "KTC_BILLER",

      transactionReference:
        transactionReference,

      transactionDate:
        imageClassification.transactionDate ||
        null,

      transactionTime:
        imageClassification.transactionTime ||
        null,

      recipientName:
        imageClassification.recipientName ||
        imageClassification.recipientBankOrBiller ||
        null,

      recipientBillerId:
        imageClassification.recipientBillerId ||
        null,

      recipientCardLast4:
        imageClassification.recipientCardLast4 ||
        null,

      verificationReasons:
        paymentVerification.reasons ||
        [],

      slipFilePath:
  paymentSlipUpload?.filePath ||
  null,
    });

const lineGroupResult =
  await sendPaymentReviewToLineGroup({
    paymentId:
      pendingPayment.id,

    jobId:
      latestJob.id,

    slipImageUrl:
  paymentSlipUpload?.signedUrl ||
  null,

customerName:
  lineDisplayName ||
  customer.display_name ||
  "",

    businessName:
      latestJob.business_name ||
      "",

    amount:
      imageClassification.amount ||
      latestJob.price ||
      0,

    transactionDate:
      imageClassification.transactionDate ||
      null,

    transactionTime:
      imageClassification.transactionTime ||
      null,

    recipientName:
      imageClassification.recipientName ||
      imageClassification.recipientBankOrBiller ||
      null,

    recipientCardLast4:
      imageClassification.recipientCardLast4 ||
      null,

    reasons:
      paymentVerification.reasons ||
      [],
  });


if (
  lineGroupResult?.messageId
) {
  await updatePayment(
    pendingPayment.id,
    {
      line_group_message_id:
        lineGroupResult.messageId,
    }
  );
}
  
  console.log(
    "PAYMENT NEEDS REVIEW:",
    {
      paymentId:
        pendingPayment.id,

      jobId:
        latestJob.id,
    }
  );
}
  
  console.log(
    "PAYMENT VERIFICATION:",
    {
      customerId:
        customer.id,

      jobId:
        latestJob.id,

      result:
        paymentVerification,
    }
  );
}


// ตอนนี้ยังไม่เปลี่ยน state / ไม่บันทึก payment
continue;
  } catch (error) {
    console.error(
      "LINE IMAGE DOWNLOAD FAILED:",
      error
    );

    continue;
  }
}

      // ========================================
      // ส่งเข้า State Machine เดิม
      // ========================================

     const result =
  await processTestMessage({
    platform: "line",

    platformUserId,

    displayName:
      lineDisplayName,

    message,

    messageType,
  });

      console.log(
        "LINE FLOW RESULT:",
        result
      );


      // ========================================
      // ตอบลูกค้าถ้ามี botReply
      // ========================================

     if (
  result?.botReply
) {
  try {

    await sendMessageToCustomer({
      platform:
        "line",

      platformUserId,

      text:
        result.botReply,
    });

  } catch (error) {

    console.error(
      "LINE PUSH RESULT FAILED:",
      error
    );
  }
}
    }

  } catch (error) {
    console.error(
      "LINE WEBHOOK ERROR:",
      error
    );

    // ถ้ายังไม่ได้ส่ง response
    if (!res.headersSent) {
      return res.sendStatus(500);
    }
  }
});

app.get("/test-line-group", async (req, res) => {
  try {
    await sendJobToLineGroup({
      jobId: "TEST_JOB_LINE_001",
      customerName: "Test Customer",
      platform: "line",
      phone: "+66812345678",
      businessName: "Wraptor Thailand",
      reviewUrl: "https://www.google.com/maps/reviews/test",
      price: 5000,
    });

    res.status(200).json({
      ok: true,
      message: "LINE group notification sent",
    });

  } catch (error) {
    console.error(
      "TEST LINE GROUP ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get("/test-mark-removed", async (req, res) => {
  try {
    const platform =
      req.query.platform || "line";

    const platformUserId =
      req.query.platformUserId;

    if (!platformUserId) {
      return res.status(400).json({
        ok: false,
        error: "Missing platformUserId",
      });
    }

    const customer =
      await getCustomerByPlatformUserId(
        platform,
        platformUserId
      );

    if (!customer) {
      return res.status(404).json({
        ok: false,
        error: "Customer not found",
      });
    }

    const conversation =
      await getConversationByCustomerId(
        customer.id
      );

    if (!conversation) {
      throw new Error(
        "Conversation not found"
      );
    }

    const latestJob =
      await getLatestJobByCustomerId(
        customer.id
      );

    if (!latestJob) {
      throw new Error(
        "No active job found"
      );
    }

    const removedAt =
      new Date().toISOString();

    const updatedJob =
      await updateJob(
        latestJob.id,
        {
          status: "removed",
          removed_at: removedAt,
        }
      );

    const template =
      await getTemplate(
        "removed_payment",
        customer.language || "th"
      );

    if (!template) {
      throw new Error(
        "removed_payment template not found"
      );
    }

    const botReply =
      template.content;

    const nextState =
      transitionState(
        conversation.state,
        GMR_STATES.REMOVED_WAITING_PAYMENT
      );

    await updateConversationState({
      customerId: customer.id,
      state: nextState,
      handoff: false,
      handoffReason: null,
    });

    await updateJob(
      latestJob.id,
      {
        status: "waiting_payment",
      }
    );

    try {
  await updateJobInGoogleSheet({
    jobId: latestJob.id,
    status: "waiting_payment",
    removedAt,
    paidAt: "",
  });
} catch (error) {
  console.error(
    "GOOGLE SHEET UPDATE FAILED:",
    error
  );
}

try {
  await sendMessageToCustomer({
    platform,
    platformUserId,
    text: botReply,
  });
} catch (error) {
  console.error(
    "CUSTOMER NOTIFY FAILED:",
    error
  );
}
    
    await saveMessage({
      customerId: customer.id,
      platform,
      direction: "outbound",
      messageType: "text",
      messageText: botReply,
    });

    await updateLastBotMessage(
      customer.id,
      botReply
    );

    return res.status(200).json({
      ok: true,
      customerId: customer.id,
      jobId: updatedJob.id,
      stateBefore: conversation.state,
      stateAfter: nextState,
      removedAt,
      botReply,
    });

  } catch (error) {
    console.error(
      "TEST MARK REMOVED ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get("/test-google-sheet-update", async (req, res) => {
  try {
    const result =
      await updateJobInGoogleSheet({
        jobId:
          "3db297f6-9fb1-4d2f-941e-8e56181e929f",

        status:
          "waiting_payment",

        removedAt:
          new Date().toISOString(),

        paidAt:
          "",
      });

    return res.status(200).json({
      ok: true,
      result,
    });

  } catch (error) {
    console.error(
      "TEST GOOGLE SHEET UPDATE ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `GMR Auto Chat running on port ${PORT}`
  );
});
