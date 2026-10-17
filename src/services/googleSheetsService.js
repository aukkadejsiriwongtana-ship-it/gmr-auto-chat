const GOOGLE_SHEETS_WEBHOOK_URL =
  process.env.GOOGLE_SHEETS_WEBHOOK_URL;

const GOOGLE_SHEETS_WEBHOOK_SECRET =
  process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;

if (!GOOGLE_SHEETS_WEBHOOK_URL) {
  throw new Error("Missing GOOGLE_SHEETS_WEBHOOK_URL");
}

if (!GOOGLE_SHEETS_WEBHOOK_SECRET) {
  throw new Error("Missing GOOGLE_SHEETS_WEBHOOK_SECRET");
}

async function postToSheet(payload) {
  const response = await fetch(
    GOOGLE_SHEETS_WEBHOOK_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: GOOGLE_SHEETS_WEBHOOK_SECRET,
        ...payload,
      }),
      redirect: "follow",
    }
  );

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid Google Sheets response: ${text}`
    );
  }

  if (!response.ok || data?.ok !== true) {
    throw new Error(
      data?.error ||
      `Google Sheets webhook failed (${response.status})`
    );
  }

  return data;
}

export async function appendJobToGoogleSheet({
  jobId,
  customerId,
  customerName = "",
  platform = "",
  phone = "",
  businessName = "",
  reviewUrl = "",
  price = "",
  status = "",
  startedAt = "",
  removedAt = "",
  paidAt = "",
  email = "",
  currency = "",
  source = "",
  customerNotify = "",
}) {
  return postToSheet({
    action: "append",
    jobId,
    customerId,
    customerName,
    platform,
    phone,
    businessName,
    reviewUrl,
    price,
    status,
    startedAt,
    removedAt,
    paidAt,
    email,
    currency,
    source,
    customerNotify,
  });
}

export async function appendDispatchJobToGoogleSheet({
  sheetName,
  dispatchRoundId = "",
  sentAt = "",
  batchId = "",
  jobId,
  customerName = "",
  mapName = "",
  reviewUrl = "",
  reviewAge = "",
  startedAt = "",
  status = "",
  removedAt = "",
  cycleCompleted = "",
  elapsedTime = "",
}) {
  if (!sheetName) {
    throw new Error(
      "Missing sheetName in appendDispatchJobToGoogleSheet"
    );
  }

  if (!jobId) {
    throw new Error(
      "Missing jobId in appendDispatchJobToGoogleSheet"
    );
  }

  return postToSheet({
    action: "dispatch_append",
    sheetName,
    dispatchRoundId,
    sentAt,
    batchId,
    jobId,
    customerName,
    mapName,
    reviewUrl,
    reviewAge,
    startedAt,
    status,
    removedAt,
    cycleCompleted,
    elapsedTime,
  });
}

// =========================================================
// ACTIVE DEPARTMENT SHEET UPDATE
// Used when a removal is human-confirmed but payment is still pending.
// The row stays in T0_ACTIVE/T2_ACTIVE, only its status/removed time changes.
// =========================================================
export async function updateDispatchJobInGoogleSheet({
  sheetName,
  jobId,
  status,
  removedAt = "",
}) {
  if (!sheetName) {
    throw new Error(
      "Missing sheetName in updateDispatchJobInGoogleSheet"
    );
  }

  if (!jobId) {
    throw new Error(
      "Missing jobId in updateDispatchJobInGoogleSheet"
    );
  }

  return postToSheet({
    action: "dispatch_update",
    sheetName,
    jobId,
    status,
    removedAt,
  });
}

// =========================================================
// ACTIVE -> DONE
// Called only after payment has been verified / manually marked paid.
// Google Apps Script performs an idempotent move by Job ID.
// =========================================================
export async function moveDispatchJobToDoneGoogleSheet({
  sourceSheetName,
  doneSheetName,
  jobId,
  paidAt,
  completedAt = paidAt,
  removedAt = "",
  price = "",
  currency = "",
}) {
  if (!sourceSheetName) {
    throw new Error(
      "Missing sourceSheetName in moveDispatchJobToDoneGoogleSheet"
    );
  }

  if (!doneSheetName) {
    throw new Error(
      "Missing doneSheetName in moveDispatchJobToDoneGoogleSheet"
    );
  }

  if (!jobId) {
    throw new Error(
      "Missing jobId in moveDispatchJobToDoneGoogleSheet"
    );
  }

  return postToSheet({
    action: "dispatch_move_done",
    sourceSheetName,
    doneSheetName,
    jobId,
    paidAt,
    completedAt,
    removedAt,
    price,
    currency,
  });
}

export async function updateJobInGoogleSheet({
  jobId,
  status,
  removedAt = "",
  paidAt = "",
  customerName,
  phone,
  businessName,
  reviewUrl,
  price,
  email,
  currency,
  source,
  customerNotify,
}) {
  return postToSheet({
    action: "update",
    jobId,
    status,
    removedAt,
    paidAt,
    customerName,
    phone,
    businessName,
    reviewUrl,
    price,
    email,
    currency,
    source,
    customerNotify,
  });
}
