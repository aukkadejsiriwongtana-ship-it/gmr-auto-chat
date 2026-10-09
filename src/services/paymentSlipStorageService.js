import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error(
    "Missing SUPABASE_URL"
  );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

const BUCKET_NAME =
  "gmr-payment-slips";


export async function uploadPaymentSlip({
  buffer,
  contentType,
  customerId,
  jobId,
  messageId,
}) {
  if (!buffer) {
    throw new Error(
      "Missing payment slip buffer"
    );
  }

  const extension =
    contentType === "image/png"
      ? "png"
      : "jpg";

  const filePath = [
    String(customerId),
    String(jobId),
    `${String(messageId)}.${extension}`,
  ].join("/");


  const {
    error: uploadError,
  } =
    await supabase.storage
      .from(BUCKET_NAME)
      .upload(
        filePath,
        buffer,
        {
          contentType:
            contentType ||
            "image/jpeg",

          upsert:
            false,
        }
      );


  if (uploadError) {
    throw uploadError;
  }


  const {
    data,
    error:
      signedUrlError,
  } =
    await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(
        filePath,
        60 * 60
      );


  if (signedUrlError) {
    throw signedUrlError;
  }


  if (!data?.signedUrl) {
    throw new Error(
      "Failed to create signed URL"
    );
  }


  return {
    filePath,
    signedUrl:
      data.signedUrl,
  };
}

export async function deletePaymentSlip(
  filePath
) {
  if (!filePath) {
    return {
      deleted: false,
      reason: "NO_FILE_PATH",
    };
  }

  const { error } =
    await supabase.storage
      .from(BUCKET_NAME)
      .remove([
        filePath,
      ]);

  if (error) {
    throw error;
  }

  return {
    deleted: true,
    filePath,
  };
}
