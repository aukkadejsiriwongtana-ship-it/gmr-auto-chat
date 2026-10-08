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
