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
  const existing = await getCustomerByPlatformUserId(
    platform,
    platformUserId
  );

  if (existing) {
    return existing;
  }

  return createCustomer({
    platform,
    platformUserId,
    displayName,
    language,
  });
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
    await getConversationByCustomerId(customerId);

  if (existing) {
    return existing;
  }

  return createConversation(customerId);
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
