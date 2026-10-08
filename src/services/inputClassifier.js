export const INPUT_TYPES = {
  MAP_URL: "MAP_URL",
  REVIEW_URL: "REVIEW_URL",
  BUSINESS_NAME: "BUSINESS_NAME",
  TEXT: "TEXT",
  IMAGE_REVIEW: "IMAGE_REVIEW",
  UNKNOWN: "UNKNOWN",
};

function isGoogleMapsUrl(text) {
  if (!text) return false;

  const value = text.toLowerCase();

  return (
    value.includes("maps.app.goo.gl") ||
    value.includes("google.com/maps") ||
    value.includes("goo.gl/maps")
  );
}

function looksLikeReviewUrl(text) {
  if (!text) return false;

  const value = text.toLowerCase();

  // ตอนนี้ใช้ heuristic ก่อน
  // เดี๋ยว Step ถัดไปจะ resolve URL จริงอีกชั้น
  return (
    isGoogleMapsUrl(value) &&
    (
      value.includes("review") ||
      value.includes("reviews") ||
      value.includes("place")
    )
  );
}

function looksLikeBusinessName(text) {
  if (!text) return false;

  const trimmed = text.trim();

  if (trimmed.length < 3) {
    return false;
  }

  // มี URL ไม่ถือเป็นชื่อธุรกิจ
  if (
    trimmed.includes("http://") ||
    trimmed.includes("https://")
  ) {
    return false;
  }

  // ข้อความสั้นมาก ๆ อย่าง "สนใจครับ" ไม่ใช่ชื่อธุรกิจ
  const commonMessages = [
    "สนใจ",
    "สนใจครับ",
    "สนใจค่ะ",
    "ราคาเท่าไหร่",
    "กี่วัน",
    "สวัสดี",
    "ครับ",
    "ค่ะ",
    "ok",
    "okay",
    "yes",
  ];

  const lower = trimmed.toLowerCase();

  if (
    commonMessages.some(
      (item) => lower === item.toLowerCase()
    )
  ) {
    return false;
  }

  return true;
}

export function classifyInput({
  messageType = "text",
  text = "",
}) {

  if (messageType === "image") {
    return {
      type: INPUT_TYPES.IMAGE_REVIEW,
      confidence: 1,
    };
  }

  const value = String(text || "").trim();

  if (!value) {
    return {
      type: INPUT_TYPES.UNKNOWN,
      confidence: 0,
    };
  }

  if (looksLikeReviewUrl(value)) {
    return {
      type: INPUT_TYPES.REVIEW_URL,
      confidence: 0.75,
    };
  }

  if (isGoogleMapsUrl(value)) {
    return {
      type: INPUT_TYPES.MAP_URL,
      confidence: 0.95,
    };
  }

  if (looksLikeBusinessName(value)) {
    return {
      type: INPUT_TYPES.BUSINESS_NAME,
      confidence: 0.6,
    };
  }

  return {
    type: INPUT_TYPES.TEXT,
    confidence: 0.5,
  };
}
