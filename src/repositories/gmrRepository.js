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
        reviewUrl,

      map_key:
        fallbackKey,

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
// GET CUSTOMER MAPS WAITING FOR RESOLVE
// =========================================================

export async function getCustomerMapsWaitingForResolve() {
  const {
    data,
    error,
  } = await supabase
    .from("gmr_customer_maps")
    .select("*")
    .eq(
      "is_active",
      true
    )
    .is(
      "place_id",
      null
    )
    .not(
      "source_review_url",
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
// UPDATE RESOLVED CUSTOMER MAP
// =========================================================

export async function updateResolvedCustomerMap({
  customerMapId,
  businessName = null,
  placeId,
  mapUrl = null,
}) {
  if (!customerMapId) {
    throw new Error(
      "Missing customerMapId"
    );
  }

  if (!placeId) {
    throw new Error(
      "Missing placeId"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_customer_maps")
    .update({
      business_name:
        businessName ||
        undefined,

      place_id:
        placeId,

      map_url:
        mapUrl ||
        null,

      map_key:
        `place:${placeId}`,

      updated_at:
        new Date()
          .toISOString(),
    })
    .eq(
      "id",
      customerMapId
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

// =========================================================
// GET CUSTOMER MAPS DUE FOR REACTIVATION CHECK
//
// ตรวจ:
// - active เท่านั้น
// - ต้องมี place_id แล้ว
// - ยังไม่เคยตรวจ
//   หรือ
// - ตรวจล่าสุดเกิน 3 วันแล้ว
// =========================================================

export async function getCustomerMapsDueForReactivationCheck() {
  const cutoff =
    new Date(
      Date.now() -
      3 * 24 * 60 * 60 * 1000
    ).toISOString();

  const {
    data,
    error,
  } = await supabase
    .from("gmr_customer_maps")
    .select("*")
    .eq(
      "is_active",
      true
    )
    .not(
      "place_id",
      "is",
      null
    )
    .or(
      `last_checked_at.is.null,last_checked_at.lte.${cutoff}`
    )
    .order(
      "last_checked_at",
      {
        ascending: true,
        nullsFirst: true,
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}


// =========================================================
// MARK CUSTOMER MAP CHECKED
// =========================================================

export async function markCustomerMapChecked({
  customerMapId,
  checkedAt = null,
  lastReviewSeenAt = null,
}) {
  if (!customerMapId) {
    throw new Error(
      "Missing customerMapId in markCustomerMapChecked"
    );
  }

  const now =
    checkedAt ||
    new Date().toISOString();

  const updateData = {
    last_checked_at:
      now,

    updated_at:
      now,
  };

  if (lastReviewSeenAt) {
    updateData.last_review_seen_at =
      lastReviewSeenAt;
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_customer_maps")
    .update(
      updateData
    )
    .eq(
      "id",
      customerMapId
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

// =========================================================
// FIND REVIEW ALREADY KNOWN BY CUSTOMER
//
// กันกรณี:
// - ลูกค้าเคยส่ง review นี้แล้ว
// - เคยมีงาน review นี้อยู่ในระบบแล้ว
// =========================================================

export async function findExistingCustomerReview({
  customerId,
  providerReviewId = null,
  reviewUrl = null,
}) {
  if (!customerId) {
    throw new Error(
      "Missing customerId in findExistingCustomerReview"
    );
  }

  const safeProviderReviewId =
    String(
      providerReviewId || ""
    ).trim();

  const safeReviewUrl =
    String(
      reviewUrl || ""
    ).trim();


  // -----------------------------------------
  // 1. เช็ก provider_review_id ก่อน
  // -----------------------------------------

  if (safeProviderReviewId) {
    const {
      data,
      error,
    } = await supabase
      .from("gmr_reviews")
      .select("*")
      .eq(
        "customer_id",
        customerId
      )
      .eq(
        "provider_review_id",
        safeProviderReviewId
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

    if (data) {
      return data;
    }
  }


  // -----------------------------------------
  // 2. fallback เช็ก canonical review_url
  // -----------------------------------------

  if (safeReviewUrl) {
    const {
      data,
      error,
    } = await supabase
      .from("gmr_reviews")
      .select("*")
      .eq(
        "customer_id",
        customerId
      )
      .eq(
        "review_url",
        safeReviewUrl
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

    if (data) {
      return data;
    }
  }

  return null;
}


// =========================================================
// FIND EXISTING REACTIVATION ALERT
//
// กันการส่งเข้า LINE กลุ่มซ้ำ
// =========================================================

export async function findExistingReactivationAlert({
  customerMapId,
  providerReviewId = null,
  reviewUrl = null,
}) {
  if (!customerMapId) {
    throw new Error(
      "Missing customerMapId in findExistingReactivationAlert"
    );
  }

  const safeProviderReviewId =
    String(
      providerReviewId || ""
    ).trim();

  const safeReviewUrl =
    String(
      reviewUrl || ""
    ).trim();


  if (safeProviderReviewId) {
    const {
      data,
      error,
    } = await supabase
      .from(
        "gmr_review_reactivation_alerts"
      )
      .select("*")
      .eq(
        "customer_map_id",
        customerMapId
      )
      .eq(
        "provider_review_id",
        safeProviderReviewId
      )
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }
  }


  if (safeReviewUrl) {
    const {
      data,
      error,
    } = await supabase
      .from(
        "gmr_review_reactivation_alerts"
      )
      .select("*")
      .eq(
        "customer_map_id",
        customerMapId
      )
      .eq(
        "review_url",
        safeReviewUrl
      )
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }
  }

  return null;
}


// =========================================================
// CREATE REACTIVATION ALERT
//
// ตอนสร้าง:
// ยังไม่ทักลูกค้า
// รอทีมตรวจใน LINE กลุ่มก่อน
// =========================================================

export async function createReactivationAlert({
  customerId,
  customerMapId,
  providerReviewId = null,
  reviewUrl = null,
  reviewerName = null,
  reviewText = null,
  rating = null,
  reviewDate = null,
}) {
  if (!customerId) {
    throw new Error(
      "Missing customerId in createReactivationAlert"
    );
  }

  if (!customerMapId) {
    throw new Error(
      "Missing customerMapId in createReactivationAlert"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from(
      "gmr_review_reactivation_alerts"
    )
    .insert({
      customer_id:
        customerId,

      customer_map_id:
        customerMapId,

      provider_review_id:
        providerReviewId ||
        null,

      review_url:
        reviewUrl ||
        null,

      reviewer_name:
        reviewerName ||
        null,

      review_text:
        reviewText ||
        null,

      rating:
        rating === null ||
        rating === undefined
          ? null
          : Number(rating),

      review_date:
        reviewDate ||
        null,

      detected_at:
        new Date()
          .toISOString(),

      review_status:
        "pending_team_review",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

// =========================================================
// LINK REACTIVATION ALERT TO LINE GROUP MESSAGE
// =========================================================

export async function setReactivationAlertLineGroupMessage({
  alertId,
  lineGroupMessageId,
}) {
  if (!alertId) {
    throw new Error(
      "Missing alertId in setReactivationAlertLineGroupMessage"
    );
  }

  if (!lineGroupMessageId) {
    throw new Error(
      "Missing lineGroupMessageId in setReactivationAlertLineGroupMessage"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from(
      "gmr_review_reactivation_alerts"
    )
    .update({
      line_group_message_id:
        lineGroupMessageId,
    })
    .eq(
      "id",
      alertId
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}


// =========================================================
// GET PENDING REACTIVATION ALERT BY LINE MESSAGE ID
//
// ใช้ตอนทีม Reply:
// - ส่งลูกค้า
// - ข้าม
// =========================================================

export async function getReactivationAlertByLineGroupMessageId(
  lineGroupMessageId
) {
  const messageId =
    String(
      lineGroupMessageId || ""
    ).trim();

  if (!messageId) {
    return null;
  }

  const {
    data,
    error,
  } = await supabase
    .from(
      "gmr_review_reactivation_alerts"
    )
    .select("*")
    .eq(
      "line_group_message_id",
      messageId
    )
    .eq(
      "review_status",
      "pending_team_review"
    )
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}


// =========================================================
// SAVE TEAM DECISION
// =========================================================

export async function setReactivationAlertTeamDecision({
  alertId,
  decision,
}) {
  if (!alertId) {
    throw new Error(
      "Missing alertId in setReactivationAlertTeamDecision"
    );
  }

  const safeDecision =
    String(
      decision || ""
    )
      .trim()
      .toLowerCase();

  if (
    ![
      "send_to_customer",
      "skip",
    ].includes(
      safeDecision
    )
  ) {
    throw new Error(
      "Invalid reactivation team decision"
    );
  }

  const now =
    new Date().toISOString();

  const reviewStatus =
    safeDecision ===
    "send_to_customer"
      ? "sent_to_customer"
      : "skipped";

  const {
    data,
    error,
  } = await supabase
    .from(
      "gmr_review_reactivation_alerts"
    )
    .update({
      team_decision:
        safeDecision,

      team_reviewed_at:
        now,

      review_status:
        reviewStatus,

      customer_contacted_at:
        safeDecision === "send_to_customer"
          ? now
          : null,

      updated_at:
        now,
    })
    .eq(
      "id",
      alertId
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
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
  mapUrl = null,
  mapUrls = null,
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

  const normalizedMapUrls = Array.from(new Set(
    (Array.isArray(mapUrls)
      ? mapUrls
      : String(mapUrls || mapUrl || "")
          .split(/\r?\n|,/g))
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));

  const normalizedMapUrl =
    normalizedMapUrls[0] ||
    (String(mapUrl || "").trim() || null);


  // -------------------------------------------------------
  // ถ้ามี legacy_customer_id แล้ว
  // ใช้ ID เป็นตัวอ้างอิงหลัก
  //
  // ถ้า Sheet มี map_url ใหม่
  // ให้อัปเดต record เดิมด้วย
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


    let customer =
      existingById;


    // ========================================
    // UPDATE MAP URL ของ record เดิม
    // ========================================

    const existingByIdMapUrls = Array.isArray(existingById.map_urls)
      ? existingById.map_urls.map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    const mapListChanged =
      normalizedMapUrls.length > 0 &&
      JSON.stringify(normalizedMapUrls) !== JSON.stringify(existingByIdMapUrls);

    if (
      normalizedMapUrl &&
      (
        normalizedMapUrl !== String(existingById.map_url || "").trim() ||
        mapListChanged
      )
    ) {

      const {
        data: updatedCustomer,
        error: updateError,
      } =
        await supabase
          .from("gmr_legacy_customers")
          .update({
            map_url:
              normalizedMapUrl,
            map_urls:
              normalizedMapUrls.length > 0
                ? normalizedMapUrls
                : (existingById.map_urls || []),
          })
          .eq(
            "id",
            normalizedLegacyCustomerId
          )
          .select()
          .single();

      if (updateError) {
        throw updateError;
      }

      customer =
        updatedCustomer;
    }


    return {
      created: false,
      duplicate: true,
      customer,
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
  } =
    await existingQuery
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

    let customer =
      existingRows[0];


    // ========================================
    // DUPLICATE แต่มี map_url ใหม่
    // → update record เดิม
    // ========================================

    const existingMapUrls = Array.isArray(customer.map_urls)
      ? customer.map_urls.map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    const duplicateMapListChanged =
      normalizedMapUrls.length > 0 &&
      JSON.stringify(normalizedMapUrls) !== JSON.stringify(existingMapUrls);

    if (
      normalizedMapUrl &&
      (
        normalizedMapUrl !== String(customer.map_url || "").trim() ||
        duplicateMapListChanged
      )
    ) {

      const {
        data: updatedCustomer,
        error: updateError,
      } =
        await supabase
          .from("gmr_legacy_customers")
          .update({
            map_url:
              normalizedMapUrl,
            map_urls:
              normalizedMapUrls.length > 0
                ? normalizedMapUrls
                : (customer.map_urls || []),
          })
          .eq(
            "id",
            customer.id
          )
          .select()
          .single();

      if (updateError) {
        throw updateError;
      }

      customer =
        updatedCustomer;
    }


    return {
      created: false,
      duplicate: true,
      customer,
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
            ? String(
                businessName
              ).trim()
            : null,

        map_url:
          normalizedMapUrl,

        map_urls:
          normalizedMapUrls,

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
            : Number(
                newReviewRate
              ),

        new_review_currency:
          String(
            newReviewCurrency ||
              "THB"
          )
            .trim()
            .toUpperCase(),

        old_review_rate:
          oldReviewRate === null ||
          oldReviewRate === undefined ||
          oldReviewRate === ""
            ? null
            : Number(
                oldReviewRate
              ),

        old_review_currency:
          String(
            oldReviewCurrency ||
              "THB"
          )
            .trim()
            .toUpperCase(),

        has_verified_payment:
          hasVerifiedPayment ===
          true,

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
// CLAIM LEGACY CUSTOMER AUTO MATCH
//
// ใช้ตอน Import จาก Google Sheet
//
// pending -> importing
//
// เจอ customer เดิมตรงกันเพียง 1 คน
// → claim สิทธิ์ก่อนสร้าง payment history
//
// ป้องกัน:
// - Import ซ้ำ
// - Request ซ้อน
// - จับ Legacy เดียวกันเข้าหลาย customer
// =========================================================

export async function claimLegacyCustomerAutoMatch({
  legacyCustomerId,
  customerId,
}) {
  if (!legacyCustomerId) {
    throw new Error(
      "Missing legacyCustomerId in claimLegacyCustomerAutoMatch"
    );
  }

  if (!customerId) {
    throw new Error(
      "Missing customerId in claimLegacyCustomerAutoMatch"
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

      match_status:
        "importing",
    })
    .eq(
      "id",
      legacyCustomerId
    )
    .eq(
      "match_status",
      "pending"
    )
    .is(
      "matched_customer_id",
      null
    )
    .select()
    .maybeSingle();

  if (error) {
    throw error;
  }

  // null =
  // มี request อื่น claim ไปแล้ว
  // หรือ Legacy ถูก match ไปแล้ว
  return data;
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

// =========================================================
// ROLLBACK LEGACY CUSTOMER AUTO MATCH
//
// importing -> pending
//
// ใช้เฉพาะ Auto Match จาก Google Sheet
// ถ้าระหว่างสร้าง historical job/payment/map เกิด error
// ให้กลับมา pending เพื่อ Import ใหม่ได้
// =========================================================

export async function rollbackLegacyCustomerAutoMatch(
  legacyCustomerId
) {
  if (!legacyCustomerId) {
    throw new Error(
      "Missing legacyCustomerId in rollbackLegacyCustomerAutoMatch"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_legacy_customers")
    .update({
      match_status:
        "pending",

      pending_customer_id:
        null,
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

// =========================================================
// WEBHOOK IDEMPOTENCY
// =========================================================
export async function claimWebhookEvent({
  platform,
  eventId,
  payload = null,
}) {
  const safePlatform = String(platform || "").trim();
  const safeEventId = String(eventId || "").trim();

  if (!safePlatform || !safeEventId) {
    return { claimed: true, skipped: true };
  }

  const { data, error } = await supabase
    .from("gmr_webhook_events")
    .insert({
      platform: safePlatform,
      event_id: safeEventId,
      payload,
      received_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { claimed: false, duplicate: true };
    }
    throw error;
  }

  return { claimed: true, id: data?.id || null };
}

// =========================================================
// UNKNOWN QUESTION / HUMAN ATTENTION DEDUPE
// =========================================================
export async function claimUnknownSalesQuestion({
  customerId,
  platform,
  state,
  message,
  reason,
  dedupeKey,
}) {
  if (!customerId || !dedupeKey) {
    return { claimed: true, skipped: true };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("gmr_sales_unknown_questions")
    .insert({
      customer_id: customerId,
      platform: platform || null,
      conversation_state: state || null,
      message_text: message || null,
      reason: reason || null,
      dedupe_key: dedupeKey,
      status: "open",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { claimed: false, duplicate: true };
    }
    throw error;
  }

  return { claimed: true, row: data };
}

export async function setUnknownSalesQuestionLineMessage({
  questionId,
  lineGroupMessageId,
}) {
  if (!questionId || !lineGroupMessageId) return null;
  const { data, error } = await supabase
    .from("gmr_sales_unknown_questions")
    .update({
      line_group_message_id: String(lineGroupMessageId),
      updated_at: new Date().toISOString(),
    })
    .eq("id", questionId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// =========================================================
// REACTIVATION HELPERS
// =========================================================
export async function getPendingReactivationAlertByCustomerId(customerId) {
  if (!customerId) return null;
  const { data, error } = await supabase
    .from("gmr_review_reactivation_alerts")
    .select("*")
    .eq("customer_id", customerId)
    .eq("review_status", "sent_to_customer")
    .order("customer_contacted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function updateReactivationAlertCustomerResponse({
  alertId,
  response,
  status,
}) {
  if (!alertId) throw new Error("Missing alertId");
  const allowed = ["customer_interested", "customer_declined", "waiting_price", "price_sent"];
  if (!allowed.includes(status)) throw new Error("Invalid reactivation customer status");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("gmr_review_reactivation_alerts")
    .update({
      customer_response: response || null,
      customer_responded_at: now,
      review_status: status,
      updated_at: now,
    })
    .eq("id", alertId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getCustomerMapById(customerMapId) {
  if (!customerMapId) return null;
  const { data, error } = await supabase
    .from("gmr_customer_maps")
    .select("*")
    .eq("id", customerMapId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// =========================================================
// FIND EXISTING CUSTOMERS FOR LEGACY AUTO MATCH
//
// ใช้:
// platform + display_name
//
// ไม่ใช้ platform_account เป็นเงื่อนไขบังคับ
// เพราะ customer เก่าบางรายอาจยังไม่มีค่า platform_account
//
// คืนเป็น array:
// 0 คน = ยังไม่เคยมี customer ในระบบ
// 1 คน = Auto Match ได้
// >1 คน = ต้องให้ทีมเลือก
// =========================================================

export async function findCustomersByPlatformAndDisplayName({
  platform,
  displayName,
}) {
  const safePlatform =
    String(platform || "")
      .trim()
      .toLowerCase();

  const safeDisplayName =
    String(displayName || "")
      .trim();

  if (
    !safePlatform ||
    !safeDisplayName
  ) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from("gmr_customers")
    .select("*")
    .eq(
      "platform",
      safePlatform
    )
    .ilike(
      "display_name",
      safeDisplayName
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


// =========================================================
// MANUAL CUSTOMER / SHEET EDITABLE SYNC HELPERS
// =========================================================

export async function findCustomerByPhoneOrEmail({
  phone = null,
  email = null,
}) {
  const safePhone = String(phone || "").trim();
  const safeEmail = String(email || "").trim().toLowerCase();

  if (!safePhone && !safeEmail) {
    return null;
  }

  if (safePhone) {
    const { data, error } = await supabase
      .from("gmr_customers")
      .select("*")
      .eq("phone", safePhone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (safeEmail) {
    const { data, error } = await supabase
      .from("gmr_customers")
      .select("*")
      .ilike("email", safeEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  return null;
}

export async function createManualCustomer({
  platformUserId,
  displayName = null,
  phone = null,
  email = null,
  language = "th",
  platformAccount = "manual_internal",
}) {
  if (!platformUserId) {
    throw new Error("Missing platformUserId in createManualCustomer");
  }

  const { data, error } = await supabase
    .from("gmr_customers")
    .insert({
      platform: "manual",
      platform_account: platformAccount,
      platform_user_id: String(platformUserId),
      display_name: displayName || null,
      phone: phone || null,
      email: email || null,
      language: language === "en" ? "en" : "th",
      customer_type: "new",
      source: "manual",
      customer_notify: false,
      transport_metadata: {},
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCustomerEditableFields({
  customerId,
  displayName,
  phone,
  email,
}) {
  if (!customerId) {
    throw new Error("Missing customerId in updateCustomerEditableFields");
  }

  const updates = {
    updated_at: new Date().toISOString(),
  };

  if (displayName !== undefined) {
    updates.display_name = String(displayName || "").trim() || null;
  }
  if (phone !== undefined) {
    updates.phone = String(phone || "").trim() || null;
  }
  if (email !== undefined) {
    updates.email = String(email || "").trim().toLowerCase() || null;
  }

  const { data, error } = await supabase
    .from("gmr_customers")
    .update(updates)
    .eq("id", customerId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateJobEditableFields({
  jobId,
  businessName,
  price,
  currency,
  reviewUrl,
}) {
  if (!jobId) {
    throw new Error("Missing jobId in updateJobEditableFields");
  }

  const updates = {
    updated_at: new Date().toISOString(),
  };

  if (businessName !== undefined) {
    updates.business_name = String(businessName || "").trim() || null;
  }

  if (price !== undefined) {
    const parsedPrice =
      price === "" || price === null
        ? null
        : Number(String(price).replace(/,/g, ""));

    if (
      parsedPrice !== null &&
      (!Number.isFinite(parsedPrice) || parsedPrice < 0)
    ) {
      throw new Error("Invalid price");
    }

    updates.price = parsedPrice;
  }

  if (currency !== undefined) {
    const safeCurrency = String(currency || "")
      .trim()
      .toUpperCase();

    updates.currency = safeCurrency || null;
  }

  if (reviewUrl !== undefined) {
    updates.review_url = String(reviewUrl || "").trim() || null;
  }

  const { data, error } = await supabase
    .from("gmr_jobs")
    .update(updates)
    .eq("id", jobId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function logSheetSyncChange({
  jobId = null,
  customerId = null,
  fieldName,
  oldValue = null,
  newValue = null,
}) {
  if (!fieldName) return null;

  const { data, error } = await supabase
    .from("gmr_sheet_sync_log")
    .insert({
      job_id: jobId || null,
      customer_id: customerId || null,
      field_name: fieldName,
      old_value: oldValue === undefined ? null : String(oldValue ?? ""),
      new_value: newValue === undefined ? null : String(newValue ?? ""),
      source: "google_sheet",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function upsertCustomerMapRecord({
  customerId,
  businessName = null,
  placeId = null,
  mapUrl = null,
  sourceReviewUrl = null,
}) {
  if (!customerId) {
    throw new Error("Missing customerId in upsertCustomerMapRecord");
  }

  const safePlaceId = String(placeId || "").trim();
  const safeReviewUrl = String(sourceReviewUrl || "").trim();

  if (!safePlaceId && !safeReviewUrl) {
    return null;
  }

  const mapKey = safePlaceId
    ? `place:${safePlaceId}`
    : `review:${safeReviewUrl}`;

  const payload = {
    customer_id: customerId,
    business_name: businessName || null,
    place_id: safePlaceId || null,
    map_url: mapUrl || null,
    source_review_url: safeReviewUrl || null,
    map_key: mapKey,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("gmr_customer_maps")
    .upsert(payload, {
      onConflict: "customer_id,map_key",
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCustomerTransportMetadata({
  customerId,
  platformAccount = null,
  transportMetadata = {},
}) {
  if (!customerId) {
    throw new Error("Missing customerId in updateCustomerTransportMetadata");
  }

  const updates = {
    updated_at: new Date().toISOString(),
  };

  if (platformAccount !== undefined) {
    updates.platform_account = platformAccount || null;
  }

  if (transportMetadata !== undefined) {
    updates.transport_metadata = transportMetadata || {};
  }

  const { data, error } = await supabase
    .from("gmr_customers")
    .update(updates)
    .eq("id", customerId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// =========================================================
// MONTHLY EXISTING CUSTOMER OUTREACH
//
// Existing customer = เคยมี payment_verified = true
//
// หลักการ:
// 1. ดึงลูกค้าที่เคยจ่ายเงินจริง
// 2. ตัดลูกค้าที่มีงานค้าง/กำลังดำเนินการ
// 3. ตัดลูกค้าที่ส่ง Monthly Outreach เดือนนี้แล้ว
// 4. ใช้ claim ก่อนส่งจริง เพื่อกันระบบยิงซ้ำ
// =========================================================

export async function getMonthlyOutreachCandidates({
  outreachMonth,
}) {
  const safeMonth =
    String(outreachMonth || "").trim();

  if (!safeMonth) {
    throw new Error(
      "Missing outreachMonth in getMonthlyOutreachCandidates"
    );
  }

  // =======================================================
  // 1. VERIFIED PAYMENTS
  // =======================================================

  const {
    data: verifiedPayments,
    error: paymentsError,
  } = await supabase
    .from("gmr_payments")
    .select(
      "job_id, verified_at, created_at"
    )
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
    !verifiedPayments ||
    verifiedPayments.length === 0
  ) {
    return [];
  }

  const paidJobIds = [
    ...new Set(
      verifiedPayments
        .map(
          (payment) =>
            payment.job_id
        )
        .filter(Boolean)
    ),
  ];

  if (
    paidJobIds.length === 0
  ) {
    return [];
  }

  // =======================================================
  // 2. หา CUSTOMER ที่เคยจ่ายเงินจริง
  // =======================================================

  const {
    data: paidJobs,
    error: paidJobsError,
  } = await supabase
    .from("gmr_jobs")
    .select(
      "id, customer_id"
    )
    .in(
      "id",
      paidJobIds
    );

  if (paidJobsError) {
    throw paidJobsError;
  }

  const paidCustomerIds = [
    ...new Set(
      (paidJobs || [])
        .map(
          (job) =>
            job.customer_id
        )
        .filter(Boolean)
    ),
  ];

  if (
    paidCustomerIds.length === 0
  ) {
    return [];
  }

  // =======================================================
  // 3. COOLDOWN 30 DAYS AFTER VERIFIED PAYMENT
  //
  // ถ้าลูกค้าเพิ่งชำระเงินจริงภายใน 30 วัน
  // ยังไม่ส่ง Monthly Outreach
  // =======================================================

  const paymentCooldownCutoff =
    Date.now() -
    30 * 24 * 60 * 60 * 1000;

  const recentPaidJobIds =
    new Set(
      (verifiedPayments || [])
        .filter(
          (payment) => {
            const paidAt =
              payment?.verified_at ||
              payment?.created_at;

            if (!paidAt) {
              return false;
            }

            const paidTime =
              new Date(
                paidAt
              ).getTime();

            return (
              Number.isFinite(
                paidTime
              ) &&
              paidTime >=
                paymentCooldownCutoff
            );
          }
        )
        .map(
          (payment) =>
            payment.job_id
        )
        .filter(Boolean)
    );

  const recentPaidCustomerIds =
    new Set(
      (paidJobs || [])
        .filter(
          (job) =>
            recentPaidJobIds.has(
              job.id
            )
        )
        .map(
          (job) =>
            job.customer_id
        )
        .filter(Boolean)
    );

  // =======================================================
  // 4. ตัดลูกค้าที่มีงานค้าง / งานกำลังดำเนินการ
  // =======================================================

  const activeStatuses = [
    "draft",
    "waiting_price",
    "waiting_confirm",
    "waiting_phone",
    "waiting_credit_approval",

    "existing_evidence_pending",
    "existing_evidence_failed",
    "existing_batch_draft",

    "queued",
    "dispatching",
    "processing",
    "removed",
    "waiting_payment",
    "removed_waiting_payment",
  ];

  const {
    data: activeJobs,
    error: activeJobsError,
  } = await supabase
    .from("gmr_jobs")
    .select(
      "customer_id, status"
    )
    .in(
      "customer_id",
      paidCustomerIds
    )
    .in(
      "status",
      activeStatuses
    );

  if (activeJobsError) {
    throw activeJobsError;
  }

  const activeCustomerIds =
    new Set(
      (activeJobs || [])
        .map(
          (job) =>
            job.customer_id
        )
        .filter(Boolean)
    );

  // =======================================================
  // 5. เดือนนี้เคยส่ง / เคย claim แล้วหรือยัง
  // =======================================================

  const {
    data: monthlyLogs,
    error: monthlyLogsError,
  } = await supabase
    .from(
      "gmr_monthly_outreach_log"
    )
    .select(
      "customer_id, outreach_month, status"
    )
    .eq(
      "outreach_month",
      safeMonth
    );

  if (monthlyLogsError) {
    throw monthlyLogsError;
  }

  const alreadyProcessedCustomerIds =
    new Set(
      (monthlyLogs || [])
        .map(
          (item) =>
            item.customer_id
        )
        .filter(Boolean)
    );

  // =======================================================
  // 6. CUSTOMER DATA
  // =======================================================

  const {
    data: customers,
    error: customersError,
  } = await supabase
    .from("gmr_customers")
    .select(
      "id, platform, platform_user_id, display_name, language"
    )
    .in(
      "id",
      paidCustomerIds
    );

  if (customersError) {
    throw customersError;
  }

  // =======================================================
  // 7. FINAL FILTER
  // =======================================================

  return (
    customers || []
  ).filter(
    (customer) => {

      if (!customer?.id) {
        return false;
      }

      // มีงานค้าง/กำลังดำเนินการ
      if (
        activeCustomerIds.has(
          customer.id
        )
      ) {
        return false;
      }

      // เพิ่งชำระเงินภายใน 30 วัน
      if (
        recentPaidCustomerIds.has(
          customer.id
        )
      ) {
        return false;
      }

      // เดือนนี้เคยส่งหรือ claim แล้ว
      if (
        alreadyProcessedCustomerIds.has(
          customer.id
        )
      ) {
        return false;
      }

      // ต้องมีช่องทางติดต่อ
      if (
        !customer.platform ||
        !customer.platform_user_id
      ) {
        return false;
      }

      return true;
    }
  );
}

// =========================================================
// CLAIM MONTHLY OUTREACH
//
// ต้อง Claim ก่อนส่งจริง
// UNIQUE(customer_id, outreach_month)
// จะช่วยกัน Cron/Request ซ้อนกันยิงลูกค้าซ้ำ
// =========================================================

export async function claimMonthlyOutreach({
  customerId,
  outreachMonth,
  platform,
  language,
  messageText,
}) {
  if (!customerId) {
    throw new Error(
      "Missing customerId in claimMonthlyOutreach"
    );
  }

  const safeMonth =
    String(outreachMonth || "").trim();

  if (!safeMonth) {
    throw new Error(
      "Missing outreachMonth in claimMonthlyOutreach"
    );
  }

  try {
    const {
      data,
      error,
    } = await supabase
      .from(
        "gmr_monthly_outreach_log"
      )
      .insert({
        customer_id:
          customerId,

        outreach_month:
          safeMonth,

        platform:
          platform || null,

        language:
          language === "en"
            ? "en"
            : "th",

        message_text:
          messageText || null,

        status:
          "processing",
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      claimed: true,
      log: data,
    };

  } catch (error) {

    // UNIQUE:
    // customer_id + outreach_month
    //
    // ถ้ามี request อื่น claim ไปก่อนแล้ว
    // ให้ข้าม ไม่ถือเป็น error

    if (
      error?.code === "23505"
    ) {
      return {
        claimed: false,
        reason:
          "already_claimed_this_month",
        log:
          null,
      };
    }

    throw error;
  }
}


// =========================================================
// COMPLETE MONTHLY OUTREACH
// =========================================================

export async function completeMonthlyOutreach({
  logId,
  status = "sent",
  errorMessage = null,
}) {
  if (!logId) {
    throw new Error(
      "Missing logId in completeMonthlyOutreach"
    );
  }

  const safeStatus =
    String(status || "")
      .trim()
      .toLowerCase();

  if (
    ![
      "sent",
      "failed",
      "skipped",
    ].includes(
      safeStatus
    )
  ) {
    throw new Error(
      "Invalid monthly outreach status"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from(
      "gmr_monthly_outreach_log"
    )
    .update({
      status:
        safeStatus,

      error_message:
        errorMessage
          ? String(errorMessage)
          : null,

      sent_at:
        safeStatus === "sent"
          ? new Date().toISOString()
          : null,
    })
    .eq(
      "id",
      logId
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

// =========================================================
// V2 SALES LEADS / SALES ORDER DRAFTS
// =========================================================

export async function getSalesLeadByCustomerId(customerId) {
  const { data, error } = await supabase
    .from("gmr_sales_leads")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getOrCreateSalesLead(customerId) {
  const existing = await getSalesLeadByCustomerId(customerId);
  if (existing) return existing;
  try {
    const { data, error } = await supabase
      .from("gmr_sales_leads")
      .insert({ customer_id: customerId, status: "open" })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    if (error?.code === "23505") {
      const raced = await getSalesLeadByCustomerId(customerId);
      if (raced) return raced;
    }
    throw error;
  }
}

export async function updateSalesLead(customerId, patch = {}) {
  const safePatch = { ...patch, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("gmr_sales_leads")
    .update(safePatch)
    .eq("customer_id", customerId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createSalesLeadCard({
  customerId,
  lineGroupMessageId,
  payload = null,
  inputType = null,
}) {
  const { data, error } = await supabase
    .from("gmr_sales_lead_cards")
    .insert({
      customer_id: customerId,
      line_group_message_id: String(lineGroupMessageId),
      payload,
      input_type: inputType,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSalesLeadCardByLineGroupMessageId(lineGroupMessageId) {
  if (!lineGroupMessageId) return null;
  const { data, error } = await supabase
    .from("gmr_sales_lead_cards")
    .select("*")
    .eq("line_group_message_id", String(lineGroupMessageId))
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createSalesOrderDraft({
  customerId,
  leadCardId = null,
  price,
  currency,
  reviewItems,
  createdByLineUserId = null,
}) {
  const { data, error } = await supabase
    .from("gmr_sales_order_drafts")
    .insert({
      customer_id: customerId,
      lead_card_id: leadCardId,
      price: Number(price),
      currency: String(currency || "THB").toUpperCase(),
      review_items: reviewItems || [],
      created_by_line_user_id: createdByLineUserId,
      status: "pending_confirmation",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setSalesOrderDraftPreviewMessage({ draftId, messageId }) {
  const { data, error } = await supabase
    .from("gmr_sales_order_drafts")
    .update({
      preview_line_group_message_id: String(messageId),
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSalesOrderDraftByPreviewMessageId(messageId) {
  if (!messageId) return null;
  const { data, error } = await supabase
    .from("gmr_sales_order_drafts")
    .select("*")
    .eq("preview_line_group_message_id", String(messageId))
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateSalesOrderDraft(draftId, patch = {}) {
  const { data, error } = await supabase
    .from("gmr_sales_order_drafts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", draftId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// =========================================================
// LEGACY MONITORING CUSTOMER
// Creates a durable customer shell so legacy Maps can be
// monitored before the customer ever messages the new bot.
// =========================================================

export async function getOrCreateLegacyMonitoringCustomer({
  legacyCustomerId,
  platform,
  platformUserId = null,
  platformAccount = null,
  displayName,
  language = "th",
}) {
  if (!legacyCustomerId) {
    throw new Error("Missing legacyCustomerId in getOrCreateLegacyMonitoringCustomer");
  }

  const safePlatform = String(platform || "legacy").trim().toLowerCase() || "legacy";
  const explicitPlatformUserId = String(platformUserId || "").trim();
  const placeholderPlatformUserId = `legacy:${legacyCustomerId}`;
  const targetPlatformUserId = explicitPlatformUserId || placeholderPlatformUserId;

  const existing = await getCustomerByPlatformUserId(
    safePlatform,
    targetPlatformUserId
  );

  if (existing) return existing;

  const { data, error } = await supabase
    .from("gmr_customers")
    .insert({
      platform: safePlatform,
      platform_account: platformAccount || null,
      platform_user_id: targetPlatformUserId,
      display_name: displayName || null,
      language: language === "en" ? "en" : "th",
      // Keep the DB enum/check-compatible value here.
      // Business "existing customer" status is derived from verified payment history,
      // not from gmr_customers.customer_type. Legacy import creates verified history below.
      customer_type: "new",
      source: "legacy_import",
      customer_notify: Boolean(explicitPlatformUserId),
      transport_metadata: {
        legacy_customer_id: String(legacyCustomerId),
        legacy_monitoring_shell: !explicitPlatformUserId,
      },
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    if (error?.code === "23505") {
      const raced = await getCustomerByPlatformUserId(
        safePlatform,
        targetPlatformUserId
      );
      if (raced) return raced;
    }
    throw error;
  }

  return data;
}

export async function findLegacyMonitoringCustomersByPlatformAndDisplayName({
  platform,
  displayName,
}) {
  const safePlatform = String(platform || "").trim().toLowerCase();
  const safeDisplayName = String(displayName || "").trim();

  if (!safePlatform || !safeDisplayName) return [];

  const { data, error } = await supabase
    .from("gmr_customers")
    .select("*")
    .eq("platform", safePlatform)
    .ilike("display_name", safeDisplayName)
    .like("platform_user_id", "legacy:%")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function attachLegacyMonitoringCustomer({
  customerId,
  platformUserId,
  displayName = null,
}) {
  if (!customerId) {
    throw new Error("Missing customerId in attachLegacyMonitoringCustomer");
  }
  if (!platformUserId) {
    throw new Error("Missing platformUserId in attachLegacyMonitoringCustomer");
  }

  const patch = {
    platform_user_id: String(platformUserId),
    customer_notify: true,
    updated_at: new Date().toISOString(),
  };

  if (displayName) {
    patch.display_name = String(displayName).trim();
  }

  const { data, error } = await supabase
    .from("gmr_customers")
    .update(patch)
    .eq("id", customerId)
    .like("platform_user_id", "legacy:%")
    .select()
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// =========================================================
// REMOVAL KPI BATCHES
// Durable aggregation by one review-monitor run.
// =========================================================

export async function upsertRemovalKpiBatch({
  batchId,
  detectedAt = null,
}) {
  if (!batchId) {
    throw new Error("Missing batchId in upsertRemovalKpiBatch");
  }

  const now = detectedAt || new Date().toISOString();

  const { data, error } = await supabase
    .from("gmr_removal_kpi_batches")
    .upsert(
      {
        batch_id: String(batchId),
        status: "pending",
        detected_at: now,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "batch_id",
        ignoreDuplicates: true,
      }
    )
    .select()
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function getJobsByRemovalDetectionBatchId(batchId) {
  if (!batchId) return [];

  const { data, error } = await supabase
    .from("gmr_jobs")
    .select("*")
    .eq("removal_detection_batch_id", String(batchId))
    .order("review_removed_detected_at", { ascending: true, nullsFirst: true });

  if (error) throw error;
  return data || [];
}

export async function claimRemovalKpiBatch(batchId) {
  if (!batchId) return null;

  const { data, error } = await supabase
    .from("gmr_removal_kpi_batches")
    .update({
      status: "sending",
      updated_at: new Date().toISOString(),
    })
    .eq("batch_id", String(batchId))
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function completeRemovalKpiBatch({
  batchId,
  t0Count,
  t2Count,
  totalCount,
  lineMessageId = null,
  status = "sent",
}) {
  if (!batchId) {
    throw new Error("Missing batchId in completeRemovalKpiBatch");
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("gmr_removal_kpi_batches")
    .update({
      status,
      t0_count: Number(t0Count || 0),
      t2_count: Number(t2Count || 0),
      total_count: Number(totalCount || 0),
      line_message_id: lineMessageId || null,
      sent_at: status === "sent" ? now : null,
      updated_at: now,
    })
    .eq("batch_id", String(batchId))
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function releaseRemovalKpiBatch(batchId) {
  if (!batchId) return null;

  const { data, error } = await supabase
    .from("gmr_removal_kpi_batches")
    .update({
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("batch_id", String(batchId))
    .eq("status", "sending")
    .select()
    .maybeSingle();

  if (error) throw error;
  return data || null;
}
