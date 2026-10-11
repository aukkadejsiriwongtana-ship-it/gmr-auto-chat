import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL");
}

if (!supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

export const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);


// =========================================================
// CUSTOMER
// =========================================================

export async function getCustomerByPlatformUserId(
  platform,
  platformUserId
) {
  const { data, error } = await supabase
    .from("gmr_customers")
    .select("*")
    .eq("platform", platform)
    .eq("platform_user_id", platformUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}


export async function createCustomer({
  platform,
  platformUserId,
  displayName = null,
  language = "th",
}) {
  const { data, error } = await supabase
    .from("gmr_customers")
    .insert({
      platform,
      platform_user_id: platformUserId,
      display_name: displayName,
      language,
      customer_type: "new",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function getOrCreateCustomer({
  platform,
  platformUserId,
  displayName = null,
  language = "th",
}) {
  const existing =
    await getCustomerByPlatformUserId(
      platform,
      platformUserId
    );


  if (existing) {
    return existing;
  }


  try {

    return await createCustomer({
      platform,
      platformUserId,
      displayName,
      language,
    });

  } catch (error) {

    // ========================================
    // RACE CONDITION
    // มี request อีกตัวสร้าง customer
    // ในช่วงเวลาเดียวกัน
    // ========================================

    if (
      error?.code === "23505"
    ) {

      console.log(
        "CUSTOMER CREATE RACE DETECTED:",
        {
          platform,
          platformUserId,
        }
      );


      const customer =
        await getCustomerByPlatformUserId(
          platform,
          platformUserId
        );


      if (customer) {
        return customer;
      }
    }


    throw error;
  }
}


export async function updateCustomerPhone(
  customerId,
  phone
) {
  const { data, error } = await supabase
    .from("gmr_customers")
    .update({
      phone,
    })
    .eq("id", customerId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateCustomerLanguage(
  customerId,
  language
) {
  const safeLanguage =
    language === "en"
      ? "en"
      : "th";

  const { data, error } =
    await supabase
      .from("gmr_customers")
      .update({
        language:
          safeLanguage,
      })
      .eq(
        "id",
        customerId
      )
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}

// =========================================================
// CONVERSATION / STATE
// =========================================================

export async function getConversationByCustomerId(
  customerId
) {
  const { data, error } = await supabase
    .from("gmr_conversations")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}


export async function createConversation(
  customerId,
  state = "NEW"
) {
  const { data, error } = await supabase
    .from("gmr_conversations")
    .insert({
      customer_id: customerId,
      state,
      handoff: false,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function getOrCreateConversation(
  customerId
) {
  const existing =
    await getConversationByCustomerId(
      customerId
    );


  if (existing) {
    return existing;
  }


  try {

    return await createConversation(
      customerId
    );

  } catch (error) {

    if (
      error?.code === "23505"
    ) {

      console.log(
        "CONVERSATION CREATE RACE DETECTED:",
        {
          customerId,
        }
      );


      const conversation =
        await getConversationByCustomerId(
          customerId
        );


      if (conversation) {
        return conversation;
      }
    }


    throw error;
  }
}

export async function updateConversationState({
  customerId,
  state,
  handoff = false,
  handoffReason = null,
}) {
  const { data, error } = await supabase
    .from("gmr_conversations")
    .update({
      state,
      handoff,
      handoff_reason: handoffReason,
    })
    .eq("customer_id", customerId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function updateLastUserMessage(
  customerId,
  message
) {
  const { error } = await supabase
    .from("gmr_conversations")
    .update({
      last_user_message: message,
    })
    .eq("customer_id", customerId);

  if (error) {
    throw error;
  }
}


export async function updateLastBotMessage(
  customerId,
  message
) {
  const { error } = await supabase
    .from("gmr_conversations")
    .update({
      last_bot_message: message,
    })
    .eq("customer_id", customerId);

  if (error) {
    throw error;
  }
}


// =========================================================
// TEMPLATES
// =========================================================

export async function getTemplate(
  templateKey,
  language = "th"
) {
  const { data, error } = await supabase
    .from("gmr_templates")
    .select("*")
    .eq("template_key", templateKey)
    .eq("language", language)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}


// =========================================================
// FAQ
// =========================================================

export async function getActiveFaq(
  language = "th"
) {
  const { data, error } = await supabase
    .from("gmr_faq")
    .select("*")
    .eq("language", language)
    .eq("active", true);

  if (error) {
    throw error;
  }

  return data || [];
}


// =========================================================
// MESSAGES
// =========================================================

export async function saveMessage({
  customerId,
  platform,
  direction,
  messageType = "text",
  messageText = null,
  platformMessageId = null,
  metadata = null,
}) {
  const { data, error } = await supabase
    .from("gmr_messages")
    .insert({
      customer_id: customerId,
      platform,
      direction,
      message_type: messageType,
      message_text: messageText,
      platform_message_id: platformMessageId,
      metadata,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}


// =========================================================
// JOBS
// =========================================================

export async function createJob({
  customerId,
  businessName = null,
  placeId = null,
  mapUrl = null,
  reviewUrl = null,
  reviewCase = null,
  reviewVisible = null,
  reviewHasText = null,
  status = "draft",
}) {
  const { data, error } = await supabase
    .from("gmr_jobs")
    .insert({
      customer_id: customerId,
      business_name: businessName,
      place_id: placeId,
      map_url: mapUrl,
      review_url: reviewUrl,
      review_case: reviewCase,
      review_visible: reviewVisible,
      review_has_text: reviewHasText,
      status,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function getLatestJobByCustomerId(
  customerId
) {
  const { data, error } = await supabase
    .from("gmr_jobs")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

// =========================================================
// GET WAITING PAYMENT JOBS BY CUSTOMER
// ใช้รวมเฉพาะงานที่สำเร็จแล้วและยังไม่ได้ชำระ
// =========================================================

export async function getWaitingPaymentJobsByCustomerId(
  customerId
) {
  const { data, error } =
    await supabase
      .from("gmr_jobs")
      .select("*")
      .eq(
        "customer_id",
        customerId
      )
      .eq(
        "status",
        "waiting_payment"
      )
      .order(
        "removed_at",
        {
          ascending: true,
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}

// =========================================================
// GET OPEN EXISTING CUSTOMER BATCH
//
// งานของลูกค้าเก่าที่:
// - รับ Review แล้ว
// - Auto price แล้ว
// - ยังไม่ได้ยืนยันเริ่มงาน
//
// ลูกค้า 1 คนสามารถมีหลาย Review ใน batch เดียว
// =========================================================

export async function getExistingCustomerOpenBatchJobs(
  customerId
) {
  if (!customerId) {
    throw new Error(
      "Missing customerId in getExistingCustomerOpenBatchJobs"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_jobs")
    .select("*")
    .eq(
      "customer_id",
      customerId
    )
    .eq(
      "status",
      "existing_batch_draft"
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}

// =========================================================
// CUSTOMER HISTORY CHECK
// =========================================================

export async function hasPaymentByCustomerId(
  customerId
) {
  const { data: jobs, error: jobsError } =
    await supabase
      .from("gmr_jobs")
      .select("id")
      .eq(
        "customer_id",
        customerId
      );

  if (jobsError) {
    throw jobsError;
  }

  if (
    !jobs ||
    jobs.length === 0
  ) {
    return false;
  }

  const jobIds =
    jobs.map(
      (job) => job.id
    );

  const {
    data: payment,
    error: paymentError,
  } =
    await supabase
      .from("gmr_payments")
      .select("id")
      .in(
        "job_id",
        jobIds
      )
      .eq(
        "payment_verified",
        true
      )
      .limit(1)
      .maybeSingle();

  if (paymentError) {
    throw paymentError;
  }

  return Boolean(payment);
}

// =========================================================
// GET VERIFIED PAID PRICING HISTORY BY CUSTOMER
//
// ใช้สำหรับลูกค้าเก่า
//
// ดึงเฉพาะงานที่:
// 1. เป็นของ customer คนนี้
// 2. มีราคาจริง
// 3. มี payment_verified = true
//
// พร้อมข้อมูลว่า Review นั้นเป็น:
// - NEW  = อายุ 1-14 วัน  (is_recent = true)
// - OLD  = มากกว่า 14 วัน (is_recent = false)
//
// ใช้เป็นฐานสำหรับ Auto Pricing ลูกค้าเก่า
// =========================================================

export async function getPaidPricingHistoryByCustomerId(
  customerId
) {
  if (!customerId) {
    throw new Error(
      "Missing customerId in getPaidPricingHistoryByCustomerId"
    );
  }


  // =========================================================
  // 1. JOBS
  // =========================================================

  const {
    data: jobs,
    error: jobsError,
  } = await supabase
    .from("gmr_jobs")
    .select(
      "id, price, currency, created_at"
    )
    .eq(
      "customer_id",
      customerId
    )
    .not(
      "price",
      "is",
      null
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    );


  if (jobsError) {
    throw jobsError;
  }


  if (
    !jobs ||
    jobs.length === 0
  ) {
    return [];
  }


  const jobIds =
    jobs.map(
      (job) => job.id
    );


  // =========================================================
  // 2. VERIFIED PAYMENTS ONLY
  // =========================================================

  const {
    data: payments,
    error: paymentsError,
  } = await supabase
    .from("gmr_payments")
    .select(
      "job_id, verified_at, created_at"
    )
    .in(
      "job_id",
      jobIds
    )
    .eq(
      "payment_verified",
      true
    );


  if (paymentsError) {
    throw paymentsError;
  }


  if (
    !payments ||
    payments.length === 0
  ) {
    return [];
  }


  // 1 Job อาจมีหลาย payment
  // ใช้ payment verified ล่าสุด
  const verifiedPaymentsByJobId =
    new Map();


  for (
    const payment of payments
  ) {
    if (!payment?.job_id) {
      continue;
    }


    const existing =
      verifiedPaymentsByJobId.get(
        payment.job_id
      );


    if (!existing) {
      verifiedPaymentsByJobId.set(
        payment.job_id,
        payment
      );

      continue;
    }


    const existingTime =
      new Date(
        existing.verified_at ||
        existing.created_at ||
        0
      ).getTime();


    const currentTime =
      new Date(
        payment.verified_at ||
        payment.created_at ||
        0
      ).getTime();


    if (
      currentTime >
      existingTime
    ) {
      verifiedPaymentsByJobId.set(
        payment.job_id,
        payment
      );
    }
  }


  const verifiedJobIds =
    Array.from(
      verifiedPaymentsByJobId.keys()
    );


  if (
    verifiedJobIds.length === 0
  ) {
    return [];
  }


  // =========================================================
  // 3. REVIEWS
  //
  // หลักการ:
  // - ถ้ามี selected_by_customer = true → ใช้ตัวนั้น
  // - ถ้าไม่มี selected แต่มี Review เดียว → ใช้ตัวเดียวได้
  // - ถ้ามีหลาย Review และไม่มี selected → ห้ามเดา category
  // =========================================================

  const {
    data: reviews,
    error: reviewsError,
  } = await supabase
    .from("gmr_reviews")
    .select(
      "job_id, is_recent, review_date, created_at, selected_by_customer"
    )
    .in(
      "job_id",
      verifiedJobIds
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    );


  if (reviewsError) {
    throw reviewsError;
  }


  const reviewsByJobId =
    new Map();


  for (
    const review of
      reviews || []
  ) {
    if (!review?.job_id) {
      continue;
    }


    if (
      !reviewsByJobId.has(
        review.job_id
      )
    ) {
      reviewsByJobId.set(
        review.job_id,
        []
      );
    }


    reviewsByJobId
      .get(
        review.job_id
      )
      .push(
        review
      );
  }


  // =========================================================
  // 4. BUILD HISTORY
  // =========================================================

  const history = [];


  for (
    const job of jobs
  ) {
    const payment =
      verifiedPaymentsByJobId.get(
        job.id
      );


    if (!payment) {
      continue;
    }


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


    const jobReviews =
      reviewsByJobId.get(
        job.id
      ) || [];


    let review =
      null;


    // ========================================
    // 4.1 ถ้ามี selected review
    // ใช้ตัวล่าสุดที่ selected
    // ========================================

    const selectedReviews =
      jobReviews.filter(
        (item) =>
          item
            ?.selected_by_customer ===
          true
      );


    if (
      selectedReviews.length > 0
    ) {
      review =
        selectedReviews[0];
    }


    // ========================================
    // 4.2 ไม่มี selected
    // แต่มี review แค่ 1 ตัว
    // ใช้ตัวนั้นได้
    // ========================================

    else if (
      jobReviews.length === 1
    ) {
      review =
        jobReviews[0];
    }


    // ========================================
    // 4.3 มีหลายตัวแต่ไม่รู้ว่าใช้ตัวไหน
    // ห้ามเดา NEW / OLD
    // ========================================

    else {
      review =
        null;
    }


    const isRecent =
      typeof review?.is_recent ===
      "boolean"
        ? review.is_recent
        : null;


    // ถ้าไม่รู้ category
    // อย่าเอา record นี้ไปใช้ Auto Price
    if (
      isRecent === null
    ) {
      continue;
    }


    history.push({
      jobId:
        job.id,

      price,

      currency:
        job.currency ||
        null,

      paidAt:
        payment.verified_at ||
        payment.created_at ||
        null,

      jobCreatedAt:
        job.created_at ||
        null,

      isRecent,

      reviewDate:
        review?.review_date ||
        null,
    });
  }


  // =========================================================
  // 5. NEWEST PAID HISTORY FIRST
  // =========================================================

  history.sort(
    (a, b) => {
      const aTime =
        new Date(
          a.paidAt ||
          a.jobCreatedAt ||
          0
        ).getTime();


      const bTime =
        new Date(
          b.paidAt ||
          b.jobCreatedAt ||
          0
        ).getTime();


      return bTime - aTime;
    }
  );


  return history;
}

export async function isPaymentReferenceUsed(
  transactionReference
) {
  if (!transactionReference) {
    return false;
  }

  const { data, error } =
    await supabase
      .from("gmr_payments")
      .select("id, job_id, transaction_reference")
      .eq(
        "transaction_reference",
        String(transactionReference).trim()
      )
      .limit(1)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function createPayment({
  jobId,
  amount,
  paymentMethod = "KTC_BILLER",
  slipReceived = true,
  slipUrl = null,
  paymentVerified = false,
  verifiedAt = null,
  transactionReference = null,
  transactionDate = null,
  transactionTime = null,
  recipientName = null,
  recipientBillerId = null,
  recipientCardLast4 = null,
}) {
  const { data, error } =
    await supabase
      .from("gmr_payments")
      .insert({
        job_id: jobId,
        amount,
        payment_method: paymentMethod,
        slip_received: slipReceived,
        slip_url: slipUrl,
        payment_verified: paymentVerified,
        verified_at: verifiedAt,
        transaction_reference:
          transactionReference,
        transaction_date:
          transactionDate,
        transaction_time:
          transactionTime,
        recipient_name:
          recipientName,
        recipient_biller_id:
          recipientBillerId,
        recipient_card_last4:
          recipientCardLast4,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getPaymentByLineGroupMessageId(
  lineGroupMessageId
) {
  const { data, error } =
    await supabase
      .from("gmr_payments")
      .select("*")
      .eq(
        "line_group_message_id",
        String(lineGroupMessageId)
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}


export async function updatePayment(
  paymentId,
  updates
) {
  const { data, error } =
    await supabase
      .from("gmr_payments")
      .update(updates)
      .eq(
        "id",
        paymentId
      )
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function createPendingPayment({
  jobId,
  amount,
  paymentMethod = "KTC_BILLER",
  transactionReference = null,
  transactionDate = null,
  transactionTime = null,
  recipientName = null,
  recipientBillerId = null,
  recipientCardLast4 = null,
  slipFilePath = null,
  verificationReasons = [],
}) {
  const { data, error } =
    await supabase
      .from("gmr_payments")
      .insert({
        job_id: jobId,
        amount,
        payment_method: paymentMethod,
        slip_received: true,
        payment_verified: false,
        verified_at: null,
        transaction_reference:
          transactionReference,
        transaction_date:
          transactionDate,
        transaction_time:
          transactionTime,
        recipient_name:
          recipientName,
        recipient_biller_id:
          recipientBillerId,
        recipient_card_last4:
          recipientCardLast4,
        review_status:
          "pending",
        verification_reasons:
          verificationReasons,

        slip_file_path:
  slipFilePath,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getLatestJobWithMapByCustomerId(
  customerId
) {
  const { data, error } =
    await supabase
      .from("gmr_jobs")
      .select("*")
      .eq("customer_id", customerId)
      .not("map_url", "is", null)
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}


export async function updateJob(
  jobId,
  updates
) {
  const { data, error } = await supabase
    .from("gmr_jobs")
    .update(updates)
    .eq("id", jobId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getJobByLineGroupMessageId(
  lineGroupMessageId
) {
  const { data, error } = await supabase
    .from("gmr_jobs")
    .select("*")
    .eq(
      "line_group_message_id",
      String(lineGroupMessageId)
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

// =========================================================
// GET WAITING CREDIT JOBS BY CUSTOMER
//
// ใช้กับ Existing Customer Batch
// หลังลูกค้ากด "ยืนยันทั้งหมด"
// =========================================================

export async function getWaitingCreditApprovalJobsByCustomerId(
  customerId
) {
  if (!customerId) {
    throw new Error(
      "Missing customerId in getWaitingCreditApprovalJobsByCustomerId"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_jobs")
    .select("*")
    .eq(
      "customer_id",
      customerId
    )
    .eq(
      "status",
      "waiting_credit_approval"
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}

export async function getPendingCreditApprovalJobs() {
  const { data, error } =
    await supabase
      .from("gmr_jobs")
      .select("*")
      .eq(
        "status",
        "waiting_credit_approval"
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}

export async function getJobById(
  jobId
) {
  const { data, error } =
    await supabase
      .from("gmr_jobs")
      .select("*")
      .eq(
        "id",
        jobId
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

// =========================================================
// LEGACY CUSTOMERS
// ลูกค้าเก่าก่อนเริ่มใช้ระบบใหม่
// =========================================================

export async function getLegacyCustomerById(
  legacyCustomerId
) {
  if (!legacyCustomerId) {
    throw new Error(
      "Missing legacyCustomerId in getLegacyCustomerById"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_legacy_customers")
    .select("*")
    .eq(
      "id",
      legacyCustomerId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}


export async function getPendingLegacyCustomersByDisplayName(
  displayName
) {
  const normalizedName =
    String(
      displayName || ""
    ).trim();

  if (!normalizedName) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_legacy_customers")
    .select("*")
    .eq(
      "match_status",
      "pending"
    )
    .ilike(
      "display_name",
      normalizedName
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}

export async function markLegacyCustomerMatched({
  legacyCustomerId,
  customerId,
}) {
  if (!legacyCustomerId) {
    throw new Error(
      "Missing legacyCustomerId in markLegacyCustomerMatched"
    );
  }

  if (!customerId) {
    throw new Error(
      "Missing customerId in markLegacyCustomerMatched"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_legacy_customers")
    .update({
      matched_customer_id:
        customerId,

      pending_customer_id:
        null,

      line_group_message_id:
        null,

      match_status:
        "matched",

     matched_at:
  new Date().toISOString(),

match_requested_at:
  null,

pending_message_text:
  null,

pending_message_type:
  null,
    })
    .eq(
      "id",
      legacyCustomerId
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

// =========================================================
// LEGACY CUSTOMER MATCH REQUEST
// =========================================================

export async function setLegacyCustomerPendingMatch({
  legacyCustomerId,
  customerId,
  lineGroupMessageId,
  pendingMessageText = null,
  pendingMessageType = "text",
}) {
  
  if (!legacyCustomerId) {
    throw new Error(
      "Missing legacyCustomerId in setLegacyCustomerPendingMatch"
    );
  }

  if (!customerId) {
    throw new Error(
      "Missing customerId in setLegacyCustomerPendingMatch"
    );
  }

  if (!lineGroupMessageId) {
    throw new Error(
      "Missing lineGroupMessageId in setLegacyCustomerPendingMatch"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_legacy_customers")
    .update({
      pending_customer_id:
        customerId,

      line_group_message_id:
        String(
          lineGroupMessageId
        ),

      match_status:
        "pending_confirmation",

      match_requested_at:
  new Date().toISOString(),

pending_message_text:
  pendingMessageText,

pending_message_type:
  pendingMessageType,
    })
    .eq(
      "id",
      legacyCustomerId
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}


// =========================================================
// หา Legacy Customer จาก LINE Group Message ID
// ใช้ตอนทีม Reply "ยืนยัน"
// =========================================================

export async function getLegacyCustomerByLineGroupMessageId(
  lineGroupMessageId
) {
  if (!lineGroupMessageId) {
    return null;
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_legacy_customers")
    .select("*")
    .eq(
      "line_group_message_id",
      String(
        lineGroupMessageId
      )
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}


// =========================================================
// ยกเลิก Legacy Match Request
// ใช้กรณีทีมตอบว่า "ไม่ใช่"
// =========================================================

export async function rejectLegacyCustomerMatch(
  legacyCustomerId
) {
  const {
    data,
    error,
  } = await supabase
    .from("gmr_legacy_customers")
    .update({
      pending_customer_id:
        null,

      line_group_message_id:
        null,

      match_status:
        "pending",

      match_requested_at:
        null,
    })
    .eq(
      "id",
      legacyCustomerId
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getCustomerById(
  customerId
) {
  const { data, error } = await supabase
    .from("gmr_customers")
    .select("*")
    .eq("id", customerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

// =========================================================
// AUDIT LOG
// =========================================================

export async function createAuditLog({
  customerId = null,
  jobId = null,
  eventType,
  oldValue = null,
  newValue = null,
}) {
  const { data, error } = await supabase
    .from("gmr_audit_logs")
    .insert({
      customer_id: customerId,
      job_id: jobId,
      event_type: eventType,
      old_value: oldValue,
      new_value: newValue,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

// =========================================================
// REVIEW CANDIDATE
// =========================================================

export async function saveReviewCandidate({
  customerId,
  jobId = null,
  businessName = null,
  placeId = null,
  mapUrl = null,
  reviewerName = null,
  rating = null,
  reviewText = null,
  reviewDate = null,
  reviewUrl = null,
  providerReviewId = null,
isRecent = null,
isVisible = null,
hasText = null,
evidenceImagePath = null,
}) {

  const { data, error } = await supabase
    .from("gmr_reviews")
    .insert({
      customer_id: customerId,
      job_id: jobId,
      business_name: businessName,
      place_id: placeId,
      map_url: mapUrl,
      reviewer_name: reviewerName,
      rating,
      review_text: reviewText,
      review_date: reviewDate,
      review_url: reviewUrl,
      provider_review_id: providerReviewId,
is_recent: isRecent,
is_visible: isVisible,
has_text: hasText,
evidence_image_path:
  evidenceImagePath,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getReviewCandidatesByJobId(
  jobId
) {
  const { data, error } = await supabase
    .from("gmr_reviews")
    .select("*")
    .eq("job_id", jobId)
    .eq("is_recent", true)
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function getReviewsByJobId(
  jobId
) {
  const { data, error } =
    await supabase
      .from("gmr_reviews")
      .select("*")
      .eq(
        "job_id",
        jobId
      )
      .order(
        "created_at",
        {
          ascending:
            true,
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}


export async function selectReviewCandidate(
  reviewId
) {
  const { data, error } = await supabase
    .from("gmr_reviews")
    .update({
      selected_by_customer: true,
    })
    .eq("id", reviewId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

// =========================================================
// QUOTES
// =========================================================

export async function createQuote({
  jobId,
  amount,
  currency = "THB",
  quotedBy = "sales",
  quoteMessage = null,
  script3Sent = false,
}) {
  const { data, error } = await supabase
    .from("gmr_quotes")
    .insert({
      job_id: jobId,
      amount,
      currency,
      quoted_by: quotedBy,
      quote_message: quoteMessage,
      script3_sent: script3Sent,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function updateQuote(
  quoteId,
  updates
) {
  const { data, error } = await supabase
    .from("gmr_quotes")
    .update(updates)
    .eq("id", quoteId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getPendingPriceJobs() {
  const { data, error } =
    await supabase
      .from("gmr_jobs")
      .select("*")
      .eq(
        "status",
        "waiting_price"
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}



export async function getJobsForReviewMonitoring() {
  const { data, error } =
    await supabase
      .from("gmr_jobs")
      .select("*")
      .eq(
        "status",
        "processing"
      )
      .not(
        "review_url",
        "is",
        null
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}
