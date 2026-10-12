const GOOGLE_SHEETS_WEBHOOK_URL =
  process.env.GOOGLE_SHEETS_WEBHOOK_URL;

const GOOGLE_SHEETS_WEBHOOK_SECRET =
  process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;

if (!GOOGLE_SHEETS_WEBHOOK_URL) {
  throw new Error(
    "Missing GOOGLE_SHEETS_WEBHOOK_URL"
  );
}

if (!GOOGLE_SHEETS_WEBHOOK_SECRET) {
  throw new Error(
    "Missing GOOGLE_SHEETS_WEBHOOK_SECRET"
  );
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
}) {
  const payload = {
    secret:
      GOOGLE_SHEETS_WEBHOOK_SECRET,

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
  };

  const response = await fetch(
    GOOGLE_SHEETS_WEBHOOK_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body:
        JSON.stringify(payload),
      redirect: "follow",
    }
  );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid Google Sheets response: ${text}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      "Google Sheets webhook failed"
    );
  }

  if (data.ok !== true) {
    throw new Error(
      data?.error ||
      "Google Sheets webhook returned failure"
    );
  }

  return data;
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

  const payload = {
    secret:
      GOOGLE_SHEETS_WEBHOOK_SECRET,

    action:
      "dispatch_append",

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
  };

  const response =
    await fetch(
      GOOGLE_SHEETS_WEBHOOK_URL,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(payload),

        redirect:
          "follow",
      }
    );


  const text =
    await response.text();


  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid Google Sheets response: ${text}`
    );
  }


  if (!response.ok) {
    throw new Error(
      data?.error ||
      "Google Sheets dispatch append failed"
    );
  }


  if (data.ok !== true) {
    throw new Error(
      data?.error ||
      "Google Sheets dispatch append returned failure"
    );
  }


  return data;
}

export async function updateJobInGoogleSheet({
  jobId,
  status,
  removedAt = "",
  paidAt = "",
}) {
  const payload = {
    secret:
      GOOGLE_SHEETS_WEBHOOK_SECRET,

    action:
      "update",

    jobId,

    status,

    removedAt,

    paidAt,
  };

  const response = await fetch(
    GOOGLE_SHEETS_WEBHOOK_URL,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body:
        JSON.stringify(payload),
      redirect:
        "follow",
    }
  );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid Google Sheets response: ${text}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      "Google Sheets update failed"
    );
  }

  if (data.ok !== true) {
    throw new Error(
      data?.error ||
      "Google Sheets update returned failure"
    );
  }

  return data;
}
