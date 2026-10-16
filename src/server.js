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
  sendMessageToCustomer as sendMessageToCustomerBase,
  replyLineTextMessage,
  downloadLineMessageContent,
  getLineUserProfile,
  getFacebookUserProfile,
} from "./services/customerMessagingService.js";


import {
  appendJobToGoogleSheet,
  appendDispatchJobToGoogleSheet,
  updateJobInGoogleSheet,
} from "./services/googleSheetsService.js";


// =========================================================
// CUSTOMER OUTBOUND ROUTER — V2.2.8
// Facebook customers arrive through ManyChat, so their stored
// platform_user_id is the ManyChat subscriber_id. Asynchronous
// replies (Sales starts work, payment, reactivation, etc.) must
// therefore go back through ManyChat Content API instead of
// requiring a Facebook Page Access Token.
// LINE continues to use the existing customerMessagingService.
// =========================================================

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithNetworkRetry(url, options = {}, {
  attempts = 3,
  timeoutMs = 15000,
  label = "HTTP",
} = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, {
          ...options,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      lastError = error;
      console.error(`${label} NETWORK ERROR`, {
        attempt,
        attempts,
        code: error?.code || error?.cause?.code || null,
        message: error?.message || String(error),
      });

      if (attempt < attempts) {
        await sleepMs(500 * attempt);
      }
    }
  }

  throw lastError || new Error(`${label} request failed`);
}

function getManychatApiTokenForPlatform(platform) {
  const normalized = String(platform || "").trim().toLowerCase();

  if (normalized === "facebook_en") {
    return String(
      process.env.MANYCHAT_API_TOKEN_EN ||
      process.env.MANYCHAT_API_TOKEN ||
      ""
    ).trim();
  }

  if (normalized === "facebook_th") {
    return String(
      process.env.MANYCHAT_API_TOKEN_TH ||
      process.env.MANYCHAT_API_TOKEN ||
      ""
    ).trim();
  }

  return "";
}

async function sendManychatFacebookText({ platform, platformUserId, text }) {
  const token = getManychatApiTokenForPlatform(platform);
  const subscriberId = String(platformUserId || "").trim();
  const safeText = String(text || "").trim();

  if (!token) {
    throw new Error(
      `Missing ManyChat API Token for ${platform}. Configure MANYCHAT_API_TOKEN (or MANYCHAT_API_TOKEN_TH / MANYCHAT_API_TOKEN_EN).`
    );
  }

  if (!subscriberId) throw new Error("Missing ManyChat subscriber_id");
  if (!safeText) throw new Error("Missing customer message text");

  const response = await fetchWithNetworkRetry(
    "https://api.manychat.com/fb/sending/sendContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        // Keep as string. ManyChat subscriber IDs can exceed JS safe integer range.
        subscriber_id: subscriberId,
        data: {
          version: "v2",
          content: {
            messages: [
              {
                type: "text",
                text: safeText,
              },
            ],
          },
        },
      }),
    },
    {
      attempts: 3,
      timeoutMs: 15000,
      label: "MANYCHAT CUSTOMER SEND",
    }
  );

  const responseText = await response.text();
  let data = {};
  try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = {}; }

  console.log("MANYCHAT CUSTOMER SEND RESPONSE:", {
    platform,
    subscriberId,
    httpStatus: response.status,
    ok: response.ok,
    manychatStatus: data?.status || null,
  });

  if (!response.ok || data?.status === "error") {
    throw new Error(
      `ManyChat customer send failed ${response.status}: ${responseText}`
    );
  }

  return {
    ok: true,
    transport: "manychat",
    platform,
    subscriberId,
  };
}

async function sendMessageToCustomer({ platform, platformUserId, text, ...rest }) {
  const normalized = String(platform || "").trim().toLowerCase();

  if (normalized === "facebook_th" || normalized === "facebook_en") {
    const manychatToken = getManychatApiTokenForPlatform(normalized);

    if (manychatToken) {
      return sendManychatFacebookText({
        platform: normalized,
        platformUserId,
        text,
      });
    }

    // Backward-compatible fallback for installations that intentionally
    // send directly through Meta Graph API and already have Page tokens.
    console.warn("MANYCHAT TOKEN MISSING — FALLING BACK TO FACEBOOK DIRECT TRANSPORT", {
      platform: normalized,
    });
  }

  return sendMessageToCustomerBase({
    platform,
    platformUserId,
    text,
    ...rest,
  });
}

// Internal team notifications are routed through Telegram in V2.2.
// Keep the legacy LINE group service untouched in the repository; this server no longer imports it.

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
  getJobByCustomerAndReviewUrl,
    getLatestJobByCustomerId,
  hasPaymentByCustomerId,
  getPaidPricingHistoryByCustomerId,
  isPaymentReferenceUsed,
createPayment,
getLatestJobWithMapByCustomerId,
  getJobByLineGroupMessageId,
getPendingCreditApprovalJobs,
getWaitingCreditApprovalJobsByCustomerId,
updateJob,
  saveReviewCandidate,
  getReviewCandidatesByJobId,
  getReviewsByJobId,
  selectReviewCandidate,
  createQuote,
  updateQuote,
  updateCustomerPhone,
  updateCustomerLanguage,
  lockCustomerLanguageToThai,
getActiveFaqs,
registerFaqHit,
getBotControl,
setBotControl,
  createPendingPayment,
getPaymentByLineGroupMessageId,
  getJobById,
updatePayment,
  getJobsForReviewMonitoring,
getPendingPriceJobs,
getWaitingPaymentJobsByCustomerId,
getExistingCustomerOpenBatchJobs,
getDepartmentForReviewAge,

getActiveDepartments,
claimDepartmentDispatch,
completeDepartmentDispatch,
markDispatchStuckAlerted,

createLegacyCustomerFromSheet,
getPendingLegacyCustomersByDisplayName,
setLegacyCustomerPendingMatch,
getLegacyCustomerByLineGroupMessageId,
rejectLegacyCustomerMatch,
markLegacyCustomerMatched,
claimLegacyCustomerImport,
claimLegacyCustomerAutoMatch,
rollbackLegacyCustomerImport,
rollbackLegacyCustomerAutoMatch,
  getLegacyImportedJob,
getVerifiedPaymentByJobId,
backfillExistingCustomerMaps,
getCustomerMapsWaitingForResolve,
updateResolvedCustomerMap,
  
getCustomerMapsDueForReactivationCheck,
markCustomerMapChecked,
findExistingCustomerReview,
findExistingReactivationAlert,
createReactivationAlert,
setReactivationAlertLineGroupMessage,
getReactivationAlertByLineGroupMessageId,
setReactivationAlertTeamDecision,
claimWebhookEvent,
claimUnknownSalesQuestion,
setUnknownSalesQuestionLineMessage,
getUnknownSalesQuestionByLineGroupMessageId,
getPendingReactivationAlertByCustomerId,
updateReactivationAlertCustomerResponse,
getCustomerMapById,
findCustomerByPhoneOrEmail,
findCustomersByPlatformAndDisplayName,
createManualCustomer,
updateCustomerEditableFields,
updateJobEditableFields,
logSheetSyncChange,
upsertCustomerMapRecord,
updateCustomerTransportMetadata,

getMonthlyOutreachCandidates,
claimMonthlyOutreach,
completeMonthlyOutreach,

getSalesLeadByCustomerId,
getOrCreateSalesLead,
updateSalesLead,
createSalesLeadCard,
getSalesLeadCardByLineGroupMessageId,
createSalesOrderDraft,
setSalesOrderDraftPreviewMessage,
getSalesOrderDraftByPreviewMessageId,
updateSalesOrderDraft,

getOrCreateLegacyMonitoringCustomer,
findLegacyMonitoringCustomersByPlatformAndDisplayName,
attachLegacyMonitoringCustomer,
upsertRemovalKpiBatch,
getJobsByRemovalDetectionBatchId,
claimRemovalKpiBatch,
completeRemovalKpiBatch,
releaseRemovalKpiBatch,
  
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

// =========================================================
// CUSTOMER TYPE
//
// NEW_CUSTOMER
// = ยังไม่เคยมีประวัติชำระเงินสำเร็จ
//
// EXISTING_CUSTOMER
// = เคยชำระเงินสำเร็จแล้วอย่างน้อย 1 ครั้ง
//
// หมายเหตุ:
// ห้ามใช้แค่ว่าเคยมี customer record หรือเคยคุยมาก่อน
// ต้องอิง payment history เท่านั้น
// =========================================================

async function getCustomerType(
  customerId
) {
  if (!customerId) {
    throw new Error(
      "Missing customerId in getCustomerType"
    );
  }

  const hasPaymentHistory =
    await hasPaymentByCustomerId(
      customerId
    );

  return hasPaymentHistory
    ? "EXISTING_CUSTOMER"
    : "NEW_CUSTOMER";
}

// =========================================================
// EXISTING CUSTOMER AUTO PRICE
//
// NEW REVIEW = อายุ 1-14 วัน
// OLD REVIEW = มากกว่า 14 วัน
//
// ใช้ราคาล่าสุดที่ลูกค้าคนนี้เคยชำระจริง
// ของแต่ละประเภท
// =========================================================

async function getExistingCustomerRates(
  customerId
) {
  if (!customerId) {
    throw new Error(
      "Missing customerId in getExistingCustomerRates"
    );
  }

  const history =
    await getPaidPricingHistoryByCustomerId(
      customerId
    );


  let newReviewRate = null;
  let oldReviewRate = null;

  let newReviewCurrency = null;
  let oldReviewCurrency = null;


  // history ถูกเรียงล่าสุด -> เก่าสุดแล้ว
  // เพราะฉะนั้นเจอครั้งแรก = ราคาล่าสุด
  for (
    const item of history
  ) {
    if (
      item.isRecent === true &&
      newReviewRate === null
    ) {
      newReviewRate =
        Number(item.price);

      newReviewCurrency =
        item.currency ||
        null;
    }


    if (
      item.isRecent === false &&
      oldReviewRate === null
    ) {
      oldReviewRate =
        Number(item.price);

      oldReviewCurrency =
        item.currency ||
        null;
    }


    if (
      newReviewRate !== null &&
      oldReviewRate !== null
    ) {
      break;
    }
  }


  return {
    newReviewRate,
    newReviewCurrency,

    oldReviewRate,
    oldReviewCurrency,

    hasNewReviewRate:
      Number.isFinite(
        newReviewRate
      ) &&
      newReviewRate > 0,

    hasOldReviewRate:
      Number.isFinite(
        oldReviewRate
      ) &&
      oldReviewRate > 0,

    historyCount:
      history.length,
  };
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

// =========================================================
// PAYMENT / PRICE HELPERS
// =========================================================

function getCurrencyFromUnitPrice({
  price,
  currency = null,
}) {
  const unitPrice =
    Number(price || 0);

  const savedCurrency =
    String(
      currency || ""
    )
      .trim()
      .toUpperCase();

  if (
    [
      "THB",
      "USD",
    ].includes(
      savedCurrency
    )
  ) {
    return savedCurrency;
  }

  return (
    unitPrice >= 2500
      ? "THB"
      : "USD"
  );
}

// =========================================================
// STRIPE DYNAMIC CHECKOUT
//
// สร้าง Checkout Session ตามยอดจริง
// เช่น:
// $250  -> 25000 cents
// $500  -> 50000 cents
// =========================================================

async function createStripeCheckoutSession({
  amount,
  currency = "USD",
  customerId = null,
  jobIds = [],
  customerName = null,
}) {
  const stripeSecretKey =
    String(
      process.env.STRIPE_SECRET_KEY || ""
    ).trim();

  if (!stripeSecretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured"
    );
  }

  const safeAmount =
    Number(amount || 0);

  if (
    !Number.isFinite(safeAmount) ||
    safeAmount <= 0
  ) {
    throw new Error(
      "Invalid Stripe checkout amount"
    );
  }

  const safeCurrency =
    String(currency || "USD")
      .trim()
      .toLowerCase();

  const unitAmount =
    Math.round(
      safeAmount * 100
    );


  const body =
    new URLSearchParams();

  body.set(
    "mode",
    "payment"
  );

  body.set(
    "line_items[0][price_data][currency]",
    safeCurrency
  );

  body.set(
    "line_items[0][price_data][unit_amount]",
    String(unitAmount)
  );

  body.set(
    "line_items[0][price_data][product_data][name]",
    "Google Review Service"
  );

  body.set(
    "line_items[0][quantity]",
    "1"
  );

  body.set(
    "success_url",
    "https://gmr-auto-chat.onrender.com/stripe/success?session_id={CHECKOUT_SESSION_ID}"
  );

  body.set(
    "cancel_url",
    "https://gmr-auto-chat.onrender.com/stripe/cancel"
  );


  if (customerId) {
    body.set(
      "metadata[customer_id]",
      String(customerId)
    );
  }


  if (
    Array.isArray(jobIds) &&
    jobIds.length > 0
  ) {
    body.set(
      "metadata[job_ids]",
      jobIds.join(",")
    );
  }


  if (customerName) {
    body.set(
      "metadata[customer_name]",
      String(customerName)
    );
  }


  const response =
    await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${stripeSecretKey}`,

          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          body.toString(),
      }
    );


  const data =
    await response.json();


  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Stripe checkout creation failed"
    );
  }


  if (!data?.url) {
    throw new Error(
      "Stripe checkout URL missing"
    );
  }


  return {
    id:
      data.id,

    url:
      data.url,

    paymentStatus:
      data.payment_status ||
      null,
  };
}


function formatMoney(
  amount,
  currency
) {
  const number =
    Number(amount || 0);

  return number.toLocaleString(
    currency === "USD"
      ? "en-US"
      : "th-TH",
    {
      maximumFractionDigits:
        2,
    }
  );
}


function buildPaymentBreakdown({
  jobs,
  currency,
  language = "th",
}) {

  const sameCurrencyJobs =
    (jobs || [])
      .filter(
        (job) =>
          getCurrencyFromUnitPrice({
            price:
              job.price,

            currency:
              job.currency,
          }) === currency
      );


  // ==========================================
  // รวมงานราคาเดียวกัน
  //
  // เช่น
  // 5,500 x 2
  // 9,900 x 1
  // ==========================================

  const grouped =
    new Map();


  for (
    const job of
      sameCurrencyJobs
  ) {

    const price =
      Number(
        job.price || 0
      );


    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      continue;
    }


    const key =
      String(price);


    if (
      !grouped.has(key)
    ) {

      grouped.set(
        key,
        {
          price,
          count:
            0,
        }
      );
    }


    grouped.get(
      key
    ).count += 1;
  }


  const groups =
    Array.from(
      grouped.values()
    );


  const total =
    groups.reduce(
      (
        sum,
        item
      ) =>
        sum +
        (
          item.price *
          item.count
        ),
      0
    );


  const totalReviews =
    groups.reduce(
      (
        sum,
        item
      ) =>
        sum +
        item.count,
      0
    );


  const lines =
    groups.map(
      (item) => {

        const priceText =
          formatMoney(
            item.price,
            currency
          );


        const lineTotal =
          formatMoney(
            item.price *
              item.count,
            currency
          );


       if (
  currency ===
  "THB"
) {
  if (language === "en") {
    return (
      `• ${priceText} THB/review` +
      ` × ${item.count}` +
      ` = ${lineTotal} THB`
    );
  }

  return (
    `• ${priceText} บาท/รีวิว` +
    ` × ${item.count}` +
    ` = ${lineTotal} บาท`
  );
}

        if (language === "th") {
  return (
    `• $${priceText} USD/รีวิว` +
    ` × ${item.count}` +
    ` = $${lineTotal} USD`
  );
}

return (
  `• $${priceText} USD/review` +
  ` × ${item.count}` +
  ` = $${lineTotal} USD`
);
      }
    );


  return {
    jobs:
      sameCurrencyJobs,

    groups,

    total,

    totalReviews,

    lines,
  };
}

function unwrapFacebookRedirectUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return raw;

  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || "").toLowerCase();
    const isFacebookRedirect =
      (host === "l.facebook.com" || host === "lm.facebook.com") &&
      parsed.pathname === "/l.php";

    if (!isFacebookRedirect) return raw;

    const target = parsed.searchParams.get("u");
    if (!target) return raw;

    let decoded = target;
    try {
      decoded = decodeURIComponent(target);
    } catch (_) {
      // URLSearchParams already decodes normal cases.
    }

    return String(decoded || target).trim();
  } catch (_) {
    return raw;
  }
}

function normalizeInboundUrlText(value) {
  const text = String(value || "");
  if (!text) return text;

  return text.replace(/https?:\/\/[^\s]+/gi, (candidate) => {
    const cleaned = candidate.replace(/[),.;]+$/g, "");
    const suffix = candidate.slice(cleaned.length);
    const unwrapped = unwrapFacebookRedirectUrl(cleaned);
    return `${unwrapped}${suffix}`;
  });
}

function extractGoogleMapsUrl(
  message
) {
  const text =
    normalizeInboundUrlText(message);

  const match =
    text.match(
      /https?:\/\/(?:www\.)?(?:maps\.google\.com|google\.[^\s/]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)\/?[^\s]*/i
    );

  return match
    ? match[0]
    : null;
}

async function resolveGoogleShortUrl(
  url
) {
  const inputUrl =
    String(url || "").trim();

  if (!inputUrl) {
    return null;
  }

  try {
    const response =
      await fetch(
        inputUrl,
        {
          method:
            "GET",

          redirect:
            "follow",

          headers: {
            "User-Agent":
              "Mozilla/5.0",
          },
        }
      );


    const resolvedUrl =
      String(
        response.url ||
        ""
      ).trim();


    if (resolvedUrl) {
      console.log(
        "GOOGLE SHORT URL HTTP RESOLVED:",
        {
          originalUrl:
            inputUrl,

          resolvedUrl,
        }
      );

      return resolvedUrl;
    }


    return inputUrl;

  } catch (error) {
    console.error(
      "GOOGLE SHORT URL HTTP RESOLVE FAILED:",
      {
        originalUrl:
          inputUrl,

        error:
          error.message,
      }
    );

    return null;
  }
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



// =========================================================
// MANUAL ASSIGNED WORK
// LINE sales group command: /manual
// Creates/uses a customer, creates one job per review URL,
// writes JOBS_MASTER, and NEVER messages the customer.
// =========================================================
function parseManualAssignedWorkText(text) {
  const raw = String(text || "").trim();
  const lines = raw.split(/\r?\n/);

  const parsed = {
    customerName: null,
    phone: null,
    email: null,
    businessName: null,
    price: null,
    currency: "THB",
    workType: null,
    reviewUrls: [],
  };

  const valueAfterColon = (line) => {
    const index = line.indexOf(":");
    return index >= 0 ? line.slice(index + 1).trim() : "";
  };

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line || /^\/manual\b/i.test(line)) continue;

    if (/^(customer|customer\s*name|name|ลูกค้า|ชื่อลูกค้า)\s*:/i.test(line)) {
      parsed.customerName = valueAfterColon(line) || null;
      continue;
    }
    if (/^(phone|tel|telephone|เบอร์|เบอร์โทร|โทร)\s*:/i.test(line)) {
      parsed.phone = valueAfterColon(line) || null;
      continue;
    }
    if (/^(email|e-mail|อีเมล)\s*:/i.test(line)) {
      parsed.email = valueAfterColon(line).toLowerCase() || null;
      continue;
    }
    if (/^(business|business\s*name|map|ร้าน|ชื่อร้าน|ธุรกิจ)\s*:/i.test(line)) {
      parsed.businessName = valueAfterColon(line) || null;
      continue;
    }
    if (/^(price|ราคา)\s*:/i.test(line)) {
      const priceText = valueAfterColon(line).replace(/,/g, "");
      const price = Number(priceText);
      parsed.price = Number.isFinite(price) ? price : null;
      continue;
    }
    if (/^(currency|สกุล|สกุลเงิน)\s*:/i.test(line)) {
      const currency = valueAfterColon(line).toUpperCase();
      parsed.currency = currency || "THB";
      continue;
    }
    if (/^(type|department|ประเภท|แผนก)\s*:/i.test(line)) {
      const rawType = valueAfterColon(line).trim().toUpperCase();
      if (rawType === "T0" || rawType === "T2") {
        parsed.workType = rawType;
      }
      continue;
    }
  }

  const urls = raw.match(/https?:\/\/[^\s]+/gi) || [];
  parsed.reviewUrls = [...new Set(
    urls
      .map((url) => url.replace(/[),.;]+$/g, "").trim())
      .filter(Boolean)
  )];

  if (parsed.reviewUrls.length === 0) {
    throw new Error("MANUAL_WORK_NO_REVIEW_URL");
  }

  if (!Number.isFinite(parsed.price) || parsed.price <= 0) {
    throw new Error("MANUAL_WORK_INVALID_PRICE");
  }

  if (!/^[A-Z]{3}$/.test(parsed.currency)) {
    parsed.currency = "THB";
  }

  return parsed;
}

async function createManualAssignedWorkFromGroupText(groupText) {
  const parsed = parseManualAssignedWorkText(groupText);

  let customer = await findCustomerByPhoneOrEmail({
    phone: parsed.phone,
    email: parsed.email,
  });

  if (!customer) {
    customer = await createManualCustomer({
      platformUserId: `manual:${crypto.randomUUID()}`,
      displayName: parsed.customerName,
      phone: parsed.phone,
      email: parsed.email,
      language: parsed.currency === "USD" ? "en" : "th",
      platformAccount: "manual_internal",
    });
  } else if (parsed.customerName || parsed.phone || parsed.email) {
    customer = await updateCustomerEditableFields({
      customerId: customer.id,
      ...(parsed.customerName ? { displayName: parsed.customerName } : {}),
      ...(parsed.phone ? { phone: parsed.phone } : {}),
      ...(parsed.email ? { email: parsed.email } : {}),
    });
  }

  const createdJobs = [];

  for (const originalUrl of parsed.reviewUrls) {
    let canonicalReviewUrl = originalUrl;
    let directResult = null;
    let review = null;
    let businessName = parsed.businessName || null;
    let reviewAgeDays = null;
    let departmentId = null;

    if (parsed.workType) {
      const explicitDepartment =
        await getDepartmentForReviewAge(
          parsed.workType === "T0" ? 0 : 15
        );

      departmentId =
        explicitDepartment?.id || null;
    }

    try {
      const resolved = await resolveGoogleShortUrl(originalUrl);
      if (resolved) canonicalReviewUrl = resolved;
    } catch (error) {
      console.error("MANUAL URL RESOLVE FAILED:", {
        originalUrl,
        error: error.message,
      });
    }

    try {
      directResult = await getReviewFromDirectUrl(canonicalReviewUrl);
      if (directResult?.found && directResult?.review) {
        review = directResult.review;
        canonicalReviewUrl = review.reviewUrl || canonicalReviewUrl;
        businessName = directResult.businessName || businessName;
        reviewAgeDays = getReviewAgeDays(review);

        const detectedType =
          reviewAgeDays !== null &&
          reviewAgeDays !== undefined
            ? (reviewAgeDays <= 14 ? "T0" : "T2")
            : null;

        if (
          parsed.workType &&
          detectedType &&
          parsed.workType !== detectedType
        ) {
          throw new Error(
            `MANUAL_WORK_TYPE_MISMATCH:${parsed.workType}:${detectedType}`
          );
        }

        if (!parsed.workType) {
          const department =
            await getDepartmentForReviewAge(reviewAgeDays);
          departmentId = department?.id || null;
        }
      }
    } catch (error) {
      console.error("MANUAL REVIEW LOOKUP FAILED:", {
        reviewUrl: canonicalReviewUrl,
        error: error.message,
      });
    }

    const duplicate =
      (await getJobByCustomerAndReviewUrl(customer.id, canonicalReviewUrl)) ||
      (canonicalReviewUrl !== originalUrl
        ? await getJobByCustomerAndReviewUrl(customer.id, originalUrl)
        : null);

    if (duplicate) {
      createdJobs.push({
        jobId: duplicate.id,
        reviewUrl: duplicate.review_url || canonicalReviewUrl,
        status: duplicate.status,
        duplicate: true,
      });
      continue;
    }

    if (!departmentId) {
      throw new Error(
        "MANUAL_WORK_TYPE_REQUIRED"
      );
    }

    const now = new Date().toISOString();

    let job = await createJob({
      customerId: customer.id,
      businessName,
      reviewUrl: canonicalReviewUrl,
      reviewCase: "direct_review",
      reviewVisible: review ? true : null,
      reviewHasText: review
        ? Boolean(String(review.reviewText || review.text || "").trim())
        : null,
      departmentId,
      status: departmentId ? "queued" : "processing",
    });

    job = await updateJob(job.id, {
      price: parsed.price,
      currency: parsed.currency,
      source: "manual",
      customer_notify: false,
      updated_at: now,
      ...(departmentId ? { queued_at: now } : { started_at: now }),
    });

    try {
      await upsertCustomerMapRecord({
        customerId: customer.id,
        businessName,
        sourceReviewUrl: canonicalReviewUrl,
      });
    } catch (error) {
      console.error("MANUAL CUSTOMER MAP UPSERT FAILED:", {
        customerId: customer.id,
        reviewUrl: canonicalReviewUrl,
        error: error.message,
      });
    }

    await appendJobToGoogleSheet({
      jobId: job.id,
      customerId: customer.id,
      customerName: customer.display_name || "",
      platform: "manual",
      phone: customer.phone || "",
      businessName: businessName || "",
      reviewUrl: canonicalReviewUrl,
      price: parsed.price,
      status: job.status,
      startedAt: job.started_at || job.queued_at || now,
      removedAt: "",
      paidAt: "",
      email: customer.email || "",
      currency: parsed.currency,
      source: "manual",
      customerNotify: false,
    });

    createdJobs.push({
      jobId: job.id,
      reviewUrl: canonicalReviewUrl,
      status: job.status,
      duplicate: false,
    });
  }

  return {
    customer,
    parsed,
    createdJobs,
  };
}


async function findExistingJobForSubmittedReviewUrl(customerId, rawUrl) {
  const originalUrl = String(rawUrl || "").trim();
  if (!customerId || !originalUrl) return { job: null, originalUrl, resolvedUrl: null };

  let resolvedUrl = null;
  try {
    resolvedUrl = await resolveGoogleShortUrl(originalUrl);
  } catch (error) {
    console.error("EXISTING REVIEW URL RESOLVE FAILED:", {
      customerId,
      originalUrl,
      error: error.message,
    });
  }

  const candidates = [...new Set([originalUrl, resolvedUrl].filter(Boolean))];

  for (const candidateUrl of candidates) {
    const job = await getJobByCustomerAndReviewUrl(customerId, candidateUrl);
    if (job) return { job, originalUrl, resolvedUrl: resolvedUrl || candidateUrl };
  }

  try {
    const directResult = await getReviewFromDirectUrlRobust(originalUrl);
    const canonicalUrl = directResult?.review?.reviewUrl || directResult?.lookupUrl || null;

    if (canonicalUrl) {
      const job = await getJobByCustomerAndReviewUrl(customerId, canonicalUrl);
      if (job) return { job, originalUrl, resolvedUrl: canonicalUrl };
    }
  } catch (error) {
    console.log("EXISTING REVIEW CANONICAL LOOKUP SKIPPED:", {
      customerId,
      originalUrl,
      error: error.message,
    });
  }

  return { job: null, originalUrl, resolvedUrl };
}

function getExistingJobCustomerReply(customer, job) {
  const status = String(job?.status || "").trim().toLowerCase();

  if (status === "waiting_payment" || status === "removed_waiting_payment") {
    return getCustomerText(
      customer,
      "รีวิวนี้ดำเนินการสำเร็จแล้ว และอยู่ระหว่างรอชำระค่าบริการครับ",
      "This review has already been completed and is awaiting payment."
    );
  }

  if (status === "paid") {
    return getCustomerText(
      customer,
      "รีวิวนี้ดำเนินการและชำระเรียบร้อยแล้วครับ",
      "This review has already been completed and paid."
    );
  }

  if (Number(job?.review_missing_count || 0) >= 1) {
    return getCustomerText(
      customer,
      "รีวิวนี้อยู่ระหว่างตรวจสอบผลโดยทีมงานครับ ไม่ต้องส่งลิงก์ซ้ำครับ",
      "This review is currently being verified by our team. You do not need to resend the link."
    );
  }

  return getCustomerText(
    customer,
    "รีวิวนี้อยู่ระหว่างดำเนินการแล้วครับ ไม่ต้องส่งลิงก์ซ้ำครับ",
    "This review is already being processed. You do not need to resend the link."
  );
}

async function sendRemovalConfirmationToLineGroup({
  job,
  customer,
  reviewUrl,
  reason = null,
  detectedAt = null,
}) {
  const currency = String(job?.currency || "THB").toUpperCase();
  const price = Number(job?.price || 0);
  const priceText = price > 0
    ? (currency === "THB"
        ? `${price.toLocaleString("th-TH")} บาท`
        : `$${price.toLocaleString("en-US")} ${currency}`)
    : "-";

  const text = [
    "🔎 รีวิวออกแล้ว — รอยืนยัน",
    "",
    `Customer: ${customer?.display_name || "-"}`,
    `Business: ${job?.business_name || "-"}`,
    `ราคา: ${priceText}`,
    "",
    "เปิดรีวิว:",
    reviewUrl || "-",
    "",
    "กด Reply ข้อความนี้ แล้วพิมพ์",
    '✅ "อนุมัติ" = รีวิวออกแล้ว',
    '❌ "ยังอยู่" = รีวิวยังแสดงอยู่',
  ].join("\n");

  const pushed = await pushTelegramSales(text);
  return { ok: true, messageId: pushed.messageId };
}

// =========================================================
// REVIEW REMOVED KPI → INTERNAL LINE GROUP ONLY
// Durable batch aggregation by ONE review-monitor run.
// A KPI message is sent only after every detected job in the
// same run has been resolved by staff (removed / still visible).
// =========================================================

async function getRemovalKpiWorkType(job, departmentCodeById = null) {
  const jobDepartmentId = String(
    job?.department_id || job?.departmentId || ""
  );

  if (departmentCodeById && jobDepartmentId) {
    const code = String(
      departmentCodeById.get(jobDepartmentId) || ""
    )
      .trim()
      .toUpperCase();

    if (code === "T0" || code === "T2") {
      return code;
    }
  }

  try {
    const reviews = await getReviewsByJobId(job.id);
    const review = Array.isArray(reviews) ? reviews[0] : null;

    if (review?.is_recent === true) return "T0";
    if (review?.is_recent === false) return "T2";
  } catch (error) {
    console.error("KPI REVIEW TYPE LOOKUP FAILED:", {
      jobId: job?.id || null,
      error: error?.message || String(error),
    });
  }

  return null;
}

function formatBangkokDateTime(value) {
  const date = new Date(value || new Date().toISOString());
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const getPart = (type) =>
    parts.find((part) => part.type === type)?.value || "";

  return {
    thaiDate: `${getPart("day")}/${getPart("month")}/${getPart("year")}`,
    thaiTime: `${getPart("hour")}:${getPart("minute")}`,
  };
}

async function tryFinalizeRemovalKpiBatch(batchId) {
  const safeBatchId = String(batchId || "").trim();
  if (!safeBatchId) {
    return {
      ok: true,
      skipped: true,
      reason: "NO_BATCH_ID",
    };
  }

  const jobs = await getJobsByRemovalDetectionBatchId(safeBatchId);

  // If every detected review was marked visible, there is no KPI to send.
  if (!Array.isArray(jobs) || jobs.length === 0) {
    const claimedEmpty = await claimRemovalKpiBatch(safeBatchId);
    if (claimedEmpty) {
      await completeRemovalKpiBatch({
        batchId: safeBatchId,
        t0Count: 0,
        t2Count: 0,
        totalCount: 0,
        status: "skipped",
      });
    }

    return {
      ok: true,
      skipped: true,
      reason: "NO_CONFIRMED_REMOVALS",
    };
  }

  const pendingHumanConfirmation = jobs.filter(
    (item) =>
      String(item?.status || "").toLowerCase() === "processing" &&
      Number(item?.review_missing_count || 0) >= 1
  );

  if (pendingHumanConfirmation.length > 0) {
    return {
      ok: true,
      skipped: true,
      reason: "WAITING_FOR_OTHER_CONFIRMATIONS",
      pendingCount: pendingHumanConfirmation.length,
    };
  }

  const removedJobs = jobs.filter((item) => {
    const status = String(item?.status || "").toLowerCase();
    return Boolean(item?.removed_at) || ["waiting_payment", "paid"].includes(status);
  });

  if (removedJobs.length === 0) {
    const claimedEmpty = await claimRemovalKpiBatch(safeBatchId);
    if (claimedEmpty) {
      await completeRemovalKpiBatch({
        batchId: safeBatchId,
        t0Count: 0,
        t2Count: 0,
        totalCount: 0,
        status: "skipped",
      });
    }

    return {
      ok: true,
      skipped: true,
      reason: "NO_CONFIRMED_REMOVALS",
    };
  }

  // Atomic claim prevents duplicate KPI messages when two staff confirmations
  // arrive almost simultaneously or Render receives a retry.
  const claim = await claimRemovalKpiBatch(safeBatchId);
  if (!claim) {
    return {
      ok: true,
      skipped: true,
      reason: "BATCH_ALREADY_CLAIMED_OR_SENT",
    };
  }

  try {
    const departments = await getActiveDepartments();
    const departmentCodeById = new Map(
      (departments || []).map((department) => [
        String(department?.id || ""),
        String(department?.code || "").trim().toUpperCase(),
      ])
    );

    let t0Count = 0;
    let t2Count = 0;
    let unknownCount = 0;

    for (const removedJob of removedJobs) {
      const workType = await getRemovalKpiWorkType(
        removedJob,
        departmentCodeById
      );

      if (workType === "T0") t0Count += 1;
      else if (workType === "T2") t2Count += 1;
      else unknownCount += 1;
    }

    const eventTime =
      claim?.detected_at ||
      removedJobs
        .map((item) => item?.review_removed_detected_at)
        .filter(Boolean)
        .sort()[0] ||
      new Date().toISOString();

    const { thaiDate, thaiTime } = formatBangkokDateTime(eventTime);
    const totalCount = removedJobs.length;

    const lines = [
      "✅ REVIEW REMOVED — KPI",
      "",
      `วันที่: ${thaiDate}`,
      `เวลา: ${thaiTime} น.`,
      "",
      `T0: ${t0Count} รีวิว`,
      `T2: ${t2Count} รีวิว`,
      "",
      `รอบนี้สำเร็จทั้งหมด: ${totalCount} รีวิว`,
    ];

    if (unknownCount > 0) {
      lines.push(
        "",
        `⚠️ ไม่สามารถระบุ T0/T2 ได้ ${unknownCount} รีวิว กรุณาตรวจสอบก่อนจ่าย KPI`
      );
    }

    const pushed = await pushTelegramSales(lines.join("\n"));
    const lineMessageId = pushed.messageId;

    await completeRemovalKpiBatch({
      batchId: safeBatchId,
      t0Count,
      t2Count,
      totalCount,
      lineMessageId,
      status: "sent",
    });

    for (const removedJob of removedJobs) {
      try {
        await updateJob(removedJob.id, {
          removal_kpi_notified_at: new Date().toISOString(),
        });
      } catch (markError) {
        console.error("KPI JOB MARK SENT FAILED:", {
          jobId: removedJob.id,
          batchId: safeBatchId,
          error: markError?.message || String(markError),
        });
      }
    }

    return {
      ok: true,
      sent: true,
      batchId: safeBatchId,
      t0Count,
      t2Count,
      totalCount,
      unknownCount,
    };
  } catch (error) {
    try {
      await releaseRemovalKpiBatch(safeBatchId);
    } catch (releaseError) {
      console.error("KPI BATCH RELEASE FAILED:", {
        batchId: safeBatchId,
        error: releaseError?.message || String(releaseError),
      });
    }

    throw error;
  }
}

async function callSheetControlInternally({ jobId, value }) {
  const secret = process.env.SHEET_CONTROL_SECRET;

  if (!secret) throw new Error("Missing SHEET_CONTROL_SECRET");

  const response = await fetch(
    `http://127.0.0.1:${PORT}/sheet-control`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        jobId,
        action: "manual_action",
        value,
      }),
    }
  );

  const responseText = await response.text();
  let data = {};

  try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = {}; }

  if (!response.ok || data?.ok !== true) {
    throw new Error(
      data?.error || `Internal sheet-control failed ${response.status}: ${responseText}`
    );
  }

  return data;
}


// =========================================================
// TELEGRAM INTERNAL TEAM TRANSPORT — V2.2
// Customer-facing LINE/Facebook remains unchanged.
// Internal Sales / T0 / T2 notifications use Telegram.
// Existing DB column names such as line_group_message_id are retained
// for backward compatibility; they may contain a Telegram message_id.
// =========================================================

function getTelegramInternalConfig() {
  return {
    token: String(process.env.TELEGRAM_BOT_TOKEN || "").trim(),
    salesChatId: String(process.env.TELEGRAM_SALES_CHAT_ID || "").trim(),
    t0ChatId: String(process.env.TELEGRAM_T0_CHAT_ID || "").trim(),
    t2ChatId: String(process.env.TELEGRAM_T2_CHAT_ID || "").trim(),
  };
}

function getTelegramDepartmentChatId(departmentCode) {
  const cfg = getTelegramInternalConfig();
  const code = String(departmentCode || "").trim().toUpperCase();
  if (code === "T0") return cfg.t0ChatId;
  if (code === "T2") return cfg.t2ChatId;
  return "";
}

async function sendTelegramText({ chatId, text, replyToMessageId = null }) {
  const { token } = getTelegramInternalConfig();
  const safeChatId = String(chatId || "").trim();
  const safeText = String(text || "");

  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  if (!safeChatId) throw new Error("Missing Telegram chat id");
  if (!safeText.trim()) throw new Error("Missing Telegram message text");

  const body = {
    chat_id: safeChatId,
    text: safeText.slice(0, 4096),
    disable_web_page_preview: true,
  };

  if (replyToMessageId !== null && replyToMessageId !== undefined) {
    body.reply_parameters = {
      message_id: Number(replyToMessageId),
      allow_sending_without_reply: true,
    };
  }

  const response = await fetchWithNetworkRetry(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    {
      attempts: 3,
      timeoutMs: 12000,
      label: "TELEGRAM SEND",
    }
  );

  const responseText = await response.text();
  let data = {};
  try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = {}; }

  if (!response.ok || data?.ok !== true) {
    throw new Error(
      `TELEGRAM SEND FAILED ${response.status}: ${responseText}`
    );
  }

  const messageId = data?.result?.message_id;
  if (messageId === null || messageId === undefined) {
    throw new Error("Telegram send succeeded but message_id missing");
  }

  return {
    ok: true,
    messageId: String(messageId),
    chatId: safeChatId,
    text: safeText,
  };
}

async function pushTelegramSales(text) {
  const { salesChatId } = getTelegramInternalConfig();
  if (!salesChatId) throw new Error("Missing TELEGRAM_SALES_CHAT_ID");
  return sendTelegramText({ chatId: salesChatId, text });
}

async function replyTelegramInternal(chatId, incomingMessageId, text) {
  return sendTelegramText({
    chatId,
    text,
    replyToMessageId: incomingMessageId,
  });
}

// Compatibility wrappers for old call sites that previously used lineGroupService.
async function sendJobToLineGroup({
  jobId,
  jobType,
  customerName,
  businessName,
  reviewerName,
  reviewAgeDays,
  reviewText,
  reviewUrl,
  mapUrl,
  price,
}) {
  const lines = [
    "💰 งานรอ Sales ตรวจ/เสนอราคา",
    "",
    `Job: ${jobId || "-"}`,
    `Type: ${jobType || "-"}`,
    `Customer: ${customerName || "-"}`,
    `Business: ${businessName || "-"}`,
  ];

  if (reviewerName) lines.push(`Reviewer: ${reviewerName}`);
  if (reviewAgeDays !== null && reviewAgeDays !== undefined) {
    lines.push(`Review age: ${reviewAgeDays} วัน`);
  }
  if (price) lines.push(`Price: ${price}`);
  if (reviewText) lines.push("", `Review: ${reviewText}`);
  if (reviewUrl) lines.push("", "Review URL:", reviewUrl);
  if (mapUrl) lines.push("", "Map URL:", mapUrl);
  lines.push("", "Reply ข้อความนี้เพื่อดำเนินการต่อ");

  return pushTelegramSales(lines.join("\n"));
}

async function sendPaymentReviewToLineGroup({
  paymentId,
  jobId,
  slipImageUrl,
  customerName,
  businessName,
  amount,
  transactionDate,
  transactionTime,
  recipientName,
  recipientCardLast4,
  reasons = [],
}) {
  const lines = [
    "💳 PAYMENT — รอตรวจสลิป",
    "",
    `Payment: ${paymentId || "-"}`,
    `Job: ${jobId || "-"}`,
    `Customer: ${customerName || "-"}`,
    `Business: ${businessName || "-"}`,
    `Amount: ${amount || "-"}`,
    `Date: ${transactionDate || "-"}`,
    `Time: ${transactionTime || "-"}`,
    `Recipient: ${recipientName || "-"}`,
    `Card last4: ${recipientCardLast4 || "-"}`,
  ];
  if (Array.isArray(reasons) && reasons.length) {
    lines.push("", "เหตุผลที่ต้องตรวจ:", ...reasons.map((r, i) => `${i + 1}. ${r}`));
  }
  if (slipImageUrl) lines.push("", "Slip:", slipImageUrl);
  lines.push("", "Reply: ยืนยัน / no");
  return pushTelegramSales(lines.join("\n"));
}

async function registerTelegramWebhook() {
  const { token } = getTelegramInternalConfig();
  if (!token) {
    console.log("TELEGRAM WEBHOOK SKIPPED: TELEGRAM_BOT_TOKEN missing");
    return { ok: false, skipped: true, reason: "NO_TOKEN" };
  }

  const configuredBase = String(process.env.TELEGRAM_WEBHOOK_BASE_URL || "").trim();
  const renderBase = String(process.env.RENDER_EXTERNAL_URL || "").trim();
  const baseUrl = (
    configuredBase ||
    renderBase ||
    "https://gmr-auto-chat.onrender.com"
  ).replace(/\/$/, "");

  const webhookUrl = `${baseUrl}/telegram/webhook`;
  const response = await fetchWithNetworkRetry(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
        drop_pending_updates: false,
      }),
    },
    {
      attempts: 3,
      timeoutMs: 12000,
      label: "TELEGRAM SET WEBHOOK",
    }
  );

  const responseText = await response.text();
  let data = {};
  try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = {}; }
  if (!response.ok || data?.ok !== true) {
    throw new Error(`TELEGRAM SET WEBHOOK FAILED ${response.status}: ${responseText}`);
  }

  console.log("TELEGRAM WEBHOOK READY:", webhookUrl);
  return { ok: true, webhookUrl };
}

const app = express();
const PORT = process.env.PORT || 10000;


// ========================================
// ลูกค้าที่กำลังตรวจ Google Map
// ข้อความใหม่ระหว่างนี้จะถูก ignore
// ========================================

const mapProcessingUsers =
  new Set();
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

  if (
    platform === "facebook" ||
    platform.startsWith("facebook:")
  ) {
    return "Facebook";
  }

  return (
    customer?.platform ||
    "ไม่ทราบช่องทาง"
  );
}

// =========================================================
// DEPARTMENT DISPATCH → LINE GROUP
// =========================================================

async function sendDepartmentDispatchToLineGroup({
  department,
  jobs,
  dispatchedAt,
}) {
  if (!department?.id) throw new Error("Missing department in sendDepartmentDispatchToLineGroup");
  if (!Array.isArray(jobs) || jobs.length === 0) {
    throw new Error("No jobs supplied to sendDepartmentDispatchToLineGroup");
  }

  const chatId = getTelegramDepartmentChatId(department.code);
  if (!chatId) {
    throw new Error(`Missing Telegram chat id for department ${department.code || department.id}`);
  }

  const sentAt = dispatchedAt || new Date().toISOString();
  const reviewLines = jobs.map((job, index) => `${index + 1}. ${job.review_url}`);
  const thaiTime = (() => {
    const date = new Date(sentAt);
    if (Number.isNaN(date.getTime())) return sentAt;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
  })();

  const text = [
    `📦 รอบแจกงาน ${department.code || "-"}`,
    "",
    `แผนก: ${department.name || department.code || "-"}`,
    `จำนวน: ${jobs.length} รีวิว`,
    `เวลา: ${thaiTime}`,
    "",
    "รายการ:",
    ...reviewLines,
  ].join("\n");

  await sendTelegramText({ chatId, text });
  console.log("DEPARTMENT DISPATCH TELEGRAM SENT:", {
    departmentId: department.id,
    departmentCode: department.code,
    chatId,
    jobCount: jobs.length,
    dispatchedAt: sentAt,
  });

  return { sent: true, text, dispatchedAt: sentAt };
}

async function sendDispatchStuckAlertToMainGroup({
  department,
  dispatchRoundId,
  sendingStartedAt,
  stuckMinutes,
}) {
  const text = [
    "⚠️ พบงาน Dispatch ค้าง",
    "",
    `แผนก: ${department?.code || "-"}`,
    `ชื่อแผนก: ${department?.name || "-"}`,
    `Dispatch Round: ${dispatchRoundId || "-"}`,
    `เริ่มค้างตั้งแต่: ${sendingStartedAt || "-"}`,
    `ค้างประมาณ: ${Math.floor(Number(stuckMinutes || 0))} นาที`,
    "",
    "ระบบจะไม่ส่งงานชุดนี้ซ้ำอัตโนมัติ",
    "กรุณาตรวจสอบ Telegram กลุ่มแผนกและสถานะงานก่อนดำเนินการต่อ",
  ].join("\n");

  try {
    await pushTelegramSales(text);
    return { sent: true };
  } catch (error) {
    console.error("DISPATCH STUCK ALERT TELEGRAM FAILED:", error);
    return { sent: false, error: error.message };
  }
}

// =========================================================
// RUN DEPARTMENT DISPATCH
//
// queued
// → แยกตาม Department
// → เช็กว่าถึงรอบหรือยัง
// → ส่งรายการเข้า LINE Group
// → สร้าง Dispatch Round
// → processing
// =========================================================

let departmentDispatchRunning =
  false;

async function runDepartmentDispatch() {
  if (departmentDispatchRunning) {
    console.log(
      "DEPARTMENT DISPATCH SKIPPED: already running"
    );

    return {
      ok: true,
      skipped: true,
      reason: "already_running",
    };
  }


  departmentDispatchRunning =
    true;


  try {
    const dispatchedAt =
      new Date().toISOString();


    const departments =
      await getActiveDepartments();


    const results = [];


    for (
      const department of
      departments
    ) {
      try {
        // ========================================
        // 1. ต้องมี LINE Group
        // ========================================

        if (
          !String(
            department.line_group_id ||
            ""
          ).trim()
        ) {
          results.push({
            departmentCode:
              department.code,

            dispatched:
              false,

            reason:
              "missing_line_group_id",
          });

          continue;
        }


        // ========================================
        // 2. Atomic Claim
        //
        // queued
        // → dispatching
        // + สร้าง round status=sending
        // ========================================

        const claimResult =
          await claimDepartmentDispatch({
            departmentId:
              department.id,

            claimedAt:
              dispatchedAt,
          });


        if (
          claimResult?.ok !== true
        ) {
          throw new Error(
            `Dispatch claim failed: ${
              claimResult?.reason ||
              "unknown"
            }`
          );
        }


      if (
  claimResult?.claimed !== true
) {
  const reason =
    claimResult?.reason ||
    "not_claimed";


  if (
    reason ===
      "dispatch_already_sending" &&
    claimResult
      ?.sending_started_at
  ) {
    const sendingStartedAt =
      new Date(
        claimResult
          .sending_started_at
      );


    const stuckMinutes =
      (
        Date.now() -
        sendingStartedAt
          .getTime()
      ) /
      (
        60 *
        1000
      );


    if (
  Number.isFinite(
    stuckMinutes
  ) &&
  stuckMinutes >= 15 &&
  !claimResult
    ?.stuck_alerted_at
) {
      try {
        await sendDispatchStuckAlertToMainGroup({
          department,

          dispatchRoundId:
            claimResult
              .dispatch_round_id,

          sendingStartedAt:
            claimResult
              .sending_started_at,

          stuckMinutes,
        });

await markDispatchStuckAlerted({
  dispatchRoundId:
    claimResult
      .dispatch_round_id,

  alertedAt:
    new Date().toISOString(),
});
        
      } catch (alertError) {
        console.error(
          "DISPATCH STUCK ALERT ERROR:",
          {
            departmentCode:
              department.code,

            dispatchRoundId:
              claimResult
                .dispatch_round_id,

            error:
              alertError.message,
          }
        );
      }
    }
  }


  results.push({
    departmentCode:
      department.code,

    dispatched:
      false,

    reason,

    nextDispatchAt:
      claimResult
        ?.next_dispatch_at ||
      null,

    dispatchRoundId:
      claimResult
        ?.dispatch_round_id ||
      null,

    sendingStartedAt:
      claimResult
        ?.sending_started_at ||
      null,
  });


  continue;
}


        const dispatchRoundId =
          claimResult
            .dispatch_round_id;


        const claimedJobs =
          Array.isArray(
            claimResult.jobs
          )
            ? claimResult.jobs
            : [];


        if (
          !dispatchRoundId ||
          claimedJobs.length === 0
        ) {
          throw new Error(
            "Claim succeeded but dispatch round/jobs missing"
          );
        }


        // ========================================
        // 3. ส่ง LINE
        //
        // ถ้าตรงนี้ fail:
        // งานจะค้าง dispatching
        // และไม่ถูกยิงซ้ำอัตโนมัติ
        // ========================================

        await sendDepartmentDispatchToLineGroup({
          department,

          jobs:
            claimedJobs,

          dispatchedAt,
        });


        // ========================================
        // 4. LINE สำเร็จ
        // dispatching → processing
        // ========================================

        const completeResult =
          await completeDepartmentDispatch({
            dispatchRoundId,

            dispatchedAt,
          });


        if (
          completeResult?.ok !== true
        ) {
          throw new Error(
            `Dispatch complete failed: ${
              completeResult?.reason ||
              "unknown"
            }`
          );
        }


        // ========================================
        // 5. Google Sheet
        // - sync JOBS_MASTER status
        // - append department active sheet
        // ========================================

        for (
          const job of
          claimedJobs
        ) {
          try {
            await updateJobInGoogleSheet({
              jobId:
                job.id,

              status:
                "processing",
            });

          } catch (error) {
            console.error(
              "DISPATCH JOBS_MASTER UPDATE FAILED:",
              {
                jobId:
                  job.id,

                departmentCode:
                  department.code,

                error:
                  error.message,
              }
            );
          }

          try {
            const jobCustomer =
              await getCustomerById(
                job.customer_id
              );


            const jobReviews =
              await getReviewsByJobId(
                job.id
              );


            let selectedReview =
              null;


            const explicitlySelected =
              jobReviews.filter(
                (review) =>
                  review
                    ?.selected_by_customer ===
                  true
              );


            if (
              explicitlySelected.length >
              0
            ) {
              selectedReview =
                explicitlySelected[
                  explicitlySelected
                    .length - 1
                ];

            } else if (
              jobReviews.length === 1
            ) {
              selectedReview =
                jobReviews[0];
            }


            const reviewAgeDays =
              selectedReview
                ? getReviewAgeDays(
                    selectedReview
                  )
                : null;


            await appendDispatchJobToGoogleSheet({
              sheetName:
                department
                  .active_sheet_name,

              dispatchRoundId,

              sentAt:
                dispatchedAt,

              batchId:
                "",

              jobId:
                job.id,

              customerName:
                jobCustomer
                  ?.display_name ||
                "",

              mapName:
                job.business_name ||
                "",

              reviewUrl:
                job.review_url ||
                "",

              reviewAge:
                reviewAgeDays ??
                "",

              startedAt:
                dispatchedAt,

              status:
                "processing",

              removedAt:
                "",

              cycleCompleted:
                "",

              elapsedTime:
                "",
            });

          } catch (error) {
            console.error(
              "DISPATCH GOOGLE SHEET FAILED:",
              {
                jobId:
                  job.id,

                departmentCode:
                  department.code,

                error:
                  error.message,
              }
            );
          }
        }


        console.log(
          "DEPARTMENT DISPATCH COMPLETE:",
          {
            departmentCode:
              department.code,

            dispatchRoundId,

            dispatchedCount:
              completeResult
                .dispatched_count,
          }
        );


        results.push({
          departmentCode:
            department.code,

          dispatched:
            true,

          dispatchRoundId,

          jobCount:
            completeResult
              .dispatched_count,
        });


      } catch (error) {
        console.error(
          "DEPARTMENT DISPATCH FAILED:",
          {
            departmentId:
              department.id,

            departmentCode:
              department.code,

            error:
              error.message,
          }
        );


        results.push({
          departmentCode:
            department.code,

          dispatched:
            false,

          reason:
            "error",

          error:
            error.message,
        });
      }
    }


    return {
      ok: true,
      dispatchedAt,
      results,
    };


  } finally {
    departmentDispatchRunning =
      false;
  }
}


// =========================================================
// FIXED THAILAND DISPATCH SCHEDULE
// 00:00 / 08:00 / 12:00 / 16:00 / 20:00
//
// The DB atomic claim remains the final duplicate guard.
// =========================================================

const FIXED_DISPATCH_HOURS_TH = new Set([0, 8, 12, 16, 20]);
let lastFixedDispatchSlot = null;

function getBangkokClockParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

async function runFixedDispatchSchedulerTick() {
  const enabled = String(
    process.env.FIXED_DISPATCH_SCHEDULER_ENABLED ?? "true"
  ).toLowerCase() !== "false";

  if (!enabled) return;

  const clock = getBangkokClockParts();
  if (!FIXED_DISPATCH_HOURS_TH.has(clock.hour)) return;
  if (clock.minute > 2) return;

  const slotKey = `${clock.dateKey}-${String(clock.hour).padStart(2, "0")}:00`;
  if (lastFixedDispatchSlot === slotKey) return;
  lastFixedDispatchSlot = slotKey;

  try {
    console.log("FIXED DISPATCH SLOT START:", { slotKey });
    const result = await runDepartmentDispatch();
    console.log("FIXED DISPATCH SLOT COMPLETE:", { slotKey, result });
  } catch (error) {
    console.error("FIXED DISPATCH SLOT FAILED:", { slotKey, error: error.message });
  }
}

setInterval(() => {
  runFixedDispatchSchedulerTick().catch((error) => {
    console.error("FIXED DISPATCH TIMER ERROR:", error);
  });
}, 30 * 1000);

setTimeout(() => {
  runFixedDispatchSchedulerTick().catch((error) => {
    console.error("FIXED DISPATCH INITIAL CHECK ERROR:", error);
  });
}, 5 * 1000);

// =========================================================
// MONTHLY EXISTING CUSTOMER OUTREACH
//
// ตอนนี้เปิดส่งเฉพาะ LINE ก่อน
// Facebook TH / EN จะต่อผ่าน ManyChat ภายหลัง
//
// Existing customer = เคย payment_verified = true
// ไม่มี active job
// และยังไม่เคยส่งในเดือนนี้
// =========================================================

async function runMonthlyExistingCustomerOutreach() {

  // =======================================================
  // 1. หาเดือนปัจจุบันตามเวลาไทย
  // เช่น 2026-10
  // =======================================================

  const monthParts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Bangkok",

        year:
          "numeric",

        month:
          "2-digit",
      }
    ).formatToParts(
      new Date()
    );

  const year =
    monthParts.find(
      (part) =>
        part.type === "year"
    )?.value;

  const month =
    monthParts.find(
      (part) =>
        part.type === "month"
    )?.value;

  const outreachMonth =
    `${year}-${month}`;

  console.log(
    "MONTHLY OUTREACH START:",
    {
      outreachMonth,
    }
  );


  // =======================================================
  // 2. ดึงลูกค้าที่เข้าเงื่อนไข
  // =======================================================

  const candidates =
    await getMonthlyOutreachCandidates({
      outreachMonth,
    });


  const results = [];


  // =======================================================
  // 3. ไล่ส่งทีละคน
  // =======================================================

  for (
    const customer of
    candidates
  ) {

    const platform =
      String(
        customer?.platform || ""
      )
        .trim()
        .toLowerCase();


    // =====================================================
    // ตอนนี้ส่งเฉพาะ LINE
    //
    // Facebook จะไม่ claim
    // เพื่อให้เราเอาไปต่อ ManyChat ภายหลังได้
    // =====================================================

    if (
      platform !== "line"
    ) {
      results.push({
        customerId:
          customer?.id,

        platform,

        sent:
          false,

        reason:
          "facebook_manychat_pending",
      });

      continue;
    }


    const language =
      customer?.language === "en"
        ? "en"
        : "th";


    const messageText =
      language === "en"
        ? "Hi, do you have any other reviews you'd like us to help you with?"
        : "สวัสดีครับ ยังมีรีวิวไหนสนใจให้ช่วยจัดการอีกไหมครับ";


    let claim =
      null;


    try {

      // ===================================================
      // 4. Claim ก่อนส่ง
      // กันยิงซ้ำเดือนเดียวกัน
      // ===================================================

      claim =
        await claimMonthlyOutreach({
          customerId:
            customer.id,

          outreachMonth,

          platform:
            customer.platform,

          language,

          messageText,
        });


      if (
        claim?.claimed !== true
      ) {
        results.push({
          customerId:
            customer.id,

          platform,

          sent:
            false,

          reason:
            claim?.reason ||
            "not_claimed",
        });

        continue;
      }


      // ===================================================
      // 5. ส่งข้อความหา LINE ลูกค้า
      // ===================================================

      await sendMessageToCustomer({
        platform:
          customer.platform,

        platformUserId:
          customer.platform_user_id,

        text:
          messageText,
      });


      // ===================================================
      // 6. เก็บ Message History
      // ===================================================

      await saveMessage({
        customerId:
          customer.id,

        platform:
          customer.platform,

        direction:
          "outbound",

        messageType:
          "text",

        messageText,

        metadata: {
          source:
            "monthly_existing_customer_outreach",

          outreachMonth,
        },
      });


      await updateLastBotMessage(
        customer.id,
        messageText
      );


      // ===================================================
      // 7. Mark สำเร็จ
      // ===================================================

      await completeMonthlyOutreach({
        logId:
          claim.log.id,

        status:
          "sent",
      });


      results.push({
        customerId:
          customer.id,

        platform,

        language,

        sent:
          true,
      });


    } catch (error) {

      console.error(
        "MONTHLY OUTREACH CUSTOMER FAILED:",
        {
          customerId:
            customer?.id,

          platform,

          error:
            error?.message ||
            String(error),
        }
      );


      // ถ้า claim ไปแล้วแต่ส่งไม่สำเร็จ
      // บันทึก failed ไว้
      if (
        claim?.claimed === true &&
        claim?.log?.id
      ) {
        try {
          await completeMonthlyOutreach({
            logId:
              claim.log.id,

            status:
              "failed",

            errorMessage:
              error?.message ||
              String(error),
          });

        } catch (
          logError
        ) {
          console.error(
            "MONTHLY OUTREACH FAILED LOG UPDATE ERROR:",
            logError
          );
        }
      }


      results.push({
        customerId:
          customer?.id,

        platform,

        sent:
          false,

        reason:
          "send_failed",

        error:
          error?.message ||
          String(error),
      });
    }
  }


  const sentCount =
    results.filter(
      (item) =>
        item.sent === true
    ).length;


  console.log(
    "MONTHLY OUTREACH COMPLETE:",
    {
      outreachMonth,

      candidates:
        candidates.length,

      sent:
        sentCount,

      results,
    }
  );


  return {
    ok:
      true,

    outreachMonth,

    candidates:
      candidates.length,

    sent:
      sentCount,

    results,
  };
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
  "queued",
  "dispatching",
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

    // Existing customer
    "existing_evidence_pending",
    "existing_evidence_failed",
    "existing_batch_draft",

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
  const { salesChatId } = getTelegramInternalConfig();
  if (!salesChatId) {
    console.error("HUMAN ATTENTION FAILED: Missing TELEGRAM_SALES_CHAT_ID");
    return { sent: false };
  }

  const attentionDedupeKey = crypto
    .createHash("sha256")
    .update([
      customer?.id || "-",
      conversation?.state || "UNKNOWN",
      String(reason || "").trim(),
      String(message || "").trim().toLowerCase(),
    ].join("|"))
    .digest("hex");

  const attentionClaim = await claimUnknownSalesQuestion({
    customerId: customer?.id,
    platform: customer?.platform || null,
    state: conversation?.state || null,
    message: String(message || "").trim() || null,
    reason: reason || null,
    dedupeKey: attentionDedupeKey,
  });

  if (attentionClaim?.claimed === false) {
    console.log("HUMAN ATTENTION DUPLICATE SUPPRESSED", {
      customerId: customer?.id,
      reason,
    });
    return { sent: false, duplicate: true };
  }

  const customerName = customer?.display_name || "ไม่ทราบชื่อ";
  const state = conversation?.state || "UNKNOWN";
  const platformLabel = getPlatformLabel(customer);
  const stageLabel = await getCustomerStage({ customer, conversation });

  const text = [
    "⚠️ ต้องตรวจแชทลูกค้า",
    "",
    `ลูกค้า: ${customerName}`,
    `Platform: ${platformLabel}`,
    `Customer ID: ${customer?.id || "-"}`,
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
    const pushed = await pushTelegramSales(text);
    const messageId = pushed.messageId;

    if (messageId && attentionClaim?.row?.id) {
      try {
        await setUnknownSalesQuestionLineMessage({
          questionId: attentionClaim.row.id,
          lineGroupMessageId: messageId,
        });
      } catch (linkError) {
        console.error("UNKNOWN SALES QUESTION LINK FAILED:", linkError);
      }
    }

    if (messageId && conversation?.state === GMR_STATES.WAITING_PRICE) {
      const latestJob = await getLatestJobByCustomerId(customer.id);
      if (latestJob) {
        await updateJob(latestJob.id, { line_group_message_id: messageId });
      }
    }

    return { sent: true, messageId };
  } catch (error) {
    console.error("HUMAN ATTENTION TELEGRAM ERROR:", error);
    return { sent: false, error: error.message };
  }
}

// =========================================================
// REACTIVATION REVIEW → TEAM LINE GROUP
//
// พบรีวิว 1 ดาวใหม่ของลูกค้าเก่า
// → ยังไม่ทักลูกค้า
// → ส่งให้ทีมตรวจสอบก่อน
// =========================================================

async function sendReactivationAlertToLineGroup({
  alert,
  customerMap,
}) {
  if (!alert?.id) throw new Error("Missing alert in sendReactivationAlertToLineGroup");

  const customer = await getCustomerById(alert.customer_id);
  const customerName = customer?.display_name || "-";
  const businessName = customerMap?.business_name || "-";
  const reviewerName = alert.reviewer_name || "-";
  const reviewText = String(alert.review_text || "").trim() || "(ไม่มีข้อความ)";
  const reviewDate = alert.review_date || "-";
  const reviewUrl = alert.review_url || "-";
  const platformUserId = String(customer?.platform_user_id || "").trim();
  const liveChatReady = Boolean(platformUserId) &&
    !platformUserId.startsWith("legacy:") &&
    customer?.customer_notify !== false;

  const text = [
    "🔎 พบรีวิว 1 ดาวใหม่",
    "",
    `ลูกค้า: ${customerName}`,
    `Platform: ${customer?.platform || "-"}`,
    `สถานะแชท: ${liveChatReady ? "✅ ผูกห้องแชทแล้ว" : "⚠️ Legacy ยังไม่ผูกห้องแชทจริง"}`,
    `ธุรกิจ: ${businessName}`,
    `Reviewer: ${reviewerName}`,
    `วันที่รีวิว: ${reviewDate}`,
    "",
    "ข้อความ:",
    reviewText,
    "",
    `Review URL: ${reviewUrl}`,
    "",
    "⚠️ กรุณาตรวจสอบก่อนทักลูกค้า",
    "ว่าลูกค้าเคยส่งรีวิวนี้มาให้ดำเนินการแล้วหรือไม่",
    "",
    "Reply ข้อความนี้:",
    "ส่งลูกค้า",
    "ข้าม",
  ].join("\n");

  const pushed = await pushTelegramSales(text);
  await setReactivationAlertLineGroupMessage({
    alertId: alert.id,
    lineGroupMessageId: pushed.messageId,
  });

  console.log("REACTIVATION TELEGRAM ALERT SENT:", {
    alertId: alert.id,
    customerId: alert.customer_id,
    messageId: pushed.messageId,
  });

  return { sent: true, messageId: pushed.messageId, text };
}

async function sendLegacyAutoMatchAmbiguousToLine({
  legacyCustomer,
  customers = [],
}) {
  const candidateText = customers
    .map((customer, index) =>
      `${index + 1}. ${customer.display_name || "-"}\nID: ${customer.id}\nPlatform User ID: ${customer.platform_user_id || "-"}`
    )
    .join("\n\n");

  const text = [
    "⚠️ Legacy Customer พบชื่อซ้ำ",
    "",
    `Legacy Name: ${legacyCustomer?.display_name || "-"}`,
    `Business: ${legacyCustomer?.business_name || "-"}`,
    `Platform: ${legacyCustomer?.platform || "-"}`,
    "",
    `พบ Customer ตรงกัน ${customers.length} ราย`,
    "",
    candidateText,
    "",
    "ระบบยังไม่ Match อัตโนมัติ",
    "กรุณาตรวจสอบว่าเป็น Account ใดก่อนครับ",
  ].join("\n");

  try {
    await pushTelegramSales(text);
    return { sent: true };
  } catch (error) {
    console.error("LEGACY AUTO MATCH AMBIGUOUS TELEGRAM FAILED:", {
      legacyCustomerId: legacyCustomer?.id || null,
      error: error?.message || String(error),
    });
    return { sent: false };
  }
}

// =========================================================
// LEGACY CUSTOMER MATCH REQUEST
//
// เมื่อชื่อ LINE ตรงกับ Legacy Customer
// ยังไม่ถือว่าเป็นคนเดียวกันทันที
// ส่งให้ทีมตรวจและ Reply ยืนยันใน LINE Group
// =========================================================

async function sendLegacyCustomerMatchRequest({
  customer,
  legacyCustomer,
  message = null,
  messageType = "text",
}) {
  if (!customer?.id) throw new Error("Missing customer in sendLegacyCustomerMatchRequest");
  if (!legacyCustomer?.id) throw new Error("Missing legacyCustomer in sendLegacyCustomerMatchRequest");

  const newRate = Number(legacyCustomer.new_review_rate || 0);
  const oldRate = Number(legacyCustomer.old_review_rate || 0);
  const newCurrency = String(legacyCustomer.new_review_currency || "THB").toUpperCase();
  const oldCurrency = String(legacyCustomer.old_review_currency || "THB").toUpperCase();
  const formatLegacyRate = (amount, currency) => {
    if (!Number.isFinite(amount) || amount <= 0) return "-";
    return currency === "USD"
      ? `$${formatMoney(amount, "USD")} USD`
      : `${formatMoney(amount, "THB")} บาท`;
  };

  const text = [
    "⚠️ พบลูกค้าที่อาจเป็นลูกค้าเก่า",
    "",
    `Current Name: ${customer.display_name || "-"}`,
    `Legacy Name: ${legacyCustomer.display_name || "-"}`,
    `Platform: ${customer.platform || legacyCustomer.platform || "-"}`,
    "",
    `ธุรกิจเดิม: ${legacyCustomer.business_name || "-"}`,
    `เบอร์เดิม: ${legacyCustomer.phone || "-"}`,
    "",
    "ราคาเดิม:",
    `NEW Review: ${formatLegacyRate(newRate, newCurrency)}`,
    `OLD Review: ${formatLegacyRate(oldRate, oldCurrency)}`,
    "",
    `หมายเหตุ: ${legacyCustomer.note || "-"}`,
    "",
    "Reply ข้อความนี้:",
    "✅ ยืนยันลูกค้าเก่า",
    "❌ ไม่ใช่",
  ].join("\n");

  const pushed = await pushTelegramSales(text);
  await setLegacyCustomerPendingMatch({
    legacyCustomerId: legacyCustomer.id,
    customerId: customer.id,
    lineGroupMessageId: pushed.messageId,
    pendingMessageText: message,
    pendingMessageType: messageType,
  });

  return { messageId: pushed.messageId, text };
}

async function sendCreditApprovalRequestToLineGroup({
  customer,
  job,
  phone,
}) {
  const formattedPrice = Number(job?.price || 0).toLocaleString("th-TH");
  const text = [
    "⚠️ ขออนุมัติเครดิตลูกค้าใหม่",
    "",
    `ลูกค้า: ${customer?.display_name || "ไม่ทราบชื่อ"}`,
    `Platform: ${String(customer?.platform || "line").toUpperCase()}`,
    `เบอร์: ${phone || "-"}`,
    "",
    `ธุรกิจ: ${job?.business_name || "-"}`,
    `มูลค่างาน: ${formattedPrice} บาท`,
    "",
    "Reply ข้อความนี้:",
    "✅ อนุมัติ",
    "❌ ไม่อนุมัติ",
  ].join("\n");
  const pushed = await pushTelegramSales(text);
  return { messageId: pushed.messageId, text };
}

async function sendExistingCustomerBatchCreditApprovalToLineGroup({
  customer,
  jobs,
}) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    throw new Error("No jobs supplied for existing customer batch credit approval");
  }

  const grouped = new Map();
  for (const job of jobs) {
    const price = Number(job.price || 0);
    if (!Number.isFinite(price) || price <= 0) continue;
    const currency = getCurrencyFromUnitPrice({ price, currency: job.currency });
    const key = `${currency}:${price}`;
    if (!grouped.has(key)) grouped.set(key, { currency, price, count: 0 });
    grouped.get(key).count += 1;
  }

  const detailLines = Array.from(grouped.values()).map(({ currency, price, count }) => {
    const formattedPrice = formatMoney(price, currency);
    const lineTotal = formatMoney(price * count, currency);
    return currency === "THB"
      ? `• ${formattedPrice} บาท/รีวิว × ${count} = ${lineTotal} บาท`
      : `• $${formattedPrice} USD/review × ${count} = $${lineTotal} USD`;
  });

  const totalTHB = jobs.reduce((total, job) => {
    const price = Number(job.price || 0);
    const currency = getCurrencyFromUnitPrice({ price, currency: job.currency });
    return currency === "THB" && Number.isFinite(price) ? total + price : total;
  }, 0);
  const totalUSD = jobs.reduce((total, job) => {
    const price = Number(job.price || 0);
    const currency = getCurrencyFromUnitPrice({ price, currency: job.currency });
    return currency === "USD" && Number.isFinite(price) ? total + price : total;
  }, 0);

  const totalLines = [];
  if (totalTHB > 0) totalLines.push(`รวม THB: ${formatMoney(totalTHB, "THB")} บาท`);
  if (totalUSD > 0) totalLines.push(`รวม USD: $${formatMoney(totalUSD, "USD")} USD`);

  const numberedReviewLines = jobs.flatMap((job, index) => {
    const price = Number(job.price || 0);
    const currency = getCurrencyFromUnitPrice({ price, currency: job.currency });
    return [
      `${index + 1}. ${job.review_url || "-"}`,
      `   ราคา: ${formatMoney(price, currency)} ${currency}`,
    ];
  });

  const text = [
    "👤 ลูกค้าเก่ายืนยันงาน — รอ Sales ตรวจ",
    "",
    `ลูกค้า: ${customer?.display_name || "ไม่ทราบชื่อ"}`,
    `Platform: ${getPlatformLabel(customer)}`,
    `Customer ID: ${customer?.id || "-"}`,
    "",
    `จำนวนรีวิวในชุด: ${jobs.length} รีวิว`,
    "",
    ...numberedReviewLines,
    "",
    "สรุปราคา:",
    ...detailLines,
    ...totalLines,
    "",
    "⚠️ ยังไม่ได้เริ่มงาน / ยังไม่ Dispatch",
    "",
    "✅ ถูกต้อง: Reply ข้อความนี้แล้วพิมพ์  ยืนยันงาน",
    "❌ ราคา/ลิงก์ผิด: Reply ข้อความนี้แล้วพิมพ์  ยกเลิก",
  ].join("\n");

  const pushed = await pushTelegramSales(text);
  return { messageId: pushed.messageId, text };
}

// =========================================================
// START APPROVED EXISTING CUSTOMER BATCH
//
// ใช้หลังทีมอนุมัติเครดิตลูกค้าเก่า
// - เริ่มทุก Job ใน Batch
// - ลง Google Sheet ทุก Job
// - เปลี่ยน Conversation ครั้งเดียว
// - ส่งข้อความลูกค้าเพียงครั้งเดียว
// =========================================================

async function startApprovedExistingCustomerBatch({
  customer,
  conversation,
  jobs,
}) {
  if (
    !Array.isArray(jobs) ||
    jobs.length === 0
  ) {
    throw new Error(
      "No jobs supplied to startApprovedExistingCustomerBatch"
    );
  }


  // ========================================
  // Safety Check
  // ========================================

  const invalidJobs =
    jobs.filter(
      (job) => {
        const price =
          Number(
            job.price || 0
          );

        return (
          job.status !==
            "waiting_credit_approval" ||
          !job.review_url ||
          !Number.isFinite(price) ||
          price <= 0
        );
      }
    );


  if (invalidJobs.length > 0) {
    throw new Error(
      `Invalid jobs in existing batch: ${
        invalidJobs
          .map(
            (job) =>
              job.id
          )
          .join(", ")
      }`
    );
  }


  const queuedAt =
    new Date().toISOString();


  const startedJobs = [];


  // ========================================
  // 1. ทุก Job → queued
  // ========================================

  for (const job of jobs) {
    const updatedJob =
      await updateJob(
        job.id,
        {
          status:
            "queued",

          queued_at:
            queuedAt,

          started_at:
            null,

          dispatched_at:
            null,
        }
      );


    startedJobs.push(
      updatedJob
    );
  }


  // ========================================
  // 2. Conversation → IN_PROGRESS
  // ========================================

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


  // ========================================
  // 3. สรุปราคาแยก THB / USD
  // ========================================

  const thbBreakdown =
    buildPaymentBreakdown({
      jobs:
        startedJobs,

      currency:
        "THB",

      language:
        customer?.language ||
        "th",
    });


  const usdBreakdown =
    buildPaymentBreakdown({
      jobs:
        startedJobs,

      currency:
        "USD",

      language:
        customer?.language ||
        "th",
    });


  const thaiPriceLines = [];
  const englishPriceLines = [];


  if (
    thbBreakdown.totalReviews > 0
  ) {
    thaiPriceLines.push(
      "ค่าดำเนินการรายการ THB:",
      ...thbBreakdown.lines,
      `รวม THB: ${formatMoney(
        thbBreakdown.total,
        "THB"
      )} บาท`
    );


    englishPriceLines.push(
      "THB service fees:",
      ...thbBreakdown.lines,
      `Total THB: ${formatMoney(
        thbBreakdown.total,
        "THB"
      )} THB`
    );
  }


  if (
    usdBreakdown.totalReviews > 0
  ) {
    if (
      thaiPriceLines.length > 0
    ) {
      thaiPriceLines.push("");
    }

    if (
      englishPriceLines.length > 0
    ) {
      englishPriceLines.push("");
    }


    thaiPriceLines.push(
      "ค่าดำเนินการรายการ USD:",
      ...usdBreakdown.lines,
      `รวม USD: $${formatMoney(
        usdBreakdown.total,
        "USD"
      )} USD`
    );


    englishPriceLines.push(
      "USD service fees:",
      ...usdBreakdown.lines,
      `Total USD: $${formatMoney(
        usdBreakdown.total,
        "USD"
      )} USD`
    );
  }

  // ========================================
  // 4. START MESSAGE
  //
  // THB:
  // - ภาษาไทย
  // - QR Scan Payment
  // - 1–20 วันทำการ
  //
  // USD:
  // - English
  // - Stripe
  // - 1–14 days
  //
  // Batch รองรับ THB / USD / Mixed
  // ========================================

  const hasTHB =
    thbBreakdown.totalReviews > 0;

  const hasUSD =
    usdBreakdown.totalReviews > 0;


  let botReply = "";


  // ========================================
  // THB ONLY
  // ========================================

  if (
    hasTHB &&
    !hasUSD
  ) {
    botReply =
      `ทางเราได้เริ่มดำเนินการเรียบร้อยแล้วครับ

จำนวนทั้งหมด ${startedJobs.length} รีวิว

รายละเอียดค่าบริการ:
${thaiPriceLines.join("\n")}

ระยะเวลาดำเนินการโดยประมาณ: 1–20 วันทำการ

🔥 แจ้งให้ลูกค้าทราบทันทีเมื่อดำเนินการสำเร็จ 🔥

📌 เงื่อนไขการให้บริการ:
1. ชำระผ่านแสกนจ่ายเท่านั้น ไม่รับผ่านโอนเข้าบัญชี
2. ชำระค่าบริการทันทีหลังจากลบออก
3. เมื่อเริ่มดำเนินการแล้ว ไม่สามารถยกเลิกหรือเปลี่ยนแปลงได้ เช่น เจ้าของรีวิวยินดีลบรีวิวให้ภายหลัง (ค่าบริการเต็มจำนวนยังคงต้องชำระ)
4. ค่าบริการทุกกรณีไม่สามารถขอคืนเงินได้หลังจากเริ่มดำเนินการ
5. งานจะถือว่าเสร็จสมบูรณ์เมื่อรีวิวถูกลบและลูกค้าชำระหลังเช็คงานแล้วเรียบร้อย
6. หากชำระล่าช้าเกิน 7 วัน (นับจากวันเรียกเก็บเงิน) ทางเราจะลบรีวิว5ดาวบนแมพ จนกว่าลูกค้าจะชำระ

หมายเหตุ: กรณีกังวลว่าจะชำระไม่ทัน สามารถขอชำระล่วงหน้าก่อนได้`;
  }


  // ========================================
  // USD ONLY
  // ========================================

  else if (
    hasUSD &&
    !hasTHB
  ) {
    botReply =
      `We have already commenced the service.

Total: ${startedJobs.length} review(s)

Service Fee:
${englishPriceLines.join("\n")}

Duration: 1-14days(depends on GG system)

🔥We will promptly notify the client upon successful completion🔥

📌 Terms & Conditions:
1. Payment is accepted via STRIPE (credit card).
2. Full payment is required immediately after the review has been successfully removed.
3. Once the service has started, cancellation or changes are not permitted, including cases where the reviewer later agrees to remove the review themselves. The full service fee remains payable.
4. Service fees are non-refundable once the service has started.
5. The service is considered complete once the review has been removed and payment has been completed after the result is checked.
6. If payment is delayed for more than 7 days from the billing date, we reserve the right to remove the 5-star reviews from your Google Maps listing until the outstanding payment has been settled.

Note: If you are concerned that you may not be able to make payment within the required timeframe, you may request to make payment in advance before the service begins.`;
  }


  // ========================================
  // MIXED THB + USD
  //
  // ปกติไม่ควรเกิดบ่อย
  // แต่รองรับไว้เพื่อไม่ให้ระบบพัง
  // ========================================

  else {
    botReply =
      `ทางเราได้เริ่มดำเนินการเรียบร้อยแล้วครับ

จำนวนทั้งหมด ${startedJobs.length} รีวิว

รายละเอียดค่าบริการ:
${thaiPriceLines.join("\n")}

ระยะเวลาดำเนินการโดยประมาณ:
• THB: 1–20 วันทำการ
• USD: 1–14 days (depends on GG system)

🔥 แจ้งให้ลูกค้าทราบทันทีเมื่อดำเนินการสำเร็จ 🔥

📌 เงื่อนไขการให้บริการ:
1. รายการ THB ชำระผ่านแสกนจ่ายเท่านั้น ไม่รับผ่านโอนเข้าบัญชี และรายการ USD ชำระผ่าน STRIPE (credit card)
2. ชำระค่าบริการทันทีหลังจากลบออก
3. เมื่อเริ่มดำเนินการแล้ว ไม่สามารถยกเลิกหรือเปลี่ยนแปลงได้ เช่น เจ้าของรีวิวยินดีลบรีวิวให้ภายหลัง (ค่าบริการเต็มจำนวนยังคงต้องชำระ)
4. ค่าบริการทุกกรณีไม่สามารถขอคืนเงินได้หลังจากเริ่มดำเนินการ
5. งานจะถือว่าเสร็จสมบูรณ์เมื่อรีวิวถูกลบและลูกค้าชำระหลังเช็คงานแล้วเรียบร้อย
6. หากชำระล่าช้าเกิน 7 วัน (นับจากวันเรียกเก็บเงิน) ทางเราจะลบรีวิว5ดาวบนแมพ จนกว่าลูกค้าจะชำระ

หมายเหตุ: กรณีกังวลว่าจะชำระไม่ทัน สามารถขอชำระล่วงหน้าก่อนได้`;
  }


  // ========================================
  // 5. SAVE OUTBOUND MESSAGE
  // ========================================

  await saveMessage({
    customerId:
      customer.id,

    platform:
      customer.platform ||
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


  return {
    startedJobs,
    queuedAt,
    botReply,
  };
}


// =========================================================
// START APPROVED SINGLE JOB
// =========================================================

async function startApprovedJob({
  customer,
  conversation,
  job,
  platform,
  phone,
}) {

  // ========================================
  // PRICE / CURRENCY
  // ========================================

  const currency =
    getCurrencyFromUnitPrice({
      price:
        job.price,

      currency:
        job.currency,
    });


  const formattedPrice =
    formatMoney(
      Number(
        job.price || 0
      ),
      currency
    );


  // ========================================
  // MESSAGE
  //
  // ราคาอิงจาก Job จริง
  // ห้าม Hardcode 6500 / 199
  // ========================================

  let botReply = "";


  // ========================================
  // THB
  // ========================================

  if (
    currency === "THB"
  ) {
    const priceText =
      `${formattedPrice} บาท/รีวิว`;

    botReply =
      `ทางเราได้เริ่มดำเนินการเรียบร้อยแล้วครับ

หากลบออก ${priceText}

ระยะเวลาดำเนินการโดยประมาณ: 1–20 วันทำการ

🔥 แจ้งให้ลูกค้าทราบทันทีเมื่อดำเนินการสำเร็จ 🔥

📌 เงื่อนไขการให้บริการ:
1. ชำระผ่านแสกนจ่ายเท่านั้น ไม่รับผ่านโอนเข้าบัญชี
2. ชำระค่าบริการทันทีหลังจากลบออก
3. เมื่อเริ่มดำเนินการแล้ว ไม่สามารถยกเลิกหรือเปลี่ยนแปลงได้ เช่น เจ้าของรีวิวยินดีลบรีวิวให้ภายหลัง (ค่าบริการเต็มจำนวนยังคงต้องชำระ)
4. ค่าบริการทุกกรณีไม่สามารถขอคืนเงินได้หลังจากเริ่มดำเนินการ
5. งานจะถือว่าเสร็จสมบูรณ์เมื่อรีวิวถูกลบและลูกค้าชำระหลังเช็คงานแล้วเรียบร้อย
6. หากชำระล่าช้าเกิน 7 วัน (นับจากวันเรียกเก็บเงิน) ทางเราจะลบรีวิว5ดาวบนแมพ จนกว่าลูกค้าจะชำระ

หมายเหตุ: กรณีกังวลว่าจะชำระไม่ทัน สามารถขอชำระล่วงหน้าก่อนได้`;
  }


  // ========================================
  // USD
  // ========================================

  else {
    const priceText =
      `$${formattedPrice} (USD) per review`;

    botReply =
      `We have already commenced the service.

Service Fee: ${priceText}

Duration: 1-14days(depends on GG system)

🔥We will promptly notify the client upon successful completion🔥

📌 Terms & Conditions:
1. Payment is accepted via STRIPE (credit card).
2. Full payment is required immediately after the review has been successfully removed.
3. Once the service has started, cancellation or changes are not permitted, including cases where the reviewer later agrees to remove the review themselves. The full service fee remains payable.
4. Service fees are non-refundable once the service has started.
5. The service is considered complete once the review has been removed and payment has been completed after the result is checked.
6. If payment is delayed for more than 7 days from the billing date, we reserve the right to remove the 5-star reviews from your Google Maps listing until the outstanding payment has been settled.

Note: If you are concerned that you may not be able to make payment within the required timeframe, you may request to make payment in advance before the service begins.`;
  }


  // ========================================
  // QUEUE TIME
  // ========================================

  const queuedAt =
    new Date().toISOString();


  // ========================================
  // CONVERSATION → IN_PROGRESS
  // ========================================

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


  // ========================================
  // JOB → QUEUED
  // ========================================

  const updatedJob =
    await updateJob(
      job.id,
      {
        status:
          "queued",

        queued_at:
          queuedAt,

        started_at:
          null,

        dispatched_at:
          null,
      }
    );


  // ========================================
  // SAVE OUTBOUND
  // ========================================

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
    queuedAt,
  };
}

  
function shouldSuppressDuplicateBotReply({
  conversation,
  botReply,
}) {
  const previous =
    String(
      conversation?.last_bot_message ||
      ""
    ).trim();

  const next =
    String(
      botReply ||
      ""
    ).trim();

  if (!previous || !next) {
    return false;
  }

  return previous === next;
}

async function getGlobalFaqReply({
  customer,
  message,
}) {
  const text =
    String(message || "")
      .trim()
      .toLowerCase();

  if (!text) {
    return null;
  }

  const faqs =
    await getActiveFaqs();

  if (
    !Array.isArray(faqs) ||
    faqs.length === 0
  ) {
    return null;
  }

  const language =
    customer?.language === "en"
      ? "en"
      : "th";

  for (const faq of faqs) {
    const keywords =
      language === "en"
        ? faq.keywords_en
        : faq.keywords_th;

    const safeKeywords =
      Array.isArray(keywords)
        ? keywords
        : [];

    const matched =
      safeKeywords.some(
        (keyword) => {
          const normalizedKeyword =
            String(keyword || "")
              .trim()
              .toLowerCase();

          if (!normalizedKeyword) {
            return false;
          }

          return text.includes(
            normalizedKeyword
          );
        }
      );

    if (!matched) {
      continue;
    }

    const hit =
      await registerFaqHit({
        customerId:
          customer.id,

        faqKey:
          faq.faq_key,
      });

    const isRepeat =
      Number(
        hit?.hit_count || 1
      ) > 1;

    let reply;

    if (language === "en") {
      reply =
        isRepeat
          ? (
              faq.repeat_reply_en ||
              faq.reply_en ||
              faq.reply_th
            )
          : (
              faq.reply_en ||
              faq.reply_th
            );
    } else {
      reply =
        isRepeat
          ? (
              faq.repeat_reply_th ||
              faq.reply_th
            )
          : faq.reply_th;
    }

    const finalReply =
      String(reply || "").trim();

    if (!finalReply) {
      return null;
    }

    return {
      faqKey:
        faq.faq_key,

      faqTitle:
        faq.title,

      reply:
        finalReply,

      repeat:
        isRepeat,

      hitCount:
        Number(
          hit?.hit_count || 1
        ),
    };
  }

  return null;
}

async function sendGlobalFaqIfMatched({
  customer,
  conversation,
  platform,
  message,
}) {
  const faqMatch =
  await getGlobalFaqReply({
    customer,
    message,
  });

const faqReply =
  faqMatch?.reply || null;

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
  faqKey:
    faqMatch.faqKey,
  repeat:
    faqMatch.repeat,
  hitCount:
    faqMatch.hitCount,
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
// TELEGRAM UNIVERSAL CUSTOMER CONTEXT — V2.2.19
//
// Pricing replies are allowed only when Sales replies to a Telegram
// message that can be tied to a real customer. This prevents price + URL
// from ever falling through to an arbitrary pending customer.
// =========================================================
function extractCustomerIdFromTelegramQuotedMessage(replyMessage) {
  const quotedText = String(
    replyMessage?.text || replyMessage?.caption || ""
  );
  const match = quotedText.match(
    /Customer\s*ID\s*:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return match ? match[1] : null;
}

async function resolveTelegramPricingCustomerContext({
  quotedMessageId,
  quotedMessage = null,
}) {
  if (!quotedMessageId) return null;

  // 1) Canonical Sales Lead Card.
  const leadCard = await getSalesLeadCardByLineGroupMessageId(quotedMessageId);
  if (leadCard?.customer_id) {
    return {
      customerId: leadCard.customer_id,
      leadCard,
      source: "sales_lead_card",
    };
  }

  // 2) Human-attention / unknown-question cards are already durably linked
  // to the customer in gmr_sales_unknown_questions. This also fixes older
  // Telegram cards that were created before Customer ID was shown in text.
  const unknownQuestion =
    await getUnknownSalesQuestionByLineGroupMessageId(quotedMessageId);
  if (unknownQuestion?.customer_id) {
    return {
      customerId: unknownQuestion.customer_id,
      leadCard: {
        id: null,
        customer_id: unknownQuestion.customer_id,
        payload: unknownQuestion.message_text || null,
        input_type: "HUMAN_ATTENTION",
      },
      source: "human_attention",
    };
  }

  // 3) Existing Job-linked Sales cards.
  const job = await getJobByLineGroupMessageId(quotedMessageId);
  if (job?.customer_id) {
    return {
      customerId: job.customer_id,
      leadCard: {
        id: null,
        customer_id: job.customer_id,
        payload: job.review_url || job.map_url || null,
        input_type: "JOB_CONTEXT",
      },
      source: "job_context",
    };
  }

  // 4) Reactivation alert cards.
  const reactivation =
    await getReactivationAlertByLineGroupMessageId(quotedMessageId);
  if (reactivation?.customer_id) {
    return {
      customerId: reactivation.customer_id,
      leadCard: {
        id: null,
        customer_id: reactivation.customer_id,
        payload: reactivation.review_url || null,
        input_type: "REACTIVATION_CONTEXT",
      },
      source: "reactivation",
    };
  }

  // 5) Text fallback for bot cards that visibly include Customer ID.
  const embeddedCustomerId =
    extractCustomerIdFromTelegramQuotedMessage(quotedMessage);
  if (embeddedCustomerId) {
    const customer = await getCustomerById(embeddedCustomerId);
    if (customer?.id) {
      return {
        customerId: customer.id,
        leadCard: {
          id: null,
          customer_id: customer.id,
          payload: null,
          input_type: "TELEGRAM_CUSTOMER_ID",
        },
        source: "embedded_customer_id",
      };
    }
  }

  return null;
}

// =========================================================
// TELEGRAM INTERNAL WEBHOOK — SALES REPLY FLOW
// =========================================================
app.post("/telegram/webhook", async (req, res) => {
  // Telegram expects a fast 200; process in this request because Render keeps
  // the service warm and our commands need deterministic DB updates.
  try {
    const update = req.body || {};
    const updateId = update?.update_id;
    const msg = update?.message;

    if (!msg?.chat?.id) return res.sendStatus(200);

    if (updateId !== null && updateId !== undefined) {
      const claim = await claimWebhookEvent({
        platform: "telegram",
        eventId: String(updateId),
        payload: {
          chatId: String(msg.chat.id),
          messageId: String(msg.message_id || ""),
        },
      });
      if (claim?.claimed === false) return res.sendStatus(200);
    }

    const { salesChatId, t0ChatId, t2ChatId } = getTelegramInternalConfig();
    const chatId = String(msg.chat.id);
    const allowed = new Set([salesChatId, t0ChatId, t2ChatId].filter(Boolean));
    if (!allowed.has(chatId)) {
      console.warn("TELEGRAM MESSAGE IGNORED — UNKNOWN CHAT", { chatId });
      return res.sendStatus(200);
    }

    // Telegram normally keeps pasted URLs inside msg.text/msg.caption.
    // Also append text_link entity URLs so Sales can paste/click rich links
    // without the parser losing the underlying Google Maps URL.
    const baseGroupText = String(msg.text || msg.caption || "").trim();
    const telegramEntities = Array.isArray(msg.entities)
      ? msg.entities
      : (Array.isArray(msg.caption_entities) ? msg.caption_entities : []);
    const entityUrls = telegramEntities
      .filter((entity) => entity?.type === "text_link" && entity?.url)
      .map((entity) => String(entity.url).trim())
      .filter(Boolean);
    const groupText = [baseGroupText, ...entityUrls].filter(Boolean).join("\n").trim();
    if (!groupText) return res.sendStatus(200);

    const normalizedGroupText = groupText.toLowerCase();

    // Quick connectivity test in any configured internal group.
    if (["/test", "/test@"].some((cmd) => normalizedGroupText === cmd || normalizedGroupText.startsWith("/test@"))) {
      await replyTelegramInternal(
        chatId,
        msg.message_id,
        `✅ Telegram Internal connected\nChat: ${msg.chat.title || chatId}`
      );
      return res.sendStatus(200);
    }

    // T0/T2 are dispatch-only. Interactive business commands belong to Sales.
    if (chatId !== salesChatId) return res.sendStatus(200);
    const quotedMessageId = msg?.reply_to_message?.message_id
      ? String(msg.reply_to_message.message_id)
      : null;
    const actorId = msg?.from?.id ? String(msg.from.id) : null;

    console.log("TELEGRAM SALES INBOUND:", {
      chatId,
      messageId: String(msg.message_id || ""),
      quotedMessageId,
      actorId,
      text: groupText.slice(0, 500),
    });

    const reply = async (text) =>
      replyTelegramInternal(chatId, msg.message_id, text);

    // -----------------------------------------------------
    // V2 SALES: Preview confirm/cancel + existing customer approval
    // -----------------------------------------------------
    if (quotedMessageId) {
      const isConfirmWork = ["ยืนยันงาน", "confirm work", "confirm job"].includes(normalizedGroupText);
      const isCancelWork = ["ยกเลิก", "cancel", "cancel job"].includes(normalizedGroupText);

      if (isConfirmWork || isCancelWork) {
        const draft = await getSalesOrderDraftByPreviewMessageId(quotedMessageId);

        if (draft) {
          if (isCancelWork) {
            if (draft.status !== "pending_confirmation") {
              await reply(`⚠️ งานชุดนี้อยู่ในสถานะ ${draft.status} แล้วครับ`);
              return res.sendStatus(200);
            }

            await updateSalesOrderDraft(draft.id, {
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
            });
            await reply(
              "❌ ยกเลิก Draft แล้วครับ\nยังไม่มี Job ถูกสร้าง / ยังไม่ลง Sheet / ยังไม่เริ่มงาน\nแก้ข้อมูลแล้ว Reply ข้อความลูกค้าเดิมเพื่อส่งชุดใหม่ได้เลย"
            );
            return res.sendStatus(200);
          }

          try {
            const confirmed = await confirmV2SalesOrderDraft(draft);
            const failedSheets = (confirmed.sheetResults || []).filter((item) => item.ok !== true);
            await reply([
              "✅ ยืนยันงานเรียบร้อย",
              `ลูกค้า: ${confirmed.customer?.display_name || "-"}`,
              `Platform: ${getPlatformLabel(confirmed.customer)}`,
              `รับเข้าคิว: ${confirmed.startedJobs.length} รีวิว`,
              "ระบบจะส่ง T0/T2 เข้ากลุ่ม Telegram ตามรอบ 00:00 / 08:00 / 12:00 / 16:00 / 20:00",
              confirmed.customerNotifyOk
                ? "แจ้ง Script เริ่มงานให้ลูกค้าแล้ว"
                : "⚠️ รับงานแล้ว แต่ส่ง Script เริ่มงานให้ลูกค้าไม่สำเร็จ กรุณาเช็กแชท",
              failedSheets.length === 0
                ? "ลง Sheet ครบแล้ว"
                : `⚠️ Sheet มีปัญหา ${failedSheets.length} งาน กรุณาตรวจสอบ log`,
            ].join("\n"));
          } catch (error) {
            console.error("TELEGRAM V2 SALES ORDER CONFIRM FAILED:", error);
            await reply(`❌ ยืนยันงานไม่สำเร็จ: ${error.message}\nกรุณาอย่ากดยืนยันซ้ำจนกว่าจะตรวจสอบสถานะ`);
          }
          return res.sendStatus(200);
        }

        const anchorJob = await getJobByLineGroupMessageId(quotedMessageId);
        if (anchorJob?.status === "waiting_credit_approval") {
          const existingCustomer = await getCustomerById(anchorJob.customer_id);
          const conversation = existingCustomer
            ? await getConversationByCustomerId(existingCustomer.id)
            : null;

          if (
            existingCustomer &&
            conversation?.handoff_reason === "EXISTING_BATCH_CREDIT_APPROVAL_PENDING"
          ) {
            const batchJobs = await getWaitingCreditApprovalJobsByCustomerId(existingCustomer.id);

            if (isCancelWork) {
              for (const job of batchJobs) {
                await updateJob(job.id, { status: "sales_rejected" });
              }
              await updateConversationState({
                customerId: existingCustomer.id,
                state: GMR_STATES.WAITING_MAP,
                handoff: false,
                handoffReason: null,
              });
              await reply(`❌ ยกเลิกชุดนี้แล้วครับ\nจำนวน ${batchJobs.length} รีวิว\nยังไม่มีงานถูกเริ่ม และระบบจะไม่ส่งข้อความยกเลิกหาลูกค้า`);
              return res.sendStatus(200);
            }

            try {
              const started = await startApprovedExistingCustomerBatch({
                customer: existingCustomer,
                conversation,
                jobs: batchJobs,
              });
              const sheetResults = await appendV2StartedJobsToMasterSheet({
                customer: existingCustomer,
                jobs: started.startedJobs,
                source: "existing_customer_telegram_sales_approved",
              });
              await sendMessageToCustomer({
                platform: existingCustomer.platform,
                platformUserId: existingCustomer.platform_user_id,
                text: started.botReply,
              });
              const sheetFails = sheetResults.filter((item) => item.ok !== true);
              await reply([
                "✅ Sales ยืนยันงานลูกค้าเก่าแล้ว",
                `รับเข้าคิว ${started.startedJobs.length} รีวิว`,
                "ส่ง Script เริ่มงานให้ลูกค้าแล้ว",
                sheetFails.length === 0 ? "ลง Sheet ครบแล้ว" : `⚠️ Sheet fail ${sheetFails.length} งาน`,
              ].join("\n"));
            } catch (error) {
              console.error("TELEGRAM V2 EXISTING BATCH CONFIRM FAILED:", error);
              await reply(`❌ เริ่มงานลูกค้าเก่าไม่สำเร็จ: ${error.message}`);
            }
            return res.sendStatus(200);
          }
        }
      }

      // UNIVERSAL REPLY PRICING — V2.2.19
      // Sales may Reply price + Review URL under any known customer-context
      // bot card (Lead Card, Human Attention, Job card, Reactivation card).
      // We never fall back to a random/pending customer.
      const directLeadCard =
        await getSalesLeadCardByLineGroupMessageId(quotedMessageId);
      const pricingParsed = parseV2SalesOrderText(groupText);
      const looksLikePricingCommand = Boolean(
        Number.isFinite(pricingParsed.price) &&
        pricingParsed.price > 0 &&
        pricingParsed.reviewUrls.length > 0
      );

      if (directLeadCard || looksLikePricingCommand) {
        const pricingContext = directLeadCard
          ? {
              customerId: directLeadCard.customer_id,
              leadCard: directLeadCard,
              source: "sales_lead_card",
            }
          : await resolveTelegramPricingCustomerContext({
              quotedMessageId,
              quotedMessage: msg.reply_to_message,
            });

        if (pricingContext?.leadCard?.customer_id) {
          console.log("TELEGRAM UNIVERSAL PRICING CONTEXT:", {
            quotedMessageId,
            customerId: pricingContext.customerId,
            source: pricingContext.source,
            reviewCount: pricingParsed.reviewUrls.length,
            price: pricingParsed.price,
            currency: pricingParsed.currency,
          });

          try {
            const prepared = await prepareV2SalesOrderDraft({
              leadCard: pricingContext.leadCard,
              groupText,
              lineUserId: actorId,
              skipPreview: true,
            });

            if (prepared?.ok) {
              const confirmed = await confirmV2SalesOrderDraft(prepared.draft);
              const failedSheets = (confirmed.sheetResults || []).filter((item) => item.ok !== true);
              const workLines = prepared.reviewItems.map(
                (item, index) => `${index + 1}. ${item.workType} | ${
                  item.reviewAgeDays === null || item.reviewAgeDays === undefined
                    ? "Sales ระบุประเภทเอง"
                    : `อายุประมาณ ${item.reviewAgeDays} วัน`
                }\n   ${item.canonicalUrl}`
              );

              console.log("V2 LEAD START COMMITTED:", {
                draftId: prepared.draft.id,
                customerId: confirmed.customer?.id || null,
                contextSource: pricingContext.source,
                jobIds: confirmed.startedJobs.map((job) => job.id),
                customerNotifyOk: confirmed.customerNotifyOk,
                failedSheetCount: failedSheets.length,
              });

              try {
                await reply([
                  "✅ รับงานและเริ่มดำเนินการแล้ว",
                  `ลูกค้า: ${confirmed.customer?.display_name || "-"}`,
                  `Platform: ${getPlatformLabel(confirmed.customer)}`,
                  `ราคา: ${formatMoney(prepared.draft.price, prepared.draft.currency)} ${prepared.draft.currency}/รีวิว`,
                  `จำนวน: ${confirmed.startedJobs.length} รีวิว`,
                  `Context: ${pricingContext.source}`,
                  "",
                  ...workLines,
                  "",
                  confirmed.customerNotifyOk
                    ? "✅ ส่งข้อความเริ่มงาน + เงื่อนไขให้ลูกค้าแล้ว"
                    : "⚠️ งานเริ่มแล้ว แต่ส่งข้อความเริ่มงานให้ลูกค้าไม่สำเร็จ กรุณาเช็กแชท",
                  failedSheets.length === 0
                    ? "✅ ลง Sheet ครบแล้ว"
                    : `⚠️ Sheet มีปัญหา ${failedSheets.length} งาน กรุณาตรวจสอบ log`,
                  "ระบบจะส่ง T0/T2 เข้ากลุ่ม Telegram ตามรอบ 00:00 / 08:00 / 12:00 / 16:00 / 20:00",
                ].join("\n"));
              } catch (ackError) {
                console.error("TELEGRAM V2 LEAD START ACK FAILED — JOB ALREADY COMMITTED:", ackError);
              }
            }
          } catch (error) {
            console.error("TELEGRAM V2 LEAD START FAILED:", error);
            try {
              await reply([
                `❌ รับงาน/เริ่มงานไม่สำเร็จ: ${error.message}`,
                "",
                "รูปแบบที่ถูกต้อง:",
                "5500",
                "https://google.com/maps/reviews/...",
              ].join("\n"));
            } catch (replyError) {
              console.error("TELEGRAM V2 LEAD START ERROR REPLY FAILED:", replyError);
            }
          }
          return res.sendStatus(200);
        }

        // A syntactically valid price+URL was Reply'd, but the quoted bot
        // message has no safe customer mapping. Never guess the customer.
        if (looksLikePricingCommand) {
          console.warn("TELEGRAM UNIVERSAL PRICING CONTEXT NOT FOUND:", {
            quotedMessageId,
            actorId,
          });
          await reply([
            "⚠️ พบราคา + Review URL แต่ระบุลูกค้าจากข้อความที่ Reply ไม่ได้",
            "ระบบยังไม่สร้าง Job และยังไม่ส่งข้อความหาลูกค้า",
            "กรุณา Reply ใต้ข้อความของ GMR Internal Bot ที่เกี่ยวกับลูกค้าคนนั้นโดยตรง",
          ].join("\n"));
          return res.sendStatus(200);
        }
      }
    }

    // -----------------------------------------------------
    // REACTIVATION TEAM DECISION
    // -----------------------------------------------------
    if (quotedMessageId && ["ส่งลูกค้า", "ข้าม"].includes(normalizedGroupText)) {
      const alert = await getReactivationAlertByLineGroupMessageId(quotedMessageId);
      if (alert) {
        if (normalizedGroupText === "ข้าม") {
          await setReactivationAlertTeamDecision({ alertId: alert.id, decision: "skip" });
          await reply("✅ ข้าม Reactivation รายการนี้แล้ว ระบบจะไม่ทักลูกค้าครับ");
          return res.sendStatus(200);
        }

        const customer = await getCustomerById(alert.customer_id);
        const customerMap = await getCustomerMapById(alert.customer_map_id);
        if (!customer) {
          await reply("❌ ไม่พบข้อมูลลูกค้าของ Reactivation นี้ครับ");
          return res.sendStatus(200);
        }

        const platformUserId = String(customer.platform_user_id || "").trim();
        const liveChatReady = Boolean(platformUserId) &&
          !platformUserId.startsWith("legacy:") &&
          customer.customer_notify !== false;

        if (!liveChatReady) {
          await reply([
            "⚠️ ตรวจ Map ได้แล้ว แต่ยังไม่มี Chat ID จริงสำหรับส่งอัตโนมัติ",
            `ลูกค้า: ${customer.display_name || "-"}`,
            `Platform: ${customer.platform || "-"}`,
            "",
            "ระบบเก็บ Alert ไว้ก่อน ไม่ได้ส่งผิดห้อง",
            "เมื่อผูกห้องแชทจริงแล้ว Reply ข้อความเดิมว่า “ส่งลูกค้า” อีกครั้งได้",
          ].join("\n"));
          return res.sendStatus(200);
        }

        const customerText = getCustomerText(
          customer,
          `ตรวจพบรีวิว 1 ดาวใหม่บน Google Maps ของ ${customerMap?.business_name || "ธุรกิจของคุณ"}\n\nReviewer: ${alert.reviewer_name || "-"}\n\nต้องการให้ทางเราตรวจสอบเพื่อดำเนินการรีวิวนี้ไหมครับ?\nหากสนใจ พิมพ์ “สนใจ” ได้เลยครับ`,
          `We found a new 1-star review on the Google Maps listing for ${customerMap?.business_name || "your business"}.\n\nReviewer: ${alert.reviewer_name || "-"}\n\nWould you like us to check this review for you?\nIf you're interested, reply “Interested”.`
        );

        await sendMessageToCustomer({
          platform: customer.platform,
          platformUserId: customer.platform_user_id,
          text: customerText,
        });
        await saveMessage({
          customerId: customer.id,
          platform: customer.platform,
          direction: "outbound",
          messageType: "text",
          messageText: customerText,
        });
        await updateLastBotMessage(customer.id, customerText);
        await setReactivationAlertTeamDecision({
          alertId: alert.id,
          decision: "send_to_customer",
        });
        await reply("✅ ส่งข้อความ Reactivation ให้ลูกค้าแล้วครับ ระบบจะรอคำตอบโดยไม่ Handoff");
        return res.sendStatus(200);
      }
    }

    // -----------------------------------------------------
    // MANUAL PAYMENT APPROVAL / REJECTION
    // -----------------------------------------------------
    if (quotedMessageId && ["ok", "okay", "ยืนยัน"].includes(normalizedGroupText)) {
      const pendingPayment = await getPaymentByLineGroupMessageId(quotedMessageId);
      if (pendingPayment) {
        if (pendingPayment.payment_verified === true || pendingPayment.review_status === "approved") {
          await reply("✅ สลิปนี้ถูกยืนยันไปแล้วครับ");
          return res.sendStatus(200);
        }
        if (pendingPayment.review_status === "rejected") {
          await reply("❌ สลิปนี้ถูกปฏิเสธไปแล้ว ไม่สามารถยืนยันย้อนหลังได้ครับ");
          return res.sendStatus(200);
        }

        const paymentJob = await getJobById(pendingPayment.job_id);
        if (!paymentJob) {
          await reply("❌ ไม่พบงานของ Payment นี้");
          return res.sendStatus(200);
        }

        const reasons = Array.isArray(pendingPayment.verification_reasons)
          ? pendingPayment.verification_reasons
          : [];
        if (reasons.includes("MULTIPLE_WAITING_PAYMENT_JOBS")) {
          await reply("⚠️ สลิปนี้เป็นยอดรวมหลายงาน ยังไม่สามารถกดยืนยันแบบงานเดียวได้ครับ กรุณาตรวจรายการทั้งหมดก่อน");
          return res.sendStatus(200);
        }

        const customer = await getCustomerById(paymentJob.customer_id);
        if (!customer) {
          await reply("❌ ไม่พบข้อมูลลูกค้าของ Payment นี้");
          return res.sendStatus(200);
        }

        const verifiedAt = new Date().toISOString();
        await updatePayment(pendingPayment.id, {
          payment_verified: true,
          verified_at: verifiedAt,
          review_status: "approved",
        });
        if (pendingPayment.slip_file_path) {
          try { await deletePaymentSlip(pendingPayment.slip_file_path); } catch (e) {
            console.error("TELEGRAM PAYMENT APPROVED SLIP DELETE FAILED:", e);
          }
        }
        await updateJob(paymentJob.id, { status: "paid", paid_at: verifiedAt });
        await updateConversationState({
          customerId: customer.id,
          state: GMR_STATES.WAITING_MAP,
          handoff: false,
          handoffReason: null,
        });
        try {
          await updateJobInGoogleSheet({
            jobId: paymentJob.id,
            status: "paid",
            paidAt: verifiedAt,
          });
        } catch (e) {
          console.error("TELEGRAM PAYMENT SHEET UPDATE FAILED:", e);
        }
        const customerReply = "ขอบคุณครับ หากมีรีวิวอื่นต้องการลบ แจ้งได้เลยนะครับ";
        try {
          await sendMessageToCustomer({
            platform: customer.platform,
            platformUserId: customer.platform_user_id,
            text: customerReply,
          });
        } catch (e) {
          console.error("TELEGRAM PAYMENT CUSTOMER REPLY FAILED:", e);
        }
        await reply("✅ ยืนยันสลิปเรียบร้อยแล้ว และแจ้งลูกค้าแล้วครับ");
        return res.sendStatus(200);
      }
    }

    if (quotedMessageId && ["no", "ไม่ผ่าน", "reject", "rejected"].includes(normalizedGroupText)) {
      const pendingPayment = await getPaymentByLineGroupMessageId(quotedMessageId);
      if (pendingPayment) {
        if (pendingPayment.payment_verified === true || pendingPayment.review_status === "approved") {
          await reply("✅ สลิปนี้ถูกยืนยันไปแล้ว ไม่สามารถปฏิเสธย้อนหลังได้ครับ");
          return res.sendStatus(200);
        }
        if (pendingPayment.review_status === "rejected") {
          await reply("❌ สลิปนี้ถูกปฏิเสธไปแล้วครับ");
          return res.sendStatus(200);
        }

        const paymentJob = await getJobById(pendingPayment.job_id);
        const customer = paymentJob ? await getCustomerById(paymentJob.customer_id) : null;
        if (!paymentJob || !customer) {
          await reply("❌ ไม่พบข้อมูลงาน/ลูกค้าของ Payment นี้");
          return res.sendStatus(200);
        }

        await updatePayment(pendingPayment.id, {
          payment_verified: false,
          verified_at: null,
          review_status: "rejected",
        });
        if (pendingPayment.slip_file_path) {
          try { await deletePaymentSlip(pendingPayment.slip_file_path); } catch (e) {
            console.error("TELEGRAM PAYMENT REJECTED SLIP DELETE FAILED:", e);
          }
        }

        const customerReply = "ตรวจสอบแล้วสลิปนี้ยังไม่สามารถยืนยันการชำระได้ครับ รบกวนตรวจสอบและส่งสลิปที่ถูกต้องอีกครั้งครับ";
        try {
          await sendMessageToCustomer({
            platform: customer.platform,
            platformUserId: customer.platform_user_id,
            text: customerReply,
          });
          await saveMessage({
            customerId: customer.id,
            platform: customer.platform,
            direction: "outbound",
            messageType: "text",
            messageText: customerReply,
          });
          await updateLastBotMessage(customer.id, customerReply);
        } catch (e) {
          console.error("TELEGRAM PAYMENT REJECTION CUSTOMER REPLY FAILED:", e);
        }
        await reply("❌ สลิปไม่ผ่านการตรวจสอบ และแจ้งลูกค้าแล้วครับ");
        return res.sendStatus(200);
      }
    }

    // -----------------------------------------------------
    // Legacy waiting-price compatibility
    // -----------------------------------------------------
    if (quotedMessageId) {
      try {
        // Safety: only enter the legacy price flow when the replied Telegram
        // message is explicitly linked to that waiting_price Job. Do not use
        // the old "single pending job" fallback because it can quote the wrong
        // customer when a V2 Lead Card reply is malformed or not found.
        const legacyAnchorJob = await getJobByLineGroupMessageId(quotedMessageId);
        if (!legacyAnchorJob || legacyAnchorJob.status !== "waiting_price") {
          return res.sendStatus(200);
        }

        const priceResult = await processLineGroupPrice({
          quotedMessageId,
          text: groupText,
        });
        if (priceResult?.ok) {
          const priceText = formatMoney(priceResult.amount, priceResult.currency);
          await reply(
            priceResult.currency === "THB"
              ? `✅ แจ้งราคาลูกค้าแล้ว\nราคา ${priceText} บาท/รีวิว`
              : `✅ แจ้งราคาลูกค้าแล้ว\nราคา $${priceText} USD/รีวิว`
          );
          return res.sendStatus(200);
        }
        if (priceResult?.reason && priceResult.reason !== "NOT_A_REPLY" && priceResult.reason !== "JOB_NOT_FOUND") {
          const reasonText = {
            INVALID_PRICE: "⚠️ กรุณาพิมพ์เฉพาะราคา เช่น 5900",
            MULTIPLE_WAITING_PRICE_JOBS: "⚠️ ตอนนี้มีหลายงานรอเสนอราคา ระบบไม่สามารถเลือกงานแทนให้อัตโนมัติได้ครับ",
            JOB_NOT_WAITING_PRICE: "⚠️ งานนี้ไม่ได้อยู่ในสถานะรอราคาแล้วครับ",
            CUSTOMER_NOT_WAITING_PRICE: "⚠️ ลูกค้ารายนี้ไม่ได้อยู่ในขั้นตอนรอราคาแล้วครับ",
          }[priceResult.reason];
          if (reasonText) await reply(reasonText);
        }
      } catch (error) {
        console.error("TELEGRAM LEGACY PRICE ERROR:", error);
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("TELEGRAM WEBHOOK ERROR:", error);
    return res.sendStatus(200); // prevent Telegram retry storms on business-logic errors
  }
});

// =========================================================
// STRIPE CHECKOUT RESULT PAGES
// =========================================================

app.get(
  "/stripe/success",
  async (req, res) => {
    res
      .status(200)
      .send(
        "Payment completed successfully. You may now return to the chat."
      );
  }
);


app.get(
  "/stripe/cancel",
  async (req, res) => {
    res
      .status(200)
      .send(
        "Payment was not completed. You may return to the chat and use the payment link again."
      );
  }
);


// =========================================================
// STRIPE WEBHOOK
//
// checkout.session.completed
// → ตรวจ Stripe signature
// → อ่าน job_ids จาก metadata
// → waiting_payment -> paid
// → สร้าง verified payment
// → update Google Sheet
// → แจ้งลูกค้าว่ารับเงินแล้ว
// =========================================================

app.post(
  "/stripe/webhook",
  async (req, res) => {

    try {

      const webhookSecret =
        String(
          process.env
            .STRIPE_WEBHOOK_SECRET ||
          ""
        ).trim();


      if (!webhookSecret) {
        throw new Error(
          "STRIPE_WEBHOOK_SECRET is not configured"
        );
      }


      const signatureHeader =
        String(
          req.get(
            "stripe-signature"
          ) || ""
        ).trim();


      if (!signatureHeader) {
        return res
          .status(400)
          .send(
            "Missing Stripe signature"
          );
      }


      if (!req.rawBody) {
        return res
          .status(400)
          .send(
            "Missing raw request body"
          );
      }


      // ========================================
      // VERIFY STRIPE SIGNATURE
      // ========================================

      const signatureParts =
        signatureHeader
          .split(",")
          .map(
            (part) =>
              part.trim()
          );


      const timestampPart =
        signatureParts.find(
          (part) =>
            part.startsWith(
              "t="
            )
        );


      const v1Parts =
        signatureParts
          .filter(
            (part) =>
              part.startsWith(
                "v1="
              )
          )
          .map(
            (part) =>
              part.slice(3)
          );


      const stripeTimestamp =
        timestampPart
          ? Number(
              timestampPart.slice(2)
            )
          : 0;


      if (
        !stripeTimestamp ||
        v1Parts.length === 0
      ) {
        return res
          .status(400)
          .send(
            "Invalid Stripe signature header"
          );
      }


      // 5-minute replay protection
      const nowSeconds =
        Math.floor(
          Date.now() / 1000
        );


      if (
        Math.abs(
          nowSeconds -
          stripeTimestamp
        ) > 300
      ) {
        return res
          .status(400)
          .send(
            "Stripe signature timestamp expired"
          );
      }


      const signedPayload =
        `${stripeTimestamp}.${req.rawBody.toString("utf8")}`;


      const expectedSignature =
        crypto
          .createHmac(
            "sha256",
            webhookSecret
          )
          .update(
            signedPayload,
            "utf8"
          )
          .digest("hex");


      const signatureValid =
        v1Parts.some(
          (providedSignature) => {

            try {

              const expectedBuffer =
                Buffer.from(
                  expectedSignature,
                  "hex"
                );

              const providedBuffer =
                Buffer.from(
                  providedSignature,
                  "hex"
                );


              return (
                expectedBuffer.length ===
                  providedBuffer.length &&
                crypto.timingSafeEqual(
                  expectedBuffer,
                  providedBuffer
                )
              );

            } catch {
              return false;
            }
          }
        );


      if (!signatureValid) {
        return res
          .status(400)
          .send(
            "Invalid Stripe signature"
          );
      }


      const event =
        req.body || {};


      // ========================================
      // ONLY HANDLE SUCCESSFUL CHECKOUT
      // ========================================

      if (
        event.type !==
        "checkout.session.completed"
      ) {

        return res
          .status(200)
          .json({
            received:
              true,

            ignored:
              true,

            type:
              event.type ||
              null,
          });
      }


      const session =
        event.data?.object ||
        null;


      if (
        !session ||
        session.payment_status !==
          "paid"
      ) {

        return res
          .status(200)
          .json({
            received:
              true,

            ignored:
              true,

            reason:
              "checkout_not_paid",
          });
      }


      // ========================================
      // READ METADATA
      // ========================================

      const customerId =
        String(
          session.metadata
            ?.customer_id ||
          ""
        ).trim();


      const jobIds =
        String(
          session.metadata
            ?.job_ids ||
          ""
        )
          .split(",")
          .map(
            (value) =>
              value.trim()
          )
          .filter(Boolean);


      if (
        !customerId ||
        jobIds.length === 0
      ) {
        throw new Error(
          "Stripe session metadata is incomplete"
        );
      }


      const verifiedAt =
        new Date().toISOString();


      const paidJobs = [];


      // ========================================
      // MARK EVERY JOB PAID
      // ========================================

      for (
        const jobId of jobIds
      ) {

        const paymentJob =
          await getJobById(
            jobId
          );


        if (!paymentJob) {
          console.error(
            "STRIPE JOB NOT FOUND:",
            {
              jobId,
              sessionId:
                session.id,
            }
          );

          continue;
        }


        // Safety:
        // ห้าม Stripe session ของ customer หนึ่ง
        // ไปจ่าย job ของ customer อีกคน
        if (
          String(
            paymentJob.customer_id ||
            ""
          ) !== customerId
        ) {
          console.error(
            "STRIPE CUSTOMER/JOB MISMATCH:",
            {
              jobId,
              sessionCustomerId:
                customerId,

              jobCustomerId:
                paymentJob.customer_id,
            }
          );

          continue;
        }


        // Webhook อาจถูก Stripe retry
        // ถ้า paid อยู่แล้วให้ข้าม
        if (
          paymentJob.status ===
          "paid"
        ) {
          paidJobs.push(
            jobId
          );

          continue;
        }


        const allowedStatus =
          [
            "waiting_payment",
            "removed_waiting_payment",
          ].includes(
            paymentJob.status
          );


        if (!allowedStatus) {
          console.warn(
            "STRIPE JOB NOT WAITING PAYMENT:",
            {
              jobId,
              status:
                paymentJob.status,
            }
          );

          continue;
        }


        const existingPayment =
          await getVerifiedPaymentByJobId(
            paymentJob.id
          );


        if (!existingPayment) {

          await createPayment({
            jobId:
              paymentJob.id,

            amount:
              Number(
                paymentJob.price ||
                0
              ),

            paymentMethod:
              "STRIPE",

            slipReceived:
              false,

            paymentVerified:
              true,

            verifiedAt,

            transactionReference:
              session.payment_intent ||
              session.id,
          });
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


        try {

          await updateJobInGoogleSheet({
            jobId:
              paymentJob.id,

            status:
              "paid",

            paidAt:
              verifiedAt,
          });

        } catch (sheetError) {

          console.error(
            "STRIPE PAID SHEET UPDATE FAILED:",
            {
              jobId:
                paymentJob.id,

              error:
                sheetError?.message ||
                String(
                  sheetError
                ),
            }
          );
        }


        paidJobs.push(
          paymentJob.id
        );
      }


      // ========================================
      // CUSTOMER
      // ========================================

      const customer =
        await getCustomerById(
          customerId
        );


      if (
        customer &&
        paidJobs.length > 0
      ) {

       const paymentReceivedReply =
  getCustomerText(
    customer,

    "รับยอดชำระเรียบร้อยแล้ว ขอบคุณครับ ✅\n\n" +
    "หากมีรีวิวอื่นที่ต้องการให้เราช่วยตรวจสอบเพิ่มเติม สามารถส่งมาให้เราได้เลยครับ",

    "Received with thanks. Our work is now completed. ✅\n\n" +
    "Please let us know if there are any other bad reviews you would like us to check."
  );


        try {

          await sendMessageToCustomer({
            platform:
              customer.platform,

            platformUserId:
              customer.platform_user_id,

            text:
              paymentReceivedReply,
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
              paymentReceivedReply,
          });


          await updateLastBotMessage(
            customer.id,
            paymentReceivedReply
          );


        } catch (notifyError) {

          // Payment ต้องถือว่าสำเร็จ
          // แม้ส่งข้อความหาลูกค้าไม่ได้
          console.error(
            "STRIPE PAID CUSTOMER NOTIFICATION FAILED:",
            notifyError
          );
        }
      }


      console.log(
        "STRIPE PAYMENT COMPLETED:",
        {
          sessionId:
            session.id,

          customerId,

          jobIds,

          paidJobs,

          amountTotal:
            session.amount_total,

          currency:
            session.currency,
        }
      );


      return res
        .status(200)
        .json({
          received:
            true,

          paidJobs,
        });


    } catch (error) {

      console.error(
        "STRIPE WEBHOOK ERROR:",
        error
      );


      return res
        .status(500)
        .json({
          received:
            false,

          error:
            error?.message ||
            String(error),
        });
    }
  }
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
// BOT CONTROL PAGE
// =========================================================

app.get(
  "/bot-control",
  async (req, res) => {
    try {
      const secret =
        String(
          req.query?.secret || ""
        ).trim();

      const expectedSecret =
        String(
          process.env
            .BOT_CONTROL_SECRET ||
          ""
        ).trim();

      if (!expectedSecret) {
        return res
          .status(500)
          .send(
            "BOT_CONTROL_SECRET not configured"
          );
      }

      if (
        !secret ||
        secret !== expectedSecret
      ) {
        return res
          .status(401)
          .send("Unauthorized");
      }

      const control =
        await getBotControl();

      const isEnabled =
        control.enabled === true;

      const statusText =
        isEnabled
          ? "BOT ON"
          : "BOT PAUSED";

      const statusColor =
        isEnabled
          ? "#16a34a"
          : "#dc2626";

      const action =
        isEnabled
          ? "pause"
          : "resume";

      const buttonText =
        isEnabled
          ? "หยุด Bot ชั่วคราว"
          : "เปิด Bot กลับมา";

      const html = `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  />

  <title>GMR Bot Control</title>

  <style>
    body {
      font-family:
        Arial,
        sans-serif;

      background:
        #f4f4f5;

      margin:
        0;

      padding:
        40px 20px;
    }

    .card {
      max-width:
        520px;

      margin:
        0 auto;

      background:
        white;

      border-radius:
        18px;

      padding:
        30px;

      box-shadow:
        0 10px 30px
        rgba(0,0,0,0.08);

      text-align:
        center;
    }

    .status {
      font-size:
        30px;

      font-weight:
        700;

      color:
        ${statusColor};

      margin-bottom:
        12px;
    }

    .detail {
      color:
        #52525b;

      margin-bottom:
        28px;

      line-height:
        1.6;
    }

    button {
      width:
        100%;

      border:
        0;

      border-radius:
        12px;

      padding:
        16px;

      font-size:
        18px;

      font-weight:
        700;

      cursor:
        pointer;

      background:
        ${isEnabled
          ? "#dc2626"
          : "#16a34a"};

      color:
        white;
    }

    .note {
      margin-top:
        20px;

      font-size:
        14px;

      color:
        #71717a;

      line-height:
        1.5;
    }
  </style>
</head>

<body>

  <div class="card">

    <div class="status">
      ${statusText}
    </div>

    <div class="detail">
      ${
        isEnabled
          ? "ระบบกำลังตอบลูกค้าตามปกติ"
          : "ระบบหยุดตอบลูกค้าชั่วคราว"
      }
    </div>

    <form
      method="post"
      action="/bot-control/change"
    >

      <input
        type="hidden"
        name="secret"
        value="${secret}"
      />

      <input
        type="hidden"
        name="action"
        value="${action}"
      />

      <button type="submit">
        ${buttonText}
      </button>

    </form>

    <div class="note">
      ระหว่าง Pause:
      ระบบจะไม่ตอบและไม่ดำเนิน Flow ลูกค้า
      <br />
      เมื่อเปิดกลับมา
      ระบบจะตอบเฉพาะข้อความใหม่หลังจากเปิด
    </div>

  </div>

</body>
</html>
`;

      return res
        .status(200)
        .type("html")
        .send(html);

    } catch (error) {
      console.error(
        "BOT CONTROL PAGE ERROR:",
        error
      );

      return res
        .status(500)
        .send(
          error.message
        );
    }
  }
);


// =========================================================
// BOT CONTROL CHANGE
// =========================================================

app.post(
  "/bot-control/change",
  express.urlencoded({
    extended: false,
  }),
  async (req, res) => {
    try {
      const secret =
        String(
          req.body?.secret || ""
        ).trim();

      const action =
        String(
          req.body?.action || ""
        )
          .trim()
          .toLowerCase();

      const expectedSecret =
        String(
          process.env
            .BOT_CONTROL_SECRET ||
          ""
        ).trim();

      if (
        !expectedSecret ||
        !secret ||
        secret !== expectedSecret
      ) {
        return res
          .status(401)
          .send("Unauthorized");
      }

      if (
        ![
          "pause",
          "resume",
        ].includes(
          action
        )
      ) {
        return res
          .status(400)
          .send(
            "Invalid action"
          );
      }

      const enabled =
        action === "resume";

      await setBotControl(
        enabled
      );

      return res.redirect(
        `/bot-control?secret=${encodeURIComponent(
          secret
        )}`
      );

    } catch (error) {
      console.error(
        "BOT CONTROL CHANGE ERROR:",
        error
      );

      return res
        .status(500)
        .send(
          error.message
        );
    }
  }
);

// =========================================================
// DEPARTMENT DISPATCH ENDPOINT
// ใช้สำหรับ Cron / Manual Trigger
// =========================================================

app.post(
  "/dispatch-departments",
  async (req, res) => {
    try {
      const secret =
        String(
          req.body?.secret || ""
        ).trim();

      const expectedSecret =
        String(
          process.env
            .DEPARTMENT_DISPATCH_SECRET ||
          ""
        ).trim();


      if (!expectedSecret) {
        console.error(
          "DEPARTMENT DISPATCH SECRET MISSING"
        );

        return res.status(500).json({
          ok: false,
          error:
            "DEPARTMENT_DISPATCH_SECRET not configured",
        });
      }


      if (
        !secret ||
        secret !== expectedSecret
      ) {
        return res.status(401).json({
          ok: false,
          error:
            "Unauthorized",
        });
      }


      const force = req.body?.force === true;
      const clock = getBangkokClockParts();

      // Old cron jobs may still call this endpoint at 04:00.
      // V2 blocks non-approved hours unless an authenticated manual call uses force=true.
      if (!force && !FIXED_DISPATCH_HOURS_TH.has(clock.hour)) {
        return res.status(200).json({
          ok: true,
          skipped: true,
          reason: "outside_fixed_dispatch_schedule",
          bangkokHour: clock.hour,
          allowedHours: Array.from(FIXED_DISPATCH_HOURS_TH),
        });
      }

      const result =
        await runDepartmentDispatch();


      return res.status(200).json(
        result
      );


    } catch (error) {
      console.error(
        "DEPARTMENT DISPATCH ENDPOINT ERROR:",
        error
      );


      return res.status(500).json({
        ok: false,
        error:
          error.message,
      });
    }
  }
);

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
// GLOBAL CUSTOMER PHONE CAPTURE + ROBUST REVIEW URL LOOKUP — V2.2.17
// =========================================================

function extractThaiTenDigitPhone(value) {
  const text = String(value || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .trim();

  if (!text) return null;

  // Accept common Thai local formats such as:
  // 0812345678 / 081-234-5678 / 081 234 5678
  // The number must be standalone, not embedded inside a longer digit string.
  const matches = text.match(/(?:^|[^\d])0(?:[\s-]?\d){9}(?!\d)/g) || [];

  for (const match of matches) {
    const digits = String(match || "").replace(/\D/g, "");
    if (/^0\d{9}$/.test(digits)) return digits;
  }

  return null;
}

function thaiPhoneToE164(localPhone) {
  const digits = String(localPhone || "").replace(/\D/g, "");
  if (!/^0\d{9}$/.test(digits)) return null;
  return `+66${digits.slice(1)}`;
}

function stripGoogleTrackingParams(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const u = new URL(raw);
    ["g_st", "entry", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
      .forEach((key) => u.searchParams.delete(key));
    return u.toString();
  } catch {
    return raw;
  }
}

function buildDirectReviewLookupCandidates(originalUrl, resolvedUrl = null) {
  const values = [];
  const add = (value) => {
    const safe = String(value || "").trim().replace(/[)\]}>，。、,.;]+$/g, "");
    if (!safe) return;
    if (!values.includes(safe)) values.push(safe);
  };

  add(normalizeInboundUrlText(originalUrl));
  add(stripGoogleTrackingParams(normalizeInboundUrlText(originalUrl)));
  add(resolvedUrl);
  add(stripGoogleTrackingParams(resolvedUrl));

  for (const value of [...values]) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded !== value) add(decoded);
    } catch {}
  }

  return values;
}

function extractGoogleReviewSkid(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const skid = parsed.searchParams.get("skid");
    return skid ? String(skid).trim().toLowerCase() : null;
  } catch {
    const match = raw.match(/[?&]skid=([^&#]+)/i);
    if (!match) return null;
    try { return decodeURIComponent(match[1]).trim().toLowerCase(); }
    catch { return String(match[1]).trim().toLowerCase(); }
  }
}


function extractGoogleMapsBusinessEntity(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch {}

  // Direct Google review URLs normally contain the business data id in a
  // segment similar to: !1s0x0:0xf2a64d766330b4d!
  const match = decoded.match(/(0x[0-9a-f]+):(0x[0-9a-f]+)/i);
  if (!match) return null;

  const dataId = `${match[1].toLowerCase()}:${match[2].toLowerCase()}`;
  const cidHex = match[2].toLowerCase();

  let cidDecimal = null;
  try {
    cidDecimal = BigInt(cidHex).toString(10);
  } catch {}

  return { dataId, cidHex, cidDecimal };
}

function extractGoogleReviewIdentityTokens(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];

  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch {}

  const tokens = new Set();
  const add = (token) => {
    const safe = String(token || "").trim().toLowerCase();
    if (safe) tokens.add(safe);
  };

  add(extractGoogleReviewSkid(decoded));

  // Google direct-review URL data contains another review identity token,
  // commonly after !2m5!1s... . Some providers expose this value as reviewId
  // instead of the skid UUID, so retain both identities for exact matching.
  const dataTokenMatch = decoded.match(/!2m5!1s([^!&]+)/i);
  if (dataTokenMatch?.[1]) add(dataTokenMatch[1]);

  return [...tokens];
}

function getReviewIdentityTokens(review) {
  if (!review || typeof review !== "object") return [];
  const tokens = new Set();
  const add = (value) => {
    const safe = String(value || "").trim().toLowerCase();
    if (safe) tokens.add(safe);
  };

  [
    review.reviewId,
    review.review_id,
    review.providerReviewId,
    review.provider_review_id,
    review.googleReviewId,
    review.google_review_id,
    review.id,
  ].forEach(add);

  const reviewUrl = String(
    review.reviewUrl ||
    review.review_url ||
    review.reviewLink ||
    review.review_link ||
    ""
  ).trim();

  for (const token of extractGoogleReviewIdentityTokens(reviewUrl)) add(token);
  return [...tokens];
}

function extractReviewsFromProviderResult(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  const candidates = [
    value.reviews,
    value.result?.reviews,
    value.data?.reviews,
    value.result,
    value.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}


function decodeBasicHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)); } catch { return _; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try { return String.fromCodePoint(parseInt(n, 16)); } catch { return _; }
    });
}

async function getGoogleReviewSharePageMeta(url) {
  const inputUrl = String(url || "").trim();
  if (!/^https?:\/\//i.test(inputUrl)) return null;

  try {
    const response = await fetch(inputUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
      },
    });

    const finalUrl = String(response.url || inputUrl).trim();
    const html = await response.text();

    const readMeta = (propertyName) => {
      const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
      ];
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) return decodeBasicHtmlEntities(match[1]).trim();
      }
      return null;
    };

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title =
      readMeta("og:title") ||
      (titleMatch?.[1] ? decodeBasicHtmlEntities(titleMatch[1]).replace(/\s+/g, " ").trim() : null);
    const description =
      readMeta("og:description") ||
      readMeta("description") ||
      null;

    let businessName = null;
    if (title) {
      const patterns = [
        /^Google review of\s+(.+?)\s*$/i,
        /^Review of\s+(.+?)\s*$/i,
        /^รีวิว(?:ของ)?\s*(.+?)\s*$/i,
        /^(.+?)\s*[-|–—]\s*Google Maps\s*$/i,
      ];
      for (const pattern of patterns) {
        const match = title.match(pattern);
        if (match?.[1]) {
          businessName = match[1].trim();
          break;
        }
      }
    }

    console.log("ROBUST REVIEW SHARE PAGE META:", {
      inputUrl,
      finalUrl,
      title: title || null,
      businessName: businessName || null,
      hasDescription: Boolean(description),
    });

    return {
      finalUrl,
      title,
      description,
      businessName,
    };
  } catch (error) {
    console.log("ROBUST REVIEW SHARE PAGE META FAILED:", {
      inputUrl,
      error: error?.message || String(error),
    });
    return null;
  }
}

async function resolvePlaceFromDirectReviewUrl({ originalUrl, resolvedUrl }) {
  const directCandidates = [originalUrl, resolvedUrl].filter(Boolean);
  const entity =
    extractGoogleMapsBusinessEntity(resolvedUrl) ||
    extractGoogleMapsBusinessEntity(originalUrl);

  const lookupCandidates = [];

  // Google review share links expose a public preview title such as
  // "Google review of <Business Name>". Telegram itself uses this metadata
  // for the link preview, so use the same server-readable metadata to recover
  // the business name before falling back to CID parsing.
  const shareMeta = await getGoogleReviewSharePageMeta(originalUrl);
  if (shareMeta?.businessName) lookupCandidates.push(shareMeta.businessName);
  if (shareMeta?.finalUrl && shareMeta.finalUrl !== originalUrl) lookupCandidates.push(shareMeta.finalUrl);

  if (entity?.cidDecimal) {
    lookupCandidates.push(
      `https://www.google.com/maps?cid=${entity.cidDecimal}`,
      `https://maps.google.com/?cid=${entity.cidDecimal}`,
      entity.dataId,
      entity.cidDecimal
    );
  }

  lookupCandidates.push(...directCandidates);

  const seen = new Set();
  for (const candidate of lookupCandidates) {
    const safeCandidate = String(candidate || "").trim();
    if (!safeCandidate || seen.has(safeCandidate)) continue;
    seen.add(safeCandidate);

    const searchInputs = [safeCandidate];

    if (/^https?:\/\//i.test(safeCandidate)) {
      try {
        const expanded = await resolveGoogleShortUrl(safeCandidate);
        if (expanded && !searchInputs.includes(expanded)) searchInputs.push(expanded);
      } catch {}
    }

    for (const searchInput of searchInputs) {
      try {
        const places = await searchPlaceByText(searchInput);
        if (Array.isArray(places) && places.length) {
          const place = places[0];
          console.log("ROBUST REVIEW PLACE RESOLVED:", {
            originalUrl,
            resolvedUrl,
            searchInput,
            entityDataId: entity?.dataId || null,
            cidDecimal: entity?.cidDecimal || null,
            placeId: place?.placeId || place?.place_id || null,
            businessName: place?.businessName || place?.name || null,
          });
          return place;
        }
      } catch (error) {
        console.log("ROBUST REVIEW PLACE SEARCH FAILED:", {
          searchInput,
          error: error?.message || String(error),
        });
      }
    }
  }

  return null;
}

function normalizeReviewUrlForExactMatch(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return stripGoogleTrackingParams(raw)
    .replace(/#.*$/, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

async function getReviewFromDirectUrlViaPlaceLists({ originalUrl, resolvedUrl }) {
  const targetTokens = new Set([
    ...extractGoogleReviewIdentityTokens(originalUrl),
    ...extractGoogleReviewIdentityTokens(resolvedUrl),
  ]);

  const targetUrls = new Set(
    [originalUrl, resolvedUrl]
      .filter(Boolean)
      .map(normalizeReviewUrlForExactMatch)
      .filter(Boolean)
  );

  const place = await resolvePlaceFromDirectReviewUrl({
    originalUrl,
    resolvedUrl,
  });

  const placeId = place?.placeId || place?.place_id || null;
  if (!placeId) {
    return {
      found: false,
      reason: "PLACE_NOT_FOUND_FOR_REVIEW_URL",
      businessEntity: extractGoogleMapsBusinessEntity(resolvedUrl || originalUrl),
    };
  }

  // Use every review source already available in this service. The direct
  // review may be old, new, or buried among many 1-star reviews; limiting the
  // fallback to only newest + lowest was the reason valid share links could
  // still be rejected after the business was resolved.
  const reviewResults = await Promise.allSettled([
    getNewestReviews(placeId),
    getLowestReviews(placeId),
    getPlaceReviews(placeId),
  ]);

  const seenReviewKeys = new Set();
  let inspectedCount = 0;

  for (const settled of reviewResults) {
    if (settled.status !== "fulfilled") continue;
    const rows = extractReviewsFromProviderResult(settled.value);

    for (const review of rows) {
      if (!review || typeof review !== "object") continue;

      const reviewUrl = String(
        review.reviewUrl ||
        review.review_url ||
        review.reviewLink ||
        review.review_link ||
        ""
      ).trim();
      const normalizedReviewUrl = normalizeReviewUrlForExactMatch(reviewUrl);
      const reviewTokens = getReviewIdentityTokens(review);
      const reviewKey =
        reviewTokens[0] ||
        normalizedReviewUrl ||
        `${review.reviewerName || review.reviewer_name || ""}|${review.isoDate || review.iso_date || ""}|${review.rating || ""}`;

      if (reviewKey && seenReviewKeys.has(reviewKey)) continue;
      if (reviewKey) seenReviewKeys.add(reviewKey);
      inspectedCount += 1;

      const exactTokenMatch = reviewTokens.some((token) => targetTokens.has(token));
      const exactUrlMatch = Boolean(
        normalizedReviewUrl && targetUrls.has(normalizedReviewUrl)
      );

      if (exactTokenMatch || exactUrlMatch) {
        console.log("ROBUST REVIEW PLACE-LIST MATCHED:", {
          originalUrl,
          resolvedUrl,
          placeId,
          targetTokens: [...targetTokens],
          reviewTokens,
          reviewUrl: reviewUrl || null,
          inspectedCount,
        });

        return {
          found: true,
          review,
          businessName: place.businessName || place.name || null,
          reason: null,
          lookupUrl: reviewUrl || resolvedUrl || originalUrl,
          resolvedUrl: resolvedUrl || originalUrl,
          matchedVia: "PLACE_LIST_EXACT",
          placeId,
        };
      }
    }
  }

  return {
    found: false,
    reason: targetTokens.size
      ? "REVIEW_ID_NOT_FOUND_IN_PLACE_REVIEW_LISTS"
      : "REVIEW_NOT_FOUND_IN_PLACE_REVIEW_LISTS",
    placeId,
    businessName: place.businessName || place.name || null,
    inspectedCount,
    targetTokens: [...targetTokens],
  };
}

async function getReviewFromDirectUrlRobust(rawUrl) {
  const originalUrl = String(rawUrl || "").trim();
  if (!originalUrl) {
    return { found: false, review: null, reason: "EMPTY_URL", lookupUrl: null, resolvedUrl: null };
  }

  let lastReason = null;
  let lastError = null;

  // First try the exact URL Sales supplied. Some provider paths understand
  // maps.app.goo.gl directly better than the expanded Google /maps/reviews URL.
  try {
    const firstResult = await getReviewFromDirectUrl(originalUrl);
    if (firstResult?.found && firstResult?.review) {
      console.log("ROBUST REVIEW ORIGINAL URL MATCHED:", {
        originalUrl,
        reviewerName: firstResult.review?.reviewerName || null,
        rating: firstResult.review?.rating || null,
      });
      return {
        ...firstResult,
        lookupUrl: originalUrl,
        resolvedUrl: originalUrl,
      };
    }
    lastReason = firstResult?.reason || lastReason;
  } catch (error) {
    lastError = error;
  }

  let resolvedUrl = null;
  try {
    resolvedUrl = await resolveGoogleShortUrl(originalUrl);
  } catch (error) {
    console.error("ROBUST REVIEW URL RESOLVE FAILED:", {
      originalUrl,
      error: error?.message || String(error),
    });
  }

  const candidates = buildDirectReviewLookupCandidates(originalUrl, resolvedUrl)
    .filter((candidate) => candidate !== originalUrl);

  for (const candidate of candidates) {
    try {
      const result = await getReviewFromDirectUrl(candidate);
      if (result?.found && result?.review) {
        console.log("ROBUST REVIEW URL MATCHED:", {
          originalUrl,
          resolvedUrl,
          lookupUrl: candidate,
          reviewerName: result.review?.reviewerName || null,
          rating: result.review?.rating || null,
        });
        return {
          ...result,
          lookupUrl: candidate,
          resolvedUrl: resolvedUrl || candidate,
        };
      }
      lastReason = result?.reason || lastReason;
      console.log("ROBUST REVIEW URL CANDIDATE NOT FOUND:", {
        originalUrl,
        candidate,
        reason: result?.reason || null,
      });
    } catch (error) {
      lastError = error;
      console.log("ROBUST REVIEW URL CANDIDATE FAILED:", {
        originalUrl,
        candidate,
        error: error?.message || String(error),
      });
    }
  }

  // Final automatic fallback: resolve the business from the Google URL,
  // fetch newest + lowest review lists, then match ONLY by exact skid/id/URL.
  // We never guess from rating/text/name.
  try {
    const placeListResult = await getReviewFromDirectUrlViaPlaceLists({
      originalUrl,
      resolvedUrl,
    });
    if (placeListResult?.found && placeListResult?.review) {
      return placeListResult;
    }
    lastReason = placeListResult?.reason || lastReason;
  } catch (error) {
    lastError = error;
    console.log("ROBUST REVIEW PLACE-LIST FALLBACK FAILED:", {
      originalUrl,
      resolvedUrl,
      error: error?.message || String(error),
    });
  }

  return {
    found: false,
    review: null,
    reason: lastReason || lastError?.message || "REVIEW_NOT_FOUND",
    lookupUrl: null,
    resolvedUrl,
  };
}

// =========================================================
// GMR CHAT V2 — HUMAN-CONTROLLED SALES FLOW
//
// New customer:
// - FAQ only
// - ask Map / business name / review URL once
// - never search business name
// - never auto-price
// - never create a Job until Sales confirms in LINE group
//
// Existing customer:
// - direct Review URL may use verified historical T0/T2 rate
// - Map URL only asks customer to send the exact Review URL
// - customer confirmation still requires Sales confirmation
// =========================================================

function looksLikeGoogleReviewUrl(value) {
  const text = normalizeInboundUrlText(value).trim();
  return /https?:\/\/[^\s]*google[^\s]*\/maps\/reviews/i.test(text) ||
    /https?:\/\/maps\.app\.goo\.gl\/[^\s]+/i.test(text) && /review/i.test(text);
}

function looksLikeGenericGmrServiceInquiry(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;

  // Prevent generic service-interest / price / FAQ messages from being
  // misclassified as a BUSINESS_NAME by the legacy input classifier.
  // These messages must stay in the FAQ / ask-for-map flow until the
  // customer actually provides a Map URL, Review URL, or business name.
  const patterns = [
    /สนใจ/,
    /ลบ\s*รีวิว/,
    /ลบ\s*รีวิว\s*google/,
    /รีวิว\s*1\s*ดาว/,
    /หนึ่งดาว/,
    /ราคา/,
    /เท่าไหร่/,
    /เท่าไร/,
    /ค่าบริการ/,
    /ทำยังไง/,
    /ทำอย่างไร/,
    /บริการ/,
    /ช่วยลบ/,
    /google\s*review/,
    /review\s*removal/,
    /remove\s+(?:a\s+)?review/,
    /delete\s+(?:a\s+)?review/,
    /remove\s+google\s+review/,
    /interested/,
    /how\s+much/,
    /price/,
    /pricing/,
    /service/,
    /can\s+you\s+remove/,
    /help\s+(?:me\s+)?remove/,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function looksLikeExplicitBusinessName(value) {
  const text = String(value || "").trim();
  if (!text) return false;

  return /^(?:ชื่อธุรกิจ|ชื่อร้าน|ร้านชื่อ|บริษัทชื่อ|business\s*name|company\s*name|shop\s*name)\s*[:：-]?\s*.+$/i.test(text);
}

function looksLikeQuestionOrConversation(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;

  if (/[?？]/.test(text)) return true;

  const patterns = [
    /ไหม(?:ครับ|ค่ะ|คะ)?$/,
    /มั้ย(?:ครับ|ค่ะ|คะ)?$/,
    /หรือเปล่า/,
    /รึเปล่า/,
    /หรือไม่/,
    /ยังไง/,
    /อย่างไร/,
    /เท่าไหร่/,
    /เท่าไร/,
    /^มี(?:บริการ|เพิ่ม|รับ|ทำ|ลบ|ช่วย|ไหม|มั้ย)/,
    /(?:ทำ|รับ|มี|ช่วย|เพิ่ม|ลบ).*(?:ไหม|มั้ย|หรือเปล่า|รึเปล่า)/,
    /^(?:how|what|why|when|where|who|can|could|would|do|does|is|are|have|has)\b/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function looksLikeSafeBareBusinessName(value) {
  const text = String(value || "").trim();
  if (!text) return false;

  if (looksLikeGenericGmrServiceInquiry(text)) return false;
  if (looksLikeQuestionOrConversation(text)) return false;

  // Avoid treating normal conversational sentences as a business name.
  if (text.length > 120) return false;
  if (text.split(/\s+/).filter(Boolean).length > 10) return false;
  if (/(?:ครับ|ค่ะ|คะ|ครับผม|นะครับ|นะคะ)$/i.test(text)) return false;

  return true;
}

function looksLikeReviewSelectionPhrase(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?。！？，,]+$/g, "")
    .replace(/\s+/g, " ");

  if (!text) return false;

  const exactPhrases = new Set([
    "this one",
    "this one please",
    "that one",
    "that one please",
    "this review",
    "this review please",
    "เอาอันนี้",
    "เอาตัวนี้",
    "เอารีวิวนี้",
    "อันนี้",
    "ตัวนี้",
    "รีวิวนี้",
    "อันนี้ครับ",
    "อันนี้ค่ะ",
    "ตัวนี้ครับ",
    "ตัวนี้ค่ะ",
    "อันนี้เลย",
    "ตัวนี้เลย",
  ]);

  if (exactPhrases.has(text)) return true;

  return /^(?:please\s+)?(?:use|choose|take|do|handle)\s+(?:this|that)(?:\s+one|\s+review)?(?:\s+please)?$/i.test(text);
}

function classifyV2LeadInput(message, messageType = "text", options = {}) {
  const text = normalizeInboundUrlText(message).trim();
  if (!text) return { actionable: false, inputType: null, payload: null };

  // A 10-digit Thai phone number is customer contact data, never a business name.
  if (extractThaiTenDigitPhone(text)) {
    return { actionable: false, inputType: "PHONE", payload: null };
  }

  if (looksLikeGoogleReviewUrl(text)) {
    const url = (text.match(/https?:\/\/[^\s]+/i) || [])[0] || text;
    return { actionable: true, inputType: "REVIEW_URL", payload: url.replace(/[),.;]+$/g, "") };
  }

  const mapUrl = extractGoogleMapsUrl(text);
  if (mapUrl) {
    return { actionable: true, inputType: "MAP_URL", payload: mapUrl.replace(/[),.;]+$/g, "") };
  }

  // Generic inquiries are never lead payloads by themselves.
  if (looksLikeGenericGmrServiceInquiry(text)) {
    return { actionable: false, inputType: "SERVICE_INQUIRY", payload: null };
  }

  // Short conversational replies that select a review/screenshot are NOT
  // business names. Let Sales handle them silently instead of creating a
  // duplicate lead acknowledgement in the customer chat.
  if (looksLikeReviewSelectionPhrase(text)) {
    return { actionable: false, inputType: "REVIEW_SELECTION", payload: null };
  }

  const classification = classifyInput({ messageType, text });
  if (classification?.type === INPUT_TYPES.BUSINESS_NAME) {
    const allowBareBusinessName = Boolean(options?.allowBareBusinessName);

    if (looksLikeExplicitBusinessName(text)) {
      return { actionable: true, inputType: "BUSINESS_NAME", payload: text };
    }

    if (allowBareBusinessName && looksLikeSafeBareBusinessName(text)) {
      return { actionable: true, inputType: "BUSINESS_NAME", payload: text };
    }
  }

  return { actionable: false, inputType: classification?.type || null, payload: null };
}

function getLeadRequestText(customer) {
  return getCustomerText(
    customer,
    "รบกวนส่งลิงก์ Google Maps หรือชื่อธุรกิจมาให้ตรวจสอบได้เลยครับ",
    "Please send your Google Maps link or business name so our team can check it for you."
  );
}

function getLeadReceivedText(customer) {
  return getCustomerText(
    customer,
    "สำหรับงานแรกเลือกมา 1 รีวิวได้เลยครับ",
    "For the first case, please choose 1 review you'd like us to handle."
  );
}

async function pushTextToMainLineGroup(text) {
  return pushTelegramSales(String(text || ""));
}

async function sendV2SalesLeadCard({ customer, payload, inputType, reason = "NEW_LEAD" }) {
  const platformLabel = getPlatformLabel(customer);
  const label =
    inputType === "REVIEW_URL" ? "Review URL" :
    inputType === "MAP_URL" ? "Google Maps" :
    inputType === "BUSINESS_NAME" ? "ชื่อธุรกิจ" : "ข้อมูลลูกค้า";

  const text = [
    reason === "EXISTING_MISSING_RATE"
      ? "👤 ลูกค้าเก่า — ไม่มีราคาประวัติประเภทนี้"
      : "🆕 ลูกค้าต้องการให้ตรวจสอบ",
    "",
    `ลูกค้า: ${customer?.display_name || "-"}`,
    `Platform: ${platformLabel}`,
    `Customer ID: ${customer?.id || "-"}`,
    "",
    `${label}:`,
    String(payload || "-"),
    "",
    "ตัวอย่าง:",
    "5500",
    "https://google.com/maps/reviews/...",
    "",
    "REPLY ราคาเมื่อลูกค้ายืนยันแล้วเท่านั้น:",
    "1–14 วัน = T0 | มากกว่า 14 วัน = T2",
  ].join("\n");

  const pushed = await pushTextToMainLineGroup(text);
  const card = await createSalesLeadCard({
    customerId: customer.id,
    lineGroupMessageId: pushed.messageId,
    payload: String(payload || ""),
    inputType,
  });

  await getOrCreateSalesLead(customer.id);
  await updateSalesLead(customer.id, {
    info_received_at: new Date().toISOString(),
    status: "open",
  });

  return { ...pushed, card };
}

async function saveV2BotReply({ customer, platform, botReply }) {
  if (!botReply) return;
  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "outbound",
    messageType: "text",
    messageText: botReply,
  });
  await updateLastBotMessage(customer.id, botReply);
}

async function handleV2NewCustomerInbound({
  customer,
  conversation,
  platform,
  message,
  messageType,
}) {
  const lead = await getOrCreateSalesLead(customer.id);

  const acceptLeadInput = async (leadInput) => {
    try {
      await sendV2SalesLeadCard({
        customer,
        payload: leadInput.payload,
        inputType: leadInput.inputType,
      });
    } catch (error) {
      console.error("V2 SALES LEAD CARD FAILED:", error);
      await triggerHumanAttention({
        customer,
        conversation,
        message,
        reason: "V2_LEAD_CARD_FAILED",
      });
    }

    // The "choose 1 review" acknowledgement is one-time only.
    // Guard both the durable lead flag and the conversation's last bot text.
    // The second guard is important for customers who received the same
    // acknowledgement before the V2 lead flag existed / was backfilled.
    let botReply = null;

    if (!lead?.info_received_at) {
      const candidateReply =
        getLeadReceivedText(customer);

      const freshConversation =
        await getConversationByCustomerId(
          customer.id
        );

      const alreadySentSameAck =
        shouldSuppressDuplicateBotReply({
          conversation:
            freshConversation ||
            conversation,
          botReply:
            candidateReply,
        });

      if (!alreadySentSameAck) {
        botReply = candidateReply;
      }
    }

    if (botReply) {
      await saveV2BotReply({ customer, platform, botReply });
    }

    return {
      handled: true,
      result: {
        ok: true,
        customerId: customer.id,
        stateBefore: conversation.state,
        stateAfter: conversation.state,
        v2Lead: true,
        inputType: leadInput.inputType,
        botReply,
      },
    };
  };

  // 1) Explicit lead data only: Review URL / Map URL / "ชื่อร้าน: ...".
  // Bare BUSINESS_NAME is intentionally disabled here so FAQ/questions cannot
  // be swallowed by the legacy business-name classifier before FAQ matching.
  const explicitLeadInput = classifyV2LeadInput(message, messageType, {
    allowBareBusinessName: false,
  });

  if (explicitLeadInput.actionable) {
    return acceptLeadInput(explicitLeadInput);
  }

  // 2) FAQ has priority over a bare business-name guess.
  // Example: "มีเพิ่มดาวไหม" must match the FAQ keyword "เพิ่มดาว" rather
  // than being treated as a business name / lead payload.
  const faqMatch = await getGlobalFaqReply({ customer, message });
  if (faqMatch?.reply) {
    let botReply = faqMatch.reply;

    if (!lead?.info_requested_at) {
      botReply = `${botReply}\n\n${getLeadRequestText(customer)}`;
      await updateSalesLead(customer.id, {
        info_requested_at: new Date().toISOString(),
      });
    }

    await saveV2BotReply({ customer, platform, botReply });

    return {
      handled: true,
      result: {
        ok: true,
        customerId: customer.id,
        stateBefore: conversation.state,
        stateAfter: conversation.state,
        faqMatched: true,
        faqKey: faqMatch.faqKey,
        botReply,
      },
    };
  }

  // 3) After we have already asked once for Map/business info, allow a plain
  // business name — but only if it looks like a name, not a question/sentence.
  if (lead?.info_requested_at) {
    const bareBusinessLeadInput = classifyV2LeadInput(message, messageType, {
      allowBareBusinessName: true,
    });

    if (
      bareBusinessLeadInput.actionable &&
      bareBusinessLeadInput.inputType === "BUSINESS_NAME"
    ) {
      return acceptLeadInput(bareBusinessLeadInput);
    }
  }

  // 4) First non-FAQ contact: ask for Map/business once only.
  if (!lead?.info_requested_at) {
    const botReply = getLeadRequestText(customer);

    await updateSalesLead(customer.id, {
      info_requested_at: new Date().toISOString(),
    });

    await saveV2BotReply({ customer, platform, botReply });

    return {
      handled: true,
      result: {
        ok: true,
        customerId: customer.id,
        stateBefore: conversation.state,
        stateAfter: conversation.state,
        v2LeadRequest: true,
        botReply,
      },
    };
  }

  // 5) Unknown/non-FAQ after the one-time request:
  // notify Sales internally and stay silent in the customer chat.
  await triggerHumanAttention({
    customer,
    conversation,
    message,
    reason: "V2_NEW_CUSTOMER_NON_FAQ",
  });

  return {
    handled: true,
    result: {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      botReply: null,
      softHandoff: true,
      note: "Non-FAQ question sent to Sales. Bot remains available for later FAQ messages.",
    },
  };
}

function parseV2SalesOrderText(text) {
  const raw = String(text || "").trim();
  const allUrls = raw.match(/https?:\/\/[^\s]+/gi) || [];

  // Accept all plausible Google Maps URL shapes here, not only /maps/reviews.
  // Google currently produces several review/share formats such as:
  // - google.<tld>/maps/reviews/...
  // - google.<tld>/maps/place/...
  // - maps.app.goo.gl/...
  // - goo.gl/maps/...
  // The next stage (getReviewFromDirectUrl) remains the authority that
  // verifies whether the URL actually resolves to a specific review.
  const isPotentialGoogleMapsUrl = (url) => {
    const value = String(url || "").trim().toLowerCase();
    if (!value) return false;
    if (/^https?:\/\/maps\.app\.goo\.gl\//i.test(value)) return true;
    if (/^https?:\/\/(?:www\.)?goo\.gl\/maps\//i.test(value)) return true;
    if (/^https?:\/\/(?:www\.)?google\.[^/]+\/maps(?:[/?#]|$)/i.test(value)) return true;
    return false;
  };

  const reviewUrls = Array.from(new Set(
    allUrls
      .map((url) => url.replace(/[)\]}>，。、,.;:!?]+$/g, "").trim())
      .filter(isPotentialGoogleMapsUrl)
  ));

  const nonUrlLines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^https?:\/\//i.test(line) && !/^(งาน|\/job)$/i.test(line));

  let amount = null;
  let currency = null;
  let workTypeOverride = null;

  for (const line of nonUrlLines) {
    const typeMatch = String(line || "").toUpperCase().match(/(?:^|\s)(T0|T2)(?:\s|$)/);
    if (typeMatch && !workTypeOverride) workTypeOverride = typeMatch[1];
  }

  for (const line of nonUrlLines) {
    const match = line.replace(/,/g, "").match(/(?:ราคา\s*[:=]?\s*)?\$?\s*(\d+(?:\.\d{1,2})?)\s*(THB|USD|บาท)?/i);
    if (!match) continue;
    amount = Number(match[1]);
    const token = String(match[2] || "").toUpperCase();
    if (token === "USD" || line.includes("$")) currency = "USD";
    else if (token === "THB" || /บาท/i.test(line)) currency = "THB";
    break;
  }

  if (Number.isFinite(amount) && amount > 0 && !currency) {
    currency = amount >= 2500 ? "THB" : "USD";
  }

  return { price: amount, currency, reviewUrls, workTypeOverride };
}

function buildV2CustomerQuoteText({ customer, draft, reviewItems }) {
  const unitPrice = Number(draft?.price || 0);
  const currency = String(draft?.currency || "THB").toUpperCase();
  const count = Array.isArray(reviewItems) ? reviewItems.length : 0;
  const priceText = currency === "THB"
    ? `${formatMoney(unitPrice, "THB")} บาท/รีวิว`
    : `$${formatMoney(unitPrice, "USD")} USD/รีวิว`;
  const total = unitPrice * count;
  const totalText = currency === "THB"
    ? `${formatMoney(total, "THB")} บาท`
    : `$${formatMoney(total, "USD")} USD`;

  return getCustomerText(
    customer,
    [
      "ตรวจสอบแล้วครับ รีวิวที่เลือกสามารถดำเนินการได้ ✅",
      "",
      `ราคา: ${priceText}`,
      `จำนวน: ${count} รีวิว`,
      count > 1 ? `รวมกรณีสำเร็จทั้งหมด: ${totalText}` : null,
      "",
      "หากต้องการเริ่มดำเนินการ แจ้งยืนยันในแชทได้เลยครับ",
    ].filter(Boolean).join("\n"),
    [
      "Checked. The selected review(s) can be processed. ✅",
      "",
      `Price: ${priceText}`,
      `Quantity: ${count} review(s)`,
      count > 1 ? `Total if all are successful: ${totalText}` : null,
      "",
      "If you would like us to proceed, please confirm in this chat.",
    ].filter(Boolean).join("\n")
  );
}

async function prepareV2SalesOrderDraft({ leadCard, groupText, lineUserId = null, skipPreview = false }) {
  const customer = await getCustomerById(leadCard.customer_id);
  if (!customer) throw new Error("ไม่พบลูกค้าที่ผูกกับข้อความนี้");

  const parsed = parseV2SalesOrderText(groupText);
  if (!Number.isFinite(parsed.price) || parsed.price <= 0) {
    throw new Error("กรุณาระบุราคา เช่น 5500 THB หรือ 250 USD");
  }
  if (!parsed.reviewUrls.length) {
    throw new Error("ไม่พบ Review URL กรุณาวางลิงก์รีวิวอย่างน้อย 1 ลิงก์");
  }

  const reviewItems = [];
  const errors = [];

  for (let index = 0; index < parsed.reviewUrls.length; index++) {
    const originalUrl = parsed.reviewUrls[index];
    try {
      const directResult = await getReviewFromDirectUrlRobust(originalUrl);

      let review = directResult?.review || null;
      let canonicalUrl =
        review?.reviewUrl ||
        directResult?.lookupUrl ||
        directResult?.resolvedUrl ||
        originalUrl;
      let ageDays = review ? getReviewAgeDays(review) : null;
      let forcedWorkType = null;

      if (!directResult?.found || !review) {
        const resolvedDirectUrl = String(directResult?.resolvedUrl || "").trim();
        const looksLikeResolvedDirectReview =
          /google\.[^/]+\/maps\/reviews\/data=/i.test(resolvedDirectUrl) ||
          Boolean(extractGoogleReviewSkid(resolvedDirectUrl));

        if (parsed.workTypeOverride && looksLikeResolvedDirectReview) {
          forcedWorkType = parsed.workTypeOverride;
          canonicalUrl = resolvedDirectUrl || originalUrl;
          ageDays = forcedWorkType === "T0" ? 14 : 15;
          review = {
            reviewUrl: canonicalUrl,
            reviewerName: null,
            rating: null,
            text: null,
            reviewText: null,
            isoDate: null,
            reviewId: extractGoogleReviewSkid(canonicalUrl),
          };
          console.log("V2 SALES REVIEW MANUAL T0/T2 FALLBACK:", {
            originalUrl,
            canonicalUrl,
            workType: forcedWorkType,
            providerReason: directResult?.reason || null,
          });
        } else {
          const reason = String(directResult?.reason || "UNKNOWN");
          const suffix = looksLikeResolvedDirectReview
            ? " — Google ยืนยันว่าเป็น direct review link แต่ Provider อ่าน metadata ไม่ได้; Reply ใหม่โดยเพิ่ม T0 หรือ T2 เช่น `3500 T2` + URL"
            : "";
          errors.push(`${index + 1}. ตรวจ Review URL ไม่สำเร็จ: ${originalUrl} (${reason})${suffix}`);
          continue;
        }
      }

      if (!forcedWorkType && (ageDays === null || ageDays === undefined || !Number.isFinite(Number(ageDays)))) {
        errors.push(`${index + 1}. ระบุอายุรีวิวไม่ได้: ${originalUrl} — Reply ใหม่โดยเพิ่ม T0 หรือ T2 เช่น 3500 T2 + URL`);
        continue;
      }

      const existingJob =
        (await getJobByCustomerAndReviewUrl(customer.id, canonicalUrl)) ||
        (canonicalUrl !== originalUrl
          ? await getJobByCustomerAndReviewUrl(customer.id, originalUrl)
          : null);
      if (existingJob) {
        errors.push(`${index + 1}. ลิงก์นี้มี Job อยู่แล้ว (${existingJob.status}): ${canonicalUrl}`);
        continue;
      }

      const department = await getDepartmentForReviewAge(Number(ageDays));
      if (!department?.id) {
        errors.push(`${index + 1}. หาแผนก T0/T2 ไม่ได้: ${canonicalUrl}`);
        continue;
      }

      reviewItems.push({
        originalUrl,
        canonicalUrl,
        businessName: directResult.businessName || null,
        reviewerName: review.reviewerName || null,
        rating: Number(review.rating) || null,
        reviewText: review.text || review.reviewText || null,
        reviewDate: review.isoDate || null,
        providerReviewId: review.reviewId || null,
        reviewAgeDays: forcedWorkType ? null : Number(ageDays),
        workType: forcedWorkType || (Number(ageDays) <= 14 ? "T0" : "T2"),
        departmentId: department.id,
      });
    } catch (error) {
      errors.push(`${index + 1}. ตรวจลิงก์ไม่ได้: ${originalUrl} (${error.message})`);
    }
  }

  if (errors.length > 0 || reviewItems.length !== parsed.reviewUrls.length) {
    const text = [
      "❌ ยังรับงานไม่ได้ กรุณาตรวจลิงก์ก่อน",
      "",
      ...errors,
      "",
      "แก้ข้อมูลแล้ว Reply ข้อความลูกค้าเดิมอีกครั้ง พร้อมราคา + Review URL",
      "⚠️ ยังไม่มี Job ถูกสร้าง และยังไม่มีงานลง Sheet",
    ].join("\n");
    await pushTextToMainLineGroup(text);
    return { ok: false, validationFailed: true, errors };
  }

  const draft = await createSalesOrderDraft({
    customerId: customer.id,
    leadCardId: leadCard.id,
    price: parsed.price,
    currency: parsed.currency,
    reviewItems,
    createdByLineUserId: lineUserId,
  });

  const total = parsed.price * reviewItems.length;
  const totalText = parsed.currency === "THB"
    ? `${formatMoney(total, "THB")} บาท`
    : `$${formatMoney(total, "USD")} USD`;

  const reviewLines = reviewItems.flatMap((item, index) => [
    `${index + 1}. ${item.canonicalUrl}`,
    `   ประเภท: ${item.workType} | อายุประมาณ ${item.reviewAgeDays} วัน`,
  ]);

  // Telegram Sales may use price + Review URL as the final authorization
  // to start immediately. In that mode, do not emit the old pending preview.
  if (skipPreview) {
    return { ok: true, customer, draft, reviewItems, previewMessageId: null };
  }

  const previewText = [
    "📋 ตรวจสอบงานก่อนรับเข้าระบบ",
    "",
    `ลูกค้า: ${customer.display_name || "-"}`,
    `Platform: ${getPlatformLabel(customer)}`,
    `Customer ID: ${customer.id}`,
    "",
    `ราคา: ${formatMoney(parsed.price, parsed.currency)} ${parsed.currency} / รีวิว`,
    `จำนวน: ${reviewItems.length} รีวิว`,
    `รวมกรณีสำเร็จทั้งหมด: ${totalText}`,
    "",
    ...reviewLines,
    "",
    "⚠️ งานยังไม่ได้เริ่ม / ยังไม่ลง Sheet",
    "",
    "✅ ถูกต้อง: Reply ข้อความนี้แล้วพิมพ์  ยืนยันงาน",
    "❌ ข้อมูลผิด: Reply ข้อความนี้แล้วพิมพ์  ยกเลิก",
  ].join("\n");

  const pushed = await pushTextToMainLineGroup(previewText);
  await setSalesOrderDraftPreviewMessage({ draftId: draft.id, messageId: pushed.messageId });

  return { ok: true, customer, draft, reviewItems, previewMessageId: pushed.messageId };
}

async function appendV2StartedJobsToMasterSheet({ customer, jobs, source = "sales_line" }) {
  const results = [];
  for (const job of jobs) {
    try {
      await appendJobToGoogleSheet({
        jobId: job.id,
        customerId: customer.id,
        customerName: customer.display_name || "",
        platform: customer.platform || "",
        phone: customer.phone || "",
        businessName: job.business_name || "",
        reviewUrl: job.review_url || "",
        price: Number(job.price || 0),
        status: job.status || "queued",
        startedAt: job.queued_at || new Date().toISOString(),
        removedAt: "",
        paidAt: "",
        email: customer.email || "",
        currency: job.currency || "THB",
        source,
        customerNotify: true,
      });
      results.push({ jobId: job.id, ok: true });
    } catch (error) {
      console.error("V2 MASTER SHEET APPEND FAILED:", { jobId: job.id, error: error.message });
      results.push({ jobId: job.id, ok: false, error: error.message });
    }
  }
  return results;
}

async function confirmV2SalesOrderDraft(draft) {
  if (!draft || draft.status !== "pending_confirmation") {
    throw new Error("งานชุดนี้ไม่ได้อยู่ในสถานะรอยืนยันแล้ว");
  }

  const customer = await getCustomerById(draft.customer_id);
  if (!customer) throw new Error("ไม่พบข้อมูลลูกค้า");

  const items = Array.isArray(draft.review_items) ? draft.review_items : [];
  if (!items.length) throw new Error("Draft ไม่มี Review URL");

  const stagedJobs = [];
  for (const item of items) {
    let job = await getJobByCustomerAndReviewUrl(customer.id, item.canonicalUrl);
    if (job && !["waiting_credit_approval"].includes(String(job.status))) {
      throw new Error(`Review นี้มี Job อยู่แล้ว: ${item.canonicalUrl}`);
    }

    if (!job) {
      job = await createJob({
        customerId: customer.id,
        businessName: item.businessName || null,
        reviewUrl: item.canonicalUrl,
        reviewCase: "direct_review",
        reviewVisible: true,
        reviewHasText: Boolean(String(item.reviewText || "").trim()),
        departmentId: item.departmentId,
        status: "waiting_credit_approval",
      });

      await saveReviewCandidate({
        customerId: customer.id,
        jobId: job.id,
        businessName: item.businessName || null,
        reviewerName: item.reviewerName || null,
        rating: item.rating || null,
        reviewText: item.reviewText || null,
        reviewDate: item.reviewDate || null,
        reviewUrl: item.canonicalUrl,
        providerReviewId: item.providerReviewId || null,
        isRecent: item.workType === "T0",
        isVisible: true,
        hasText: Boolean(String(item.reviewText || "").trim()),
      });
    }

    job = await updateJob(job.id, {
      price: Number(draft.price),
      currency: String(draft.currency || "THB").toUpperCase(),
      status: "waiting_credit_approval",
      source: `sales_line:${draft.id}`,
      customer_notify: true,
    });
    stagedJobs.push(job);
  }

  const conversation = await getOrCreateConversation(customer.id);
  const startResult = await startApprovedExistingCustomerBatch({
    customer,
    conversation,
    jobs: stagedJobs,
  });

  const sheetResults = await appendV2StartedJobsToMasterSheet({
    customer,
    jobs: startResult.startedJobs,
    source: "sales_line",
  });

  await updateSalesOrderDraft(draft.id, {
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
  });
  await updateSalesLead(customer.id, { status: "converted" });

  let customerNotifyOk = true;
  try {
    await sendMessageToCustomer({
      platform: customer.platform,
      platformUserId: customer.platform_user_id,
      text: startResult.botReply,
    });
  } catch (error) {
    customerNotifyOk = false;
    console.error("V2 START CUSTOMER NOTIFICATION FAILED:", error);
  }

  return {
    customer,
    startedJobs: startResult.startedJobs,
    botReply: startResult.botReply,
    sheetResults,
    customerNotifyOk,
  };
}

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
let existingCustomer =
  await getCustomerByPlatformUserId(
    platform,
    platformUserId
  );

// =========================================================
// LEGACY MONITORING SHELL → LIVE CHAT ATTACH
//
// Nightly Legacy import can create a monitoring-only customer
// BEFORE that person ever messages the new bot. When the same
// name later messages on the same platform, attach the shell to
// the real platform user ID so rates/maps/history stay on one ID.
// =========================================================
if (!existingCustomer && String(displayName || "").trim()) {
  try {
    const legacyMonitoringMatches =
      await findLegacyMonitoringCustomersByPlatformAndDisplayName({
        platform,
        displayName,
      });

    if (legacyMonitoringMatches.length === 1) {
      const attached =
        await attachLegacyMonitoringCustomer({
          customerId: legacyMonitoringMatches[0].id,
          platformUserId,
          displayName,
        });

      if (attached) {
        existingCustomer = attached;

        console.log("LEGACY MONITORING CUSTOMER ATTACHED TO LIVE CHAT:", {
          customerId: attached.id,
          platform,
          platformUserId,
          displayName,
        });
      }
    } else if (legacyMonitoringMatches.length > 1) {
      console.warn("LEGACY MONITORING LIVE ATTACH AMBIGUOUS:", {
        platform,
        displayName,
        matchCount: legacyMonitoringMatches.length,
        customerIds: legacyMonitoringMatches.map((item) => item.id),
      });
    }
  } catch (attachError) {
    console.error("LEGACY MONITORING LIVE ATTACH FAILED:", {
      platform,
      platformUserId,
      displayName,
      error: attachError?.message || String(attachError),
    });
  }
}

const messageHasThai =
  /[\u0E00-\u0E7F]/.test(
    String(message || "")
  );

const normalizedPlatform =
  String(platform || "")
    .trim()
    .toLowerCase();

const forceEnglishPage =
  normalizedPlatform === "facebook_en" ||
  normalizedPlatform === "fb_en";

const isThaiFacebookPage =
  normalizedPlatform === "facebook_th" ||
  normalizedPlatform === "fb_th";

const thaiLocked =
  existingCustomer?.language_locked === true;

// URL / attachment-only payloads do not carry a reliable language signal.
// ManyChat often forwards an image as a CDN URL, which previously caused a
// brand-new Facebook TH customer to be detected as English.
const languageBearingText =
  String(message || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[\s\p{P}\p{S}_]+/gu, "")
    .trim();

const hasLanguageBearingText =
  Boolean(languageBearingText);

let detectedLanguage;

// =========================================================
// LANGUAGE POLICY
//
// Facebook EN = English 100%
// Facebook TH = Auto detect when real text exists; otherwise TH default
// LINE        = Auto detect
// =========================================================

if (forceEnglishPage) {

  detectedLanguage = "en";

} else if (messageHasThai) {

  detectedLanguage = "th";

} else if (
  isThaiFacebookPage &&
  !hasLanguageBearingText
) {

  detectedLanguage =
    existingCustomer?.language ||
    "th";

} else {

  detectedLanguage =
    detectCustomerLanguage(
      message,
      existingCustomer?.language ||
        (isThaiFacebookPage ? "th" : "en")
    );
}


let customer =
  existingCustomer ||
  await getOrCreateCustomer({
    platform,
    platformUserId,
    displayName,
    language:
      detectedLanguage,
  });


// =========================================================
// UPDATE CUSTOMER LANGUAGE
// =========================================================

if (forceEnglishPage) {

  if (
    customer.language !== "en"
  ) {
    customer =
      await updateCustomerLanguage(
        customer.id,
        "en"
      );
  }

} else if (messageHasThai) {

  if (
    customer.language !== "th"
  ) {
    customer =
      await updateCustomerLanguage(
        customer.id,
        "th"
      );
  }

} else {

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
let conversation =
  await getOrCreateConversation(
    customer.id
  );

// =========================================================
// LEGACY CUSTOMER AUTO MATCH CHECK
//
// ใช้เฉพาะ LINE
// - ชื่อตรง 1 คน → ส่งให้ทีมยืนยัน
// - ชื่อตรงหลายคน → ห้ามเดา ส่ง Human Attention
// - ไม่เจอ → เข้า Flow ปกติ
// =========================================================

if (
  String(platform || "")
    .toLowerCase() === "line"
) {

  const legacyMatches =
  await getPendingLegacyCustomersByDisplayName(
    customer.display_name,
    "line",
    "line_main"
  );

  console.log(
    "LEGACY CUSTOMER MATCH CHECK:",
    {
      customerId:
        customer.id,

      displayName:
        customer.display_name,

      matchCount:
        legacyMatches.length,

      legacyIds:
        legacyMatches.map(
          (item) => item.id
        ),
    }
  );


  // ========================================
  // เจอเพียง 1 คน
  // → ส่งให้ทีมตรวจ
  // ========================================

  if (
    legacyMatches.length === 1
  ) {

    const legacyCustomer =
      legacyMatches[0];


    try {

     const matchRequest =
  await sendLegacyCustomerMatchRequest({
    customer,
    legacyCustomer,

    message:
      message || null,

    messageType:
      messageType || "text",
  });


      await updateConversationState({
        customerId:
          customer.id,

        state:
          GMR_STATES.HANDOFF,

        handoff:
          true,

        handoffReason:
          "LEGACY_MATCH_PENDING",
      });


      console.log(
        "LEGACY MATCH REQUEST SENT:",
        {
          customerId:
            customer.id,

          legacyCustomerId:
            legacyCustomer.id,

          lineGroupMessageId:
            matchRequest.messageId,
        }
      );


      return {
        ok: true,

        customerId:
          customer.id,

        legacyMatchPending:
          true,

        legacyCustomerId:
          legacyCustomer.id,

        stateBefore:
          conversation.state,

        stateAfter:
          GMR_STATES.HANDOFF,

        botReply:
          null,
      };


    } catch (error) {

      console.error(
        "LEGACY MATCH REQUEST FAILED:",
        {
          customerId:
            customer.id,

          legacyCustomerId:
            legacyCustomer.id,

          error:
            error.message,
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
          "LEGACY_MATCH_REQUEST_FAILED",
      });


      await triggerHumanAttention({
        customer,
        conversation,

        message:
          `พบ Legacy Customer ชื่อตรงกัน แต่ส่งคำขอยืนยันไม่สำเร็จ: ${
            legacyCustomer.display_name ||
            "-"
          } / ${
            legacyCustomer.business_name ||
            "-"
          }`,

        reason:
          "LEGACY_MATCH_REQUEST_FAILED",
      });


      return {
        ok: true,

        customerId:
          customer.id,

        legacyMatchPending:
          true,

        legacyMatchError:
          true,

        botReply:
          null,
      };
    }
  }


  // ========================================
  // เจอมากกว่า 1 คน
  // → ห้ามเลือกเอง
  // ========================================

  if (
    legacyMatches.length > 1
  ) {

    const candidateText =
      legacyMatches
        .map(
          (
            item,
            index
          ) =>
            `${index + 1}. ${
              item.display_name ||
              "-"
            } / ${
              item.business_name ||
              "-"
            }`
        )
        .join("\n");


    await updateConversationState({
      customerId:
        customer.id,

      state:
        GMR_STATES.HANDOFF,

      handoff:
        true,

      handoffReason:
        "LEGACY_MATCH_AMBIGUOUS",
    });


    await triggerHumanAttention({
      customer,
      conversation,

      message:
        `พบ Legacy Customer ชื่อซ้ำหลายรายการ\n${candidateText}`,

      reason:
        "LEGACY_MATCH_AMBIGUOUS",
    });


    return {
      ok: true,

      customerId:
        customer.id,

      legacyMatchAmbiguous:
        true,

      legacyMatchCount:
        legacyMatches.length,

      botReply:
        null,
    };
  }
}

  
// =========================================================
// CUSTOMER TYPE
// =========================================================

const customerType =
  await getCustomerType(
    customer.id
  );

const isExistingCustomer =
  customerType ===
  "EXISTING_CUSTOMER";

const isNewCustomer =
  customerType ===
  "NEW_CUSTOMER";


let existingCustomerRates =
  null;

if (isExistingCustomer) {
  existingCustomerRates =
    await getExistingCustomerRates(
      customer.id
    );
}


console.log(
  "CUSTOMER TYPE:",
  {
    customerId:
      customer.id,

    customerType,

    isExistingCustomer,

    rates:
      existingCustomerRates,
  }
);

// =========================================================
// EXISTING CUSTOMER - START NEW JOB WHILE OLD JOB UNPAID
//
// ลูกค้าเก่าสามารถส่งงานใหม่ได้
// แม้ยังมีงานเก่า waiting_payment อยู่
//
// IMPORTANT:
// - ไม่แก้ status งานเก่า
// - ไม่ถือว่างานเก่าชำระแล้ว
// - เปิด Conversation สำหรับงานใหม่เท่านั้น
// =========================================================

const incomingMapUrl =
  extractGoogleMapsUrl(
    message
  );

const incomingClassification =
  incomingMapUrl
    ? {
        type:
          INPUT_TYPES.MAP_URL,
        confidence: 1,
      }
    : classifyInput({
        messageType,
        text:
          message || "",
      });

const isNewJobInput =
  [
    INPUT_TYPES.MAP_URL,
    INPUT_TYPES.REVIEW_URL,
  ].includes(
    incomingClassification.type
  );


if (
  isExistingCustomer &&
  conversation.state ===
    GMR_STATES.REMOVED_WAITING_PAYMENT &&
  isNewJobInput
) {
  console.log(
    "EXISTING CUSTOMER STARTING NEW JOB WHILE OLD PAYMENT PENDING:",
    {
      customerId:
        customer.id,

      previousState:
        conversation.state,

      inputType:
        incomingClassification.type,
    }
  );

  await updateConversationState({
    customerId:
      customer.id,

    state:
      GMR_STATES.NEW,

    handoff:
      false,

    handoffReason:
      null,
  });

  conversation =
    await getConversationByCustomerId(
      customer.id
    );
}
  
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

  // =======================================================
  // GLOBAL 10-DIGIT PHONE CAPTURE — V2.2.15
  // Store a Thai 10-digit phone whenever the customer sends it,
  // regardless of the current conversation state. This does not
  // force a state transition and does not send an extra bot reply.
  // =======================================================
  const capturedLocalPhone = extractThaiTenDigitPhone(message);
  if (capturedLocalPhone) {
    const capturedPhoneE164 = thaiPhoneToE164(capturedLocalPhone);
    if (capturedPhoneE164 && String(customer.phone || "").trim() !== capturedPhoneE164) {
      try {
        await updateCustomerPhone(customer.id, capturedPhoneE164);
        customer = { ...customer, phone: capturedPhoneE164 };
        console.log("GLOBAL CUSTOMER PHONE CAPTURED:", {
          customerId: customer.id,
          platform,
          phone: capturedPhoneE164,
        });
      } catch (phoneCaptureError) {
        console.error("GLOBAL CUSTOMER PHONE CAPTURE FAILED:", {
          customerId: customer.id,
          platform,
          error: phoneCaptureError?.message || String(phoneCaptureError),
        });
      }
    }
  }

  // =======================================================
  // REACTIVATION CUSTOMER RESPONSE
  // ทีมอนุมัติให้ทักลูกค้าแล้วเท่านั้น
  // สนใจ -> ป้อน review URL กลับเข้า Existing Customer flow เดิม
  // ไม่สนใจ -> ปิด lead และคง State เดิม
  // =======================================================
  const pendingReactivation =
    await getPendingReactivationAlertByCustomerId(customer.id);

  if (pendingReactivation && messageType === "text") {
    const reactText = String(message || "").trim().toLowerCase();
    const interestedWords = [
      "สนใจ", "สนใจครับ", "สนใจค่ะ", "เอาครับ", "เอาค่ะ",
      "ดำเนินการ", "ได้", "yes", "interested", "proceed", "go ahead", "ok", "okay"
    ];
    const declineWords = [
      "ไม่สนใจ", "ไม่เอา", "ข้าม", "ไม่ครับ", "ไม่ค่ะ",
      "no", "not interested", "skip", "no thanks"
    ];

    if (declineWords.includes(reactText)) {
      await updateReactivationAlertCustomerResponse({
        alertId: pendingReactivation.id,
        response: message,
        status: "customer_declined",
      });
      const declineReply = getCustomerText(
        customer,
        "รับทราบครับ หากต้องการให้ช่วยตรวจสอบรีวิวอื่น สามารถส่งลิงก์มาได้ตลอดครับ",
        "Understood. If you'd like us to check another review, you can send the review link at any time."
      );
      await saveMessage({
        customerId: customer.id, platform, direction: "outbound",
        messageType: "text", messageText: declineReply,
      });
      await updateLastBotMessage(customer.id, declineReply);
      return {
        ok: true, customerId: customer.id,
        stateBefore: conversation.state, stateAfter: conversation.state,
        reactivationDeclined: true, botReply: declineReply,
      };
    }

    if (interestedWords.includes(reactText)) {
      await updateReactivationAlertCustomerResponse({
        alertId: pendingReactivation.id,
        response: message,
        status: "customer_interested",
      });

      const reviewUrl = String(pendingReactivation.review_url || "").trim();
      if (!reviewUrl) {
        await triggerHumanAttention({
          customer, conversation, message,
          reason: "REACTIVATION_INTEREST_NO_REVIEW_URL",
        });
        return {
          ok: true, customerId: customer.id,
          stateBefore: conversation.state, stateAfter: conversation.state,
          botReply: null, softHandoff: false,
          note: "Reactivation interested but review URL missing; Sales notified.",
        };
      }

      // เปลี่ยนสถานะชั่วคราวเป็น NEW เพื่อให้ Existing Customer direct-review flow
      // รับ review นี้เหมือนลูกค้าส่งลิงก์เข้ามาเอง โดยยังคง payment history เดิม
      await updateConversationState({
        customerId: customer.id,
        state: GMR_STATES.NEW,
        handoff: false,
        handoffReason: null,
      });

      const replay = await processTestMessage({
        platform,
        platformUserId,
        message: reviewUrl,
        messageType: "text",
        displayName: customer.display_name || displayName || "Customer",
      });

      return {
        ok: true,
        customerId: customer.id,
        reactivationInterested: true,
        replayResult: replay,
        // replay flow บาง branch ส่งเองอยู่แล้ว; ไม่ให้ webhook ยิงซ้ำ
        botReply: replay?.alreadySent ? null : replay?.botReply || null,
        alreadySent: replay?.alreadySent === true,
      };
    }
  }


// =========================================================
// GMR CHAT V2 ROUTING GATE
// =========================================================

// NEW CUSTOMER: fully handled by V2 lead/FAQ flow.
// This prevents the old Map-search / auto-price / WAITING_PRICE logic
// from running for new customers.
if (isNewCustomer) {
  const v2New = await handleV2NewCustomerInbound({
    customer,
    conversation,
    platform,
    message,
    messageType,
  });

  if (v2New?.handled) {
    return v2New.result;
  }
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
  conversation.state ===
    GMR_STATES.NEW &&
  !isExplicitRestart &&
  !isExistingCustomer
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

  await triggerHumanAttention({
    customer,
    conversation,
    message,
    reason:
      "EXISTING_CUSTOMER_PAYMENT_HISTORY_UNHANDLED",
  });

  return {
    ok: true,
    customerId: customer.id,
    stateBefore: conversation.state,
    stateAfter: conversation.state,
    oldCustomer: true,
    hasPayment: true,
    botReply: null,
    softHandoff: true,
    note:
      "Existing customer with payment history. Sales notified.",
  };
}
  // ยังไม่เคยจ่าย
  // → เช็กว่าเคยมี Map เดิมหรือไม่
  const previousMapJob =
  await getLatestJobWithMapByCustomerId(
    customer.id
  );


const freshConversationForMap =
  await getConversationByCustomerId(
    customer.id
  );


const lastBotMessageForMap =
  String(
    freshConversationForMap
      ?.last_bot_message ||
    ""
  )
    .trim()
    .toLowerCase();


const welcomeWasSent =
  lastBotMessageForMap.includes(
    "ส่งลิงก์"
  ) ||
  lastBotMessageForMap.includes(
    "google maps"
  ) ||
  lastBotMessageForMap.includes(
    "send"
  );


const wantsToStartService =
  isServiceInquiryMessage(
    message
  ) ||
  [
    "yes",
    "yes please",
    "interested",
    "start",
    "start now",
    "can you start",
    "please start",
    "สนใจ",
    "เริ่มเลย",
    "เริ่มงาน",
    "ดำเนินการ",
  ].some(
    (word) =>
      normalizedMessage === word ||
      normalizedMessage.startsWith(
        `${word} `
      )
  );


if (
  previousMapJob &&
  welcomeWasSent &&
  wantsToStartService
) {
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

 await triggerHumanAttention({
  customer,
  conversation,
  message,
  reason:
    "EXISTING_CUSTOMER_NO_IMPORTED_HISTORY_UNHANDLED",
});

return {
  ok: true,
  customerId: customer.id,
  stateBefore: conversation.state,
  stateAfter: conversation.state,
  oldCustomer: true,
  hasPayment: false,
  resumedFromHistory: false,
  botReply: null,
  softHandoff: true,
  note:
    "Existing customer without imported history. Sales notified.",
};
  
}

  
  // -------------------------------------------------------
  // 4. HANDOFF CHECK
  // -------------------------------------------------------

  if (
  conversation.handoff === true ||
  conversation.state === GMR_STATES.HANDOFF
) {

  try {
    await triggerHumanAttention({
      customer,
      conversation,
      message,
      reason:
        "CUSTOMER_FOLLOWUP_WHILE_HANDOFF",
    });
  } catch (error) {
    console.error(
      "HANDOFF FOLLOWUP HUMAN ATTENTION FAILED:",
      error
    );
  }

  return {
    ok: true,
    customerId: customer.id,
    stateBefore: conversation.state,
    stateAfter: conversation.state,
    handoff: true,
    botReply: null,
    softHandoff: true,
    note:
      "Conversation is in human handoff mode. Latest customer message forwarded to Sales.",
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

  // =========================================================
  // SERVICE INQUIRY WHILE WAITING_MAP
  // เช่น สนใจ / สอบถาม / อยากลบรีวิว
  // ให้ตอบ Welcome เดิม ไม่ส่ง Human Attention
  // =========================================================

  // =========================================================
// SERVICE INQUIRY WHILE WAITING_MAP
//
// EXISTING CUSTOMER
// → ไม่ถาม Google Map ซ้ำ
// → ให้ส่ง Review Link ได้ทันที
//
// NEW CUSTOMER
// → ใช้ Welcome Flow เดิม
// =========================================================

if (
  isServiceInquiryMessage(message)
) {

  // =======================================================
  // EXISTING CUSTOMER
  // =======================================================

  if (isExistingCustomer) {

    const botReply =
      getCustomerText(
        customer,

        `ได้เลยครับ ส่งลิงก์รีวิวที่ต้องการดำเนินการมาได้เลยครับ

สามารถส่งได้หลายลิงก์
เมื่อส่งครบแล้ว พิมพ์ “ยืนยัน” เพื่อยืนยันรายการทั้งหมดครับ`,

        `Sure. Please send the review link(s) you'd like us to process.

You can send multiple links.
When you're finished, reply "Confirm all" to confirm the full batch.`
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

      customerType:
        "EXISTING_CUSTOMER",

      stateBefore:
        conversation.state,

      stateAfter:
        conversation.state,

      serviceInquiry:
        true,

      existingCustomerReadyForReview:
        true,

      botReply,
    };
  }


  // =======================================================
  // NEW CUSTOMER
  // =======================================================

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

    customerType:
      "NEW_CUSTOMER",

    stateBefore:
      conversation.state,

    stateAfter:
      conversation.state,

    serviceInquiry:
      true,

    botReply,
  };
}

  // =========================================================
  // EXISTING CUSTOMER
  // CONFIRM ALL BATCH
  // =========================================================

const confirmAllWords = [
  "ยืนยัน",
  "ยืนยันครับ",
  "ยืนยันค่ะ",

  "ยืนยันรายการทั้งหมด",
  "ตกลงทั้งหมด",

  "confirm all",
  "confirm all reviews",
  "confirm batch",
];


const isConfirmAll =
  confirmAllWords.includes(
    normalizedMessage
  );


if (
  isExistingCustomer &&
  isConfirmAll
) {

  // ========================================
  // 1. ดึงเฉพาะงานที่ Evidence ผ่านแล้ว
  // ========================================

  const batchJobs =
    await getExistingCustomerOpenBatchJobs(
      customer.id
    );


  // ========================================
  // ไม่มีงานใน Batch
  // ========================================

  if (batchJobs.length === 0) {

    const botReply =
      getCustomerText(
        customer,

        "ยังไม่มีรีวิวที่พร้อมยืนยันในรายการครับ รบกวนส่งลิงก์รีวิวที่ต้องการดำเนินการมาก่อนได้เลยครับ",

        "There are no reviews ready to confirm yet. Please send the review link(s) you would like us to process first."
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

      existingCustomerBatch:
        true,

      batchConfirmed:
        false,

      batchSize:
        0,

      stateBefore:
        conversation.state,

      stateAfter:
        conversation.state,

      botReply,
    };
  }


  // ========================================
  // 2. Safety Check
  // ทุก Job ต้องมีราคา + Review URL
  // ========================================

  const invalidJobs =
    batchJobs.filter(
      (job) => {

        const price =
          Number(
            job.price || 0
          );

        return (
          !Number.isFinite(price) ||
          price <= 0 ||
          !job.review_url
        );
      }
    );


  if (invalidJobs.length > 0) {

    await triggerHumanAttention({
      customer,
      conversation,

      message:
        "ลูกค้ากดยืนยัน Existing Customer Batch",

      reason:
        "EXISTING_BATCH_INVALID_JOB_DATA",
    });


    return {
      ok: true,

      customerId:
        customer.id,

      existingCustomerBatch:
        true,

      batchConfirmed:
        false,

      batchSize:
        batchJobs.length,

      invalidJobIds:
        invalidJobs.map(
          (job) =>
            job.id
        ),

      botReply:
        null,

      softHandoff:
        true,
    };
  }


  // ========================================
  // 3. เปลี่ยนทุก Job
  // existing_batch_draft
  // → waiting_credit_approval
  // ========================================

  for (
    const job of
      batchJobs
  ) {

    await updateJob(
      job.id,
      {
        status:
          "waiting_credit_approval",
      }
    );
  }


  let creditRequest;


  // ========================================
  // 4. ส่ง Batch เข้า LINE Group
  //
  // ถ้าส่งไม่สำเร็จ
  // rollback กลับ Draft ทุก Job
  // ========================================

  try {

    creditRequest =
      await sendExistingCustomerBatchCreditApprovalToLineGroup({
        customer,

        jobs:
          batchJobs,
      });

  } catch (error) {

    console.error(
      "EXISTING CUSTOMER BATCH CREDIT REQUEST FAILED:",
      error
    );


    for (
      const job of
        batchJobs
    ) {

      try {
        await updateJob(
          job.id,
          {
            status:
              "existing_batch_draft",
          }
        );

      } catch (
        rollbackError
      ) {

        console.error(
          "EXISTING BATCH ROLLBACK FAILED:",
          {
            jobId:
              job.id,

            error:
              rollbackError.message,
          }
        );
      }
    }


    await triggerHumanAttention({
      customer,
      conversation,

      message:
        "ลูกค้ากดยืนยัน Existing Customer Batch",

      reason:
        "EXISTING_BATCH_CREDIT_REQUEST_FAILED",
    });


    const botReply =
      getCustomerText(
        customer,

        "ระบบยังยืนยันรายการไม่สำเร็จครับ กรุณารอสักครู่แล้วพิมพ์ “ยืนยัน” อีกครั้งได้เลยครับ",

        'The batch could not be confirmed yet. Please wait a moment and reply "Confirm all" again.'
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

      existingCustomerBatch:
        true,

      batchConfirmed:
        false,

      creditRequestFailed:
        true,

      stateBefore:
        conversation.state,

      stateAfter:
        conversation.state,

      botReply,
    };
  }


  // ========================================
  // 5. ใช้ Job แรกเป็น Anchor
  //
  // สำคัญ:
  // LINE messageId ห้ามใส่ทุก Job
  // เพราะ getJobByLineGroupMessageId()
  // ต้องเจอเพียง Job เดียว
  // ========================================

  const anchorJob =
    batchJobs[0];


  await updateJob(
    anchorJob.id,
    {
      line_group_message_id:
        creditRequest.messageId,
    }
  );


  // ========================================
  // 6. Conversation → HANDOFF
  // รอทีมอนุมัติเครดิต
  // ========================================

  await updateConversationState({
    customerId:
      customer.id,

    state:
      GMR_STATES.HANDOFF,

    handoff:
      true,

    handoffReason:
      "EXISTING_BATCH_CREDIT_APPROVAL_PENDING",
  });


  // ========================================
  // 7. แจ้งลูกค้า
  // ไม่ขอเบอร์โทร
  // ========================================

  const botReply =
    getCustomerText(
      customer,

      `ยืนยันรายการเรียบร้อยครับ ✅

จำนวนทั้งหมด ${batchJobs.length} รีวิว

ขณะนี้กำลังตรวจสอบข้อมูลก่อนเริ่มดำเนินการครับ`,

      `Your batch has been confirmed. ✅

Total: ${batchJobs.length} review(s)

We're completing a quick verification before starting the service.`
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

    customerType:
      "EXISTING_CUSTOMER",

    existingCustomerBatch:
      true,

    batchConfirmed:
      true,

    batchSize:
      batchJobs.length,

    anchorJobId:
      anchorJob.id,

    creditApprovalPending:
      true,

    lineGroupMessageId:
      creditRequest.messageId,

    stateBefore:
      conversation.state,

    stateAfter:
      GMR_STATES.HANDOFF,

    botReply,
  };
}
    
const detectedMapUrl =
  extractGoogleMapsUrl(
    message
  );
    


// =========================================================
// SAME REVIEW DUPLICATE GUARD
// =========================================================
if (detectedMapUrl) {
  const existingSubmission =
    await findExistingJobForSubmittedReviewUrl(
      customer.id,
      detectedMapUrl
    );

  if (existingSubmission?.job) {
    const existingJob = existingSubmission.job;
    const botReply = getExistingJobCustomerReply(customer, existingJob);
    const suppressed = shouldSuppressDuplicateBotReply({
      conversation,
      botReply,
    });

    if (!suppressed) {
      await saveMessage({
        customerId: customer.id,
        platform,
        direction: "outbound",
        messageType: "text",
        messageText: botReply,
      });

      await updateLastBotMessage(customer.id, botReply);
    }

    return {
      ok: true,
      customerId: customer.id,
      jobId: existingJob.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      duplicateReviewSubmission: true,
      existingJobStatus: existingJob.status,
      botReply: suppressed ? null : botReply,
      note: "Existing review job detected; duplicate submission suppressed.",
    };
  }
}

let classification =
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


// =========================================================
// GOOGLE MAP SHORT LINK PREFLIGHT
//
// maps.app.goo.gl อาจเป็น
// 1. Business Map URL
// 2. Direct Review URL
//
// ต้อง resolve short URL ก่อน
// แล้วค่อยตรวจ Direct Review
// =========================================================

let directReviewResolvedUrl =
  null;


if (
  classification.type ===
    INPUT_TYPES.MAP_URL &&
  detectedMapUrl
) {
  try {
    const resolvedShortUrl =
      await resolveGoogleShortUrl(
        detectedMapUrl
      );


    const reviewLookupUrl =
      resolvedShortUrl ||
      detectedMapUrl;


    console.log(
      "DIRECT REVIEW PREFLIGHT URL:",
      {
        originalUrl:
          detectedMapUrl,

        resolvedUrl:
          resolvedShortUrl,

        lookupUrl:
          reviewLookupUrl,
      }
    );


    const directReviewPreflight =
      await getReviewFromDirectUrlRobust(
        detectedMapUrl
      );


    if (
      directReviewPreflight?.found &&
      directReviewPreflight?.review
    ) {
      directReviewResolvedUrl =
        directReviewPreflight.lookupUrl ||
        directReviewPreflight.resolvedUrl ||
        reviewLookupUrl;

      classification = {
        type:
          INPUT_TYPES.REVIEW_URL,

        confidence:
          1,
      };


      console.log(
        "MAP SHORT LINK DETECTED AS DIRECT REVIEW:",
        {
          customerId:
            customer.id,

          originalUrl:
            detectedMapUrl,

          resolvedUrl:
            directReviewResolvedUrl,

          reviewerName:
            directReviewPreflight
              .review
              ?.reviewerName ||
            null,

          rating:
            directReviewPreflight
              .review
              ?.rating ||
            null,
        }
      );

    } else {
      console.log(
        "MAP SHORT LINK IS NOT DIRECT REVIEW:",
        {
          customerId:
            customer.id,

          originalUrl:
            detectedMapUrl,

          resolvedUrl:
            resolvedShortUrl,

          reason:
            directReviewPreflight
              ?.reason ||
            null,
        }
      );
    }

  } catch (error) {
    console.error(
      "DIRECT REVIEW PREFLIGHT FAILED:",
      {
        customerId:
          customer.id,

        mapUrl:
          detectedMapUrl,

        error:
          error.message,
      }
    );

    // ไม่ block flow
    // ถ้า Direct Review ตรวจไม่ได้
    // ให้ MAP_URL flow เดิมทำงานต่อ
  }
}

    // -----------------------------------------------------
    // MAP URL
    // -----------------------------------------------------

// GMR CHAT V2: Existing customer sent a business Map URL.
// Short direct-review links have already been preflighted above and
// changed to REVIEW_URL, so only a real MAP_URL reaches this guard.
if (
  isExistingCustomer &&
  classification.type === INPUT_TYPES.MAP_URL
) {
  const botReply = getCustomerText(
    customer,
    "ได้รับลิงก์ Google Maps แล้วครับ รบกวนส่งลิงก์รีวิวที่ต้องการดำเนินการมาได้เลยครับ",
    "We received the Google Maps link. Please send the exact review link you would like us to process."
  );

  await saveV2BotReply({ customer, platform, botReply });

  return {
    ok: true,
    customerId: customer.id,
    customerType: "EXISTING_CUSTOMER",
    stateBefore: conversation.state,
    stateAfter: conversation.state,
    existingCustomerMapOnly: true,
    botReply,
  };
}

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

     
  let places;

try {
  places =
    await searchPlaceByText(
      mapUrl
    );

} catch (error) {
  console.error(
    "MAP URL SEARCH TEMPORARILY FAILED:",
    {
      customerId:
        customer.id,

      mapUrl,

      error:
        error.message,

      code:
        error?.code ||
        null,

      status:
        error?.status ||
        null,
    }
  );

  await triggerHumanAttention({
    customer,
    conversation,
    message,
    reason:
      "MAP_URL_SEARCH_TEMPORARILY_FAILED",
  });

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

    botReply:
      null,

    salesAttention:
      true,

    softHandoff:
      false,

    temporaryMapError:
      true,
  };
}


  if (!places.length) {

    await triggerHumanAttention({
      customer,
      conversation,
      message,
      reason:
        "MAP_URL_NOT_RESOLVED",
    });

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

      botReply:
        null,

      salesAttention:
        true,

      softHandoff:
        false,
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
  customer.language_locked !== true &&
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
  directReviewResolvedUrl ||
  String(message || "").trim();
  let directResult;

  try {
    directResult =
      await getReviewFromDirectUrlRobust(
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

  const directReviewAgeDays =
  getReviewAgeDays(
    directReview
  );

const directReviewDepartment =
  await getDepartmentForReviewAge(
    directReviewAgeDays
  );

const directReviewDepartmentId =
  directReviewDepartment?.id ||
  null;

console.log(
  "DIRECT REVIEW DEPARTMENT ROUTING:",
  {
    customerId:
      customer.id,

    reviewUrl:
      canonicalReviewUrl,

    reviewAgeDays:
      directReviewAgeDays,

    departmentCode:
      directReviewDepartment
        ?.code ||
      null,

    departmentId:
      directReviewDepartmentId,
  }
);
// =========================================================
// EXISTING CUSTOMER - DIRECT REVIEW AUTO PRICE
// =========================================================

if (isExistingCustomer) {
  const reviewAgeDays =
    directReviewAgeDays;


  // ========================================
  // 1. หาอายุไม่ได้
  // ห้ามเดาว่าเป็นรีวิวเก่าหรือใหม่
  // → ปล่อยลง Sales Pricing Flow เดิม
  // ========================================

  if (reviewAgeDays === null) {
    console.log(
      "EXISTING CUSTOMER REVIEW AGE UNKNOWN:",
      {
        customerId:
          customer.id,

        reviewUrl:
          canonicalReviewUrl,
      }
    );

  } else {

    const isRecentReview =
      reviewAgeDays <= 14;


    // ========================================
    // 2. เลือก Rate จากประวัติลูกค้าคนนี้
    // ========================================

    const unitPrice =
      isRecentReview
        ? existingCustomerRates
            ?.newReviewRate
        : existingCustomerRates
            ?.oldReviewRate;


    const savedCurrency =
      isRecentReview
        ? existingCustomerRates
            ?.newReviewCurrency
        : existingCustomerRates
            ?.oldReviewCurrency;


    const hasValidRate =
      Number.isFinite(
        Number(unitPrice)
      ) &&
      Number(unitPrice) > 0;


    // ========================================
    // 3. มี Rate
    // → เข้า Existing Customer Auto Price
    // ========================================

    if (hasValidRate) {
      const currency =
        getCurrencyFromUnitPrice({
          price:
            Number(unitPrice),

          currency:
            savedCurrency,
        });


      // ========================================
      // 4. สร้าง Job ก่อน
      //
      // แต่ยังห้ามเข้า Batch
      // จนกว่า Evidence จะสำเร็จ
      // ========================================

      const existingJob =
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

departmentId:
  directReviewDepartmentId,
          
          status:
            "existing_evidence_pending",
        });


      await updateJob(
        existingJob.id,
        {
          price:
            Number(unitPrice),

          currency,

          status:
            "existing_evidence_pending",
        }
      );


      // ========================================
      // 5. สร้าง Evidence
      // ========================================

      let evidenceImagePath =
        null;

      let evidenceImageUrl =
        null;


      try {
        const evidenceBuffer =
          await createReviewScreenshot({
            reviewUrl:
              canonicalReviewUrl,
          });


        const evidenceUpload =
          await uploadReviewEvidence({
            buffer:
              evidenceBuffer,

            customerId:
              customer.id,

            jobId:
              existingJob.id,

            reviewId:
              directReview.reviewId ||
              null,

            index:
              1,
          });


        evidenceImagePath =
          evidenceUpload.filePath;


        evidenceImageUrl =
          await createReviewEvidenceSignedUrl(
            evidenceImagePath
          );

      } catch (error) {
        console.error(
          "EXISTING CUSTOMER REVIEW EVIDENCE FAILED:",
          {
            customerId:
              customer.id,

            jobId:
              existingJob.id,

            reviewUrl:
              canonicalReviewUrl,

            error:
              error.message,
          }
        );
      }


      // ========================================
      // 6. Evidence ไม่สำเร็จ
      //
      // FAIL CLOSED
      // ห้ามเข้า Batch
      // ห้ามให้ลูกค้ายืนยันงานนี้
      // ========================================

      if (
        !evidenceImagePath ||
        !evidenceImageUrl
      ) {
        await updateJob(
          existingJob.id,
          {
            status:
              "existing_evidence_failed",
          }
        );


        await triggerHumanAttention({
          customer,
          conversation,

          message:
            canonicalReviewUrl,

          reason:
            "EXISTING_CUSTOMER_EVIDENCE_FAILED",
        });


        const botReply =
          getCustomerText(
            customer,

            "รับข้อมูลรีวิวแล้วครับ แต่ระบบกำลังตรวจสอบรูปยืนยันของรีวิวนี้เพิ่มเติมก่อนนำเข้ารายการดำเนินการครับ",

            "We've received the review. The system is verifying the review evidence before adding it to the batch."
          );


        await sendMessageToCustomer({
          platform,
          platformUserId,

          text:
            botReply,
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
          ok: true,

          customerId:
            customer.id,

          jobId:
            existingJob.id,

          customerType:
            "EXISTING_CUSTOMER",

          existingCustomerBatch:
            false,

          evidenceSent:
            false,

          evidenceFailed:
            true,

          stateBefore:
            conversation.state,

          stateAfter:
            conversation.state,

          botReply,
          alreadySent: true,
        };
      }


      // ========================================
      // 7. Evidence สำเร็จ
      // → บันทึก Review
      // ========================================

      await saveReviewCandidate({
        customerId:
          customer.id,

        jobId:
          existingJob.id,

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
          isRecentReview,

        isVisible:
          true,

        hasText:
          Boolean(
            directReview.text &&
            directReview.text.trim()
          ),

        evidenceImagePath,
      });


      // ========================================
      // 8. ตอนนี้เท่านั้น
      // จึงอนุญาตให้ Job เข้า Batch
      // ========================================

      const pricedJob =
        await updateJob(
          existingJob.id,
          {
            price:
              Number(unitPrice),

            currency,

            status:
              "existing_batch_draft",
          }
        );


      const batchJobs =
        await getExistingCustomerOpenBatchJobs(
          customer.id
        );


      const formattedPrice =
        formatMoney(
          unitPrice,
          currency
        );


      const reviewTypeText =
        isRecentReview
          ? getCustomerText(
              customer,
              "รีวิวใหม่ (1–14 วัน)",
              "New review (1–14 days)"
            )
          : getCustomerText(
              customer,
              "รีวิวเก่า (มากกว่า 14 วัน)",
              "Older review (over 14 days)"
            );


      const priceText =
        currency === "THB"
          ? `${formattedPrice} บาท/รีวิว`
          : `$${formattedPrice} USD/review`;


      // ========================================
      // 9. ส่ง Evidence ให้ลูกค้าก่อน
      // ========================================

      await sendMessageToCustomer({
        platform,
        platformUserId,

        imageUrl:
          evidenceImageUrl,
      });


      // ========================================
      // 10. ส่งรายละเอียดหลังรูป
      // ========================================

      const botReply =
        getCustomerText(
          customer,

          `ลิงก์ที่ส่งมา:
${canonicalReviewUrl}

ประเภท: ${reviewTypeText}
ราคา: ${priceText}
จำนวน: 1 รีวิว

ขณะนี้มี ${batchJobs.length} รีวิวในรายการทั้งหมด
หากต้องการส่งเพิ่ม สามารถส่ง Review URL ถัดไปได้เลยครับ
เมื่อพร้อมเริ่มงาน รบกวนพิมพ์ “ยืนยัน” ครับ`,

          `Review link received:
${canonicalReviewUrl}

Type: ${reviewTypeText}
Price: ${priceText}
Quantity: 1 review

There are ${batchJobs.length} review(s) in the current batch.
You may send another Review URL if needed.
When you are ready to start, please reply "Confirm all".`
        );


      await sendMessageToCustomer({
        platform,
        platformUserId,

        text:
          botReply,
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
        ok: true,

        customerId:
          customer.id,

        jobId:
          pricedJob.id,

        customerType:
          "EXISTING_CUSTOMER",

        existingCustomerBatch:
          true,

        batchSize:
          batchJobs.length,

        reviewAgeDays,

        reviewRateType:
          isRecentReview
            ? "NEW_1_14_DAYS"
            : "OLD_OVER_14_DAYS",

        unitPrice:
          Number(unitPrice),

        currency,

        evidenceSent:
          true,

        stateBefore:
          conversation.state,

        stateAfter:
          conversation.state,

        botReply,
        alreadySent: true,
      };
    }


    // ========================================
    // ไม่มี Rate ประเภทนี้
    // → ปล่อยลง Sales Pricing Flow เดิม
    // ========================================

    console.log(
      "EXISTING CUSTOMER RATE MISSING:",
      {
        customerId:
          customer.id,

        reviewAgeDays,

        requiredRate:
          isRecentReview
            ? "NEW_REVIEW_RATE"
            : "OLD_REVIEW_RATE",

        rates:
          existingCustomerRates,
      }
    );
  }
}
  
  // Existing customer but no verified historical rate for this review type.
  // V2: Sales handles the quote manually in the real customer chat.
  // No waiting_price Job is created here.
  if (isExistingCustomer) {
    try {
      await sendV2SalesLeadCard({
        customer,
        payload: canonicalReviewUrl,
        inputType: "REVIEW_URL",
        reason: "EXISTING_MISSING_RATE",
      });
    } catch (error) {
      console.error("EXISTING MISSING RATE LEAD CARD FAILED:", error);
      await triggerHumanAttention({
        customer,
        conversation,
        message: canonicalReviewUrl,
        reason: "EXISTING_CUSTOMER_MISSING_RATE_V2",
      });
    }

    const botReply = getCustomerText(
      customer,
      "ได้รับลิงก์รีวิวแล้วครับ รายการนี้ยังไม่มีราคาประวัติที่ยืนยันไว้ เจ้าหน้าที่จะตรวจสอบและแจ้งราคาในแชทนี้ครับ",
      "We received the review link. There is no verified historical rate for this review type yet, so our team will review it and quote you in this chat."
    );

    await saveV2BotReply({ customer, platform, botReply });
    return {
      ok: true,
      customerId: customer.id,
      customerType: "EXISTING_CUSTOMER",
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      missingHistoricalRate: true,
      botReply,
    };
  }

  const job =
    await createJob({
      customerId:
        customer.id,

      businessName,

      reviewUrl:
        canonicalReviewUrl,

      reviewCase:
  isExistingCustomer
    ? "existing_missing_rate"
    : "direct_review",
      
      reviewVisible:
        true,

      reviewHasText:
        Boolean(
          directReview.text &&
          directReview.text.trim()
        ),

departmentId:
  directReviewDepartmentId,
      
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
  getReviewAgeDays(
    directReview
  ) === null
    ? null
    : getReviewAgeDays(
        directReview
      ) <= 14,

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
    "เช็คแล้ว รีวิวนี้สามารถดำเนินการได้ครับ",
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
  let places;

try {
  places =
    await searchPlaceByText(
      message
    );

} catch (error) {
  console.error(
    "BUSINESS NAME SEARCH TEMPORARILY FAILED:",
    {
      customerId:
        customer.id,

      message,

      error:
        error.message,

      code:
        error?.code ||
        null,

      status:
        error?.status ||
        null,
    }
  );

  await triggerHumanAttention({
    customer,
    conversation,
    message,
    reason:
      "BUSINESS_NAME_SEARCH_TEMPORARILY_FAILED",
  });

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

    botReply:
      null,

    salesAttention:
      true,

    softHandoff:
      false,

    temporaryMapError:
      true,
  };
}

  if (!places.length) {

    await triggerHumanAttention({
      customer,
      conversation,
      message,
      reason:
        "BUSINESS_NAME_NOT_FOUND_OR_UNSCRIPTED_MESSAGE",
    });

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

      botReply:
        null,

      placeFound:
        false,

      salesAttention:
        true,

      softHandoff:
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
  customer.language_locked !== true &&
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
    "เช็คแล้ว รีวิวนี้สามารถดำเนินการได้ครับ",
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


// ========================================
// ถ้ามีหลาย Review
// บอกลูกค้าให้พิมพ์หมายเลขที่ต้องการ
// ========================================

if (
  recentOneStarReviews.length > 1
) {

  const choices =
    recentOneStarReviews
      .map(
        (_, index) =>
          `"${index + 1}"`
      )
      .join(" ");


  botReply +=
    getCustomerText(
      customer,
      `\n\nกรุณาพิมพ์หมายเลขรีวิวที่ต้องการดำเนินการ เช่น ${choices} ครับ`,
      `\n\nPlease reply with the review number you would like to proceed with, for example ${choices}.`
    );
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

    // ========================================
    // ส่งข้อความให้ลูกค้าทันที
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
    //
    // สร้างและส่งรูปหลังข้อความ
    // แต่ไม่ block response หลัก
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


    // ========================================
    // ค่อย return หลังจาก kick off screenshot task
    // ========================================

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

botReply:
  null,

sentBotReply:
  botReply,
    };
  }

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


// ========================================
// อ่านข้อความล่าสุดของ Bot จาก Conversation
// last_bot_message อยู่ใน gmr_conversations
// ========================================

const freshConversation =
  await getConversationByCustomerId(
    customer.id
  );


const lastBotMessage =
  String(
    freshConversation?.last_bot_message ||
    ""
  )
    .trim()
    .toLowerCase();


const reviewSelectionPromptWasSent =
  lastBotMessage.includes(
    "เอาเป็นรีวิวนี้เลยไหมครับ"
  ) ||
  lastBotMessage.includes(
    "would you like to proceed with this review?"
  );


console.log(
  "REVIEW SELECTION PROMPT CHECK:",
  {
    customerId:
      customer.id,

    message:
      normalizedLower,

    lastBotMessage,

    reviewSelectionPromptWasSent,

    candidates:
      candidates.length,
  }
);


// ========================================
// ถ้ามี Review เดียว
// และ Bot ถามเลือก Review ไปแล้ว
// คำตอบธรรมชาติ เช่น ได้ / ใช่ / ok
// = เลือก Review นั้น
// ========================================

const singleReviewYesWords = [
  "ใช่",
  "ใช่ครับ",
  "ใช่ค่ะ",
  "ได้",
  "ได้ครับ",
  "ได้ค่ะ",
  "เอา",
  "เอาครับ",
  "เอาค่ะ",
  "รีวิวนี้",
  "อันนี้",
  "yes",
  "y",
  "ok",
  "okay",
];


if (
  candidates.length === 1 &&
  reviewSelectionPromptWasSent &&
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

  // ========================================
  // 1. เปลี่ยน Job เป็นรออนุมัติก่อน
  // ต้องสำเร็จก่อน ถึงจะส่งข้อความเข้ากลุ่ม
  // ========================================

  await updateJob(
    latestJob.id,
    {
      status:
        "waiting_credit_approval",
    }
  );


  // ========================================
  // 2. ส่งคำขออนุมัติเข้ากลุ่ม
  // ========================================

  const creditRequest =
    await sendCreditApprovalRequestToLineGroup({
      customer,

      job:
        latestJob,

      phone:
        phoneForDb,
    });


  // ========================================
  // 3. ผูก LINE messageId หลังส่งสำเร็จ
  // ========================================

  await updateJob(
    latestJob.id,
    {
      line_group_message_id:
        creditRequest.messageId,
    }
  );


  console.log(
    "CREDIT APPROVAL CREATED:",
    {
      jobId:
        latestJob.id,

      status:
        "waiting_credit_approval",

      messageId:
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

app.get(
  "/test-sales-quote",
  async (req, res) => {

    try {

      const platform =
        req.query.platform ||
        "line";


      const platformUserId =
        req.query.platformUserId;


      const amount =
        Number(
          req.query.amount
        );


      if (!platformUserId) {

        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Missing platformUserId",
          });
      }


      if (
        !Number.isFinite(
          amount
        ) ||
        amount <= 0
      ) {

        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Invalid amount",
          });
      }


      const customer =
        await getCustomerByPlatformUserId(
          platform,
          platformUserId
        );


      if (!customer) {

        return res
          .status(404)
          .json({
            ok: false,
            error:
              "Customer not found",
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


      if (
        conversation.state !==
        GMR_STATES
          .WAITING_PRICE
      ) {

        return res
          .status(400)
          .json({
            ok: false,

            error:
              `Customer is not waiting for price. Current state: ${conversation.state}`,
          });
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


      // ========================================
      // amount = ราคาต่อ 1 รีวิว
      // ========================================

      const unitPrice =
        Number(amount);


      const currency =
        unitPrice >= 2500
          ? "THB"
          : "USD";


      const formattedAmount =
        formatMoney(
          unitPrice,
          currency
        );


      const salesMessage =
        currency === "THB"
          ? getCustomerText(
              customer,

              `สำหรับรีวิวดังกล่าว ราคา ${formattedAmount} บาท/รีวิว`,

              `For this review, the price is THB ${formattedAmount} per review.`
            )
          : getCustomerText(
              customer,

              `สำหรับรีวิวดังกล่าว ราคา $${formattedAmount} USD/รีวิว`,

              `For this review, the price is $${formattedAmount} USD per review.`
            );


      await updateJob(
        latestJob.id,
        {
          price:
            unitPrice,

          currency,

          status:
            "waiting_confirm",
        }
      );


      const quote =
        await createQuote({
          jobId:
            latestJob.id,

          amount:
            unitPrice,

          currency,

          quotedBy:
            "sales",

          quoteMessage:
            salesMessage,

          script3Sent:
            false,
        });


      const template =
        await getTemplate(
          "script_3_after_quote",
          customer.language ||
            "th"
        );


      if (!template) {

        throw new Error(
          "script_3_after_quote template not found"
        );
      }


      const botReply =
        `${salesMessage}\n\n${template.content}`;


      const nextState =
        transitionState(
          conversation.state,
          GMR_STATES
            .WAITING_CONFIRM
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


      await sendMessageToCustomer({
        platform:
          customer.platform,

        platformUserId:
          customer.platform_user_id,

        text:
          botReply,
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
          botReply,
      });


      await updateLastBotMessage(
        customer.id,
        botReply
      );


      return res
        .status(200)
        .json({
          ok: true,

          customerId:
            customer.id,

          jobId:
            latestJob.id,

          quoteId:
            quote.id,

          unitPrice,

          currency,

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


      return res
        .status(500)
        .json({
          ok: false,

          error:
            error.message,
        });
    }
  }
);

// =========================================================
// LINE GROUP SALES PRICE
// Sales กด Reply ข้อความงานในกลุ่ม แล้วพิมพ์ราคา
//
// amount = ราคาต่อ 1 รีวิว
//
// >= 2,500 / review → THB
// <  2,500 / review → USD
// =========================================================

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


  // ========================================
  // รองรับ:
  //
  // 5900
  // 5,900
  // 5900 บาท
  // 5900 THB
  // 199 USD
  // $199
  // ========================================

  const normalizedText =
    String(text || "")
      .trim()
      .replace(/,/g, "");


  const priceMatch =
    normalizedText.match(
      /^\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:บาท|thb|usd)?$/i
    );


  if (!priceMatch) {
    return {
      ok: false,
      handled: true,
      reason:
        "INVALID_PRICE",
    };
  }


  const amount =
    Number(
      priceMatch[1]
    );


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    return {
      ok: false,
      handled: true,
      reason:
        "INVALID_PRICE",
    };
  }


  // ========================================
  // หา Job จากข้อความที่ Sales Reply
  // ========================================

  let job =
    await getJobByLineGroupMessageId(
      quotedMessageId
    );


  console.log(
    "PRICE JOB LOOKUP:",
    {
      quotedMessageId,

      directJobId:
        job?.id ||
        null,

      directStatus:
        job?.status ||
        null,
    }
  );


  // ========================================
  // FALLBACK
  //
  // ถ้า quotedMessageId จับคู่ไม่ได้
  // และมี waiting_price แค่ Job เดียว
  // → ใช้ Job นั้น
  // ========================================

  if (
    !job ||
    job.status !==
      "waiting_price"
  ) {

    const pendingPriceJobs =
      await getPendingPriceJobs();


    console.log(
      "PRICE JOB FALLBACK:",
      {
        pendingCount:
          pendingPriceJobs.length,

        pendingJobIds:
          pendingPriceJobs.map(
            (item) =>
              item.id
          ),
      }
    );


    if (
      pendingPriceJobs.length ===
      1
    ) {

      job =
        pendingPriceJobs[0];


      console.log(
        "PRICE JOB FALLBACK MATCHED:",
        {
          jobId:
            job.id,

          customerId:
            job.customer_id,
        }
      );

    } else if (
      pendingPriceJobs.length ===
      0
    ) {

      return {
        ok: false,
        handled: true,
        reason:
          "JOB_NOT_FOUND",
      };

    } else {

      return {
        ok: false,
        handled: true,
        reason:
          "MULTIPLE_WAITING_PRICE_JOBS",
      };
    }
  }


  if (
    job.status !==
    "waiting_price"
  ) {

    return {
      ok: false,
      handled: true,

      reason:
        "JOB_NOT_WAITING_PRICE",

      jobId:
        job.id,
    };
  }


  // ========================================
  // CUSTOMER
  // ========================================

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

      reason:
        "CUSTOMER_NOT_WAITING_PRICE",

      currentState:
        conversation.state,
    };
  }


  // ========================================
  // PRICE / CURRENCY
  //
  // amount = ราคาต่อ 1 รีวิว
  // ========================================

  const unitPrice =
    Number(amount);


  const currency =
    unitPrice >= 2500
      ? "THB"
      : "USD";


  const formattedAmount =
    formatMoney(
      unitPrice,
      currency
    );


  const salesMessage =
    currency ===
      "THB"
      ? getCustomerText(
          customer,

          `สำหรับรีวิวดังกล่าว ราคา ${formattedAmount} บาท/รีวิว`,

          `For this review, the price is THB ${formattedAmount} per review.`
        )
      : getCustomerText(
          customer,

          `สำหรับรีวิวดังกล่าว ราคา $${formattedAmount} USD/รีวิว`,

          `For this review, the price is $${formattedAmount} USD per review.`
        );

// =========================================================
// EXISTING CUSTOMER - MISSING HISTORICAL RATE
//
// ลูกค้าเก่าที่ไม่มีราคาเดิมของ Review ประเภทนี้
// Sales เป็นคนกำหนดราคาให้ครั้งแรก
//
// หลังได้ราคา:
// 1. สร้าง Evidence
// 2. ส่งรูปให้ลูกค้า
// 3. เข้า Existing Batch
// 4. ไม่เข้า WAITING_CONFIRM / WAITING_PHONE
// =========================================================

if (
  job.review_case ===
    "existing_missing_rate"
) {

  console.log(
    "EXISTING CUSTOMER MISSING RATE PRICE RECEIVED:",
    {
      jobId:
        job.id,

      customerId:
        customer.id,

      unitPrice,

      currency,
    }
  );


  // ========================================
  // 1. ต้องมี Review URL
  // ========================================

  if (!job.review_url) {

    await updateJob(
      job.id,
      {
        price:
          unitPrice,

        currency,

        status:
          "existing_evidence_failed",
      }
    );


    await triggerHumanAttention({
      customer,
      conversation,

      message:
        `Missing review_url for existing customer price job ${job.id}`,

      reason:
        "EXISTING_CUSTOMER_MISSING_RATE_NO_REVIEW_URL",
    });


    return {
      ok: false,
      handled: true,

      reason:
        "EXISTING_CUSTOMER_REVIEW_URL_MISSING",

      jobId:
        job.id,
    };
  }


  // ========================================
  // 2. หา Review ที่ผูกกับ Job
  // ========================================

  const jobReviews =
    await getReviewsByJobId(
      job.id
    );


  let review =
    null;


  const selectedReview =
    (jobReviews || []).find(
      (item) =>
        item
          ?.selected_by_customer ===
        true
    );


  if (selectedReview) {
    review =
      selectedReview;

  } else if (
    (jobReviews || []).length ===
    1
  ) {
    review =
      jobReviews[0];
  }


  if (!review) {

    await updateJob(
      job.id,
      {
        price:
          unitPrice,

        currency,

        status:
          "existing_evidence_failed",
      }
    );


    await triggerHumanAttention({
      customer,
      conversation,

      message:
        `Cannot determine review for existing customer price job ${job.id}`,

      reason:
        "EXISTING_CUSTOMER_MISSING_RATE_REVIEW_AMBIGUOUS",
    });


    return {
      ok: false,
      handled: true,

      reason:
        "EXISTING_CUSTOMER_REVIEW_AMBIGUOUS",

      jobId:
        job.id,
    };
  }


  // ========================================
  // 3. สร้าง Evidence
  // ========================================

  let evidenceImagePath =
    null;

  let evidenceImageUrl =
    null;


  try {

    const evidenceBuffer =
      await createReviewScreenshot({
        reviewUrl:
          job.review_url,
      });


    const evidenceUpload =
      await uploadReviewEvidence({
        buffer:
          evidenceBuffer,

        customerId:
          customer.id,

        jobId:
          job.id,

        reviewId:
          review.provider_review_id ||
          review.id ||
          null,

        index:
          1,
      });


    evidenceImagePath =
      evidenceUpload.filePath;


    evidenceImageUrl =
      await createReviewEvidenceSignedUrl(
        evidenceImagePath
      );


  } catch (error) {

    console.error(
      "EXISTING CUSTOMER MISSING RATE EVIDENCE FAILED:",
      {
        customerId:
          customer.id,

        jobId:
          job.id,

        reviewUrl:
          job.review_url,

        error:
          error.message,
      }
    );
  }


  // ========================================
  // 4. Evidence Fail → ห้ามเข้า Batch
  // ========================================

  if (
    !evidenceImagePath ||
    !evidenceImageUrl
  ) {

    await updateJob(
      job.id,
      {
        price:
          unitPrice,

        currency,

        status:
          "existing_evidence_failed",
      }
    );


    await triggerHumanAttention({
      customer,
      conversation,

      message:
        job.review_url,

      reason:
        "EXISTING_CUSTOMER_MISSING_RATE_EVIDENCE_FAILED",
    });


    return {
      ok: false,
      handled: true,

      reason:
        "EXISTING_CUSTOMER_EVIDENCE_FAILED",

      jobId:
        job.id,
    };
  }


  // ========================================
  // 5. บันทึกราคาจาก Sales
  // และอนุญาตเข้า Batch
  // ========================================

  await updateJob(
    job.id,
    {
      price:
        unitPrice,

      currency,

      status:
        "existing_batch_draft",
    }
  );


  // เก็บ Quote ไว้เป็น Audit ว่า
  // ราคานี้มาจาก Sales
  await createQuote({
    jobId:
      job.id,

    amount:
      unitPrice,

    currency,

    quotedBy:
      "line_group_sales_existing_customer",

    quoteMessage:
      salesMessage,

    script3Sent:
      true,
  });


  // ========================================
  // 6. Conversation กลับ WAITING_MAP
  //
  // เพื่อรับ Review link เพิ่มได้
  // และรองรับ "ยืนยัน"
  // ========================================

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


  const batchJobs =
    await getExistingCustomerOpenBatchJobs(
      customer.id
    );


  const reviewTypeText =
    review.is_recent === true
      ? getCustomerText(
          customer,
          "รีวิวใหม่ (1–14 วัน)",
          "New review (1–14 days)"
        )
      : review.is_recent === false
        ? getCustomerText(
            customer,
            "รีวิวเก่า (มากกว่า 14 วัน)",
            "Older review (over 14 days)"
          )
        : getCustomerText(
            customer,
            "ไม่สามารถระบุอายุรีวิวได้",
            "Review age could not be determined"
          );


  const priceText =
    currency === "THB"
      ? `${formattedAmount} บาท/รีวิว`
      : `$${formattedAmount} USD/review`;


  // ========================================
  // 7. ส่ง Evidence ก่อน
  // ========================================

  await sendMessageToCustomer({
    platform:
      customer.platform,

    platformUserId:
      customer.platform_user_id,

    imageUrl:
      evidenceImageUrl,
  });


  // ========================================
  // 8. ส่งราคาและสถานะ Batch
  // ========================================

  const botReply =
    getCustomerText(
      customer,

      `ตรวจสอบแล้ว สามารถดำเนินการได้ครับ ✅

ประเภท: ${reviewTypeText}
ราคา: ${priceText}

ขณะนี้มีทั้งหมด ${batchJobs.length} รีวิวในรายการ

สามารถส่งลิงก์รีวิวถัดไปมาได้เลยครับ
เมื่อส่งครบแล้ว พิมพ์ “ยืนยัน” เพื่อยืนยันรายการก่อนเริ่มดำเนินการ`,

      `Checked. We can proceed with this review. ✅

Type: ${reviewTypeText}
Price: ${priceText}

There are currently ${batchJobs.length} review(s) in this batch.

You may send the next review link.
When finished, reply "Confirm all" to confirm the full batch before we begin.`
    );


  await sendMessageToCustomer({
    platform:
      customer.platform,

    platformUserId:
      customer.platform_user_id,

    text:
      botReply,
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
      botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  console.log(
    "EXISTING CUSTOMER MISSING RATE ADDED TO BATCH:",
    {
      customerId:
        customer.id,

      jobId:
        job.id,

      unitPrice,

      currency,

      batchSize:
        batchJobs.length,
    }
  );


  return {
    ok: true,
    handled: true,

    customerId:
      customer.id,

    jobId:
      job.id,

    existingCustomerBatch:
      true,

    missingHistoricalRate:
      true,

    unitPrice,

    currency,

    batchSize:
      batchJobs.length,

    evidenceSent:
      true,

    stateAfter:
      GMR_STATES.WAITING_MAP,

    botReply,
  };
}
  
  // ========================================
  // SAVE JOB
  // ========================================

  await updateJob(
    job.id,
    {
      price:
        unitPrice,

      currency,

      status:
        "waiting_confirm",
    }
  );


  // ========================================
  // CREATE QUOTE
  // ========================================

  const quote =
    await createQuote({
      jobId:
        job.id,

      amount:
        unitPrice,

      currency,

      quotedBy:
        "line_group_sales",

      quoteMessage:
        salesMessage,

      script3Sent:
        false,
    });


  // ========================================
  // SCRIPT 3
  // ========================================

  const template =
    await getTemplate(
      "script_3_after_quote",
      customer.language ||
        "th"
    );


  if (!template) {
    throw new Error(
      "script_3_after_quote template not found"
    );
  }


  const botReply =
    `${salesMessage}\n\n${template.content}`;


  // ========================================
  // WAITING_PRICE → WAITING_CONFIRM
  // ========================================

  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES
        .WAITING_CONFIRM
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


  // ========================================
  // SEND CUSTOMER
  // ========================================

  await sendMessageToCustomer({
    platform:
      customer.platform,

    platformUserId:
      customer.platform_user_id,

    text:
      botReply,
  });


  // ========================================
  // SAVE OUTBOUND
  // ========================================

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

    amount:
      unitPrice,

    currency,

    stateBefore:
      conversation.state,

    stateAfter:
      nextState,

    botReply,
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
      // WEBHOOK IDEMPOTENCY
      // LINE retry ต้องไม่ประมวลผลซ้ำ
      // ========================================
      const lineEventId =
        event?.webhookEventId ||
        event?.message?.id ||
        null;

      if (lineEventId) {
        const claim = await claimWebhookEvent({
          platform: "line",
          eventId: String(lineEventId),
          payload: {
            type: event?.type || null,
            sourceType: event?.source?.type || null,
          },
        });
        if (claim?.claimed === false) {
          console.log("DUPLICATE LINE EVENT SUPPRESSED", { lineEventId });
          continue;
        }
      }

      // ========================================
      // GROUP MESSAGE
      // ไม่ส่งเข้าระบบลูกค้า
      // ========================================

    if (
  event.source?.type === "group"
) {

console.log(
  "LINE GROUP DETECTED:",
  {
    groupId:
      event.source?.groupId || null,

    eventType:
      event.type,

    messageType:
      event.message?.type || null,

    text:
      event.message?.type === "text"
        ? event.message.text
        : null,
  }
);
      
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

// =========================================================
// V2 SALES — USER FRIENDLY REPLY FLOW
//
// A) Reply Lead Card + price + Review URLs -> Preview only
// B) Reply Preview + "ยืนยันงาน" -> create Jobs + Sheet + Queue
// C) Reply Preview + "ยกเลิก" -> cancel draft
// D) Existing-customer approval card uses the same words
// =========================================================

if (quotedMessageId) {
  const isConfirmWork = ["ยืนยันงาน", "confirm work", "confirm job"].includes(normalizedGroupText);
  const isCancelWork = ["ยกเลิก", "cancel", "cancel job"].includes(normalizedGroupText);

  // -------------------------------------------------------
  // V2 NEW/MANUAL QUOTE SALES ORDER DRAFT
  // -------------------------------------------------------
  if (isConfirmWork || isCancelWork) {
    const draft = await getSalesOrderDraftByPreviewMessageId(quotedMessageId);

    if (draft) {
      if (isCancelWork) {
        if (draft.status !== "pending_confirmation") {
          await replyLineTextMessage(
            event.replyToken,
            `⚠️ งานชุดนี้อยู่ในสถานะ ${draft.status} แล้วครับ`
          );
          continue;
        }

        await updateSalesOrderDraft(draft.id, {
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
        });

        await replyLineTextMessage(
          event.replyToken,
          "❌ ยกเลิก Draft แล้วครับ\nยังไม่มี Job ถูกสร้าง / ยังไม่ลง Sheet / ยังไม่เริ่มงาน\nแก้ข้อมูลแล้ว Reply ข้อความลูกค้าเดิมเพื่อส่งชุดใหม่ได้เลย"
        );
        continue;
      }

      try {
        const confirmed = await confirmV2SalesOrderDraft(draft);
        const failedSheets = (confirmed.sheetResults || []).filter((item) => item.ok !== true);

        await replyLineTextMessage(
          event.replyToken,
          [
            "✅ ยืนยันงานเรียบร้อย",
            `ลูกค้า: ${confirmed.customer?.display_name || "-"}`,
            `Platform: ${getPlatformLabel(confirmed.customer)}`,
            `รับเข้าคิว: ${confirmed.startedJobs.length} รีวิว`,
            "ระบบจะส่ง T0/T2 เข้ากลุ่มตามรอบ 00:00 / 08:00 / 12:00 / 16:00 / 20:00",
            confirmed.customerNotifyOk
              ? "แจ้ง Script เริ่มงานให้ลูกค้าแล้ว"
              : "⚠️ รับงานแล้ว แต่ส่ง Script เริ่มงานให้ลูกค้าไม่สำเร็จ กรุณาเช็กแชท",
            failedSheets.length === 0
              ? "ลง Sheet ครบแล้ว"
              : `⚠️ Sheet มีปัญหา ${failedSheets.length} งาน กรุณาตรวจสอบ log`,
          ].join("\n")
        );
      } catch (error) {
        console.error("V2 SALES ORDER CONFIRM FAILED:", error);
        await replyLineTextMessage(
          event.replyToken,
          `❌ ยืนยันงานไม่สำเร็จ: ${error.message}\nกรุณาอย่ากดยืนยันซ้ำจนกว่าจะตรวจสอบสถานะ`
        );
      }
      continue;
    }

    // -----------------------------------------------------
    // EXISTING CUSTOMER BATCH APPROVAL
    // -----------------------------------------------------
    const anchorJob = await getJobByLineGroupMessageId(quotedMessageId);
    if (anchorJob?.status === "waiting_credit_approval") {
      const existingCustomerForApproval = await getCustomerById(anchorJob.customer_id);
      const existingConversationForApproval = existingCustomerForApproval
        ? await getConversationByCustomerId(existingCustomerForApproval.id)
        : null;

      if (
        existingCustomerForApproval &&
        existingConversationForApproval?.handoff_reason === "EXISTING_BATCH_CREDIT_APPROVAL_PENDING"
      ) {
        const batchJobs = await getWaitingCreditApprovalJobsByCustomerId(
          existingCustomerForApproval.id
        );

        if (isCancelWork) {
          for (const job of batchJobs) {
            await updateJob(job.id, { status: "sales_rejected" });
          }

          await updateConversationState({
            customerId: existingCustomerForApproval.id,
            state: GMR_STATES.WAITING_MAP,
            handoff: false,
            handoffReason: null,
          });

          await replyLineTextMessage(
            event.replyToken,
            `❌ ยกเลิกชุดนี้แล้วครับ\nจำนวน ${batchJobs.length} รีวิว\nยังไม่มีงานถูกเริ่ม และระบบจะไม่ส่งข้อความยกเลิกหาลูกค้า`
          );
          continue;
        }

        try {
          const started = await startApprovedExistingCustomerBatch({
            customer: existingCustomerForApproval,
            conversation: existingConversationForApproval,
            jobs: batchJobs,
          });

          const sheetResults = await appendV2StartedJobsToMasterSheet({
            customer: existingCustomerForApproval,
            jobs: started.startedJobs,
            source: "existing_customer_sales_approved",
          });

          await sendMessageToCustomer({
            platform: existingCustomerForApproval.platform,
            platformUserId: existingCustomerForApproval.platform_user_id,
            text: started.botReply,
          });

          const sheetFails = sheetResults.filter((item) => item.ok !== true);
          await replyLineTextMessage(
            event.replyToken,
            [
              "✅ Sales ยืนยันงานลูกค้าเก่าแล้ว",
              `รับเข้าคิว ${started.startedJobs.length} รีวิว`,
              "ส่ง Script เริ่มงานให้ลูกค้าแล้ว",
              sheetFails.length === 0 ? "ลง Sheet ครบแล้ว" : `⚠️ Sheet fail ${sheetFails.length} งาน`,
            ].join("\n")
          );
        } catch (error) {
          console.error("V2 EXISTING BATCH CONFIRM FAILED:", error);
          await replyLineTextMessage(
            event.replyToken,
            `❌ เริ่มงานลูกค้าเก่าไม่สำเร็จ: ${error.message}`
          );
        }
        continue;
      }
    }
  }

  // -------------------------------------------------------
  // Reply Lead Card -> parse price + review links -> Preview
  // -------------------------------------------------------
  const leadCard = await getSalesLeadCardByLineGroupMessageId(quotedMessageId);
  if (leadCard) {
    try {
      const prepared = await prepareV2SalesOrderDraft({
        leadCard,
        groupText,
        lineUserId: event.source?.userId || null,
      });

      if (prepared?.ok) {
        await replyLineTextMessage(
          event.replyToken,
          "✅ อ่านราคาและลิงก์แล้วครับ\nระบบส่ง Preview ใหม่ด้านล่างแล้ว กรุณาตรวจแล้ว Reply Preview ด้วยคำว่า “ยืนยันงาน” หรือ “ยกเลิก”"
        );
      }
    } catch (error) {
      await replyLineTextMessage(
        event.replyToken,
        [
          `❌ อ่านคำสั่งงานไม่สำเร็จ: ${error.message}`,
          "",
          "วิธีง่ายที่สุด:",
          "Reply ข้อความลูกค้า แล้วพิมพ์",
          "5500 THB",
          "https://google.com/maps/reviews/...",
          "https://google.com/maps/reviews/...",
        ].join("\n")
      );
    }
    continue;
  }
}

// =========================================================
// MANUAL ASSIGNED WORK COMMAND
// Example starts with: /manual
// =========================================================
if (/^\/manual\b/i.test(String(groupText || "").trim())) {
  try {
    const manualResult = await createManualAssignedWorkFromGroupText(groupText);
    const lines = manualResult.createdJobs.map(
      (item, index) => `${index + 1}. ${item.reviewUrl}\n   Job: ${item.jobId}\n   Status: ${item.status}`
    );

    await replyLineTextMessage(
      event.replyToken,
      [
        "✅ รับ Manual Assigned Work เข้าระบบแล้ว",
        `Customer: ${manualResult.customer?.display_name || "-"}`,
        `Phone: ${manualResult.customer?.phone || "-"}`,
        `Email: ${manualResult.customer?.email || "-"}`,
        `Type: ${manualResult.parsed.workType || "AUTO"}`,
        `Price: ${manualResult.parsed.price} ${manualResult.parsed.currency || ""}/review`,
        `จำนวน: ${manualResult.createdJobs.length} รีวิว`,
        "",
        ...lines,
        "",
        "หมายเหตุ: งานชุดนี้ customer_notify=false ระบบจะไม่ทักลูกค้าเอง",
      ].join("\n")
    );
  } catch (manualError) {
    let message = `❌ Manual Assigned Work ไม่สำเร็จ: ${manualError.message}`;
    if (manualError.message === "MANUAL_WORK_NO_REVIEW_URL") {
      message = "❌ ไม่พบ Review URL ในข้อความ /manual";
    } else if (manualError.message === "MANUAL_WORK_INVALID_PRICE") {
      message = "❌ กรุณาระบุ Price/ราคา ที่มากกว่า 0";
    } else if (manualError.message === "MANUAL_WORK_TYPE_REQUIRED") {
      message = "❌ กรุณาระบุ Type: T0 หรือ Type: T2";
    } else if (String(manualError.message || "").startsWith("MANUAL_WORK_TYPE_MISMATCH:")) {
      const parts = String(manualError.message).split(":");
      message = `❌ Type ที่ระบุไม่ตรงกับอายุรีวิวที่ตรวจพบ (ระบุ ${parts[1]} แต่ระบบตรวจพบ ${parts[2]})`;
    }
    await replyLineTextMessage(event.replyToken, message);
  }
  continue;
}


// =========================================================
// REVIEW REMOVAL HUMAN CONFIRMATION — REPLY MODE
//
// ทีมกด Reply ที่ข้อความแจ้งเตือน แล้วพิมพ์:
//   อนุมัติ = ยืนยันว่ารีวิวออกแล้ว
//   ยังอยู่  = รีวิวยังแสดงอยู่
//
// ไม่ต้องพิมพ์ Job ID / UUID
// =========================================================
if (
  quotedMessageId &&
  ["อนุมัติ", "ยังอยู่"].includes(normalizedGroupText)
) {
  try {
    const monitoringJobs =
      await getJobsForReviewMonitoring();

    const removalJob =
      (monitoringJobs || []).find(
        (item) =>
          String(
            item?.removal_team_alert_message_id || ""
          ) === String(quotedMessageId)
      );

    if (removalJob) {
      const value =
        normalizedGroupText === "อนุมัติ"
          ? "CONFIRM_REMOVED"
          : "REVIEW_STILL_VISIBLE";

      await callSheetControlInternally({
        jobId: removalJob.id,
        value,
      });

      await replyLineTextMessage(
        event.replyToken,
        value === "CONFIRM_REMOVED"
          ? "✅ ยืนยันว่ารีวิวออกแล้ว ระบบดำเนินขั้นตอนถัดไปเรียบร้อยครับ"
          : "✅ รับทราบครับ รีวิวนี้ยังอยู่ ระบบจะตรวจต่อในรอบถัดไป"
      );

      continue;
    }

    // ถ้า Reply คำว่าอนุมัติ/ยังอยู่ แต่ข้อความที่ Reply ไม่ใช่
    // removal alert ให้ปล่อย handler อื่นทำงานต่อ
    // เพื่อไม่ชน flow อื่นใน LINE group
  } catch (error) {
    console.error(
      "GROUP REVIEW REMOVAL REPLY CONFIRMATION FAILED:",
      {
        quotedMessageId,
        command: normalizedGroupText,
        error: error.message,
      }
    );

    await replyLineTextMessage(
      event.replyToken,
      `❌ ดำเนินการไม่สำเร็จ: ${error.message}`
    );

    continue;
  }
}


// =========================================================
// REVIEW REMOVAL HUMAN CONFIRMATION — LEGACY COMMAND MODE
// รองรับคำสั่งเดิมชั่วคราว:
// ออกแล้ว <JOB_ID>
// ยังอยู่ <JOB_ID>
// =========================================================
{
  const removalCommand =
    String(groupText || "")
      .trim()
      .match(
        /^(ออกแล้ว|ยังอยู่|confirm_removed|review_still_visible)\s+([0-9a-fA-F-]{36})$/i
      );

  if (removalCommand) {
    const command = String(removalCommand[1] || "").trim().toLowerCase();
    const jobId = String(removalCommand[2] || "").trim();

    try {
      const value =
        (command === "ออกแล้ว" || command === "confirm_removed")
          ? "CONFIRM_REMOVED"
          : "REVIEW_STILL_VISIBLE";

      await callSheetControlInternally({ jobId, value });

      await replyLineTextMessage(
        event.replyToken,
        value === "CONFIRM_REMOVED"
          ? `✅ ยืนยันว่ารีวิวออกแล้ว\nJob: ${jobId}\nระบบส่งเข้า Flow เก็บเงินเรียบร้อยครับ`
          : `✅ ยืนยันว่ารีวิวยังอยู่\nJob: ${jobId}\nระบบ Reset และจะตรวจต่อในรอบถัดไปครับ`
      );
    } catch (error) {
      await replyLineTextMessage(
        event.replyToken,
        `❌ ดำเนินการไม่สำเร็จ\nJob: ${jobId}\n${error.message}`
      );

      console.error("GROUP REVIEW REMOVAL CONFIRMATION FAILED:", {
        jobId,
        command,
        error: error.message,
      });
    }

    continue;
  }
}

// =========================================================
// REACTIVATION TEAM DECISION
// Reply: ส่งลูกค้า / ข้าม
// =========================================================
if (
  quotedMessageId &&
  ["ส่งลูกค้า", "ข้าม"].includes(normalizedGroupText)
) {
  const reactivationAlert =
    await getReactivationAlertByLineGroupMessageId(quotedMessageId);

  if (reactivationAlert) {
    if (normalizedGroupText === "ข้าม") {
      await setReactivationAlertTeamDecision({
        alertId: reactivationAlert.id,
        decision: "skip",
      });
      await replyLineTextMessage(
        event.replyToken,
        "✅ ข้าม Reactivation รายการนี้แล้ว ระบบจะไม่ทักลูกค้าครับ"
      );
      continue;
    }

    const reactCustomer =
      await getCustomerById(reactivationAlert.customer_id);
    const reactMap =
      await getCustomerMapById(reactivationAlert.customer_map_id);

    if (!reactCustomer) {
      await replyLineTextMessage(event.replyToken, "❌ ไม่พบข้อมูลลูกค้าของ Reactivation นี้ครับ");
      continue;
    }

    const reactPlatformUserId =
      String(reactCustomer.platform_user_id || "").trim();

    const reactLiveChatReady =
      Boolean(reactPlatformUserId) &&
      !reactPlatformUserId.startsWith("legacy:") &&
      reactCustomer.customer_notify !== false;

    if (!reactLiveChatReady) {
      await replyLineTextMessage(
        event.replyToken,
        [
          "⚠️ พบลูกค้าเก่าและตรวจ Map ได้แล้ว แต่ยังไม่มี Chat ID จริงสำหรับส่งอัตโนมัติ",
          `ลูกค้า: ${reactCustomer.display_name || "-"}`,
          `Platform: ${reactCustomer.platform || "-"}`,
          "",
          "ระบบจะเก็บ Alert นี้ไว้ก่อน ไม่ได้ส่งข้อความผิดห้องครับ",
          "เมื่อบัญชีนี้ถูกผูกกับห้องแชทจริงแล้ว สามารถ Reply ข้อความเดิมว่า “ส่งลูกค้า” อีกครั้งได้",
        ].join("\n")
      );
      continue;
    }

    const reactCustomerText = getCustomerText(
      reactCustomer,
      `ตรวจพบรีวิว 1 ดาวใหม่บน Google Maps ของ ${reactMap?.business_name || "ธุรกิจของคุณ"}\n\nReviewer: ${reactivationAlert.reviewer_name || "-"}\n\nต้องการให้ทางเราตรวจสอบเพื่อดำเนินการรีวิวนี้ไหมครับ?\nหากสนใจ พิมพ์ “สนใจ” ได้เลยครับ`,
      `We found a new 1-star review on the Google Maps listing for ${reactMap?.business_name || "your business"}.\n\nReviewer: ${reactivationAlert.reviewer_name || "-"}\n\nWould you like us to check this review for you?\nIf you're interested, reply “Interested”.`
    );

    await sendMessageToCustomer({
      platform: reactCustomer.platform,
      platformUserId: reactCustomer.platform_user_id,
      text: reactCustomerText,
    });
    await saveMessage({
      customerId: reactCustomer.id,
      platform: reactCustomer.platform,
      direction: "outbound",
      messageType: "text",
      messageText: reactCustomerText,
    });
    await updateLastBotMessage(reactCustomer.id, reactCustomerText);
    await setReactivationAlertTeamDecision({
      alertId: reactivationAlert.id,
      decision: "send_to_customer",
    });

    await replyLineTextMessage(
      event.replyToken,
      "✅ ส่งข้อความ Reactivation ให้ลูกค้าแล้วครับ ระบบจะรอคำตอบโดยไม่ Handoff"
    );
    continue;
  }
}

// =========================================================
// LEGACY CUSTOMER MATCH APPROVAL
//
// ทีมต้อง Reply ข้อความ Legacy Match เท่านั้น
//
// ยืนยันลูกค้าเก่า
// → สร้างประวัติ Job + Payment ที่เคยจ่ายจริง
// → Match LINE customer กับ Legacy customer
//
// ไม่ใช่
// → ยกเลิก Candidate
// → ลูกค้ากลับเข้า Flow ปกติ
// =========================================================

if (
  quotedMessageId &&
  [
    "ยืนยันลูกค้าเก่า",
    "ไม่ใช่",
  ].includes(
    normalizedGroupText
  )
) {

  const legacyCustomer =
    await getLegacyCustomerByLineGroupMessageId(
      quotedMessageId
    );


  // ข้อความนี้ไม่ใช่ Legacy Match
  // ปล่อยให้ Handler อื่นทำงานต่อ
  if (legacyCustomer) {

    const customerId =
      legacyCustomer
        .pending_customer_id;


    if (!customerId) {

      await replyLineTextMessage(
        event.replyToken,
        "❌ Legacy Customer นี้ไม่มี pending_customer_id กรุณาตรวจสอบข้อมูลก่อนครับ"
      );

      continue;
    }


    const matchedCustomer =
      await getCustomerById(
        customerId
      );


    if (!matchedCustomer) {

      await replyLineTextMessage(
        event.replyToken,
        "❌ ไม่พบ Customer ที่กำลังรอ Match ครับ"
      );

      continue;
    }


    // ========================================
    // ทีมตอบ "ไม่ใช่"
    // ========================================

    if (
      normalizedGroupText ===
      "ไม่ใช่"
    ) {

      await rejectLegacyCustomerMatch(
        legacyCustomer.id
      );


      await updateConversationState({
        customerId:
          matchedCustomer.id,

        state:
          GMR_STATES.WAITING_MAP,

        handoff:
          false,

        handoffReason:
          null,
      });


      await replyLineTextMessage(
        event.replyToken,
        "❌ ยกเลิกการจับคู่ Legacy Customer แล้ว ลูกค้าจะถูกดำเนินการเป็นลูกค้าปกติครับ"
      );


      console.log(
        "LEGACY CUSTOMER MATCH REJECTED:",
        {
          legacyCustomerId:
            legacyCustomer.id,

          customerId:
            matchedCustomer.id,
        }
      );


      continue;
    }


// ========================================
// SAFETY CHECK:
// Legacy record ต้องยืนยันว่าเคยชำระเงินจริง
// ========================================

if (
  legacyCustomer.has_verified_payment !==
  true
) {

  await replyLineTextMessage(
    event.replyToken,
    "❌ ยังไม่สามารถยืนยันลูกค้าเก่ารายนี้ได้ เนื่องจาก Legacy record ยังไม่ได้ยืนยันประวัติการชำระเงินจริง"
  );

  console.error(
    "LEGACY IMPORT BLOCKED: PAYMENT NOT VERIFIED",
    {
      legacyCustomerId:
        legacyCustomer.id,

      customerId:
        matchedCustomer.id,
    }
  );

  continue;
}


// ========================================
// CLAIM IMPORT
//
// request แรกเท่านั้นที่ได้สิทธิ์ Import
// ========================================

const claimedLegacy =
  await claimLegacyCustomerImport({
    legacyCustomerId:
      legacyCustomer.id,

    customerId:
      matchedCustomer.id,
  });


if (!claimedLegacy) {

  await replyLineTextMessage(
    event.replyToken,
    "⚠️ รายการลูกค้าเก่านี้กำลังถูกดำเนินการ หรือดำเนินการไปแล้วครับ"
  );

  console.log(
    "LEGACY IMPORT DUPLICATE BLOCKED:",
    {
      legacyCustomerId:
        legacyCustomer.id,

      customerId:
        matchedCustomer.id,
    }
  );

  continue;
}
    
    // ========================================
    // ทีมตอบ "ยืนยันลูกค้าเก่า"
    // ========================================

    try {

      const verifiedAt =
        new Date().toISOString();


      const pendingMessageText =
  legacyCustomer
    .pending_message_text ||
  null;


const pendingMessageType =
  legacyCustomer
    .pending_message_type ||
  "text";

      const importedJobs = [];


    // ========================================
// NEW REVIEW HISTORY
// Resume-safe / Idempotent
// ========================================

const newReviewRate =
  Number(
    legacyCustomer
      .new_review_rate ||
    0
  );


if (
  Number.isFinite(
    newReviewRate
  ) &&
  newReviewRate > 0
) {

  const newCurrency =
    String(
      legacyCustomer
        .new_review_currency ||
      "THB"
    ).toUpperCase();


  // ========================================
  // 1. หา Job ที่เคย Import ไว้ก่อน
  // ========================================

  let historicalNewJob =
    await getLegacyImportedJob({
      legacySourceId:
        legacyCustomer.id,

      reviewCase:
        "legacy_import_new",
    });


  // ========================================
  // 2. ไม่มี Job เดิม → ค่อยสร้าง
  // ========================================

  if (!historicalNewJob) {

    historicalNewJob =
      await createJob({
        customerId:
          matchedCustomer.id,

        businessName:
          legacyCustomer
            .business_name ||
          null,

        reviewCase:
          "legacy_import_new",

        status:
          "paid",

        legacySourceId:
          legacyCustomer.id,
      });

  } else if (
    historicalNewJob.customer_id !==
    matchedCustomer.id
  ) {

    throw new Error(
      "Legacy NEW history is already linked to another customer"
    );
  }


  // ========================================
  // 3. Update ราคาให้ตรง Legacy record
  // ========================================

  historicalNewJob =
    await updateJob(
      historicalNewJob.id,
      {
        price:
          newReviewRate,

        currency:
          newCurrency,

        status:
          "paid",
      }
    );


  // ========================================
  // 4. Review มีแล้ว → ไม่สร้างซ้ำ
  // ========================================

  const existingNewReviews =
    await getReviewsByJobId(
      historicalNewJob.id
    );


  if (
    !existingNewReviews ||
    existingNewReviews.length === 0
  ) {

    await saveReviewCandidate({
      customerId:
        matchedCustomer.id,

      jobId:
        historicalNewJob.id,

      businessName:
        legacyCustomer
          .business_name ||
        null,

      reviewerName:
        "LEGACY_IMPORT",

      reviewText:
        "Imported historical NEW review rate",

      isRecent:
        true,

      isVisible:
        null,

      hasText:
        null,
    });
  }


  // ========================================
  // 5. Verified Payment มีแล้ว
  // → ไม่สร้างซ้ำ
  // ========================================

  const existingNewPayment =
    await getVerifiedPaymentByJobId(
      historicalNewJob.id
    );


  if (!existingNewPayment) {

    await createPayment({
      jobId:
        historicalNewJob.id,

      amount:
        newReviewRate,

      paymentMethod:
        "LEGACY_IMPORT",

      slipReceived:
        false,

      paymentVerified:
        true,

      verifiedAt,
    });
  }


  importedJobs.push(
    historicalNewJob.id
  );
}


      // ========================================
// OLD REVIEW HISTORY
// Resume-safe / Idempotent
// ========================================

const oldReviewRate =
  Number(
    legacyCustomer
      .old_review_rate ||
    0
  );


if (
  Number.isFinite(
    oldReviewRate
  ) &&
  oldReviewRate > 0
) {

  const oldCurrency =
    String(
      legacyCustomer
        .old_review_currency ||
      "THB"
    ).toUpperCase();


  // ========================================
  // 1. หา Job ที่เคย Import ไว้ก่อน
  // ========================================

  let historicalOldJob =
    await getLegacyImportedJob({
      legacySourceId:
        legacyCustomer.id,

      reviewCase:
        "legacy_import_old",
    });


  // ========================================
  // 2. ไม่มี Job เดิม → ค่อยสร้าง
  // ========================================

  if (!historicalOldJob) {

    historicalOldJob =
      await createJob({
        customerId:
          matchedCustomer.id,

        businessName:
          legacyCustomer
            .business_name ||
          null,

        reviewCase:
          "legacy_import_old",

        status:
          "paid",

        legacySourceId:
          legacyCustomer.id,
      });

  } else if (
    historicalOldJob.customer_id !==
    matchedCustomer.id
  ) {

    throw new Error(
      "Legacy OLD history is already linked to another customer"
    );
  }


  // ========================================
  // 3. Update ราคา
  // ========================================

  historicalOldJob =
    await updateJob(
      historicalOldJob.id,
      {
        price:
          oldReviewRate,

        currency:
          oldCurrency,

        status:
          "paid",
      }
    );


  // ========================================
  // 4. Review มีแล้ว → ไม่สร้างซ้ำ
  // ========================================

  const existingOldReviews =
    await getReviewsByJobId(
      historicalOldJob.id
    );


  if (
    !existingOldReviews ||
    existingOldReviews.length === 0
  ) {

    await saveReviewCandidate({
      customerId:
        matchedCustomer.id,

      jobId:
        historicalOldJob.id,

      businessName:
        legacyCustomer
          .business_name ||
        null,

      reviewerName:
        "LEGACY_IMPORT",

      reviewText:
        "Imported historical OLD review rate",

      isRecent:
        false,

      isVisible:
        null,

      hasText:
        null,
    });
  }


  // ========================================
  // 5. Verified Payment มีแล้ว
  // → ไม่สร้างซ้ำ
  // ========================================

  const existingOldPayment =
    await getVerifiedPaymentByJobId(
      historicalOldJob.id
    );


  if (!existingOldPayment) {

    await createPayment({
      jobId:
        historicalOldJob.id,

      amount:
        oldReviewRate,

      paymentMethod:
        "LEGACY_IMPORT",

      slipReceived:
        false,

      paymentVerified:
        true,

      verifiedAt,
    });
  }


  importedJobs.push(
    historicalOldJob.id
  );
}

      // ========================================
      // ต้องมีอย่างน้อย 1 ราคา
      // ถึงจะถือว่า Import Payment History สำเร็จ
      // ========================================

      if (
        importedJobs.length === 0
      ) {
        throw new Error(
          "Legacy customer has no valid historical rate"
        );
      }


      // ========================================
      // Legacy → Matched
      // ========================================

      await markLegacyCustomerMatched({
        legacyCustomerId:
          legacyCustomer.id,

        customerId:
          matchedCustomer.id,
      });

// ========================================
// LEGACY MAP -> CUSTOMER MAP
//
// ถ้า Legacy Customer มี map_url
// หลัง Match สำเร็จ:
// 1. Resolve Google Place
// 2. เก็บ place_id + map_url
// 3. พร้อมเข้า 1-Star Reactivation Monitor
//
// ถ้า resolve ไม่ได้:
// - ไม่ทำให้ Legacy Import ล้ม
// - log ไว้ให้ตรวจภายหลัง
// ========================================

const legacyMapUrls = Array.from(new Set(
  [
    ...(Array.isArray(legacyCustomer.map_urls) ? legacyCustomer.map_urls : []),
    ...String(legacyCustomer.map_url || "").split(/\r?\n|,/g),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

for (const legacyMapUrl of legacyMapUrls) {
  try {
    const legacyPlaces = await searchPlaceByText(legacyMapUrl);

    if (Array.isArray(legacyPlaces) && legacyPlaces.length > 0) {
      const legacyPlace = legacyPlaces[0];
      const legacyPlaceId = String(legacyPlace?.placeId || "").trim();

      if (legacyPlaceId) {
        await upsertCustomerMapRecord({
          customerId: matchedCustomer.id,
          businessName:
            legacyPlace.businessName ||
            legacyCustomer.business_name ||
            null,
          placeId: legacyPlaceId,
          mapUrl: legacyPlace.mapUrl || legacyMapUrl,
          sourceReviewUrl: null,
        });

        console.log("LEGACY CUSTOMER MAP LINKED:", {
          legacyCustomerId: legacyCustomer.id,
          customerId: matchedCustomer.id,
          placeId: legacyPlaceId,
          mapUrl: legacyPlace.mapUrl || legacyMapUrl,
        });
      } else {
        console.warn("LEGACY MAP PLACE ID MISSING:", {
          legacyCustomerId: legacyCustomer.id,
          customerId: matchedCustomer.id,
          mapUrl: legacyMapUrl,
        });
      }
    } else {
      console.warn("LEGACY MAP NOT RESOLVED:", {
        legacyCustomerId: legacyCustomer.id,
        customerId: matchedCustomer.id,
        mapUrl: legacyMapUrl,
      });
    }
  } catch (legacyMapError) {
    console.error("LEGACY MAP LINK ERROR:", {
      legacyCustomerId: legacyCustomer.id,
      customerId: matchedCustomer.id,
      mapUrl: legacyMapUrl,
      error: legacyMapError?.message || String(legacyMapError),
    });
  }
}


      
      // ========================================
      // ปลด HANDOFF
      // พร้อมรับ Review ใหม่
      // ========================================

      await updateConversationState({
        customerId:
          matchedCustomer.id,

        state:
          GMR_STATES.WAITING_MAP,

        handoff:
          false,

        handoffReason:
          null,
      });

      // ========================================
// REPLAY ข้อความแรกของลูกค้า
//
// หลัง Match สำเร็จแล้ว customer คนนี้
// มี verified payment history จริง
// ดังนั้น processTestMessage รอบนี้
// จะมองเป็น EXISTING_CUSTOMER
// ========================================

let replayResult =
  null;


if (
  pendingMessageType === "text" &&
  pendingMessageText
) {

  try {

    replayResult =
      await processTestMessage({
        platform:
          matchedCustomer.platform,

        platformUserId:
          matchedCustomer
            .platform_user_id,

        message:
          pendingMessageText,

        messageType:
          "text",

        displayName:
          matchedCustomer
            .display_name ||
          legacyCustomer
            .display_name ||
          "Customer",
      });


    console.log(
      "LEGACY PENDING MESSAGE REPLAYED:",
      {
        legacyCustomerId:
          legacyCustomer.id,

        customerId:
          matchedCustomer.id,

        replayResult,
      }
    );


  } catch (replayError) {

    console.error(
      "LEGACY PENDING MESSAGE REPLAY FAILED:",
      {
        legacyCustomerId:
          legacyCustomer.id,

        customerId:
          matchedCustomer.id,

        pendingMessageText,

        error:
          replayError.message,
      }
    );
  }
}

     await replyLineTextMessage(
  event.replyToken,

  `✅ ยืนยันลูกค้าเก่าเรียบร้อยแล้ว
Legacy: ${
    legacyCustomer.display_name ||
    "-"
  }
LINE: ${
    matchedCustomer.display_name ||
    "-"
  }
นำเข้าประวัติราคา ${importedJobs.length} ประเภทเรียบร้อย
${
  pendingMessageText
    ? replayResult
      ? "✅ ดำเนินการข้อความแรกของลูกค้าต่ออัตโนมัติแล้ว"
      : "⚠️ Match สำเร็จ แต่ข้อความแรกต้องตรวจสอบต่อ"
    : "ไม่มีข้อความเดิมที่ต้องดำเนินการต่อ"
}`
);


      console.log(
        "LEGACY CUSTOMER MATCH APPROVED:",
        {
          legacyCustomerId:
            legacyCustomer.id,

          customerId:
            matchedCustomer.id,

          importedJobs,
        }
      );


    } catch (error) {

      console.error(
        "LEGACY CUSTOMER MATCH APPROVAL FAILED:",
        {
          legacyCustomerId:
            legacyCustomer.id,

          customerId:
            matchedCustomer.id,

          error:
            error.message,
        }
      );

try {

  await rollbackLegacyCustomerImport(
    legacyCustomer.id
  );

} catch (rollbackError) {

  console.error(
    "LEGACY IMPORT ROLLBACK FAILED:",
    {
      legacyCustomerId:
        legacyCustomer.id,

      error:
        rollbackError.message,
    }
  );
}
      
      await replyLineTextMessage(
        event.replyToken,
        `❌ Import ลูกค้าเก่าไม่สำเร็จ: ${error.message}\nกรุณายังไม่กดยืนยันซ้ำจนกว่าจะตรวจสอบข้อมูลครับ`
      );
    }


    continue;
  }
}
    
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

// =========================================================
// EXISTING CUSTOMER BATCH CREDIT APPROVAL
//
// ถ้าเป็น Batch ลูกค้าเก่า
// ให้จัดการทั้งชุดตรงนี้แล้ว continue
// ไม่ปล่อยลง Credit Flow แบบ Job เดียวด้านล่าง
// =========================================================

const isExistingBatchCredit =
  creditConversation
    .handoff_reason ===
  "EXISTING_BATCH_CREDIT_APPROVAL_PENDING";


if (isExistingBatchCredit) {

  const batchCreditJobs =
    await getWaitingCreditApprovalJobsByCustomerId(
      creditCustomer.id
    );


  // ========================================
  // Safety
  // ========================================

  if (
    batchCreditJobs.length === 0
  ) {

    await replyLineTextMessage(
      event.replyToken,
      "⚠️ ไม่พบงานใน Batch ที่กำลังรออนุมัติเครดิตครับ"
    );

    continue;
  }


  // ========================================
  // ไม่อนุมัติ → Reject ทั้ง Batch
  // ========================================

  if (
    normalizedGroupText ===
      "ไม่อนุมัติ"
  ) {

    for (
      const job of
        batchCreditJobs
    ) {

      await updateJob(
        job.id,
        {
          status:
            "credit_rejected",
        }
      );
    }


    await updateConversationState({
      customerId:
        creditCustomer.id,

      state:
        GMR_STATES.HANDOFF,

      handoff:
        true,

      handoffReason:
        "EXISTING_BATCH_CREDIT_REJECTED",
    });


    await replyLineTextMessage(
      event.replyToken,

      `❌ ไม่อนุมัติเครดิต Batch นี้ครับ\nจำนวน ${batchCreditJobs.length} รีวิว\nยังไม่มีงานใดถูกเริ่ม`
    );


    continue;
  }


  // ========================================
  // อนุมัติ → เริ่มทั้ง Batch
  // ========================================

  try {

    const batchStartResult =
      await startApprovedExistingCustomerBatch({
        customer:
          creditCustomer,

        conversation:
          creditConversation,

        jobs:
          batchCreditJobs,
      });


    // แจ้งลูกค้าเพียงครั้งเดียว
    await sendMessageToCustomer({
      platform:
        creditCustomer.platform ||
        "line",

      platformUserId:
        creditCustomer
          .platform_user_id,

      text:
        batchStartResult.botReply,
    });


    await replyLineTextMessage(
  event.replyToken,

  `✅ อนุมัติเครดิตแล้ว\nรับเข้าคิวทั้งหมด ${batchStartResult.startedJobs.length} รีวิวแล้วครับ\nระบบจะรวบรวมและส่งเข้าแผนกตามรอบถัดไปอัตโนมัติ`
);


  } catch (error) {

    console.error(
      "START EXISTING CUSTOMER BATCH FAILED:",
      {
        customerId:
          creditCustomer.id,

        jobIds:
          batchCreditJobs.map(
            (job) =>
              job.id
          ),

        error:
          error.message,
      }
    );


    await replyLineTextMessage(
      event.replyToken,

      "❌ เริ่ม Existing Customer Batch ไม่สำเร็จ ระบบยังต้องตรวจสอบก่อน กรุณาอย่ากดอนุมัติซ้ำจนกว่าจะตรวจสอบสถานะงานครับ"
    );
  }


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
  "✅ อนุมัติเครดิตแล้ว รับงานเข้าคิวเรียบร้อยครับ ระบบจะส่งเข้าแผนกตามรอบถัดไปอัตโนมัติ"
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

const paymentReviewReasons =
  Array.isArray(
    pendingPayment.verification_reasons
  )
    ? pendingPayment.verification_reasons
    : [];


const isMultiJobPayment =
  paymentReviewReasons.includes(
    "MULTIPLE_WAITING_PAYMENT_JOBS"
  );


if (isMultiJobPayment) {
  await replyLineTextMessage(
    event.replyToken,
    "⚠️ สลิปนี้เป็นยอดรวมหลายงาน ยังไม่สามารถกดยืนยันแบบงานเดียวได้ครับ กรุณาตรวจรายการทั้งหมดก่อน"
  );

  console.log(
    "MULTI JOB PAYMENT MANUAL APPROVAL BLOCKED:",
    {
      paymentId:
        pendingPayment.id,

      anchorJobId:
        paymentJob.id,

      reasons:
        paymentReviewReasons,
    }
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

    if (
  priceResult.reason ===
  "MULTIPLE_WAITING_PRICE_JOBS"
) {
  await replyLineTextMessage(
    event.replyToken,
    "⚠️ ตอนนี้มีหลายงานรอเสนอราคา ระบบไม่สามารถเลือกงานแทนให้อัตโนมัติได้ครับ"
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
  if (
  priceResult.ok
) {

  const priceText =
    formatMoney(
      priceResult.amount,
      priceResult.currency
    );


  const groupReply =
    priceResult.currency ===
      "THB"
      ? (
          "✅ แจ้งราคาลูกค้าแล้ว\n" +
          `ราคา ${priceText} บาท/รีวิว`
        )
      : (
          "✅ แจ้งราคาลูกค้าแล้ว\n" +
          `ราคา $${priceText} USD/รีวิว`
        );


  await replyLineTextMessage(
    event.replyToken,
    groupReply
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

// =========================================================
// LINE STICKER → HUMAN ATTENTION
//
// Sticker มีหลายความหมาย
// Bot ห้ามตีความเอง
// ส่งให้ Sales ดูใน LINE Group
// State ลูกค้าคงเดิม
// =========================================================

if (
  messageType === "sticker"
) {
  const customer =
    await getOrCreateCustomer({
      platform:
        "line",

      platformUserId,

      displayName:
        lineDisplayName,

      language:
        "th",
    });

  const conversation =
    await getOrCreateConversation(
      customer.id
    );

  const packageId =
    event.message?.packageId ||
    null;

  const stickerId =
    event.message?.stickerId ||
    null;

  const stickerText =
    [
      "[LINE STICKER]",
      packageId
        ? `Package ID: ${packageId}`
        : null,
      stickerId
        ? `Sticker ID: ${stickerId}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");


  await saveMessage({
    customerId:
      customer.id,

    platform:
      "line",

    direction:
      "inbound",

    messageType:
      "sticker",

    messageText:
      stickerText,

    platformMessageId:
      event.message?.id ||
      null,

    metadata: {
      packageId,
      stickerId,
    },
  });


  await triggerHumanAttention({
    customer,
    conversation,

    message:
      stickerText,

    reason:
      "CUSTOMER_SENT_STICKER",
  });


  console.log(
    "LINE STICKER SENT TO HUMAN ATTENTION:",
    {
      customerId:
        customer.id,

      platformUserId,

      packageId,
      stickerId,
    }
  );


  // ห้ามเข้า Bot flow ต่อ
  continue;
}
      
// ========================================
// BOT PAUSE GATE
// รับข้อความเข้า + บันทึกไว้
// แต่ไม่ตอบ / ไม่เดิน Flow / ไม่วิเคราะห์รูป
// ========================================

const botControl =
  await getBotControl();

if (
  botControl.enabled !== true
) {
  try {
    const existingCustomer =
      await getCustomerByPlatformUserId(
        "line",
        platformUserId
      );

    const pausedLanguage =
      existingCustomer?.language ||
      detectCustomerLanguage(
        message,
        "th"
      );

    const pausedCustomer =
      await getOrCreateCustomer({
        platform:
          "line",

        platformUserId,

        displayName:
          lineDisplayName,

        language:
          pausedLanguage,
      });

    await saveMessage({
      customerId:
        pausedCustomer.id,

      platform:
        "line",

      direction:
        "inbound",

      messageType,

      messageText:
        message || null,
    });

    if (message) {
      await updateLastUserMessage(
        pausedCustomer.id,
        message
      );
    }

    console.log(
      "BOT PAUSED - MESSAGE SAVED WITHOUT PROCESSING:",
      {
        customerId:
          pausedCustomer.id,

        platformUserId,

        messageType,

        message:
          message || null,

        pausedAt:
          botControl.pausedAt ||
          null,
      }
    );

  } catch (error) {
    console.error(
      "BOT PAUSED MESSAGE SAVE FAILED:",
      error
    );
  }

  continue;
}
      
// ========================================
// IGNORE MESSAGE WHILE MAP IS PROCESSING
// ถ้า Bot กำลังตรวจ Map ของลูกค้าคนนี้อยู่
// ไม่ตอบ / ไม่ส่งเข้ากลุ่ม / ไม่เปลี่ยน State
// ========================================

if (
  mapProcessingUsers.has(
    platformUserId
  )
) {

  console.log(
    "MESSAGE IGNORED DURING MAP PROCESSING:",
    {
      platformUserId,
      message,
      messageType,
    }
  );

  continue;
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
    let shouldSendFastAck = true;

    try {
      const existingCustomer =
        await getCustomerByPlatformUserId(
          "line",
          platformUserId
        );

      if (existingCustomer) {
        const existingSubmission =
          await findExistingJobForSubmittedReviewUrl(
            existingCustomer.id,
            detectedMapUrl
          );

        if (existingSubmission?.job) {
          shouldSendFastAck = false;

          console.log(
            "FAST MAP ACK SUPPRESSED FOR EXISTING REVIEW:",
            {
              customerId:
                existingCustomer.id,
              jobId:
                existingSubmission.job.id,
              status:
                existingSubmission.job.status,
            }
          );
        }
      }

      if (shouldSendFastAck) {
        mapProcessingUsers.add(
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
      }

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


  let places;

try {
  places =
    await searchPlaceByText(
      businessName
    );

} catch (error) {
  console.error(
    "REVIEW SCREENSHOT MAP SEARCH TEMPORARILY FAILED:",
    {
      customerId:
        customer.id,

      businessName,

      error:
        error.message,

      code:
        error?.code ||
        null,

      status:
        error?.status ||
        null,
    }
  );

  const botReply =
    getCustomerText(
      customer,
      "ระบบ Google Map ตอบกลับชั่วคราวไม่ได้ครับ รบกวนส่งรูปรีวิวหรือลิงก์เดิมอีกครั้งในอีกสักครู่นะครับ",
      "Google Maps is temporarily unavailable. Please send the review screenshot or link again in a moment."
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

  const matchedReviewAgeDays =
  getReviewAgeDays(
    matchedReview
  );

const matchedReviewDepartment =
  await getDepartmentForReviewAge(
    matchedReviewAgeDays
  );

const matchedReviewDepartmentId =
  matchedReviewDepartment?.id ||
  null;

console.log(
  "IMAGE REVIEW DEPARTMENT ROUTING:",
  {
    customerId:
      customer.id,

    reviewUrl:
      matchedReview.reviewUrl,

    reviewAgeDays:
      matchedReviewAgeDays,

    departmentCode:
      matchedReviewDepartment
        ?.code ||
      null,

    departmentId:
      matchedReviewDepartmentId,
  }
);


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

department_id:
  matchedReviewDepartmentId,

      departmentId:
  matchedReviewDepartmentId,
      
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

  const waitingPaymentJobs =
  await getWaitingPaymentJobsByCustomerId(
    customer.id
  );

if (
  !Array.isArray(
    waitingPaymentJobs
  ) ||
  waitingPaymentJobs.length === 0
) {
  console.log(
    "PAYMENT SLIP - NO WAITING PAYMENT JOB FOUND",
    {
      customerId:
        customer.id,
    }
  );

  const botReply =
    getCustomerText(
      customer,
      "ยังไม่พบงานที่กำลังรอชำระเงินครับ หากเพิ่งได้รับแจ้งยอด รบกวนส่งข้อความมาอีกครั้งหรือติดต่อทีมงานได้เลยครับ",
      "I couldn't find any job currently waiting for payment. If you just received a payment request, please send a message again or contact our team."
    );

  await sendMessageToCustomer({
    platform:
      customer.platform,

    platformUserId:
      customer.platform_user_id,

    text:
      botReply,
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
      botReply,
  });

  await updateLastBotMessage(
    customer.id,
    botReply
  );

  continue;
}

// ========================================
// PAYMENT JOB SELECTION
//
// 1 waiting job
// → auto payment verification ได้
//
// มากกว่า 1 waiting job
// → ยอดที่ลูกค้าได้รับอาจเป็นยอดรวม
// → ห้ามเดาว่าเป็น Job ไหน
// → ส่งให้ทีมตรวจ
// ========================================

const hasMultipleWaitingPaymentJobs =
  waitingPaymentJobs.length > 1;

const paymentJob =
  waitingPaymentJobs[0];


if (
  hasMultipleWaitingPaymentJobs
) {
  console.log(
    "MULTIPLE WAITING PAYMENT JOBS - HUMAN REVIEW REQUIRED:",
    {
      customerId:
        customer.id,

      waitingPaymentCount:
        waitingPaymentJobs.length,

      waitingPaymentJobIds:
        waitingPaymentJobs.map(
          (job) =>
            job.id
        ),

      slipAmount:
        imageClassification.amount ||
        null,
    }
  );
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
          paymentJob.id,

        messageId,
      });

    console.log(
      "PAYMENT SLIP UPLOADED:",
      {
        jobId:
          paymentJob.id,

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
      paymentJob.price,

    minimumTransactionDate:
      paymentJob.removed_at ||
      null,
  });


const transactionReference =
  imageClassification.reference
    ? String(
        imageClassification.reference
      ).trim()
    : null;


let referenceAlreadyUsed =
  false;

if (transactionReference) {
  referenceAlreadyUsed =
    await isPaymentReferenceUsed(
      transactionReference
    );
}


// -----------------------------------------
// DUPLICATE PAYMENT SLIP
// -----------------------------------------

if (referenceAlreadyUsed) {
  const duplicateSlipReply =
    getCustomerText(
      customer,
      "ตรวจพบว่าสลิปนี้เคยถูกใช้ยืนยันการชำระแล้วครับ รบกวนส่งสลิปรายการใหม่อีกครั้งครับ",
      "This payment slip has already been used. Please send a new payment slip."
    );

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
        paymentJob.id,

      transactionReference,
    }
  );

  continue;
}


// -----------------------------------------
// CUSTOMER-CORRECTABLE PAYMENT ERRORS
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
      getCustomerText(
        customer,
        "ตรวจสอบแล้วข้อมูลผู้รับเงินและวันที่ทำรายการในสลิปไม่ตรงกับงานนี้ครับ รบกวนตรวจสอบและส่งสลิปที่ถูกต้องอีกครั้งครับ",
        "The recipient information and transaction date on this payment slip do not match this job. Please check and send the correct payment slip."
      );

  } else if (
    recipientNameMismatch
  ) {
    invalidSlipReply =
      getCustomerText(
        customer,
        "ข้อมูลผู้รับเงินในสลิปไม่ตรงกับบัญชีที่กำหนดครับ รบกวนตรวจสอบและส่งสลิปที่ถูกต้องอีกครั้งครับ",
        "The recipient information on this payment slip does not match the required account. Please check and send the correct payment slip."
      );

  } else {
    invalidSlipReply =
      getCustomerText(
        customer,
        "วันที่ทำรายการในสลิปไม่ตรงกับรอบงานนี้ครับ รบกวนตรวจสอบและส่งสลิปที่ชำระสำหรับงานนี้อีกครั้งครับ",
        "The transaction date on this payment slip does not match this job. Please send the payment slip for this job."
      );
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
        paymentJob.id,

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
  paymentVerification.verified =
    false;

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
// JOB MUST BE WAITING PAYMENT
// -----------------------------------------

const paymentAllowed =
  [
    "waiting_payment",
    "removed_waiting_payment",
  ].includes(
    paymentJob.status
  );


if (!paymentAllowed) {
  paymentVerification.verified =
    false;

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


// -----------------------------------------
// AUTO VERIFIED PAYMENT
// -----------------------------------------

if (
  paymentVerification.verified &&
  !hasMultipleWaitingPaymentJobs
) {
  const verifiedAt =
    new Date().toISOString();

  const payment =
    await createPayment({
      jobId:
        paymentJob.id,

      amount:
        paymentJob.price,

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
    paymentJob.id,
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
        paymentJob.id,

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
    getCustomerText(
      customer,
      "ขอบคุณครับ ได้รับชำระเรียบร้อยแล้วครับ หากมีรีวิวอื่นต้องการลบ แจ้งได้เลยนะครับ",
      "Thank you. Your payment has been received successfully. If you have another review you'd like us to handle, please send it anytime."
    );


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
        paymentJob.id,

      verified:
        true,
    }
  );
}


// -----------------------------------------
// NEEDS HUMAN REVIEW
// -----------------------------------------

if (
  hasMultipleWaitingPaymentJobs
) {
  paymentVerification.verified =
    false;

  paymentVerification.status =
    "NEEDS_REVIEW";

  if (
    !paymentVerification.reasons.includes(
      "MULTIPLE_WAITING_PAYMENT_JOBS"
    )
  ) {
    paymentVerification.reasons.push(
      "MULTIPLE_WAITING_PAYMENT_JOBS"
    );
  }
}
  
if (
  !paymentVerification.verified &&
  paymentVerification.status ===
    "NEEDS_REVIEW"
) {
  const pendingPayment =
    await createPendingPayment({
      jobId:
        paymentJob.id,

      amount:
        imageClassification.amount ||
        paymentJob.price ||
        0,

      paymentMethod:
        process.env.PAYMENT_RECIPIENT_TYPE ||
        "KTC_BILLER",

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
        paymentJob.id,

      slipImageUrl:
        paymentSlipUpload?.signedUrl ||
        null,

      customerName:
        lineDisplayName ||
        customer.display_name ||
        "",

     businessName:
  hasMultipleWaitingPaymentJobs
    ? `หลายงาน (${waitingPaymentJobs.length} งาน)`
    : (
        paymentJob.business_name ||
        ""
      ),

amount:
  imageClassification.amount ||
  (
    hasMultipleWaitingPaymentJobs
      ? waitingPaymentJobs.reduce(
          (
            total,
            job
          ) =>
            total +
            Number(
              job.price ||
              0
            ),
          0
        )
      : (
          paymentJob.price ||
          0
        )
  ),

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
      paymentJob.id,

    multipleWaitingJobs:
      hasMultipleWaitingPaymentJobs,

    waitingPaymentCount:
      waitingPaymentJobs.length,

    waitingPaymentJobIds:
      waitingPaymentJobs.map(
        (job) =>
          job.id
      ),
  }
);
}


console.log(
  "PAYMENT VERIFICATION:",
  {
    customerId:
      customer.id,

    jobId:
      paymentJob.id,

    result:
      paymentVerification,
  }
);


// ตอนนี้ยังไม่เปลี่ยน state / ไม่บันทึก payment
continue;
}

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

    let result = null;

try {

  result =
    await processTestMessage({
      platform:
        "line",

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
    result?.botReply &&
    result?.alreadySent !== true
  ) {

    let repliedWithReplyToken = false;

    // V2.2.18: For an immediate response to the inbound LINE webhook,
    // prefer the reply API. Reply messages do not consume the monthly
    // push-message quota. Keep push only as a fallback when the reply token
    // is missing/expired or LINE rejects the reply request.
    if (event.replyToken) {
      try {
        await replyLineTextMessage(
          event.replyToken,
          result.botReply
        );
        repliedWithReplyToken = true;
        console.log(
          "LINE REPLY RESULT SENT:",
          { platformUserId }
        );
      } catch (error) {
        console.error(
          "LINE REPLY RESULT FAILED; FALLING BACK TO PUSH:",
          error
        );
      }
    }

    if (!repliedWithReplyToken) {
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

} finally {

  // ========================================
  // ตรวจ Map เสร็จแล้ว
  // ปลด lock เพื่อรับข้อความใหม่
  // ========================================

  if (
    mapProcessingUsers.has(
      platformUserId
    )
  ) {

    mapProcessingUsers.delete(
      platformUserId
    );


    console.log(
      "MAP PROCESSING UNLOCKED:",
      {
        platformUserId,
      }
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

// =========================================================
// MANYCHAT -> GMR CORE BRIDGE
// รองรับทั้ง Facebook Page TH / EN
//
// TH  page_key = gmr_th
// ENG page_key = gmr_en
//
// ManyChat Header:
// x-manychat-secret = MANYCHAT_WEBHOOK_SECRET
// =========================================================
app.post("/manychat/inbound", async (req, res) => {
  try {
    // ========================================
    // 1. VERIFY MANYCHAT SECRET
    // ========================================

    const expectedSecret =
      String(
        process.env.MANYCHAT_WEBHOOK_SECRET || ""
      ).trim();

    const suppliedSecret =
      String(
        req.get("x-manychat-secret") || ""
      ).trim();


    if (!expectedSecret) {
      console.error(
        "MANYCHAT_WEBHOOK_SECRET NOT CONFIGURED"
      );

      return res.status(500).json({
        ok: false,
        error:
          "MANYCHAT_WEBHOOK_SECRET not configured",
      });
    }


    if (
      !suppliedSecret ||
      suppliedSecret !== expectedSecret
    ) {
      console.error(
        "MANYCHAT UNAUTHORIZED"
      );

      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }


    // ========================================
    // 2. READ MANYCHAT PAYLOAD
    // ========================================

    const body =
      req.body || {};


    const pageKey =
      String(
        body.page_key ||
        body.pageKey ||
        "gmr_th"
      )
        .trim()
        .toLowerCase();


    if (
      ![
        "gmr_th",
        "gmr_en",
      ].includes(pageKey)
    ) {
      return res.status(400).json({
        ok: false,
        error: "Invalid page_key",
      });
    }


    const platformUserId =
      String(
        body.subscriber_id ||
        body.contact_id ||
        body.platform_user_id ||
        body.user_id ||
        ""
      ).trim();


    const message =
      String(
        body.message ||
        body.text ||
        ""
      ).trim();


    const firstName =
      String(
        body.first_name || ""
      ).trim();


    const lastName =
      String(
        body.last_name || ""
      ).trim();


    const displayName =
      String(
        body.display_name ||
        [firstName, lastName]
          .filter(Boolean)
          .join(" ") ||
        "Facebook User"
      ).trim();


    const messageId =
      String(
        body.message_id ||
        body.messageId ||
        ""
      ).trim() || null;


    // ========================================
    // 3. VALIDATE
    // ========================================

    if (!platformUserId) {
      return res.status(400).json({
        ok: false,
        error: "Missing subscriber_id",
      });
    }


    if (!message) {
      return res.status(400).json({
        ok: false,
        error: "Missing message",
      });
    }


    // ========================================
    // 4. SEPARATE TH / ENG PAGE IDENTITIES
    // ========================================

  const platform =
  pageKey === "gmr_en"
    ? "facebook_en"
    : "facebook_th";


    console.log(
      "MANYCHAT INBOUND:",
      {
        pageKey,
        platform,
        platformUserId,
        displayName,
        message,
      }
    );


    // ========================================
    // 5. OPTIONAL IDEMPOTENCY
    // ถ้า ManyChat ส่ง message_id มา
    // กัน request ซ้ำ
    // ========================================

    if (messageId) {
      const claim =
        await claimWebhookEvent({
          platform,
          eventId:
            messageId,

          payload: {
            transport:
              "manychat",

            pageKey,
            platformUserId,
          },
        });


      if (
        claim?.claimed === false
      ) {
        console.log(
          "DUPLICATE MANYCHAT EVENT SUPPRESSED:",
          {
            messageId,
            platformUserId,
          }
        );


        return res.status(200).json({
          ok: true,
          duplicate: true,

          reply: null,
          should_reply: false,
        });
      }
    }


    // ========================================
    // 6. BOT CONTROL
    // ถ้าปิด Bot
    // เก็บข้อความไว้ แต่ไม่ตอบ
    // ========================================

    const botControl =
      await getBotControl();


    if (
      botControl.enabled !== true
    ) {

      const pausedCustomer =
        await getOrCreateCustomer({
          platform,

          platformUserId,

          displayName,

          language:
            pageKey === "gmr_en"
              ? "en"
              : detectCustomerLanguage(
                  message,
                  "th"
                ),
        });


      await saveMessage({
        customerId:
          pausedCustomer.id,

        platform,

        direction:
          "inbound",

        messageType:
          "text",

        messageText:
          message,

        platformMessageId:
          messageId,

        metadata: {
          transport:
            "manychat",

          page_key:
            pageKey,
        },
      });


      return res.status(200).json({
        ok: true,

        paused: true,

        reply: null,

        should_reply: false,
      });
    }


    // ========================================
    // 7. SEND INTO EXISTING GMR CORE
    // ใช้ State Machine เดิมทั้งหมด
    // ========================================

    const result =
      await processTestMessage({
        platform,

        platformUserId,

        message,

        messageType:
          "text",

        displayName,
      });


    // ========================================
    // 8. RETURN REPLY TO MANYCHAT
    // ========================================

    const reply =
      result?.alreadySent === true
        ? null
        : (
            result?.botReply ||
            null
          );


    console.log(
      "MANYCHAT FLOW RESULT:",
      {
        pageKey,

        platformUserId,

        stateBefore:
          result?.stateBefore ||
          null,

        stateAfter:
          result?.stateAfter ||
          null,

        shouldReply:
          Boolean(reply),

        alreadySent:
          result?.alreadySent === true,
      }
    );


    return res.status(200).json({
      ok: true,

      page_key:
        pageKey,

      reply,

      should_reply:
        Boolean(reply),

      customer_id:
        result?.customerId ||
        null,

      state_before:
        result?.stateBefore ||
        null,

      state_after:
        result?.stateAfter ||
        null,

      soft_handoff:
        result?.softHandoff === true,
    });


  } catch (error) {

    console.error(
      "MANYCHAT INBOUND ERROR:",
      error
    );


    return res.status(500).json({
      ok: false,

      error:
        error.message,

      reply: null,

      should_reply: false,
    });
  }
});



// =========================================================
// BOTPRESS -> GMR CORE BRIDGE
// Interactive replies are returned to Botpress; Botpress sends them to Messenger.
// page_key keeps Page TH / Page EN identities separate.
// =========================================================
app.post("/botpress/inbound", async (req, res) => {
  try {
    const expectedSecret = process.env.BOTPRESS_WEBHOOK_SECRET;
    const suppliedSecret =
      req.get("x-gmr-secret") ||
      req.body?.secret ||
      null;

    if (!expectedSecret || suppliedSecret !== expectedSecret) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const body = req.body || {};
    const pageKey = String(body.page_key || body.pageKey || "gmr_th").trim();
    const platformUserId = String(
      body.platform_user_id || body.sender_id || body.senderId || body.user_id || ""
    ).trim();
    const message = String(body.message || body.text || "").trim();
    const messageId = String(body.message_id || body.messageId || "").trim() || null;
    const displayName = String(
      body.display_name ||
      [body.first_name, body.last_name].filter(Boolean).join(" ") ||
      "Facebook User"
    ).trim();

    if (!platformUserId) {
      return res.status(400).json({ ok: false, error: "Missing platform_user_id" });
    }
    if (!message) {
      return res.status(400).json({ ok: false, error: "Missing message" });
    }

    const platform = `facebook:${pageKey || "default"}`;

    if (messageId) {
      const claim = await claimWebhookEvent({
        platform,
        eventId: messageId,
        payload: { pageKey, platformUserId },
      });
      if (claim?.claimed === false) {
        return res.status(200).json({
          ok: true,
          duplicate: true,
          reply: null,
          should_reply: false,
        });
      }
    }

    const botControl = await getBotControl();
    if (botControl.enabled !== true) {
      const pausedCustomer = await getOrCreateCustomer({
        platform,
        platformUserId,
        displayName,
        language: detectCustomerLanguage(message, pageKey === "gmr_en" ? "en" : "th"),
      });
      await saveMessage({
        customerId: pausedCustomer.id,
        platform,
        direction: "inbound",
        messageType: "text",
        messageText: message,
        platformMessageId: messageId,
        metadata: { transport: "botpress", page_key: pageKey },
      });
      return res.status(200).json({
        ok: true,
        paused: true,
        reply: null,
        should_reply: false,
      });
    }

    const result = await processTestMessage({
      platform,
      platformUserId,
      message,
      messageType: "text",
      displayName,
    });

    const reply = result?.alreadySent === true
      ? null
      : (result?.botReply || null);

    return res.status(200).json({
      ok: true,
      reply,
      should_reply: Boolean(reply),
      customer_id: result?.customerId || null,
      state_before: result?.stateBefore || null,
      state_after: result?.stateAfter || null,
      soft_handoff: result?.softHandoff === true,
    });
  } catch (error) {
    console.error("BOTPRESS INBOUND ERROR:", error);
    return res.status(500).json({
      ok: false,
      error: error.message,
      reply: null,
      should_reply: false,
    });
  }
});

// =========================================================
// GOOGLE SHEET -> SUPABASE EDITABLE SYNC
// Editable fields only. IDs/status remain controlled by the workflow.
// =========================================================
app.post("/sheet-sync", async (req, res) => {
  try {
    const { secret, jobId, customerId, field, value } = req.body || {};
    const expectedSecret = process.env.SHEET_CONTROL_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    if (!field) {
      return res.status(400).json({ ok: false, error: "Missing field" });
    }

    const safeField = String(field).trim();
    const customerFields = new Set(["customerName", "phone", "email"]);
    const jobFields = new Set(["businessName", "reviewUrl", "price", "currency"]);

    let resolvedCustomerId = customerId || null;
    let job = null;

    if (jobId) {
      job = await getJobById(jobId);
      if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
      resolvedCustomerId = resolvedCustomerId || job.customer_id;
    }

    if (customerFields.has(safeField)) {
      if (!resolvedCustomerId) {
        return res.status(400).json({ ok: false, error: "Missing customerId" });
      }
      const before = await getCustomerById(resolvedCustomerId);
      const args = { customerId: resolvedCustomerId };
      if (safeField === "customerName") args.displayName = value;
      if (safeField === "phone") args.phone = value;
      if (safeField === "email") args.email = value;
      const updated = await updateCustomerEditableFields(args);
      await logSheetSyncChange({
        jobId: jobId || null,
        customerId: resolvedCustomerId,
        fieldName: safeField,
        oldValue:
          safeField === "customerName" ? before?.display_name :
          safeField === "phone" ? before?.phone : before?.email,
        newValue: value,
      });
      return res.json({ ok: true, field: safeField, customer: updated });
    }

    if (jobFields.has(safeField)) {
      if (!jobId) return res.status(400).json({ ok: false, error: "Missing jobId" });
      const args = { jobId };
      if (safeField === "businessName") args.businessName = value;
      if (safeField === "reviewUrl") args.reviewUrl = value;
      if (safeField === "price") args.price = value;
      if (safeField === "currency") args.currency = value;
      const beforeValue =
        safeField === "businessName" ? job?.business_name :
        safeField === "reviewUrl" ? job?.review_url :
        safeField === "price" ? job?.price : job?.currency;
      const updated = await updateJobEditableFields(args);
      await logSheetSyncChange({
        jobId,
        customerId: resolvedCustomerId,
        fieldName: safeField,
        oldValue: beforeValue,
        newValue: value,
      });
      return res.json({ ok: true, field: safeField, job: updated });
    }

    return res.status(400).json({ ok: false, error: "Field is not editable" });
  } catch (error) {
    console.error("SHEET SYNC ERROR:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// =========================================================
// FACEBOOK MESSENGER WEBHOOK
// Direct Meta Messenger integration
// Platform key = facebook:<PAGE_ID>
// =========================================================
app.get("/facebook/webhook", (req, res) => {
  const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/facebook/webhook", async (req, res) => {
  try {
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (appSecret) {
      const signature = req.get("x-hub-signature-256");
      if (!signature || !req.rawBody) return res.sendStatus(401);
      const expected = "sha256=" + crypto
        .createHmac("sha256", appSecret)
        .update(req.rawBody)
        .digest("hex");
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.sendStatus(401);
      }
    }

    res.sendStatus(200);
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];

    for (const entry of entries) {
      const pageId = String(entry?.id || "").trim();
      const events = Array.isArray(entry?.messaging) ? entry.messaging : [];

      for (const event of events) {
        if (!event?.message || event.message.is_echo === true) continue;
        const senderId = String(event?.sender?.id || "").trim();
        if (!senderId) continue;

        const eventId = event?.message?.mid ||
          `${pageId}:${senderId}:${event?.timestamp || ""}:${event?.message?.text || ""}`;
        const claim = await claimWebhookEvent({
          platform: `facebook:${pageId || "default"}`,
          eventId: String(eventId),
          payload: { pageId, senderId, timestamp: event?.timestamp || null },
        });
        if (claim?.claimed === false) {
          console.log("DUPLICATE FACEBOOK EVENT SUPPRESSED", { eventId });
          continue;
        }

        const platform = `facebook:${pageId || "default"}`;
        let displayName = "Facebook User";
        try {
          const profile = await getFacebookUserProfile({
            pageId,
            userId: senderId,
          });
          if (profile?.displayName) displayName = profile.displayName;
        } catch (profileError) {
          console.error("FACEBOOK PROFILE FETCH FAILED:", profileError);
        }

        const messageType = event?.message?.text ? "text" : "unknown";
        const message = event?.message?.text || "";

        const botControl = await getBotControl();
        if (botControl.enabled !== true) {
          const pausedCustomer = await getOrCreateCustomer({
            platform, platformUserId: senderId, displayName,
            language: detectCustomerLanguage(message, "en"),
          });
          await saveMessage({
            customerId: pausedCustomer.id, platform,
            direction: "inbound", messageType, messageText: message || null,
            platformMessageId: event?.message?.mid || null,
          });
          continue;
        }

        const result = await processTestMessage({
          platform,
          platformUserId: senderId,
          displayName,
          message,
          messageType,
        });

        console.log("FACEBOOK FLOW RESULT:", result);

        if (result?.botReply && result?.alreadySent !== true) {
          await sendMessageToCustomer({
            platform,
            platformUserId: senderId,
            text: result.botReply,
          });
        }
      }
    }
  } catch (error) {
    console.error("FACEBOOK WEBHOOK ERROR:", error);
    if (!res.headersSent) return res.sendStatus(500);
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


    // ========================================
    // CUSTOMER
    // ========================================

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


    // ========================================
    // CONVERSATION
    // ========================================

    const conversation =
      await getConversationByCustomerId(
        customer.id
      );

    if (!conversation) {
      throw new Error(
        "Conversation not found"
      );
    }


    // ========================================
    // LATEST JOB
    // ========================================

    const latestJob =
      await getLatestJobByCustomerId(
        customer.id
      );

    if (!latestJob) {
      throw new Error(
        "No active job found"
      );
    }


    const unitPrice =
      Number(
        latestJob.price || 0
      );

    if (
      !Number.isFinite(unitPrice) ||
      unitPrice <= 0
    ) {
      throw new Error(
        "Job has invalid price"
      );
    }


    // ========================================
    // CURRENCY
    // ========================================

    const paymentCurrency =
      getCurrencyFromUnitPrice({
        price:
          unitPrice,

        currency:
          latestJob.currency,
      });


    // ========================================
    // PAYMENT CONFIG
    // ========================================

    const thbPaymentQrUrl =
      String(
        process.env
          .THB_PAYMENT_QR_URL ||
        ""
      ).trim();

    const stripePaymentLink =
      String(
        process.env
          .STRIPE_PAYMENT_LINK ||
        ""
      ).trim();


    if (
      paymentCurrency === "THB" &&
      !thbPaymentQrUrl
    ) {
      throw new Error(
        "THB_PAYMENT_QR_URL is not configured"
      );
    }


    if (
      paymentCurrency === "USD" &&
      !stripePaymentLink
    ) {
      throw new Error(
        "STRIPE_PAYMENT_LINK is not configured"
      );
    }


    // ========================================
    // MARK CURRENT JOB REMOVED
    // ========================================

    const removedAt =
      new Date().toISOString();


    await updateJob(
      latestJob.id,
      {
        status:
          "waiting_payment",

        removed_at:
          removedAt,

        review_removed_detected_at:
          removedAt,

        review_missing_count:
          1,

        currency:
          paymentCurrency,
      }
    );


    // ========================================
    // GET ALL WAITING PAYMENT JOBS
    // ของลูกค้าคนเดียวกัน
    // ========================================

    const waitingPaymentJobs =
      await getWaitingPaymentJobsByCustomerId(
        customer.id
      );


    // ========================================
    // PAYMENT SUMMARY
    // ========================================

    const paymentSummary =
      buildPaymentBreakdown({
        jobs:
          waitingPaymentJobs,

        currency:
          paymentCurrency,

        language:
          customer.language ||
          "th",
      });


    if (
      paymentSummary.total <= 0
    ) {
      throw new Error(
        "Payment total is invalid"
      );
    }


    const formattedTotal =
      formatMoney(
        paymentSummary.total,
        paymentCurrency
      );


    const breakdownText =
      paymentSummary.lines
        .join("\n");


    // ========================================
    // PAYMENT MESSAGE
    // ========================================

    let botReply;


    if (
      paymentCurrency === "THB"
    ) {

      botReply =
        getCustomerText(
          customer,

          "รีวิวที่ให้ดำเนินการ ออกแล้วนะครับ ✅\n\n" +

          `จำนวนที่สำเร็จและรอชำระ: ${paymentSummary.totalReviews} รีวิว\n\n` +

          "รายละเอียด:\n" +
          `${breakdownText}\n\n` +

          `ยอดที่ต้องชำระทั้งหมด: ${formattedTotal} บาท\n\n` +

          "สามารถสแกน QR ด้านล่างเพื่อชำระได้เลยครับ\n\n" +

          "หลังชำระแล้ว รบกวนส่งสลิปเข้ามาในแชทนี้ได้เลยครับ",

          "The assigned reviews have been successfully processed. ✅\n\n" +

          `Completed and awaiting payment: ${paymentSummary.totalReviews} review(s)\n\n` +

          "Breakdown:\n" +
          `${breakdownText}\n\n` +

          `Total amount due: THB ${formattedTotal}\n\n` +

          "Please use the QR code below to make payment, then send the payment slip in this chat."
        );

    } else {

      botReply =
        getCustomerText(
          customer,

          "รีวิวที่ให้ดำเนินการ ออกแล้วนะครับ ✅\n\n" +

          `จำนวนที่สำเร็จและรอชำระ: ${paymentSummary.totalReviews} รีวิว\n\n` +

          "รายละเอียด:\n" +
          `${breakdownText}\n\n` +

          `ยอดที่ต้องชำระทั้งหมด: $${formattedTotal} USD\n\n` +

          "สามารถชำระผ่านลิงก์ด้านล่างได้เลยครับ\n" +
          `${stripePaymentLink}`,

          "The assigned reviews have been successfully processed. ✅\n\n" +

          `Completed and awaiting payment: ${paymentSummary.totalReviews} review(s)\n\n` +

          "Breakdown:\n" +
          `${breakdownText}\n\n` +

          `Total amount due: $${formattedTotal} USD\n\n` +

          "Please complete payment using the link below:\n" +
          `${stripePaymentLink}`
        );
    }


    // ========================================
    // UPDATE CONVERSATION
    // ========================================

    await updateConversationState({
      customerId:
        customer.id,

      state:
        GMR_STATES
          .REMOVED_WAITING_PAYMENT,

      handoff:
        false,

      handoffReason:
        null,
    });


    // ========================================
    // UPDATE GOOGLE SHEET
    // ========================================

    try {
      await updateJobInGoogleSheet({
        jobId:
          latestJob.id,

        status:
          "waiting_payment",

        removedAt,

        paidAt:
          "",
      });

    } catch (error) {

      console.error(
        "TEST MARK REMOVED SHEET UPDATE FAILED:",
        error
      );
    }


    // ========================================
    // SEND PAYMENT MESSAGE
    // ========================================

    await sendMessageToCustomer({
      platform:
        customer.platform,

      platformUserId:
        customer.platform_user_id,

      text:
        botReply,
    });


    // ========================================
    // THB → SEND QR IMAGE
    // ========================================

    if (
      paymentCurrency === "THB"
    ) {

      await sendMessageToCustomer({
        platform:
          customer.platform,

        platformUserId:
          customer.platform_user_id,

        imageUrl:
          thbPaymentQrUrl,
      });
    }


    // ========================================
    // SAVE OUTBOUND
    // ========================================

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


    // ========================================
    // RESULT
    // ========================================

    return res
      .status(200)
      .json({
        ok: true,

        customerId:
          customer.id,

        jobId:
          latestJob.id,

        stateAfter:
          GMR_STATES
            .REMOVED_WAITING_PAYMENT,

        paymentCurrency,

        totalReviews:
          paymentSummary.totalReviews,

        total:
          paymentSummary.total,

        removedAt,

        qrSent:
          paymentCurrency === "THB",

        botReply,
      });


  } catch (error) {

    console.error(
      "TEST MARK REMOVED ERROR:",
      error
    );


    return res
      .status(500)
      .json({
        ok: false,

        error:
          error.message,
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

// =========================================================
// BACKFILL EXISTING CUSTOMER MAPS
// =========================================================

app.post(
  "/backfill-existing-customer-maps",
  async (req, res) => {
    try {
      const {
        secret,
      } = req.body || {};

      const SHEET_CONTROL_SECRET =
        process.env.SHEET_CONTROL_SECRET;

      if (
        !SHEET_CONTROL_SECRET ||
        secret !== SHEET_CONTROL_SECRET
      ) {
        return res.status(401).json({
          ok: false,
          error: "Unauthorized",
        });
      }

      const result =
        await backfillExistingCustomerMaps();

      console.log(
        "BACKFILL EXISTING CUSTOMER MAPS:",
        result
      );

      return res.json({
        ok: true,
        ...result,
      });

    } catch (error) {
      console.error(
        "BACKFILL EXISTING CUSTOMER MAPS ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          String(error),
      });
    }
  }
);

// =========================================================
// RESOLVE EXISTING CUSTOMER MAPS
//
// source_review_url
// → หา review/business
// → search Google Place
// → save place_id + map_url
// =========================================================

app.post(
  "/resolve-existing-customer-maps",
  async (req, res) => {
    try {
      const {
        secret,
      } = req.body || {};

      const SHEET_CONTROL_SECRET =
        process.env.SHEET_CONTROL_SECRET;

      if (
        !SHEET_CONTROL_SECRET ||
        secret !== SHEET_CONTROL_SECRET
      ) {
        return res.status(401).json({
          ok: false,
          error: "Unauthorized",
        });
      }

      const maps =
        await getCustomerMapsWaitingForResolve();

      const results = [];

      for (const customerMap of maps) {
        try {
          const reviewUrl =
            String(
              customerMap?.source_review_url ||
              ""
            ).trim();

          if (!reviewUrl) {
            results.push({
              customerMapId:
                customerMap.id,
              ok: false,
              reason:
                "missing_source_review_url",
            });

            continue;
          }

          // =====================================
          // 1. Resolve review URL
          // =====================================

          const directResult =
            await getReviewFromDirectUrl(
              reviewUrl
            );

         let businessName =
  String(
    directResult?.businessName ||
    customerMap.business_name ||
    ""
  ).trim();

if (
  !directResult?.found ||
  !directResult?.review
) {
  console.log(
    "REVIEW RESOLVE FAILED, USING STORED BUSINESS NAME:",
    {
      customerMapId:
        customerMap.id,

      reason:
        directResult?.reason ||
        "review_not_found",

      businessName,
    }
  );
}

if (!businessName) {
  results.push({
    customerMapId:
      customerMap.id,
    ok: false,
    reason:
      "business_name_not_found",
  });

  continue;
}

          if (!businessName) {
            results.push({
              customerMapId:
                customerMap.id,
              ok: false,
              reason:
                "business_name_not_found",
            });

            continue;
          }

          // =====================================
          // 2. Search Google Place
          // =====================================

          const places =
            await searchPlaceByText(
              businessName
            );

          if (
            !Array.isArray(places) ||
            places.length === 0
          ) {
            results.push({
              customerMapId:
                customerMap.id,
              ok: false,
              businessName,
              reason:
                "place_not_found",
            });

            continue;
          }

          const place =
            places[0];

          const placeId =
            String(
              place?.placeId ||
              ""
            ).trim();

          if (!placeId) {
            results.push({
              customerMapId:
                customerMap.id,
              ok: false,
              businessName,
              reason:
                "place_id_missing",
            });

            continue;
          }

          // =====================================
          // 3. Save resolved Map
          // =====================================

          const updated =
            await updateResolvedCustomerMap({
              customerMapId:
                customerMap.id,

              businessName:
                place.businessName ||
                businessName,

              placeId,

              mapUrl:
                place.mapUrl ||
                null,
            });

          results.push({
            customerMapId:
              customerMap.id,
            ok: true,
            businessName:
              updated.business_name,
            placeId:
              updated.place_id,
            mapUrl:
              updated.map_url,
          });

        } catch (mapError) {
          console.error(
            "RESOLVE CUSTOMER MAP ERROR:",
            {
              customerMapId:
                customerMap?.id,

              error:
                mapError?.message ||
                String(mapError),
            }
          );

          results.push({
            customerMapId:
              customerMap?.id ||
              null,
            ok: false,
            reason:
              "resolve_error",
            error:
              mapError?.message ||
              String(mapError),
          });
        }
      }

      const resolved =
        results.filter(
          (item) =>
            item.ok === true
        ).length;

      const failed =
        results.length -
        resolved;

      return res.json({
        ok: true,
        total:
          results.length,
        resolved,
        failed,
        results,
      });

    } catch (error) {
      console.error(
        "RESOLVE EXISTING CUSTOMER MAPS ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          String(error),
      });
    }
  }
);

// =========================================================
// CHECK REACTIVATION MAPS
//
// รอบแรกของแต่ละ Map = BASELINE เท่านั้น
// ห้ามแจ้งทีมจากรีวิวเก่าที่มีอยู่ก่อนเริ่มระบบ
//
// รอบถัดไป:
// - เช็กเฉพาะ Map ที่ครบ 3 วัน
// - เอาเฉพาะ 1 ดาว
// - เอาเฉพาะ review ที่ใหม่กว่า last_checked_at
// - กัน review/job เดิม
// - กัน alert เดิม
// =========================================================

app.post(
  "/check-reactivation-maps",
  async (req, res) => {
    try {
      const {
        secret,
        dryRun = true,
      } = req.body || {};

      const SHEET_CONTROL_SECRET =
        process.env.SHEET_CONTROL_SECRET;

      if (
        !SHEET_CONTROL_SECRET ||
        secret !== SHEET_CONTROL_SECRET
      ) {
        return res.status(401).json({
          ok: false,
          error: "Unauthorized",
        });
      }

      const maps =
        await getCustomerMapsDueForReactivationCheck();

      const results = [];

      for (const customerMap of maps) {
        try {
          const placeId =
            String(
              customerMap?.place_id ||
              ""
            ).trim();

          if (!placeId) {
            continue;
          }

          const newestResult =
            await getNewestReviews(
              placeId
            );

          const reviews =
            Array.isArray(
              newestResult?.reviews
            )
              ? newestResult.reviews
              : [];

          const oneStarReviews =
            reviews.filter(
              (review) =>
                Number(
                  review?.rating
                ) === 1
            );

          // =====================================
          // FIRST RUN = BASELINE ONLY
          //
          // สำคัญ:
          // ห้ามเอารีวิวเก่าที่มีอยู่แล้ว
          // ไปเสนอขายลูกค้า
          // =====================================

          if (
            !customerMap.last_checked_at
          ) {
            let newestReviewDate =
              null;

            for (
              const review of
              oneStarReviews
            ) {
              const reviewDate =
                review?.isoDate
                  ? new Date(
                      review.isoDate
                    )
                  : null;

              if (
                !reviewDate ||
                Number.isNaN(
                  reviewDate.getTime()
                )
              ) {
                continue;
              }

              if (
                !newestReviewDate ||
                reviewDate >
                  newestReviewDate
              ) {
                newestReviewDate =
                  reviewDate;
              }
            }

            if (dryRun !== true) {
              await markCustomerMapChecked({
                customerMapId:
                  customerMap.id,

                lastReviewSeenAt:
                  newestReviewDate
                    ? newestReviewDate
                        .toISOString()
                    : null,
              });
            }

            results.push({
              customerMapId:
                customerMap.id,

              customerId:
                customerMap.customer_id,

              businessName:
                customerMap.business_name,

              status:
                "baseline",

              oneStarCount:
                oneStarReviews.length,

              wouldMarkChecked:
                true,
            });

            continue;
          }

          const lastCheckedAt =
            new Date(
              customerMap.last_checked_at
            );

          const candidates = [];

          for (
            const review of
            oneStarReviews
          ) {
            const reviewDate =
              review?.isoDate
                ? new Date(
                    review.isoDate
                  )
                : null;

            // ไม่มีวันที่ที่เชื่อถือได้
            // → ไม่เดาว่าเป็นรีวิวใหม่
            if (
              !reviewDate ||
              Number.isNaN(
                reviewDate.getTime()
              )
            ) {
              continue;
            }

            // ต้องใหม่กว่ารอบตรวจล่าสุดจริง
            if (
              reviewDate <=
              lastCheckedAt
            ) {
              continue;
            }

            const providerReviewId =
              String(
                review?.reviewId ||
                ""
              ).trim() ||
              null;

            const reviewUrl =
              String(
                review?.reviewUrl ||
                ""
              ).trim() ||
              null;

            // ---------------------------------
            // เคยมีงานนี้แล้วหรือไม่
            // ---------------------------------

            const existingReview =
              await findExistingCustomerReview({
                customerId:
                  customerMap.customer_id,

                providerReviewId,

                reviewUrl,
              });

            if (existingReview) {
              continue;
            }

            // ---------------------------------
            // เคยแจ้ง Reactivation ไปแล้วหรือไม่
            // ---------------------------------

            const existingAlert =
              await findExistingReactivationAlert({
                customerMapId:
                  customerMap.id,

                providerReviewId,

                reviewUrl,
              });

            if (existingAlert) {
              continue;
            }

            candidates.push({
              providerReviewId,

              reviewUrl,

              reviewerName:
                review?.reviewerName ||
                null,

              reviewText:
                review?.text ||
                null,

              rating:
                Number(
                  review?.rating
                ) || 1,

              reviewDate:
                reviewDate
                  .toISOString(),
            });
          }

          // =====================================
          // ตอนนี้ยังไม่ส่ง LINE กลุ่ม
          // dryRun=true ใช้ตรวจ logic ก่อน
          // =====================================

          if (dryRun !== true) {
            for (
              const candidate of
              candidates
            ) {
              const createdAlert =
                await createReactivationAlert({
                  customerId:
                    customerMap.customer_id,

                  customerMapId:
                    customerMap.id,

                  ...candidate,
                });

              await sendReactivationAlertToLineGroup({
                alert: createdAlert,
                customerMap,
              });
            }

            await markCustomerMapChecked({
              customerMapId:
                customerMap.id,
            });
          }

          results.push({
            customerMapId:
              customerMap.id,

            customerId:
              customerMap.customer_id,

            businessName:
              customerMap.business_name,

            status:
              "checked",

            newOneStarCount:
              candidates.length,

            candidates,
          });

        } catch (mapError) {
          console.error(
            "REACTIVATION MAP CHECK ERROR:",
            {
              customerMapId:
                customerMap?.id,

              error:
                mapError?.message ||
                String(mapError),
            }
          );

          results.push({
            customerMapId:
              customerMap?.id ||
              null,

            status:
              "error",

            error:
              mapError?.message ||
              String(mapError),
          });
        }
      }

      return res.json({
        ok: true,
        dryRun:
          dryRun === true,
        mapsChecked:
          maps.length,
        results,
      });

    } catch (error) {
      console.error(
        "CHECK REACTIVATION MAPS ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          String(error),
      });
    }
  }
);

// =========================================================
// IMPORT LEGACY CUSTOMERS FROM GOOGLE SHEET
// =========================================================

app.post(
  "/import-legacy-customers",
  async (req, res) => {
    try {
      const {
        secret,
        customers,
      } = req.body || {};


      const SHEET_CONTROL_SECRET =
        process.env.SHEET_CONTROL_SECRET;


      // ================================================
      // AUTH
      // ================================================

      if (
        !SHEET_CONTROL_SECRET ||
        secret !== SHEET_CONTROL_SECRET
      ) {
        return res.status(401).json({
          ok: false,
          error: "Unauthorized",
        });
      }


      // ================================================
      // VALIDATE
      // ================================================

      if (
        !Array.isArray(customers) ||
        customers.length === 0
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "customers must be a non-empty array",
        });
      }


      if (customers.length > 500) {
        return res.status(400).json({
          ok: false,
          error:
            "Maximum 500 customers per import",
        });
      }


      const results = [];


      // ================================================
      // IMPORT EACH CUSTOMER
      // ================================================

      for (
        let i = 0;
        i < customers.length;
        i++
      ) {
        const item =
          customers[i] || {};


        try {
          const result =
  await createLegacyCustomerFromSheet({
    platform:
      item.platform,

    platformAccount:
      item.platformAccount,

    legacyCustomerId:
      item.legacyCustomerId,

    displayName:
      item.displayName,

    businessName:
      item.businessName,

    mapUrl:
      item.mapUrl,

    mapUrls:
      item.mapUrls ||
      item.map_urls ||
      null,

    phone:
      item.phone,

    email:
      item.email,

    newReviewRate:
      item.newReviewRate,

    newReviewCurrency:
      item.newReviewCurrency,

    oldReviewRate:
      item.oldReviewRate,

    oldReviewCurrency:
      item.oldReviewCurrency,

    hasVerifiedPayment:
      item.hasVerifiedPayment,

    note:
      item.note,
  });


// ========================================================
// LEGACY AUTO MATCH ON SHEET IMPORT
//
// หลักการ:
// 1. Legacy ที่ matched แล้ว → ไม่ยุ่ง
// 2. Legacy pending → หา customer เดิมจาก
//    platform + display_name
// 3. เจอ 1 คน → claim สำหรับ Auto Match
// 4. เจอ >1 คน → ห้ามเดา
// 5. ไม่เจอ → pending ต่อไป
// ========================================================

let autoMatchCustomer =
  null;

let autoMatchClaim =
  null;

let autoMatchStatus =
  "not_checked";

const importedLegacyForMatch =
  result?.customer || null;

const currentMatchStatus =
  String(
    importedLegacyForMatch
      ?.match_status ||
    ""
  )
    .trim()
    .toLowerCase();

const alreadyMatchedCustomerId =
  String(
    importedLegacyForMatch
      ?.matched_customer_id ||
    ""
  ).trim();


if (alreadyMatchedCustomerId) {

  autoMatchStatus =
    "already_matched";

} else if (
  currentMatchStatus === "pending"
) {

  const legacyPlatform =
    String(
      importedLegacyForMatch
        ?.platform ||
      item.platform ||
      ""
    )
      .trim()
      .toLowerCase();

  const legacyDisplayName =
    String(
      importedLegacyForMatch
        ?.display_name ||
      item.displayName ||
      ""
    ).trim();


  if (
    legacyPlatform &&
    legacyDisplayName
  ) {

    const customerMatches =
      await findCustomersByPlatformAndDisplayName({
        platform:
          legacyPlatform,

        displayName:
          legacyDisplayName,
      });


    console.log(
      "LEGACY IMPORT AUTO MATCH SEARCH:",
      {
        legacyCustomerId:
          importedLegacyForMatch?.id ||
          null,

        platform:
          legacyPlatform,

        displayName:
          legacyDisplayName,

        matchCount:
          customerMatches.length,

        customerIds:
          customerMatches.map(
            (customer) =>
              customer.id
          ),
      }
    );


    // ====================================================
    // EXACTLY 1 CUSTOMER
    // ====================================================

    if (
      customerMatches.length === 1
    ) {

      autoMatchCustomer =
        customerMatches[0];


      autoMatchClaim =
        await claimLegacyCustomerAutoMatch({
          legacyCustomerId:
            importedLegacyForMatch.id,

          customerId:
            autoMatchCustomer.id,
        });


      if (autoMatchClaim) {

        autoMatchStatus =
          "claimed";

        console.log(
          "LEGACY AUTO MATCH CLAIMED:",
          {
            legacyCustomerId:
              importedLegacyForMatch.id,

            customerId:
              autoMatchCustomer.id,

            platform:
              legacyPlatform,

            displayName:
              legacyDisplayName,
          }
        );

      } else {

        autoMatchStatus =
          "claim_skipped";

        console.log(
          "LEGACY AUTO MATCH CLAIM SKIPPED:",
          {
            legacyCustomerId:
              importedLegacyForMatch.id,

            customerId:
              autoMatchCustomer.id,
          }
        );
      }


    // ====================================================
    // 0 OR >1 LIVE CHAT MATCHES
    //
    // Do NOT wait for the customer to message again.
    // Create a monitoring shell now so historical rates + Maps
    // are imported immediately and 1-star reactivation can run.
    //
    // If an exact platform_user_id is supplied in the Legacy Sheet,
    // the shell is immediately contactable. Otherwise it uses
    // legacy:<legacy_id> until the same name messages on that platform.
    // ====================================================

    } else {

      if (customerMatches.length > 1) {
        console.warn(
          "LEGACY LIVE CHAT MATCH AMBIGUOUS — USING MONITORING SHELL:",
          {
            legacyCustomerId: importedLegacyForMatch.id,
            platform: legacyPlatform,
            displayName: legacyDisplayName,
            customerIds: customerMatches.map((customer) => customer.id),
          }
        );
      }

      autoMatchCustomer =
        await getOrCreateLegacyMonitoringCustomer({
          legacyCustomerId: importedLegacyForMatch.id,
          platform: legacyPlatform,
          platformUserId:
            item.platformUserId ||
            item.platform_user_id ||
            null,
          platformAccount:
            importedLegacyForMatch.platform_account ||
            item.platformAccount ||
            null,
          displayName: legacyDisplayName,
          language:
            legacyPlatform === "facebook_en" || legacyPlatform === "fb_en"
              ? "en"
              : "th",
        });

      autoMatchClaim =
        await claimLegacyCustomerAutoMatch({
          legacyCustomerId: importedLegacyForMatch.id,
          customerId: autoMatchCustomer.id,
        });

      if (autoMatchClaim) {
        autoMatchStatus = "claimed";

        console.log(
          "LEGACY MONITORING SHELL CLAIMED:",
          {
            legacyCustomerId: importedLegacyForMatch.id,
            customerId: autoMatchCustomer.id,
            platform: legacyPlatform,
            platformUserId: autoMatchCustomer.platform_user_id,
            displayName: legacyDisplayName,
            liveMatchCount: customerMatches.length,
          }
        );
      } else {
        autoMatchStatus = "claim_skipped";
      }
    }

  } else {

    autoMatchStatus =
      "missing_match_data";
  }

} else {

  autoMatchStatus =
    currentMatchStatus ||
    "unknown_status";
}

  // ========================================================
// COMPLETE LEGACY AUTO MATCH
//
// claimed
// → ตรวจ verified payment
// → สร้าง historical NEW/OLD jobs
// → สร้าง verified payment
// → mark Legacy = matched
//
// Resume-safe:
// ใช้ legacy_source_id + review_case กันงานซ้ำ
// ========================================================

let autoMatchedLegacy =
  null;

if (
  autoMatchStatus === "claimed" &&
  autoMatchClaim &&
  autoMatchCustomer
) {

  try {

    // ====================================================
    // SAFETY:
    // Legacy ต้องยืนยันว่าเคยจ่ายเงินจริง
    // ====================================================

    if (
      autoMatchClaim.has_verified_payment !== true
    ) {

      await rollbackLegacyCustomerAutoMatch(
        autoMatchClaim.id
      );

      autoMatchStatus =
        "payment_unverified";

      console.warn(
        "LEGACY AUTO MATCH BLOCKED: PAYMENT NOT VERIFIED",
        {
          legacyCustomerId:
            autoMatchClaim.id,

          customerId:
            autoMatchCustomer.id,
        }
      );

    } else {

      const verifiedAt =
        new Date().toISOString();

      const importedJobs = [];


      // ==================================================
      // NEW REVIEW HISTORY
      // ==================================================

      const newReviewRate =
        Number(
          autoMatchClaim
            .new_review_rate ||
          0
        );


      if (
        Number.isFinite(
          newReviewRate
        ) &&
        newReviewRate > 0
      ) {

        const newCurrency =
          String(
            autoMatchClaim
              .new_review_currency ||
            "THB"
          ).toUpperCase();


        let historicalNewJob =
          await getLegacyImportedJob({
            legacySourceId:
              autoMatchClaim.id,

            reviewCase:
              "legacy_import_new",
          });


        if (!historicalNewJob) {

          historicalNewJob =
            await createJob({
              customerId:
                autoMatchCustomer.id,

              businessName:
                autoMatchClaim
                  .business_name ||
                null,

              reviewCase:
                "legacy_import_new",

              status:
                "paid",

              legacySourceId:
                autoMatchClaim.id,
            });

        } else if (
          historicalNewJob.customer_id !==
          autoMatchCustomer.id
        ) {

          throw new Error(
            "Legacy NEW history is already linked to another customer"
          );
        }


        historicalNewJob =
          await updateJob(
            historicalNewJob.id,
            {
              price:
                newReviewRate,

              currency:
                newCurrency,

              status:
                "paid",
            }
          );


        const existingNewReviews =
          await getReviewsByJobId(
            historicalNewJob.id
          );


        if (
          !existingNewReviews ||
          existingNewReviews.length === 0
        ) {

          await saveReviewCandidate({
            customerId:
              autoMatchCustomer.id,

            jobId:
              historicalNewJob.id,

            businessName:
              autoMatchClaim
                .business_name ||
              null,

            reviewerName:
              "LEGACY_IMPORT",

            reviewText:
              "Imported historical NEW review rate",

            isRecent:
              true,

            isVisible:
              null,

            hasText:
              null,
          });
        }


        const existingNewPayment =
          await getVerifiedPaymentByJobId(
            historicalNewJob.id
          );


        if (!existingNewPayment) {

          await createPayment({
            jobId:
              historicalNewJob.id,

            amount:
              newReviewRate,

            paymentMethod:
              "LEGACY_IMPORT",

            slipReceived:
              false,

            paymentVerified:
              true,

            verifiedAt,
          });
        }


        importedJobs.push(
          historicalNewJob.id
        );
      }


      // ==================================================
      // OLD REVIEW HISTORY
      // ==================================================

      const oldReviewRate =
        Number(
          autoMatchClaim
            .old_review_rate ||
          0
        );


      if (
        Number.isFinite(
          oldReviewRate
        ) &&
        oldReviewRate > 0
      ) {

        const oldCurrency =
          String(
            autoMatchClaim
              .old_review_currency ||
            "THB"
          ).toUpperCase();


        let historicalOldJob =
          await getLegacyImportedJob({
            legacySourceId:
              autoMatchClaim.id,

            reviewCase:
              "legacy_import_old",
          });


        if (!historicalOldJob) {

          historicalOldJob =
            await createJob({
              customerId:
                autoMatchCustomer.id,

              businessName:
                autoMatchClaim
                  .business_name ||
                null,

              reviewCase:
                "legacy_import_old",

              status:
                "paid",

              legacySourceId:
                autoMatchClaim.id,
            });

        } else if (
          historicalOldJob.customer_id !==
          autoMatchCustomer.id
        ) {

          throw new Error(
            "Legacy OLD history is already linked to another customer"
          );
        }


        historicalOldJob =
          await updateJob(
            historicalOldJob.id,
            {
              price:
                oldReviewRate,

              currency:
                oldCurrency,

              status:
                "paid",
            }
          );


        const existingOldReviews =
          await getReviewsByJobId(
            historicalOldJob.id
          );


        if (
          !existingOldReviews ||
          existingOldReviews.length === 0
        ) {

          await saveReviewCandidate({
            customerId:
              autoMatchCustomer.id,

            jobId:
              historicalOldJob.id,

            businessName:
              autoMatchClaim
                .business_name ||
              null,

            reviewerName:
              "LEGACY_IMPORT",

            reviewText:
              "Imported historical OLD review rate",

            isRecent:
              false,

            isVisible:
              null,

            hasText:
              null,
          });
        }


        const existingOldPayment =
          await getVerifiedPaymentByJobId(
            historicalOldJob.id
          );


        if (!existingOldPayment) {

          await createPayment({
            jobId:
              historicalOldJob.id,

            amount:
              oldReviewRate,

            paymentMethod:
              "LEGACY_IMPORT",

            slipReceived:
              false,

            paymentVerified:
              true,

            verifiedAt,
          });
        }


        importedJobs.push(
          historicalOldJob.id
        );
      }


      // ==================================================
      // ต้องมีอย่างน้อย 1 historical rate
      // ==================================================

      if (
        importedJobs.length === 0
      ) {

        throw new Error(
          "Legacy customer has no valid historical rate"
        );
      }


      // ==================================================
      // MARK MATCHED
      // ==================================================

      autoMatchedLegacy =
        await markLegacyCustomerMatched({
          legacyCustomerId:
            autoMatchClaim.id,

          customerId:
            autoMatchCustomer.id,
        });


      autoMatchStatus =
        "matched";


      console.log(
        "LEGACY AUTO MATCH COMPLETE:",
        {
          legacyCustomerId:
            autoMatchClaim.id,

          customerId:
            autoMatchCustomer.id,

          importedJobs,

          displayName:
            autoMatchClaim
              .display_name ||
            null,
        }
      );
    }


  } catch (autoMatchError) {

    console.error(
      "LEGACY AUTO MATCH FAILED:",
      {
        legacyCustomerId:
          autoMatchClaim?.id ||
          null,

        customerId:
          autoMatchCustomer?.id ||
          null,

        error:
          autoMatchError?.message ||
          String(autoMatchError),
      }
    );


    try {

      await rollbackLegacyCustomerAutoMatch(
        autoMatchClaim.id
      );

    } catch (rollbackError) {

      console.error(
        "LEGACY AUTO MATCH ROLLBACK FAILED:",
        {
          legacyCustomerId:
            autoMatchClaim?.id ||
            null,

          error:
            rollbackError?.message ||
            String(
              rollbackError
            ),
        }
      );
    }


    throw autoMatchError;
  }
}        
          
// ================================================
// LEGACY MAP AUTO-LINK FOR ALREADY MATCHED CUSTOMER
//
// กรณีลูกค้า Legacy ถูก Match ไปแล้ว
// แต่เพิ่งเพิ่ม map_url ภายหลังใน Google Sheet
// → Import ซ้ำแล้วผูก Map ให้ทันที
// ================================================

const importedLegacy =
  autoMatchedLegacy ||
  result?.customer ||
  null;

const matchedCustomerId =
  String(
    importedLegacy?.matched_customer_id || ""
  ).trim();

const importedMapUrls = Array.from(new Set(
  [
    ...(Array.isArray(importedLegacy?.map_urls) ? importedLegacy.map_urls : []),
    ...(Array.isArray(item.mapUrls) ? item.mapUrls : []),
    ...String(importedLegacy?.map_url || item.mapUrl || "").split(/\r?\n|,/g),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

if (matchedCustomerId && importedMapUrls.length > 0) {
  for (const importedMapUrl of importedMapUrls) {
    try {
      const places = await searchPlaceByText(importedMapUrl);

      if (Array.isArray(places) && places.length > 0) {
        const place = places[0];
        const placeId = String(place?.placeId || "").trim();

        if (placeId) {
          await upsertCustomerMapRecord({
            customerId: matchedCustomerId,
            businessName:
              place.businessName ||
              importedLegacy?.business_name ||
              item.businessName ||
              null,
            placeId,
            mapUrl: place.mapUrl || importedMapUrl,
            sourceReviewUrl: null,
          });

          console.log("LEGACY IMPORT MAP AUTO-LINKED:", {
            legacyCustomerId: importedLegacy?.id || null,
            customerId: matchedCustomerId,
            placeId,
            mapUrl: place.mapUrl || importedMapUrl,
          });
        }
      }
    } catch (mapLinkError) {
      console.error("LEGACY IMPORT MAP AUTO-LINK FAILED:", {
        legacyCustomerId: importedLegacy?.id || null,
        customerId: matchedCustomerId,
        mapUrl: importedMapUrl,
        error: mapLinkError?.message || String(mapLinkError),
      });
    }
  }
}

          
     const finalLegacyCustomer =
  autoMatchedLegacy ||
  importedLegacy ||
  result.customer ||
  null;


results.push({
  row:
    i + 2,

  ok:
    true,

  created:
    result.created,

  duplicate:
    result.duplicate,

  legacyCustomerId:
    finalLegacyCustomer?.id ||
    null,

  displayName:
    finalLegacyCustomer
      ?.display_name ||
    item.displayName ||
    null,

  matchStatus:
    finalLegacyCustomer
      ?.match_status ||
    null,

  matchedCustomerId:
    finalLegacyCustomer
      ?.matched_customer_id ||
    null,

  matchedAt:
    finalLegacyCustomer
      ?.matched_at ||
    null,

  autoMatchStatus:
    autoMatchStatus,
});
          

        } catch (error) {

          console.error(
            "LEGACY CUSTOMER IMPORT ROW ERROR:",
            {
              row:
                i + 2,

              displayName:
                item.displayName,

              error:
                error.message,
            }
          );


          results.push({
            row:
              i + 2,

            ok:
              false,

            created:
              false,

            duplicate:
              false,

            displayName:
              item.displayName || null,

            error:
              error.message,
          });
        }
      }


      // ================================================
      // SUMMARY
      // ================================================

      const createdCount =
        results.filter(
          (item) =>
            item.created === true
        ).length;


      const duplicateCount =
        results.filter(
          (item) =>
            item.duplicate === true
        ).length;


      const failedCount =
        results.filter(
          (item) =>
            item.ok === false
        ).length;


      console.log(
        "LEGACY CUSTOMERS IMPORT COMPLETE:",
        {
          total:
            results.length,

          created:
            createdCount,

          duplicates:
            duplicateCount,

          failed:
            failedCount,
        }
      );


      return res.status(200).json({
        ok:
          failedCount === 0,

        total:
          results.length,

        created:
          createdCount,

        duplicates:
          duplicateCount,

        failed:
          failedCount,

        results,
      });


    } catch (error) {

      console.error(
        "IMPORT LEGACY CUSTOMERS ERROR:",
        error
      );


      return res.status(500).json({
        ok: false,
        error:
          error.message,
      });
    }
  }
);

// =========================================================
// GOOGLE SHEET CONTROL
//
// M = Bot Control
//     AUTO / HANDOFF
//
// N = Manual Action
//     CONFIRM_REMOVED
//     REVIEW_STILL_VISIBLE
//     MARK_PAID
// =========================================================

app.post("/sheet-control", async (req, res) => {
  try {
    const {
      secret,
      jobId,
      action,
      value,
    } = req.body || {};


    // =====================================================
    // AUTH
    // =====================================================

    const SHEET_CONTROL_SECRET =
      process.env.SHEET_CONTROL_SECRET;


    if (
      !SHEET_CONTROL_SECRET ||
      secret !== SHEET_CONTROL_SECRET
    ) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }


    if (!jobId) {
      return res.status(400).json({
        ok: false,
        error: "Missing jobId",
      });
    }


    const job =
      await getJobById(
        jobId
      );


    if (!job) {
      return res.status(404).json({
        ok: false,
        error: "Job not found",
      });
    }


    const customer =
      await getCustomerById(
        job.customer_id
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
      return res.status(404).json({
        ok: false,
        error: "Conversation not found",
      });
    }


    const normalizedValue =
      String(value || "")
        .trim()
        .toUpperCase();


    const compactValue =
      normalizedValue.replace(
        /[\s_-]+/g,
        ""
      );


    console.log(
      "SHEET CONTROL VALUE:",
      {
        rawValue:
          value,

        normalizedValue,

        compactValue,
      }
    );


    // =====================================================
    // BOT CONTROL
    // =====================================================

    if (
      action === "bot_control"
    ) {

      // ---------------------------------------------------
      // HANDOFF
      // ---------------------------------------------------

      if (
        compactValue ===
        "HANDOFF"
      ) {

        await updateConversationState({
          customerId:
            customer.id,

          state:
            GMR_STATES.HANDOFF,

          handoff:
            true,

          handoffReason:
            `SHEET_MANUAL_HANDOFF_FROM_${conversation.state}`,
        });


        console.log(
          "SHEET HANDOFF ENABLED:",
          {
            jobId:
              job.id,

            customerId:
              customer.id,

            previousState:
              conversation.state,
          }
        );


        return res.status(200).json({
          ok: true,

          action:
            "bot_control",

          value:
            "HANDOFF",

          customerId:
            customer.id,

          jobId:
            job.id,
        });
      }


      // ---------------------------------------------------
      // AUTO
      // ---------------------------------------------------

      if (
        compactValue ===
        "AUTO"
      ) {

        let resumeState =
          GMR_STATES.WAITING_MAP;


        const handoffReason =
          String(
            conversation.handoff_reason ||
            ""
          );


        const prefix =
          "SHEET_MANUAL_HANDOFF_FROM_";


        if (
          handoffReason.startsWith(
            prefix
          )
        ) {

          const previousState =
            handoffReason.slice(
              prefix.length
            );


          if (
            Object.values(
              GMR_STATES
            ).includes(
              previousState
            ) &&
            previousState !==
              GMR_STATES.HANDOFF
          ) {

            resumeState =
              previousState;
          }
        }


        await updateConversationState({
          customerId:
            customer.id,

          state:
            resumeState,

          handoff:
            false,

          handoffReason:
            null,
        });


        console.log(
          "SHEET HANDOFF DISABLED:",
          {
            jobId:
              job.id,

            customerId:
              customer.id,

            resumeState,
          }
        );


        return res.status(200).json({
          ok: true,

          action:
            "bot_control",

          value:
            "AUTO",

          customerId:
            customer.id,

          jobId:
            job.id,

          resumeState,
        });
      }


      return res.status(400).json({
        ok: false,
        error:
          "Invalid bot_control value",
      });
    }


    // =====================================================
    // MANUAL ACTION
    // =====================================================

    if (
      action === "manual_action"
    ) {

      // ===================================================
      // CONFIRM REMOVED
      //
      // พนักงานตรวจ Google แล้ว:
      // Review หายจริง
      //
      // → waiting_payment
      // → Conversation = REMOVED_WAITING_PAYMENT
      // → Update Google Sheet
      // → ส่งข้อความเก็บเงินหาลูกค้า
      // ===================================================

          if (
  normalizedValue ===
  "CONFIRM_REMOVED"
) {

  // Idempotency: a retry must never charge/notify/KPI twice.
  if (
    ["waiting_payment", "paid"].includes(
      String(job.status || "").trim().toLowerCase()
    ) ||
    Boolean(job.removed_at)
  ) {
    return res.status(200).json({
      ok: true,
      action: "manual_action",
      value: "CONFIRM_REMOVED",
      jobId: job.id,
      customerId: customer.id,
      alreadyConfirmed: true,
      status: job.status,
      removedAt: job.removed_at || job.review_removed_detected_at || null,
    });
  }

  if (
    Number(
      job.review_missing_count ||
      0
    ) < 1
  ) {

    return res
      .status(400)
      .json({
        ok: false,

        error:
          "This job is not awaiting removal confirmation",
      });
  }


  const confirmedAt =
    new Date()
      .toISOString();


  const removedAt =
    job.review_removed_detected_at ||
    confirmedAt;


  const unitPrice =
    Number(
      job.price || 0
    );


  if (
    !Number.isFinite(
      unitPrice
    ) ||
    unitPrice <= 0
  ) {

    throw new Error(
      "Job has invalid price"
    );
  }


  const paymentCurrency =
    getCurrencyFromUnitPrice({
      price:
        unitPrice,

      currency:
        job.currency,
    });


  // ========================================
  // PAYMENT CONFIG
  // ========================================

  const thbPaymentQrUrl =
    String(
      process.env
        .THB_PAYMENT_QR_URL ||
      ""
    ).trim();


  let stripePaymentLink =
  null;


  // ========================================
  // 1. ยืนยัน CURRENT JOB ก่อน
  // ========================================

  const removalBatchId =
    String(job.removal_detection_batch_id || "").trim() ||
    crypto.randomUUID();

  // Old in-flight jobs from before this deployment may not have a batch yet.
  // Create a one-job durable batch so KPI is still sent exactly once.
  await upsertRemovalKpiBatch({
    batchId: removalBatchId,
    detectedAt: removedAt,
  });

  await updateJob(
    job.id,
    {
      status:
        "waiting_payment",

      removed_at:
        removedAt,

      review_missing_count:
        0,

      review_removed_detected_at:
        removedAt,

      removal_detection_batch_id:
        removalBatchId,

      currency:
        paymentCurrency,
    }
  );

  // ========================================
  // INTERNAL KPI — BATCHED + DURABLE
  // ส่งเมื่อทุกงานที่ตรวจหายจาก monitor run เดียวกัน
  // ถูก Sales ตัดสินครบแล้วเท่านั้น
  // ========================================

  try {
    await tryFinalizeRemovalKpiBatch(removalBatchId);
  } catch (kpiError) {
    console.error(
      "REMOVAL KPI BATCH FINALIZE FAILED:",
      {
        jobId: job.id,
        batchId: removalBatchId,
        error: kpiError?.message || String(kpiError),
      }
    );
  }

  // ========================================
  // 2. ดึงทุกงานของลูกค้าคนนี้
  // ที่สำเร็จแล้วและยังไม่จ่าย
  // ========================================

  const waitingPaymentJobs =
    await getWaitingPaymentJobsByCustomerId(
      customer.id
    );


  // ========================================
  // 3. สรุปเฉพาะสกุลเงินเดียวกัน
  //
  // ป้องกัน THB + USD ถูกบวกเข้าด้วยกัน
  // ========================================

  const paymentSummary =
    buildPaymentBreakdown({
      jobs:
        waitingPaymentJobs,

      currency:
        paymentCurrency,

      language:
        customer.language ||
        "th",
    });


  if (
    paymentSummary.total <=
    0
  ) {

    throw new Error(
      "Payment total is invalid"
    );
  }


  const formattedTotal =
    formatMoney(
      paymentSummary.total,
      paymentCurrency
    );


  const breakdownText =
    paymentSummary.lines
      .join("\n");

// ========================================
// USD → CREATE DYNAMIC STRIPE CHECKOUT
// ========================================

if (
  paymentCurrency === "USD"
) {

  const stripeJobs =
    waitingPaymentJobs.filter(
      (waitingJob) => {

        const jobPrice =
          Number(
            waitingJob.price || 0
          );

        const jobCurrency =
          getCurrencyFromUnitPrice({
            price:
              jobPrice,

            currency:
              waitingJob.currency,
          });

        return (
          jobCurrency === "USD"
        );
      }
    );


  const stripeCheckout =
    await createStripeCheckoutSession({
      amount:
        paymentSummary.total,

      currency:
        "USD",

      customerId:
        customer.id,

      jobIds:
        stripeJobs.map(
          (waitingJob) =>
            waitingJob.id
        ),

      customerName:
        customer.display_name ||
        null,
    });


  stripePaymentLink =
    stripeCheckout.url;


  console.log(
    "STRIPE CHECKOUT CREATED:",
    {
      customerId:
        customer.id,

      sessionId:
        stripeCheckout.id,

      amount:
        paymentSummary.total,

      currency:
        "USD",

      jobIds:
        stripeJobs.map(
          (waitingJob) =>
            waitingJob.id
        ),
    }
  );
}
            

  // ========================================
  // 4. สร้างข้อความเก็บเงิน
  // ========================================

  let botReply;


 if (
  paymentCurrency ===
  "THB"
) {

  botReply =
    getCustomerText(
      customer,

      "ยินดีด้วยครับ 🎉 รีวิวของคุณได้รับการพิจารณาจาก Google เรียบร้อยแล้ว และขณะนี้ลิงก์รีวิวดังกล่าวไม่สามารถเข้าถึงได้แล้ว\n\n" +

      "รีวิวจะถูกนำออกจากหน้า Google Maps ของคุณภายในเวลา 20:00 น. ของวันนี้ หรือไม่เกิน 20:00 น. ของวันพรุ่งนี้\n\n" +

      `จำนวนรีวิวที่ดำเนินการสำเร็จและรอชำระ: ${paymentSummary.totalReviews} รีวิว\n\n` +

      "สรุปรายการ:\n" +
      `${breakdownText}\n\n` +

      `ยอดชำระทั้งหมด: ${formattedTotal} บาท\n\n` +

      "🔥 สามารถชำระผ่านการสแกน QR ด้านล่างได้เลยครับ",

      "Good news 🎉 Your review case has been successfully processed by Google, and the review link is now no longer accessible.\n\n" +

      "The review is expected to disappear from your Google Maps profile by 8:00 PM today, or no later than 8:00 PM tomorrow.\n\n" +

      `Completed and awaiting payment: ${paymentSummary.totalReviews} review(s)\n\n` +

      "Summary:\n" +
      `${breakdownText}\n\n` +

      `Total amount due: THB ${formattedTotal}\n\n` +

      "🔥 Please complete your payment by scanning the QR code below."
    );

} else {

  botReply =
    getCustomerText(
      customer,

      "ยินดีด้วยครับ 🎉 รีวิวลูกค้าได้รับการพิจารณาจาก Google เรียบร้อยแล้ว ตอนนี้ลิงก์รีวิวดังกล่าวไม่สามารถเข้าถึงได้แล้ว\n\n" +

      "รีวิวจะถูกนำออกจากหน้า Maps ภายในเวลา 20:00 น. วันนี้ หรือไม่เกิน 20:00 น. ของวันพรุ่งนี้\n\n" +

      `จำนวนรีวิวที่ดำเนินการสำเร็จและรอชำระ: ${paymentSummary.totalReviews} รีวิว\n\n` +

      "สรุปรายการ:\n" +
      `${breakdownText}\n\n` +

      `ยอดชำระทั้งหมด: $${formattedTotal} USD\n\n` +

      "🔥 สามารถชำระผ่านลิงก์ด้านล่างได้เลยครับ:\n\n" +
      `${stripePaymentLink}`,

      "Good news 🎉 Your review case has been successfully processed by Google, and the review link is now no longer accessible.\n\n" +

      "The review is expected to disappear from your Google Maps profile by 8:00 PM today, or no later than 8:00 PM tomorrow.\n\n" +

      `Completed and awaiting payment: ${paymentSummary.totalReviews} review(s)\n\n` +

      "Summary:\n" +
      `${breakdownText}\n\n` +

      `Total amount due: $${formattedTotal} USD\n\n` +

      "🔥 Complete your payment using the link below:\n\n" +
      `${stripePaymentLink}`
    );
}

  // ========================================
  // 5. CONVERSATION
  // ========================================

  await updateConversationState({
    customerId:
      customer.id,

    state:
      GMR_STATES
        .REMOVED_WAITING_PAYMENT,

    handoff:
      false,

    handoffReason:
      null,
  });


  // ========================================
  // 6. GOOGLE SHEET - CURRENT JOB
  // ========================================

  try {

    await updateJobInGoogleSheet({
      jobId:
        job.id,

      status:
        "waiting_payment",

      removedAt,

      paidAt:
        "",
    });

  } catch (error) {

    console.error(
      "CONFIRM REMOVED SHEET UPDATE FAILED:",
      {
        jobId:
          job.id,

        error:
          error.message,
      }
    );
  }


  // ========================================
  // 7-9. CUSTOMER NOTIFICATION
  // Manual/internal jobs must never message the customer automatically.
  // ========================================

  const shouldNotifyCustomer =
    job?.customer_notify !== false &&
    customer?.customer_notify !== false &&
    customer?.platform !== "manual";

  if (shouldNotifyCustomer) {
    await sendMessageToCustomer({
      platform: customer.platform,
      platformUserId: customer.platform_user_id,
      text: botReply,
    });

    if (paymentCurrency === "THB") {
      await sendMessageToCustomer({
        platform: customer.platform,
        platformUserId: customer.platform_user_id,
        imageUrl: thbPaymentQrUrl,
      });
    }

    await saveMessage({
      customerId: customer.id,
      platform: customer.platform,
      direction: "outbound",
      messageType: "text",
      messageText: botReply,
    });

    await updateLastBotMessage(customer.id, botReply);
  } else {
    try {
      await triggerHumanAttention({
        customer,
        conversation,
        message: `Manual job removed: ${job.review_url || job.id} | Amount ${formattedTotal} ${paymentCurrency}`,
        reason: "MANUAL_JOB_REMOVED_AWAITING_INTERNAL_PAYMENT_UPDATE",
      });
    } catch (notifyError) {
      console.error("MANUAL REMOVED INTERNAL ALERT FAILED:", notifyError);
    }
  }


  console.log(
    "SHEET CONFIRM REMOVED:",
    {
      jobId:
        job.id,

      customerId:
        customer.id,

      unitPrice,

      paymentCurrency,

      waitingPaymentCount:
        paymentSummary
          .totalReviews,

      paymentTotal:
        paymentSummary.total,

      removedAt,
    }
  );


  return res
    .status(200)
    .json({
      ok: true,

      action:
        "manual_action",

      value:
        "CONFIRM_REMOVED",

      customerId:
        customer.id,

      jobId:
        job.id,

      status:
        "waiting_payment",

      unitPrice,

      currency:
        paymentCurrency,

      waitingPaymentCount:
        paymentSummary
          .totalReviews,

      paymentTotal:
        paymentSummary.total,

      paymentBreakdown:
        paymentSummary.groups,

      paymentMethod:
        paymentCurrency ===
          "THB"
          ? "QR"
          : "STRIPE",

      removedAt,

      customerNotified:
        shouldNotifyCustomer,
    });
}

      // ===================================================
      // REVIEW STILL VISIBLE
      //
      // พนักงานเปิด Google แล้ว:
      // Review ยังอยู่
      //
      // → Reset detection
      // → processing
      // → Monitor ตรวจต่อในรอบถัดไป
      // ===================================================

      if (
        normalizedValue ===
        "REVIEW_STILL_VISIBLE"
      ) {

        const previousRemovalBatchId =
          String(job.removal_detection_batch_id || "").trim() || null;

        await updateJob(
          job.id,
          {
            status:
              "processing",

            review_missing_count:
              0,

            review_removed_detected_at:
              null,

            removal_detection_batch_id:
              null,

            removal_team_alerted_at:
              null,

            removal_team_alert_message_id:
              null,

            removed_at:
              null,
          }
        );

        // If this was the last unresolved item in a KPI batch,
        // finalize the remaining confirmed removals now.
        if (previousRemovalBatchId) {
          try {
            await tryFinalizeRemovalKpiBatch(previousRemovalBatchId);
          } catch (kpiError) {
            console.error("REMOVAL KPI FINALIZE AFTER STILL VISIBLE FAILED:", {
              jobId: job.id,
              batchId: previousRemovalBatchId,
              error: kpiError?.message || String(kpiError),
            });
          }
        }


        try {

          await updateJobInGoogleSheet({
            jobId:
              job.id,

            status:
              "processing",

            removedAt:
              "",

            paidAt:
              "",
          });

        } catch (error) {

          console.error(
            "REVIEW STILL VISIBLE SHEET UPDATE FAILED:",
            {
              jobId:
                job.id,

              error:
                error.message,
            }
          );
        }


        console.log(
          "SHEET REVIEW STILL VISIBLE:",
          {
            jobId:
              job.id,

            customerId:
              customer.id,
          }
        );


        return res
          .status(200)
          .json({
            ok:
              true,

            action:
              "manual_action",

            value:
              "REVIEW_STILL_VISIBLE",

            customerId:
              customer.id,

            jobId:
              job.id,

            status:
              "processing",
          });
      }


      // ===================================================
      // MARK PAID
      // ===================================================

      if (
        normalizedValue ===
        "MARK_PAID"
      ) {

        const paidAt =
          new Date()
            .toISOString();


        await updateJob(
          job.id,
          {
            status:
              "paid",

            paid_at:
              paidAt,
          }
        );


        await updateConversationState({
          customerId:
            customer.id,

          state:
            GMR_STATES
              .WAITING_MAP,

          handoff:
            false,

          handoffReason:
            null,
        });


        try {

          await updateJobInGoogleSheet({
            jobId:
              job.id,

            status:
              "paid",

            paidAt,
          });

        } catch (error) {

          console.error(
            "SHEET MANUAL PAID GOOGLE SHEET UPDATE FAILED:",
            {
              jobId:
                job.id,

              error:
                error.message,
            }
          );
        }


        console.log(
          "SHEET MANUAL MARK PAID:",
          {
            jobId:
              job.id,

            customerId:
              customer.id,

            paidAt,
          }
        );


        return res
          .status(200)
          .json({
            ok:
              true,

            action:
              "manual_action",

            value:
              "MARK_PAID",

            customerId:
              customer.id,

            jobId:
              job.id,

            paidAt,
          });
      }


      return res.status(400).json({
        ok: false,

        error:
          "Invalid manual_action value",
      });
    }


    return res.status(400).json({
      ok: false,

      error:
        "Invalid action",
    });


  } catch (error) {

    console.error(
      "SHEET CONTROL ERROR:",
      error
    );


    return res
      .status(500)
      .json({
        ok: false,

        error:
          error.message,
      });
  }
});

// =========================================================
// TEST REVIEW REMOVAL DETECTION
// ใช้ทดสอบลิงก์รีวิวที่ทราบว่าถูกลบแล้ว
// ไม่แก้ Job / ไม่แก้ Customer / ไม่เปลี่ยน Status
// =========================================================

app.get(
  "/test-review-monitor-link",
  async (req, res) => {
    try {

      const reviewUrl =
        "https://maps.app.goo.gl/MrUD3MewCAq2nFT76?g_st=il";


      const result =
        await getReviewFromDirectUrl(
          reviewUrl
        );


      console.log(
        "TEST REVIEW MONITOR RESULT:",
        {
          reviewUrl,

          found:
            Boolean(
              result?.found &&
              result?.review
            ),

          reason:
            result?.reason ||
            null,

          reviewerName:
            result?.review
              ?.reviewerName ||
            null,

          rating:
            result?.review
              ?.rating ||
            null,
        }
      );


      return res
        .status(200)
        .json({
          ok: true,

          reviewUrl,

          found:
            Boolean(
              result?.found &&
              result?.review
            ),

          reason:
            result?.reason ||
            null,

          review:
            result?.review ||
            null,
        });

    } catch (error) {

      console.error(
        "TEST REVIEW MONITOR ERROR:",
        error
      );


      return res
        .status(500)
        .json({
          ok: false,

          error:
            error.message,
        });
    }
  }
);

// =========================================================
// AUTO REVIEW REMOVAL MONITOR
//
// VERSION:
// HUMAN_CONFIRM_V3_20261011
//
// Flow:
//
// processing
//     ↓
// ตรวจ Review URL
//
// ยังพบ Review
// → processing ต่อ
//
// หา Review ไม่เจอ
// → review_missing_count = 1
// → status ยัง processing
// → แจ้ง LINE Group
// → หยุดตรวจ Job นี้ซ้ำ
// → รอ Human Confirm
//
// CONFIRM_REMOVED
// → waiting_payment
// → แจ้งลูกค้าเก็บเงิน
//
// REVIEW_STILL_VISIBLE
// → reset missing_count
// → processing
// → กลับเข้า monitor
//
// Provider / Network Error
// → CHECK_ERROR
// → ไม่ถือว่า Review ถูกลบ
// =========================================================

app.post(
  "/check-processing-reviews",
  async (req, res) => {

    const monitorVersion =
      "HUMAN_CONFIRM_V3_20261011";

    try {

      const monitorSecret =
        req.headers[
          "x-monitor-secret"
        ];


      if (
        !process.env.REVIEW_MONITOR_SECRET ||
        monitorSecret !==
          process.env.REVIEW_MONITOR_SECRET
      ) {

        return res
          .status(401)
          .json({
            ok: false,

            monitorVersion,

            error:
              "Unauthorized",
          });
      }


      const jobs =
        await getJobsForReviewMonitoring();

      const monitorRunId =
        crypto.randomUUID();

      const monitorRunStartedAt =
        new Date().toISOString();

      let removalKpiBatchCreated =
        false;

      const results = [];


      console.log(
        "REVIEW MONITOR START:",
        {
          monitorVersion,
          monitorRunId,

          jobCount:
            jobs.length,
        }
      );


      for (
        const job of jobs
      ) {

        const reviewUrl =
          String(
            job.review_url ||
            ""
          ).trim();


        // ========================================
        // ไม่มี Review URL
        // ========================================

        if (!reviewUrl) {

          results.push({
            jobId:
              job.id,

            result:
              "SKIPPED_NO_REVIEW_URL",
          });


          continue;
        }


        // ========================================
        // เคยตรวจไม่เจอแล้ว
        //
        // ตอนนี้รอคนตรวจเอง
        // ห้ามยิง Provider ซ้ำ
        // ========================================

        if (
          Number(
            job.review_missing_count ||
            0
          ) >= 1
        ) {

          if (!job.removal_team_alerted_at) {
            const customer =
              await getCustomerById(
                job.customer_id
              );

            try {
              const alertResult =
                await sendRemovalConfirmationToLineGroup({
                  job,
                  customer,
                  reviewUrl,
                  reason:
                    "RETRY_PENDING_HUMAN_CONFIRM",
                  detectedAt:
                    job.review_removed_detected_at ||
                    new Date().toISOString(),
                });

              await updateJob(
                job.id,
                {
                  removal_team_alerted_at:
                    new Date().toISOString(),
                  removal_team_alert_message_id:
                    alertResult?.messageId || null,
                }
              );
            } catch (error) {
              console.error(
                "REVIEW MONITOR TEAM ALERT RETRY FAILED:",
                {
                  jobId:
                    job.id,
                  error:
                    error.message,
                }
              );
            }
          }

          results.push({
            jobId:
              job.id,
            result:
              "AWAITING_HUMAN_CONFIRM",
          });

          continue;
        }


        let found =
          null;

        let lookupReason =
          null;


        // ========================================
        // ตรวจ Review URL
        // ========================================

        try {

          const lookup =
            await getReviewFromDirectUrl(
              reviewUrl
            );


          found =
            Boolean(
              lookup?.found &&
              lookup?.review
            );


          lookupReason =
            lookup?.reason ||
            null;


          console.log(
            "REVIEW MONITOR LOOKUP:",
            {
              monitorVersion,

              jobId:
                job.id,

              found,

              reason:
                lookupReason,
            }
          );


        } catch (error) {

          // ======================================
          // Provider / Network Error
          //
          // ห้ามตีความว่า Review ถูกลบ
          // ======================================

          console.error(
            "REVIEW MONITOR LOOKUP ERROR:",
            {
              monitorVersion,

              jobId:
                job.id,

              reviewUrl,

              error:
                error.message,
            }
          );


          results.push({
            jobId:
              job.id,

            result:
              "CHECK_ERROR",

            error:
              error.message,
          });


          continue;
        }


        const checkedAt =
          new Date()
            .toISOString();


        // ========================================
        // Review ยังอยู่
        // ========================================

        if (found) {

          await updateJob(
            job.id,
            {
              status:
                "processing",

              review_missing_count:
                0,

              last_review_check_at:
                checkedAt,

              review_removed_detected_at:
                null,

              removal_detection_batch_id:
                null,

              removal_team_alerted_at:
                null,

              removal_team_alert_message_id:
                null,

              removed_at:
                null,
            }
          );


          results.push({
            jobId:
              job.id,

            result:
              "STILL_VISIBLE",

            checkedAt,
          });


          continue;
        }


        // ========================================
        // Review หาไม่เจอ
        //
        // สำคัญ:
        //
        // - ยังไม่ waiting_payment
        // - ยังไม่เปลี่ยน Conversation State
        // - ยังไม่ทักลูกค้า
        //
        // ส่งให้คนตรวจเองก่อน
        // ========================================

        const detectedAt =
          checkedAt;

        if (!removalKpiBatchCreated) {
          await upsertRemovalKpiBatch({
            batchId: monitorRunId,
            detectedAt: monitorRunStartedAt,
          });
          removalKpiBatchCreated = true;
        }

        await updateJob(
          job.id,
          {
            status:
              "processing",

            review_missing_count:
              1,

            last_review_check_at:
              checkedAt,

            review_removed_detected_at:
              detectedAt,

            removal_detection_batch_id:
              monitorRunId,

            removal_kpi_notified_at:
              null,

            removed_at:
              null,
          }
        );


        const customer =
          await getCustomerById(
            job.customer_id
          );


        // ========================================
        // Google Sheet
        //
        // ยังคง processing
        // ========================================

        try {

          await updateJobInGoogleSheet({
            jobId:
              job.id,

            status:
              "processing",

            removedAt:
              "",

            paidAt:
              "",
          });


        } catch (error) {

          console.error(
            "REVIEW MONITOR SHEET UPDATE FAILED:",
            {
              jobId:
                job.id,

              error:
                error.message,
            }
          );
        }


        // ========================================
        // แจ้ง LINE Group
        //
        // ยังไม่แจ้งลูกค้า
        // ========================================

        if (customer) {

          try {
            const alertResult =
              await sendRemovalConfirmationToLineGroup({
                job,
                customer,
                reviewUrl,
                reason:
                  lookupReason,
                detectedAt,
              });

            await updateJob(
              job.id,
              {
                removal_team_alerted_at:
                  new Date().toISOString(),
                removal_team_alert_message_id:
                  alertResult?.messageId || null,
              }
            );

          } catch (error) {

            console.error(
              "REVIEW MONITOR TEAM NOTIFY FAILED:",
              {
                jobId:
                  job.id,

                error:
                  error.message,
              }
            );
          }
        }


        console.log(
          "REVIEW AWAITING HUMAN CONFIRM:",
          {
            monitorVersion,

            jobId:
              job.id,

            customerId:
              job.customer_id,

            reason:
              lookupReason,

            detectedAt,
            removalBatchId:
              monitorRunId,
          }
        );


        results.push({
          jobId:
            job.id,

          result:
            "AWAITING_HUMAN_CONFIRM",

          missingCount:
            1,

          reason:
            lookupReason,

          detectedAt,
          removalBatchId:
            monitorRunId,
        });
      }


      return res
        .status(200)
        .json({
          ok:
            true,

          monitorVersion,

          checked:
            jobs.length,

          results,
        });


    } catch (error) {

      console.error(
        "REVIEW MONITOR ERROR:",
        {
          monitorVersion,

          error:
            error.message,
        }
      );


      return res
        .status(500)
        .json({
          ok:
            false,

          monitorVersion,

          error:
            error.message,
        });
    }
  }
);

// =========================================================
// MANUAL TEST — MONTHLY EXISTING CUSTOMER OUTREACH
//
// ใช้ทดสอบก่อนเปิด schedule จริง
// ป้องกันด้วย SHEET_CONTROL_SECRET
// =========================================================

// =========================================================
// MONTHLY OUTREACH — SAFE PREVIEW ENDPOINT
//
// =========================================================
// MONTHLY OUTREACH — REAL SEND
// =========================================================

function isLastDayOfMonthBangkok() {
  const now = new Date();

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(now);

  const year =
    Number(
      parts.find(
        (part) => part.type === "year"
      )?.value
    );

  const month =
    Number(
      parts.find(
        (part) => part.type === "month"
      )?.value
    );

  const day =
    Number(
      parts.find(
        (part) => part.type === "day"
      )?.value
    );

  const lastDay =
    new Date(
      year,
      month,
      0
    ).getDate();

  return day === lastDay;
}


app.post(
  "/monthly-outreach/run",
  async (req, res) => {
    try {
      const {
        secret,
      } = req.body || {};

      const expectedSecret =
        process.env.SHEET_CONTROL_SECRET;

      if (
        !expectedSecret ||
        secret !== expectedSecret
      ) {
        return res.status(401).json({
          ok: false,
          error: "Unauthorized",
        });
      }

if (
  req.body?.scheduled === true &&
  !isLastDayOfMonthBangkok()
) {
  return res.json({
    ok: true,
    skipped: true,
    reason: "not_last_day_of_month",
  });
}
      
      const result =
        await runMonthlyExistingCustomerOutreach();

      return res.json({
        ...result,
        mode:
          "REAL_SEND",
      });

    } catch (error) {
      console.error(
        "MONTHLY OUTREACH RUN ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          String(error),
      });
    }
  }
);
  

app.listen(PORT, () => {
  console.log(`GMR Auto Chat running on port ${PORT}`);

  registerTelegramWebhook().catch((error) => {
    console.error("TELEGRAM WEBHOOK REGISTER FAILED:", error);
  });
});
