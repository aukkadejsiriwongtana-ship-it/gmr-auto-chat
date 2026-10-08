export const GMR_STATES = {
  NEW: "NEW",
  WAITING_MAP: "WAITING_MAP",
  MAP_FOUND_WAITING_CONFIRMATION: "MAP_FOUND_WAITING_CONFIRMATION",
  WAITING_REVIEW_SELECTION: "WAITING_REVIEW_SELECTION",
  WAITING_PRICE: "WAITING_PRICE",
  WAITING_CONFIRM: "WAITING_CONFIRM",
  WAITING_PHONE: "WAITING_PHONE",
  IN_PROGRESS: "IN_PROGRESS",
  REMOVED_WAITING_PAYMENT: "REMOVED_WAITING_PAYMENT",
  PAID: "PAID",
  HANDOFF: "HANDOFF",
};

export const GMR_REVIEW_CASES = {
  RECENT_REVIEW: "recent_review",
  OLD_REVIEW: "old_review",
  DIRECT_REVIEW: "direct_review",
  IMAGE_REVIEW: "image_review",
  HIDDEN_ONE_STAR: "hidden_one_star",
};

export const GMR_JOB_STATUS = {
  DRAFT: "draft",
  WAITING_PRICE: "waiting_price",
  WAITING_CONFIRM: "waiting_confirm",
  WAITING_PHONE: "waiting_phone",
  PROCESSING: "processing",
  REMOVED: "removed",
  WAITING_PAYMENT: "waiting_payment",
  PAID: "paid",
  CANCELLED: "cancelled",
  HANDOFF: "handoff",
};

export function isValidState(state) {
  return Object.values(GMR_STATES).includes(state);
}

export function isValidReviewCase(reviewCase) {
  return Object.values(GMR_REVIEW_CASES).includes(reviewCase);
}

export function isValidJobStatus(status) {
  return Object.values(GMR_JOB_STATUS).includes(status);
}

/**
 * บอกว่า state ปัจจุบันสามารถไป state ถัดไปได้หรือไม่
 * เพื่อป้องกัน flow กระโดดผิดขั้น
 */
const ALLOWED_TRANSITIONS = {
  [GMR_STATES.NEW]: [
    GMR_STATES.WAITING_MAP,
    GMR_STATES.HANDOFF,
  ],

  [GMR_STATES.WAITING_MAP]: [
    GMR_STATES.MAP_FOUND_WAITING_CONFIRMATION,
    GMR_STATES.WAITING_REVIEW_SELECTION,
    GMR_STATES.WAITING_PRICE,
    GMR_STATES.HANDOFF,
  ],

  [GMR_STATES.MAP_FOUND_WAITING_CONFIRMATION]: [
    GMR_STATES.WAITING_REVIEW_SELECTION,
    GMR_STATES.WAITING_PRICE,
    GMR_STATES.HANDOFF,
  ],

  [GMR_STATES.WAITING_REVIEW_SELECTION]: [
    GMR_STATES.WAITING_PRICE,
    GMR_STATES.HANDOFF,
  ],

  [GMR_STATES.WAITING_PRICE]: [
    GMR_STATES.WAITING_CONFIRM,
    GMR_STATES.HANDOFF,
  ],

  [GMR_STATES.WAITING_CONFIRM]: [
    GMR_STATES.WAITING_PHONE,
    GMR_STATES.HANDOFF,
  ],

  [GMR_STATES.WAITING_PHONE]: [
    GMR_STATES.IN_PROGRESS,
    GMR_STATES.HANDOFF,
  ],

  [GMR_STATES.IN_PROGRESS]: [
    GMR_STATES.REMOVED_WAITING_PAYMENT,
    GMR_STATES.HANDOFF,
  ],

  [GMR_STATES.REMOVED_WAITING_PAYMENT]: [
    GMR_STATES.PAID,
    GMR_STATES.HANDOFF,
  ],

  [GMR_STATES.PAID]: [
    GMR_STATES.WAITING_MAP,
    GMR_STATES.HANDOFF,
  ],

  [GMR_STATES.HANDOFF]: [
    GMR_STATES.WAITING_MAP,
    GMR_STATES.WAITING_PRICE,
    GMR_STATES.WAITING_CONFIRM,
    GMR_STATES.WAITING_PHONE,
    GMR_STATES.IN_PROGRESS,
    GMR_STATES.REMOVED_WAITING_PAYMENT,
    GMR_STATES.PAID,
  ],
};

export function canTransition(fromState, toState) {
  if (!isValidState(fromState) || !isValidState(toState)) {
    return false;
  }

  if (fromState === toState) {
    return true;
  }

  const allowed = ALLOWED_TRANSITIONS[fromState] || [];

  return allowed.includes(toState);
}

/**
 * helper สำหรับเปลี่ยน state แบบตรวจสอบก่อน
 */
export function transitionState(fromState, toState) {
  if (!isValidState(fromState)) {
    throw new Error(`Invalid current GMR state: ${fromState}`);
  }

  if (!isValidState(toState)) {
    throw new Error(`Invalid target GMR state: ${toState}`);
  }

  if (!canTransition(fromState, toState)) {
    throw new Error(
      `GMR state transition not allowed: ${fromState} -> ${toState}`
    );
  }

  return toState;
}

/**
 * State เริ่มต้นของลูกค้าใหม่
 */
export function getInitialState() {
  return GMR_STATES.NEW;
}

/**
 * ระบุว่าต้องหยุด bot และรอคนหรือไม่
 */
export function isHandoffState(state) {
  return state === GMR_STATES.HANDOFF;
}

/**
 * ระบุว่า bot กำลังรอ action อะไรจากลูกค้า
 */
export function getExpectedInputForState(state) {
  switch (state) {
    case GMR_STATES.NEW:
      return "initial_message";

    case GMR_STATES.WAITING_MAP:
      return "map_url_review_url_business_name_or_review_image";

    case GMR_STATES.MAP_FOUND_WAITING_CONFIRMATION:
      return "map_confirmation";

    case GMR_STATES.WAITING_REVIEW_SELECTION:
      return "review_selection";

    case GMR_STATES.WAITING_PRICE:
      return "sales_quote";

    case GMR_STATES.WAITING_CONFIRM:
      return "customer_confirmation";

    case GMR_STATES.WAITING_PHONE:
      return "phone_number";

    case GMR_STATES.IN_PROGRESS:
      return "review_status_update";

    case GMR_STATES.REMOVED_WAITING_PAYMENT:
      return "payment_slip_or_payment_question";

    case GMR_STATES.PAID:
      return "new_job_or_general_message";

    case GMR_STATES.HANDOFF:
      return "human_agent";

    default:
      return "unknown";
  }
}

/**
 * review case ไปจบที่ state ไหน
 */
export function getNextStateFromReviewCase(reviewCase) {
  switch (reviewCase) {
    case GMR_REVIEW_CASES.RECENT_REVIEW:
      return GMR_STATES.WAITING_REVIEW_SELECTION;

    case GMR_REVIEW_CASES.OLD_REVIEW:
      return GMR_STATES.WAITING_PRICE;

    case GMR_REVIEW_CASES.DIRECT_REVIEW:
      return GMR_STATES.WAITING_PRICE;

    case GMR_REVIEW_CASES.IMAGE_REVIEW:
      return GMR_STATES.MAP_FOUND_WAITING_CONFIRMATION;

    case GMR_REVIEW_CASES.HIDDEN_ONE_STAR:
      return GMR_STATES.WAITING_PRICE;

    default:
      throw new Error(`Unknown review case: ${reviewCase}`);
  }
}

/**
 * ใช้ตอนเซลล์เสนอราคาแล้ว
 */
export function getStateAfterQuote() {
  return GMR_STATES.WAITING_CONFIRM;
}

/**
 * ใช้ตอนลูกค้ายืนยัน
 */
export function getStateAfterCustomerConfirm() {
  return GMR_STATES.WAITING_PHONE;
}

/**
 * ใช้ตอนรับเบอร์แล้ว
 */
export function getStateAfterPhoneReceived() {
  return GMR_STATES.IN_PROGRESS;
}

/**
 * ใช้ตอนรีวิวถูกนำออก
 */
export function getStateAfterRemoved() {
  return GMR_STATES.REMOVED_WAITING_PAYMENT;
}

/**
 * ใช้ตอนชำระเสร็จ
 */
export function getStateAfterPaid() {
  return GMR_STATES.PAID;
}
