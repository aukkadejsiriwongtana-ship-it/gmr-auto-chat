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
// LANGUAGE LOCK
// =========================================================

export async function lockCustomerLanguageToThai(
  customerId
) {
  const { data, error } =
    await supabase
      .from("gmr_customers")
      .update({
        language: "th",
        language_locked: true,
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
// FAQ
// =========================================================

export async function getActiveFaqs() {
  const { data, error } =
    await supabase
      .from("gmr_faqs")
      .select("*")
      .eq(
        "is_active",
        true
      )
      .order(
        "priority",
        {
          ascending: true,
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}


export async function registerFaqHit({
  customerId,
  faqKey,
}) {
  if (!customerId) {
    throw new Error(
      "Missing customerId in registerFaqHit"
    );
  }

  if (!faqKey) {
    throw new Error(
      "Missing faqKey in registerFaqHit"
    );
  }

  const { data: existing, error: findError } =
    await supabase
      .from("gmr_faq_hits")
      .select("*")
      .eq(
        "customer_id",
        customerId
      )
      .eq(
        "faq_key",
        faqKey
      )
      .maybeSingle();

  if (findError) {
    throw findError;
  }

  if (!existing) {
    const { data, error } =
      await supabase
        .from("gmr_faq_hits")
        .insert({
          customer_id:
            customerId,

          faq_key:
            faqKey,

          hit_count:
            1,

          first_asked_at:
            new Date().toISOString(),

          last_asked_at:
            new Date().toISOString(),
        })
        .select()
        .single();

    if (error) {
      throw error;
    }

    return data;
  }


  const { data, error } =
    await supabase
      .from("gmr_faq_hits")
      .update({
        hit_count:
          Number(
            existing.hit_count || 0
          ) + 1,

        last_asked_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        existing.id
      )
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}


// =========================================================
// BOT CONTROL
// =========================================================

export async function getBotControl() {
  const { data, error } =
    await supabase
      .from(
        "gmr_system_settings"
      )
      .select(
        "setting_value"
      )
      .eq(
        "setting_key",
        "bot_control"
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  const value =
    data?.setting_value ||
    {};

  return {
    enabled:
      value.enabled !== false,

    pausedAt:
      value.paused_at ||
      null,

    resumedAt:
      value.resumed_at ||
      null,
  };
}


export async function setBotControl(
  enabled
) {
  const now =
    new Date().toISOString();

  const current =
    await getBotControl();

  const settingValue =
    enabled
      ? {
          enabled: true,

          paused_at:
            current.pausedAt,

          resumed_at:
            now,
        }
      : {
          enabled: false,

          paused_at:
            now,

          resumed_at:
            current.resumedAt,
        };


  const { data, error } =
    await supabase
      .from(
        "gmr_system_settings"
      )
      .upsert(
        {
          setting_key:
            "bot_control",

          setting_value:
            settingValue,

          updated_at:
            now,
        },
        {
          onConflict:
            "setting_key",
        }
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

  departmentId = null,
  monitoredMapId = null,
  legacySourceId = null,

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

      department_id: departmentId,
      monitored_map_id: monitoredMapId,
      legacy_source_id: legacySourceId,

      status,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getLegacyImportedJob({
  legacySourceId,
  reviewCase,
}) {
  if (!legacySourceId) {
    throw new Error(
      "Missing legacySourceId in getLegacyImportedJob"
    );
  }

  if (!reviewCase) {
    throw new Error(
      "Missing reviewCase in getLegacyImportedJob"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_jobs")
    .select("*")
    .eq(
      "legacy_source_id",
      legacySourceId
    )
    .eq(
      "review_case",
      reviewCase
    )
    .limit(1)
    .maybeSingle();

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

export async function getJobByCustomerAndReviewUrl(
  customerId,
  reviewUrl
) {
  const normalizedUrl =
    String(reviewUrl || "").trim();

  if (
    !customerId ||
    !normalizedUrl
  ) {
    return null;
  }


  const {
    data,
    error,
  } =
    await supabase
      .from("gmr_jobs")
      .select("*")
      .eq(
        "customer_id",
        customerId
      )
      .eq(
        "review_url",
        normalizedUrl
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      )
      .limit(1)
      .maybeSingle();


  if (error) {
    throw error;
  }


  return data || null;
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
// SYNC CUSTOMER MAPS FOR EXISTING CUSTOMER
//
// Existing customer = มี payment_verified = true อย่างน้อย 1 งาน
//
// เมื่อเป็นลูกค้าเก่าแล้ว:
// - เอา Map ทุกอันที่ customer คนนี้เคยส่งเข้าระบบ
// - เก็บไว้ใน gmr_customer_maps
// - กัน Map ซ้ำด้วย customer_id + place_id
//
// ใช้สำหรับ Reactivation Monitor ทุก 3 วัน
// =========================================================

export async function syncCustomerMapsForExistingCustomer(
  customerId
) {
  if (!customerId) {
    throw new Error(
      "Missing customerId in syncCustomerMapsForExistingCustomer"
    );
  }

  // -----------------------------------------
  // 1. ต้องเป็น Existing Customer ก่อน
  // -----------------------------------------

  const isExisting =
    await hasPaymentByCustomerId(
      customerId
    );

  if (!isExisting) {
    return {
      synced: false,
      reason: "not_existing_customer",
      count: 0,
    };
  }

  // -----------------------------------------
  // 2. ดึง Map ทุกอันที่ customer เคยส่ง
  // -----------------------------------------

  const {
  data: jobs,
  error: jobsError,
} = await supabase
  .from("gmr_jobs")
  .select(
    "customer_id, business_name, place_id, map_url, review_url"
  )
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
    return {
      synced: true,
      reason: "no_maps",
      count: 0,
    };
  }

  // -----------------------------------------
  // 3. กัน place_id ซ้ำใน jobs ก่อน upsert
  // -----------------------------------------

  const mapByPlaceId =
    new Map();

 for (const job of jobs) {
  let placeId =
    String(
      job?.place_id || ""
    ).trim();

  let mapUrl =
    String(
      job?.map_url || ""
    ).trim();

  const reviewUrl =
    String(
      job?.review_url || ""
    ).trim();

  // ถ้ามี place_id อยู่แล้ว ใช้ได้เลย
  if (placeId) {
    mapByPlaceId.set(
      placeId,
      {
        customer_id:
          customerId,

        business_name:
          job.business_name ||
          null,

        place_id:
          placeId,

        map_url:
          mapUrl ||
          null,

        is_active:
          true,

        updated_at:
          new Date()
            .toISOString(),
      }
    );

    continue;
  }

  // ถ้าไม่มี place_id แต่มี review_url
  // เก็บไว้ด้วย key review_url ชั่วคราว
  if (reviewUrl) {
    const fallbackKey =
      `review:${reviewUrl}`;

    mapByPlaceId.set(
  fallbackKey,
  {
    customer_id:
      customerId,

    business_name:
      job.business_name ||
      null,

    place_id:
      null,

    map_url:
      mapUrl ||
      null,

     source_review_url:
      reviewUrl || null,

    map_key:
      `place:${placeId}`,

    is_active:
      true,

    updated_at:
      new Date()
        .toISOString(),
  }
);
  }
}

  const maps =
    Array.from(
      mapByPlaceId.values()
    );

  if (maps.length === 0) {
    return {
      synced: true,
      reason: "no_valid_maps",
      count: 0,
    };
  }

  // -----------------------------------------
  // 4. Upsert
  // -----------------------------------------

  const {
    data,
    error,
  } = await supabase
    .from(
      "gmr_customer_maps"
    )
   .upsert(
  maps,
  {
    onConflict:
      "customer_id,map_key",

    ignoreDuplicates:
      false,
  }
)
    .select();

  if (error) {
    throw error;
  }

  return {
    synced: true,
    reason: "ok",
    count:
      data?.length ||
      maps.length,
    maps:
      data || [],
  };
}

// =========================================================
// BACKFILL MAPS FOR ALL EXISTING CUSTOMERS
//
// ใช้ครั้งแรกตอนเปิดระบบ Reactivation Monitor
//
// Existing Customer:
// ต้องมี payment_verified = true
//
// จากนั้น:
// - หา customer ที่เคยจ่ายเงินจริงทั้งหมด
// - sync Map ที่เคยส่งงานมาเข้า gmr_customer_maps
// =========================================================

export async function backfillExistingCustomerMaps() {
  // -----------------------------------------
  // 1. ดึง verified payments ทั้งหมด
  // -----------------------------------------

  const {
    data: payments,
    error: paymentsError,
  } = await supabase
    .from("gmr_payments")
    .select("job_id")
    .eq(
      "payment_verified",
      true
    )
    .not(
      "job_id",
      "is",
      null
    );

  if (paymentsError) {
    throw paymentsError;
  }

  if (
    !payments ||
    payments.length === 0
  ) {
    return {
      ok: true,
      customers: 0,
      maps: 0,
      results: [],
    };
  }

  // -----------------------------------------
  // 2. กัน job_id ซ้ำ
  // -----------------------------------------

  const jobIds =
    [
      ...new Set(
        payments
          .map(
            (payment) =>
              payment.job_id
          )
          .filter(Boolean)
      ),
    ];

  if (jobIds.length === 0) {
    return {
      ok: true,
      customers: 0,
      maps: 0,
      results: [],
    };
  }

  // -----------------------------------------
  // 3. หา customer_id จาก jobs
  // -----------------------------------------

  const {
    data: paidJobs,
    error: jobsError,
  } = await supabase
    .from("gmr_jobs")
    .select(
      "id, customer_id"
    )
    .in(
      "id",
      jobIds
    );

  if (jobsError) {
    throw jobsError;
  }

  const customerIds =
    [
      ...new Set(
        (paidJobs || [])
          .map(
            (job) =>
              job.customer_id
          )
          .filter(Boolean)
      ),
    ];

  // -----------------------------------------
  // 4. Sync Map ของลูกค้าแต่ละคน
  // -----------------------------------------

  const results = [];

  let totalMaps = 0;

  for (
    const customerId of
    customerIds
  ) {
    try {
      const result =
        await syncCustomerMapsForExistingCustomer(
          customerId
        );

      totalMaps +=
        Number(
          result?.count || 0
        );

      results.push({
        customerId,
        ok: true,
        ...result,
      });
    } catch (error) {
      console.error(
        "BACKFILL CUSTOMER MAP ERROR:",
        {
          customerId,
          error:
            error?.message ||
            String(error),
        }
      );

      results.push({
        customerId,
        ok: false,
        error:
          error?.message ||
          String(error),
      });
    }
  }

  return {
    ok: true,
    customers:
      customerIds.length,
    maps:
      totalMaps,
    results,
  };
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

export async function getVerifiedPaymentByJobId(
  jobId
) {
  if (!jobId) {
    throw new Error(
      "Missing jobId in getVerifiedPaymentByJobId"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_payments")
    .select("*")
    .eq(
      "job_id",
      jobId
    )
    .eq(
      "payment_verified",
      true
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    )
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
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

// =========================================================
// CREATE LEGACY CUSTOMER FROM SHEET
// =========================================================

export async function createLegacyCustomerFromSheet({
  platform = null,
  platformAccount = null,
  legacyCustomerId = null,
  displayName,
  businessName = null,
  phone = null,
  email = null,

  newReviewRate = null,
  newReviewCurrency = "THB",

  oldReviewRate = null,
  oldReviewCurrency = "THB",

  hasVerifiedPayment = false,
  note = null,
}) {
  
  const normalizedDisplayName =
    String(displayName || "").trim();

  if (!normalizedDisplayName) {
    throw new Error(
      "Missing displayName in createLegacyCustomerFromSheet"
    );
  }

// -------------------------------------------------------
// ถ้ามี legacy_customer_id แล้ว
// ใช้ ID เป็นตัวอ้างอิงหลัก
// ไม่สร้าง record ใหม่
// -------------------------------------------------------

const normalizedLegacyCustomerId =
  String(
    legacyCustomerId || ""
  ).trim();

if (normalizedLegacyCustomerId) {
  const {
    data: existingById,
    error: existingByIdError,
  } =
    await supabase
      .from("gmr_legacy_customers")
      .select("*")
      .eq(
        "id",
        normalizedLegacyCustomerId
      )
      .maybeSingle();

  if (existingByIdError) {
    throw existingByIdError;
  }

  if (!existingById) {
    throw new Error(
      `Legacy customer not found: ${normalizedLegacyCustomerId}`
    );
  }

  return {
    created: false,
    duplicate: true,
    customer:
      existingById,
  };
}
  // -------------------------------------------------------
  // กันกด Import ซ้ำ
  // -------------------------------------------------------

  let existingQuery =
    supabase
      .from("gmr_legacy_customers")
      .select("*")
      .ilike(
        "display_name",
        normalizedDisplayName
      );


  if (phone) {
    existingQuery =
      existingQuery.eq(
        "phone",
        String(phone).trim()
      );
  }


  if (businessName) {
    existingQuery =
      existingQuery.ilike(
        "business_name",
        String(businessName).trim()
      );
  }


  const {
    data: existingRows,
    error: existingError,
  } = await existingQuery
    .order(
      "created_at",
      {
        ascending: false,
      }
    )
    .limit(1);


  if (existingError) {
    throw existingError;
  }


  if (
    Array.isArray(existingRows) &&
    existingRows.length > 0
  ) {
    return {
      created: false,
      duplicate: true,
      customer:
        existingRows[0],
    };
  }


  // -------------------------------------------------------
  // CREATE
  // -------------------------------------------------------

  const {
    data,
    error,
  } =
    await supabase
      .from("gmr_legacy_customers")
      .insert({
        platform:
          platform
            ? String(platform)
                .trim()
                .toLowerCase()
            : null,

        platform_account:
          platformAccount
            ? String(platformAccount)
                .trim()
            : null,

        display_name:
          normalizedDisplayName,

        business_name:
          businessName
            ? String(businessName).trim()
            : null,

        phone:
          phone
            ? String(phone).trim()
            : null,

        email:
          email
            ? String(email).trim()
            : null,

        new_review_rate:
          newReviewRate === null ||
          newReviewRate === undefined ||
          newReviewRate === ""
            ? null
            : Number(newReviewRate),

        new_review_currency:
          String(
            newReviewCurrency || "THB"
          )
            .trim()
            .toUpperCase(),

        old_review_rate:
          oldReviewRate === null ||
          oldReviewRate === undefined ||
          oldReviewRate === ""
            ? null
            : Number(oldReviewRate),

        old_review_currency:
          String(
            oldReviewCurrency || "THB"
          )
            .trim()
            .toUpperCase(),

        has_verified_payment:
          hasVerifiedPayment === true,

        note:
          note
            ? String(note).trim()
            : null,

        match_status:
          "pending",
      })
      .select()
      .single();


  if (error) {
    throw error;
  }


  return {
    created: true,
    duplicate: false,
    customer:
      data,
  };
}

export async function getPendingLegacyCustomersByDisplayName(
  displayName,
  platform = null,
  platformAccount = null
) {
  const normalizedName =
    String(
      displayName || ""
    ).trim();

  if (!normalizedName) {
    return [];
  }


  let query =
    supabase
      .from("gmr_legacy_customers")
      .select("*")
      .eq(
        "match_status",
        "pending"
      )
      .ilike(
        "display_name",
        normalizedName
      );


  const normalizedPlatform =
    String(
      platform || ""
    )
      .trim()
      .toLowerCase();


  const normalizedPlatformAccount =
    String(
      platformAccount || ""
    ).trim();


  if (normalizedPlatform) {
    query =
      query.eq(
        "platform",
        normalizedPlatform
      );
  }


  if (normalizedPlatformAccount) {
    query =
      query.eq(
        "platform_account",
        normalizedPlatformAccount
      );
  }


  const {
    data,
    error,
  } =
    await query.order(
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
// CLAIM LEGACY CUSTOMER IMPORT
//
// pending_confirmation -> importing
//
// ใช้กัน:
// - กดยืนยันซ้ำ
// - webhook ซ้ำ
// - import พร้อมกัน 2 request
// =========================================================

export async function claimLegacyCustomerImport({
  legacyCustomerId,
  customerId,
}) {
  if (!legacyCustomerId) {
    throw new Error(
      "Missing legacyCustomerId in claimLegacyCustomerImport"
    );
  }

  if (!customerId) {
    throw new Error(
      "Missing customerId in claimLegacyCustomerImport"
    );
  }


  const {
    data,
    error,
  } = await supabase
    .from("gmr_legacy_customers")
    .update({
      match_status:
        "importing",
    })
    .eq(
      "id",
      legacyCustomerId
    )
    .eq(
      "pending_customer_id",
      customerId
    )
    .eq(
      "match_status",
      "pending_confirmation"
    )
    .select()
    .maybeSingle();


  if (error) {
    throw error;
  }


  // null = มี request อื่น claim ไปแล้ว
  return data;
}

export async function rollbackLegacyCustomerImport(
  legacyCustomerId
) {
  if (!legacyCustomerId) {
    throw new Error(
      "Missing legacyCustomerId in rollbackLegacyCustomerImport"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_legacy_customers")
    .update({
      match_status:
        "pending_confirmation",
    })
    .eq(
      "id",
      legacyCustomerId
    )
    .eq(
      "match_status",
      "importing"
    )
    .select()
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
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

// =========================================================
// DEPARTMENT ROUTING BY REVIEW AGE
//
// ใช้ config จาก gmr_departments
//
// ตัวอย่าง:
// T0 = 0-14 วัน
// T2 = 15 วันขึ้นไป
//
// ถ้าอายุหาไม่ได้ → return null
// ห้ามเดาแผนก
// =========================================================

export async function getDepartmentForReviewAge(
  reviewAgeDays
) {
  if (
    reviewAgeDays === null ||
    reviewAgeDays === undefined
  ) {
    return null;
  }

  const age =
    Number(reviewAgeDays);

  if (
    !Number.isFinite(age) ||
    age < 0
  ) {
    return null;
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_departments")
    .select("*")
    .eq("is_active", true)
    .order(
      "min_review_age_days",
      {
        ascending: true,
      }
    );

  if (error) {
    throw error;
  }

  const departments =
    data || [];

  for (
    const department of
    departments
  ) {
    const minAge =
      department
        .min_review_age_days ===
      null
        ? -Infinity
        : Number(
            department
              .min_review_age_days
          );

    const maxAge =
      department
        .max_review_age_days ===
      null
        ? Infinity
        : Number(
            department
              .max_review_age_days
          );

    if (
      age >= minAge &&
      age <= maxAge
    ) {
      return department;
    }
  }

  return null;
}

// =========================================================
// DISPATCH QUEUE
// =========================================================

export async function getActiveDepartments() {
  const { data, error } =
    await supabase
      .from("gmr_departments")
      .select("*")
      .eq("is_active", true)
      .order(
        "min_review_age_days",
        {
          ascending: true,
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}


export async function getQueuedJobsByDepartmentId(
  departmentId
) {
  if (!departmentId) {
    throw new Error(
      "Missing departmentId in getQueuedJobsByDepartmentId"
    );
  }

  const { data, error } =
    await supabase
      .from("gmr_jobs")
      .select("*")
      .eq(
        "department_id",
        departmentId
      )
      .eq(
        "status",
        "queued"
      )
      .is(
        "dispatch_round_id",
        null
      )
      .not(
        "review_url",
        "is",
        null
      )
      .order(
        "queued_at",
        {
          ascending: true,
          nullsFirst: true,
        }
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


export async function createDispatchRound({
  departmentId,
  startedAt,
  dispatchedCount = 0,
}) {
  if (!departmentId) {
    throw new Error(
      "Missing departmentId in createDispatchRound"
    );
  }

  const { data, error } =
    await supabase
      .from("gmr_dispatch_rounds")
      .insert({
        department_id:
          departmentId,

        started_at:
          startedAt ||
          new Date().toISOString(),

        dispatched_count:
          Number(
            dispatchedCount || 0
          ),

        removed_count:
          0,

        status:
          "open",
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function markJobDispatched({
  jobId,
  dispatchRoundId,
  dispatchedAt,
}) {
  if (!jobId) {
    throw new Error(
      "Missing jobId in markJobDispatched"
    );
  }

  if (!dispatchRoundId) {
    throw new Error(
      "Missing dispatchRoundId in markJobDispatched"
    );
  }

  const sentAt =
    dispatchedAt ||
    new Date().toISOString();

  const { data, error } =
    await supabase
      .from("gmr_jobs")
      .update({
        status:
          "processing",

        dispatch_round_id:
          dispatchRoundId,

        dispatched_at:
          sentAt,

        started_at:
          sentAt,
      })
      .eq(
        "id",
        jobId
      )
      .eq(
        "status",
        "queued"
      )
      .is(
        "dispatch_round_id",
        null
      )
      .select()
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}


export async function updateDepartmentLastDispatchedAt(
  departmentId,
  dispatchedAt
) {
  if (!departmentId) {
    throw new Error(
      "Missing departmentId in updateDepartmentLastDispatchedAt"
    );
  }

  const { data, error } =
    await supabase
      .from("gmr_departments")
      .update({
        last_dispatched_at:
          dispatchedAt ||
          new Date().toISOString(),
      })
      .eq(
        "id",
        departmentId
      )
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}

// =========================================================
// ATOMIC DEPARTMENT DISPATCH
// =========================================================

export async function claimDepartmentDispatch({
  departmentId,
  claimedAt = null,
}) {
  if (!departmentId) {
    throw new Error(
      "Missing departmentId in claimDepartmentDispatch"
    );
  }

  const params = {
    p_department_id:
      departmentId,

    p_claimed_at:
      claimedAt ||
      new Date().toISOString(),
  };

  const {
    data,
    error,
  } = await supabase.rpc(
    "claim_department_dispatch",
    params
  );

  if (error) {
    throw error;
  }

  return (
    data || {
      ok: false,
      claimed: false,
      reason:
        "empty_claim_response",
    }
  );
}


// =========================================================
// COMPLETE DEPARTMENT DISPATCH
// เรียกหลัง LINE ส่งสำเร็จแล้วเท่านั้น
// =========================================================

export async function completeDepartmentDispatch({
  dispatchRoundId,
  dispatchedAt = null,
}) {
  if (!dispatchRoundId) {
    throw new Error(
      "Missing dispatchRoundId in completeDepartmentDispatch"
    );
  }

  const params = {
    p_round_id:
      dispatchRoundId,

    p_dispatched_at:
      dispatchedAt ||
      new Date().toISOString(),
  };

  const {
    data,
    error,
  } = await supabase.rpc(
    "complete_department_dispatch",
    params
  );

  if (error) {
    throw error;
  }

  return (
    data || {
      ok: false,
      reason:
        "empty_complete_response",
    }
  );
}

export async function markDispatchStuckAlerted({
  dispatchRoundId,
  alertedAt = null,
}) {
  if (!dispatchRoundId) {
    throw new Error(
      "markDispatchStuckAlerted requires dispatchRoundId"
    );
  }


  const params = {
    p_round_id:
      dispatchRoundId,

    p_alerted_at:
      alertedAt ||
      new Date().toISOString(),
  };


  const {
    data,
    error,
  } =
    await supabase.rpc(
      "mark_dispatch_stuck_alerted",
      params
    );


  if (error) {
    throw error;
  }


  return (
    data || {
      ok: false,
      updated: false,
      reason:
        "empty_mark_stuck_alert_response",
    }
  );
}
