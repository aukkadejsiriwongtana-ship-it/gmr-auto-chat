import "dotenv/config";
import express from "express";

import {
  appendJobToGoogleSheet,
} from "./services/googleSheetsService.js";

import {
  getCustomerByPlatformUserId,
  getConversationByCustomerId,
  getOrCreateCustomer,
  getOrCreateConversation,
  getTemplate,
  saveMessage,
  updateConversationState,
  updateLastUserMessage,
  updateLastBotMessage,
  createJob,
  getLatestJobByCustomerId,
  updateJob,
  saveReviewCandidate,
  getReviewCandidatesByJobId,
  selectReviewCandidate,
  createQuote,
  updateQuote,
  updateCustomerPhone,
} from "./repositories/gmrRepository.js";

import {
  GMR_STATES,
  transitionState,
} from "./flows/gmrStateMachine.js";

import {
  classifyInput,
  INPUT_TYPES,
} from "./services/inputClassifier.js";

import {
  searchPlaceByText,
} from "./services/googleMapsService.js";

import {
  getPlaceReviews,
} from "./services/googleReviewService.js";

import {
  getNewestReviews,
  getLowestReviews,
  getRecentReviews,
  getOneStarReviews,
} from "./services/reviewProvider.js";



const app = express();
const PORT = process.env.PORT || 10000;
app.use(express.json());

// =========================================================
// HEALTH CHECK
// =========================================================

app.get("/", async (req, res) => {
  res.status(200).json({
    ok: true,
    service: "gmr-auto-chat",
  });
});


// =========================================================
// SUPABASE TEST
// =========================================================

app.get("/test-supabase", async (req, res) => {
  try {
    const customer = await getOrCreateCustomer({
      platform: "line",
      platformUserId: "TEST_USER_001",
      displayName: "Test User",
      language: "th",
    });

    const conversation =
      await getOrCreateConversation(customer.id);

    const template = await getTemplate(
      "welcome",
      "th"
    );

    res.status(200).json({
      ok: true,
      customer,
      conversation,
      template,
    });

  } catch (error) {
    console.error("SUPABASE TEST ERROR:", error);

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});


// =========================================================
// CORE TEST MESSAGE HANDLER
// =========================================================

async function processTestMessage({
  platform,
  platformUserId,
  message,
  messageType = "text",
  displayName = "Test User",
}) {

  if (!platform) {
    throw new Error("Missing platform");
  }

  if (!platformUserId) {
    throw new Error("Missing platformUserId");
  }

  if (!message && messageType === "text") {
    throw new Error("Missing message");
  }


  // -------------------------------------------------------
  // 1. CUSTOMER
  // -------------------------------------------------------

  const customer = await getOrCreateCustomer({
    platform,
    platformUserId,
    displayName,
    language: "th",
  });


  // -------------------------------------------------------
  // 2. CONVERSATION
  // -------------------------------------------------------

  const conversation =
    await getOrCreateConversation(customer.id);


  // -------------------------------------------------------
  // 3. SAVE INBOUND MESSAGE
  // -------------------------------------------------------

  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "inbound",
    messageType,
    messageText: message || null,
  });


  if (message) {
    await updateLastUserMessage(
      customer.id,
      message
    );
  }


  // -------------------------------------------------------
  // 4. HANDOFF CHECK
  // -------------------------------------------------------

  if (
    conversation.handoff === true ||
    conversation.state === GMR_STATES.HANDOFF
  ) {
    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      handoff: true,
      botReply: null,
      note:
        "Conversation is currently in human handoff mode",
    };
  }


  // -------------------------------------------------------
  // 5. NEW CUSTOMER
  // -------------------------------------------------------

  if (conversation.state === GMR_STATES.NEW) {

    const template = await getTemplate(
      "welcome",
      customer.language || "th"
    );

    if (!template) {
      throw new Error(
        "Welcome template not found"
      );
    }

    const botReply = template.content;

    const nextState = transitionState(
      conversation.state,
      GMR_STATES.WAITING_MAP
    );

    await updateConversationState({
      customerId: customer.id,
      state: nextState,
      handoff: false,
      handoffReason: null,
    });

    await saveMessage({
      customerId: customer.id,
      platform,
      direction: "outbound",
      messageType: "text",
      messageText: botReply,
    });

    await updateLastBotMessage(
      customer.id,
      botReply
    );

    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: nextState,
      inputType: null,
      botReply,
    };
  }


  // -------------------------------------------------------
  // 6. WAITING_MAP
  // -------------------------------------------------------

  if (
    conversation.state ===
    GMR_STATES.WAITING_MAP
  ) {

    const classification = classifyInput({
      messageType,
      text: message || "",
    });


    // -----------------------------------------------------
    // MAP URL
    // -----------------------------------------------------

    if (
      classification.type ===
      INPUT_TYPES.MAP_URL
    ) {
      return {
        ok: true,
        customerId: customer.id,
        stateBefore: conversation.state,
        stateAfter: conversation.state,
        inputType: classification.type,
        confidence: classification.confidence,
        botReply: null,
        nextAction:
          "MAP_LOOKUP_FLOW_3_1",
      };
    }


    // -----------------------------------------------------
    // REVIEW URL
    // -----------------------------------------------------

    if (
      classification.type ===
      INPUT_TYPES.REVIEW_URL
    ) {
      return {
        ok: true,
        customerId: customer.id,
        stateBefore: conversation.state,
        stateAfter: conversation.state,
        inputType: classification.type,
        confidence: classification.confidence,
        botReply: null,
        nextAction:
          "DIRECT_REVIEW_FLOW_3_2",
      };
    }


    // -----------------------------------------------------
    // IMAGE REVIEW
    // -----------------------------------------------------

    if (
      classification.type ===
      INPUT_TYPES.IMAGE_REVIEW
    ) {
      return {
        ok: true,
        customerId: customer.id,
        stateBefore: conversation.state,
        stateAfter: conversation.state,
        inputType: classification.type,
        confidence: classification.confidence,
        botReply: null,
        nextAction:
          "IMAGE_REVIEW_FLOW_3_3",
      };
    }


    // -----------------------------------------------------
    // BUSINESS NAME
    // -----------------------------------------------------

    if (
  classification.type ===
  INPUT_TYPES.BUSINESS_NAME
) {

  // 1. ค้นชื่อธุรกิจใน Google Places
  const places =
    await searchPlaceByText(message);

  // หาไม่เจอ
  if (!places.length) {

    const botReply =
      "ยังหา Google Map จากชื่อนี้ไม่เจอครับ รบกวนส่งชื่อธุรกิจให้ละเอียดขึ้น หรือส่งลิงก์ Google Map มาได้เลยครับ";

    await saveMessage({
      customerId: customer.id,
      platform,
      direction: "outbound",
      messageType: "text",
      messageText: botReply,
    });

    await updateLastBotMessage(
      customer.id,
      botReply
    );

    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      inputType: classification.type,
      botReply,
      placeFound: false,
    };
  }


  // 2. ตอนนี้เลือกผลลัพธ์อันดับแรกจาก Google
  const place = places[0];


  // 3. ดึง Template "ใช่ Google Map นี้ไหมครับ"
  const template =
    await getTemplate(
      "confirm_map",
      customer.language || "th"
    );

  if (!template) {
    throw new Error(
      "confirm_map template not found"
    );
  }


  // 4. แทน {{map_url}} ด้วย URL จริง
  const botReply =
    template.content.replace(
      "{{map_url}}",
      place.mapUrl
    );


  // 5. สร้าง Draft Job เก็บข้อมูล Map ไว้
  const job = await createJob({
    customerId: customer.id,
    businessName:
      place.businessName,
    placeId:
      place.placeId,
    mapUrl:
      place.mapUrl,
    status: "draft",
  });


  // 6. เปลี่ยน State
  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES.MAP_FOUND_WAITING_CONFIRMATION
    );


  await updateConversationState({
    customerId: customer.id,
    state: nextState,
    handoff: false,
    handoffReason: null,
  });


  // 7. บันทึกข้อความ Bot
  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "outbound",
    messageType: "text",
    messageText: botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  // 8. ส่งผลกลับ
  return {
    ok: true,

    customerId:
      customer.id,

    jobId:
      job.id,

    stateBefore:
      conversation.state,

    stateAfter:
      nextState,

    inputType:
      classification.type,

    placeFound: true,

    place: {
      placeId:
        place.placeId,

      businessName:
        place.businessName,

      formattedAddress:
        place.formattedAddress,

      mapUrl:
        place.mapUrl,

      rating:
        place.rating,

      userRatingCount:
        place.userRatingCount,
    },

    botReply,
  };
}


    // -----------------------------------------------------
    // OTHER TEXT
    // -----------------------------------------------------

    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      inputType: classification.type,
      confidence: classification.confidence,
      botReply: null,
      nextAction:
        "FAQ_OR_GENERAL_TEXT",
    };
  }

// -------------------------------------------------------
// 7. MAP_FOUND_WAITING_CONFIRMATION
// -------------------------------------------------------

if (
  conversation.state ===
  GMR_STATES.MAP_FOUND_WAITING_CONFIRMATION
) {
  const normalized = String(message || "")
    .trim()
    .toLowerCase();

  const yesWords = [
    "ใช่",
    "ใช่ครับ",
    "ใช่ค่ะ",
    "ถูกต้อง",
    "ถูกครับ",
    "ถูกค่ะ",
    "yes",
    "y",
    "yeah",
    "yep",
    "ok",
    "okay",
  ];

  const noWords = [
    "ไม่ใช่",
    "ไม่ใช่ครับ",
    "ไม่ใช่ค่ะ",
    "ผิด",
    "ผิดร้าน",
    "no",
    "n",
    "nope",
  ];

  const isYes = yesWords.includes(normalized);
  const isNo = noWords.includes(normalized);

  // -----------------------------------------------------
  // ลูกค้าตอบ "ใช่"
  // -----------------------------------------------------

  if (isYes) {

  // -----------------------------------------------------
  // 1. หา Job ล่าสุดของลูกค้า
  // -----------------------------------------------------

  const latestJob =
    await getLatestJobByCustomerId(
      customer.id
    );

  if (!latestJob) {
    throw new Error(
      "No job found for confirmed map"
    );
  }

  if (!latestJob.place_id) {
    throw new Error(
      "Job has no place_id"
    );
  }


  // -----------------------------------------------------
  // 2. ตรวจรีวิวล่าสุด
  // -----------------------------------------------------

  const newestResult =
    await getNewestReviews(
      latestJob.place_id
    );

  const recentReviews =
    getRecentReviews(
      newestResult.reviews,
      14
    );


  // -----------------------------------------------------
  // 3. ถ้ามีรีวิวใหม่ <= 14 วัน
  // → Script 2
  // → WAITING_REVIEW_SELECTION
  // -----------------------------------------------------

  if (recentReviews.length > 0) {

    const template =
      await getTemplate(
        "script_2_recent_reviews",
        customer.language || "th"
      );

    if (!template) {
      throw new Error(
        "script_2_recent_reviews template not found"
      );
    }


    let botReply =
      template.content.replace(
        "{{review_count}}",
        String(
          recentReviews.length
        )
      );


    // ต่อท้ายลิงก์รีวิวทุกอัน
    const reviewLines =
      recentReviews
        .map(
          (review, index) => {

            const reviewer =
              review.reviewerName ||
              "ไม่ทราบชื่อ";

            const rating =
              review.rating ||
              "-";

            const dateText =
              review.dateText ||
              "";

            const reviewUrl =
              review.reviewUrl ||
              "";

            return [
              `${index + 1}. ${reviewer}`,
              `⭐ ${rating}`,
              dateText,
              reviewUrl,
            ]
              .filter(Boolean)
              .join("\n");
          }
        )
        .join("\n\n");


    if (reviewLines) {
      botReply +=
        `\n\n${reviewLines}`;
    }


    // บันทึก reviews ลง DB
    for (
      const review of recentReviews
    ) {
      await saveReviewCandidate({
        customerId:
          customer.id,

        jobId:
          latestJob.id,

        businessName:
          latestJob.business_name,

        placeId:
          latestJob.place_id,

        mapUrl:
          latestJob.map_url,

        reviewerName:
          review.reviewerName,

        rating:
          review.rating,

        reviewText:
          review.text,

        reviewDate:
          review.isoDate,

        reviewUrl:
          review.reviewUrl,

        providerReviewId:
          review.reviewId,

        isRecent: true,

        isVisible: true,

        hasText:
          Boolean(
            review.text &&
            review.text.trim()
          ),
      });
    }


    const nextState =
      transitionState(
        conversation.state,
        GMR_STATES.WAITING_REVIEW_SELECTION
      );


    await updateConversationState({
      customerId:
        customer.id,

      state:
        nextState,

      handoff:
        false,

      handoffReason:
        null,
    });


    await updateJob(
      latestJob.id,
      {
        review_case:
          "recent_review",

        status:
          "draft",
      }
    );


    await saveMessage({
      customerId:
        customer.id,

      platform,

      direction:
        "outbound",

      messageType:
        "text",

      messageText:
        botReply,
    });


    await updateLastBotMessage(
      customer.id,
      botReply
    );


    return {
      ok: true,

      customerId:
        customer.id,

      jobId:
        latestJob.id,

      stateBefore:
        conversation.state,

      stateAfter:
        nextState,

      mapConfirmed:
        true,

      reviewCase:
        "recent_review",

      recentCount:
        recentReviews.length,

      botReply,
    };
  }


  // -----------------------------------------------------
  // 4. ไม่มีรีวิวใหม่
  // ตรวจ Lowest ต่อ
  // -----------------------------------------------------

  const lowestResult =
    await getLowestReviews(
      latestJob.place_id
    );

  const oneStarReviews =
    getOneStarReviews(
      lowestResult.reviews
    );


  // -----------------------------------------------------
  // 5. พบ 1 ดาว
  // → Script 1
  // → WAITING_PRICE
  // -----------------------------------------------------

  if (oneStarReviews.length > 0) {

    const template =
      await getTemplate(
        "script_1_old_review",
        customer.language || "th"
      );

    if (!template) {
      throw new Error(
        "script_1_old_review template not found"
      );
    }

    const botReply =
      template.content;


    const nextState =
      transitionState(
        conversation.state,
        GMR_STATES.WAITING_PRICE
      );


    await updateConversationState({
      customerId:
        customer.id,

      state:
        nextState,

      handoff:
        false,

      handoffReason:
        null,
    });


    await updateJob(
      latestJob.id,
      {
        review_case:
          "old_review",

        status:
          "waiting_price",
      }
    );


    await saveMessage({
      customerId:
        customer.id,

      platform,

      direction:
        "outbound",

      messageType:
        "text",

      messageText:
        botReply,
    });


    await updateLastBotMessage(
      customer.id,
      botReply
    );


    return {
      ok: true,

      customerId:
        customer.id,

      jobId:
        latestJob.id,

      stateBefore:
        conversation.state,

      stateAfter:
        nextState,

      mapConfirmed:
        true,

      reviewCase:
        "old_review",

      oneStarCount:
        oneStarReviews.length,

      botReply,
    };
  }


  // -----------------------------------------------------
  // 6. Lowest แล้วไม่พบ 1 ดาว
  // → Script 3.4
  // → WAITING_PRICE
  // -----------------------------------------------------

  const template =
    await getTemplate(
      "script_3_4_hidden_one_star",
      customer.language || "th"
    );

  if (!template) {
    throw new Error(
      "script_3_4_hidden_one_star template not found"
    );
  }

  const botReply =
    template.content;


  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES.WAITING_PRICE
    );


  await updateConversationState({
    customerId:
      customer.id,

    state:
      nextState,

    handoff:
      false,

    handoffReason:
      null,
  });


  await updateJob(
    latestJob.id,
    {
      review_case:
        "hidden_one_star",

      review_visible:
        false,

      review_has_text:
        false,

      status:
        "waiting_price",
    }
  );


  await saveMessage({
    customerId:
      customer.id,

    platform,

    direction:
      "outbound",

    messageType:
      "text",

    messageText:
      botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  return {
    ok: true,

    customerId:
      customer.id,

    jobId:
      latestJob.id,

    stateBefore:
      conversation.state,

    stateAfter:
      nextState,

    mapConfirmed:
      true,

    reviewCase:
      "hidden_one_star",

    oneStarCount: 0,

    botReply,
  };
}

  // -----------------------------------------------------
  // ลูกค้าตอบ "ไม่ใช่"
  // → HANDOFF
  // -----------------------------------------------------

  if (isNo) {
    const nextState = transitionState(
      conversation.state,
      GMR_STATES.HANDOFF
    );

    await updateConversationState({
      customerId: customer.id,
      state: nextState,
      handoff: true,
      handoffReason: "CUSTOMER_REJECTED_MAP",
    });

    const botReply =
      "รับทราบครับ เดี๋ยวให้เจ้าหน้าที่ช่วยตรวจสอบ Google Map ที่ถูกต้องให้อีกครั้งครับ";

    await saveMessage({
      customerId: customer.id,
      platform,
      direction: "outbound",
      messageType: "text",
      messageText: botReply,
    });

    await updateLastBotMessage(
      customer.id,
      botReply
    );

    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: nextState,
      mapConfirmed: false,
      handoff: true,
      botReply,
    };
  }

  // -----------------------------------------------------
  // ลูกค้าพิมพ์อย่างอื่น
  // -----------------------------------------------------

  const botReply =
    'รบกวนยืนยันว่าเป็น Google Map นี้หรือไม่ครับ พิมพ์ "ใช่" หรือ "ไม่ใช่" ได้เลยครับ';

  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "outbound",
    messageType: "text",
    messageText: botReply,
  });

  await updateLastBotMessage(
    customer.id,
    botReply
  );

  return {
    ok: true,
    customerId: customer.id,
    stateBefore: conversation.state,
    stateAfter: conversation.state,
    botReply,
  };
}

  if (
  conversation.state ===
  GMR_STATES.WAITING_REVIEW_SELECTION
) {
  const latestJob =
    await getLatestJobByCustomerId(
      customer.id
    );

  if (!latestJob) {
    throw new Error(
      "No job found while waiting for review selection"
    );
  }

  const candidates =
    await getReviewCandidatesByJobId(
      latestJob.id
    );

  if (!candidates.length) {
    throw new Error(
      "No review candidates found"
    );
  }

  const normalized =
    String(message || "").trim();

  let selectedReview = null;

  // ลูกค้าพิมพ์ 1 / 2 / 3
  const numericChoice =
    Number(normalized);

  if (
    Number.isInteger(numericChoice) &&
    numericChoice >= 1 &&
    numericChoice <= candidates.length
  ) {
    selectedReview =
      candidates[numericChoice - 1];
  }

  // ลูกค้าส่งลิงก์รีวิวกลับมา
  if (
    !selectedReview &&
    normalized.startsWith("http")
  ) {
    selectedReview =
      candidates.find(
        (review) =>
          review.review_url === normalized
      ) || null;
  }

  // ยังเลือกไม่สำเร็จ
  if (!selectedReview) {
    const botReply =
      `เลือกรายการที่ต้องการดำเนินการได้เลยครับ โดยพิมพ์หมายเลข 1-${candidates.length} หรือส่งลิงก์รีวิวกลับมาได้ครับ`;

    await saveMessage({
      customerId: customer.id,
      platform,
      direction: "outbound",
      messageType: "text",
      messageText: botReply,
    });

    await updateLastBotMessage(
      customer.id,
      botReply
    );

    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      selected: false,
      botReply,
    };
  }

  // mark ว่าเลือกแล้ว
  const selected =
    await selectReviewCandidate(
      selectedReview.id
    );

  // update job ให้ผูกกับ review ที่เลือก
  await updateJob(
    latestJob.id,
    {
      review_url:
        selected.review_url,

      review_case:
        "recent_review",

      status:
        "waiting_price",
    }
  );

  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES.WAITING_PRICE
    );

  await updateConversationState({
    customerId: customer.id,
    state: nextState,
    handoff: false,
    handoffReason: null,
  });

  const botReply =
    "รับทราบครับ เดี๋ยวเจ้าหน้าที่ตรวจสอบและแจ้งราคาสำหรับรีวิวนี้ให้ครับ";

  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "outbound",
    messageType: "text",
    messageText: botReply,
  });

  await updateLastBotMessage(
    customer.id,
    botReply
  );

  return {
    ok: true,
    customerId: customer.id,
    jobId: latestJob.id,
    stateBefore: conversation.state,
    stateAfter: nextState,
    selected: true,
    selectedReview: {
      reviewerName:
        selected.reviewer_name,

      rating:
        selected.rating,

      reviewText:
        selected.review_text,

      reviewUrl:
        selected.review_url,
    },
    botReply,
  };
}

if (
  conversation.state ===
  GMR_STATES.WAITING_CONFIRM
) {
  const normalized =
    String(message || "")
      .trim()
      .toLowerCase();

  const confirmWords = [
    "ยืนยัน",
    "ยืนยันครับ",
    "ยืนยันค่ะ",
    "ok",
    "okay",
    "ตกลง",
    "เริ่มได้เลย",
    "เริ่มงานได้เลย",
    "จัดการเลย",
    "confirm",
    "confirmed",
    "go ahead",
    "proceed",
  ];

  const isConfirmed =
    confirmWords.includes(normalized);

  if (!isConfirmed) {
    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      confirmed: false,
      botReply: null,
      note: "Waiting for customer confirmation",
    };
  }

  const template =
    await getTemplate(
      "script_4_request_phone",
      customer.language || "th"
    );

  if (!template) {
    throw new Error(
      "script_4_request_phone template not found"
    );
  }

  const botReply =
    template.content;

  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES.WAITING_PHONE
    );

  await updateConversationState({
    customerId: customer.id,
    state: nextState,
    handoff: false,
    handoffReason: null,
  });

  const latestJob =
    await getLatestJobByCustomerId(
      customer.id
    );

  if (latestJob) {
    await updateJob(
      latestJob.id,
      {
        status: "waiting_phone",
      }
    );
  }

  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "outbound",
    messageType: "text",
    messageText: botReply,
  });

  await updateLastBotMessage(
    customer.id,
    botReply
  );

  return {
    ok: true,
    customerId: customer.id,
    jobId: latestJob?.id || null,
    stateBefore: conversation.state,
    stateAfter: nextState,
    confirmed: true,
    botReply,
  };
}

if (
  conversation.state ===
  GMR_STATES.WAITING_PHONE
) {
  const rawPhone =
    String(message || "").trim();

  const normalizedPhone =
    rawPhone.replace(/[^\d+]/g, "");

  const thaiPhonePattern =
    /^(?:\+66|0)\d{8,9}$/;

  if (
    !thaiPhonePattern.test(
      normalizedPhone
    )
  ) {
    const botReply =
      "รบกวนส่งเบอร์โทรศัพท์ให้ถูกต้องอีกครั้งครับ เช่น 0812345678";

    await saveMessage({
      customerId: customer.id,
      platform,
      direction: "outbound",
      messageType: "text",
      messageText: botReply,
    });

    await updateLastBotMessage(
      customer.id,
      botReply
    );

    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      phoneAccepted: false,
      botReply,
    };
  }


  // แปลง 0812345678 -> +66812345678
  let phoneForDb =
    normalizedPhone;

  if (
    phoneForDb.startsWith("0")
  ) {
    phoneForDb =
      "+66" +
      phoneForDb.slice(1);
  }


  await updateCustomerPhone(
    customer.id,
    phoneForDb
  );


  const latestJob =
    await getLatestJobByCustomerId(
      customer.id
    );

  if (!latestJob) {
    throw new Error(
      "No active job found while receiving phone"
    );
  }


  const template =
    await getTemplate(
      "script_5_started",
      customer.language || "th"
    );

  if (!template) {
    throw new Error(
      "script_5_started template not found"
    );
  }

  const botReply =
    template.content;


  const nextState =
    transitionState(
      conversation.state,
      GMR_STATES.IN_PROGRESS
    );


  await updateConversationState({
    customerId: customer.id,
    state: nextState,
    handoff: false,
    handoffReason: null,
  });

const startedAt =
  new Date().toISOString();

const updatedJob =
  await updateJob(
    latestJob.id,
    {
      status: "processing",
      started_at: startedAt,
    }
  );

await appendJobToGoogleSheet({
  jobId:
    updatedJob.id,

  customerId:
    customer.id,

  customerName:
    customer.display_name || "",

  platform,

  phone:
    phoneForDb,

  businessName:
    updatedJob.business_name || "",

  reviewUrl:
    updatedJob.review_url || "",

  price:
    updatedJob.price || "",

  status:
    updatedJob.status || "processing",

  startedAt,

  removedAt:
    "",

  paidAt:
    "",
});



  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "outbound",
    messageType: "text",
    messageText: botReply,
  });


  await updateLastBotMessage(
    customer.id,
    botReply
  );


  return {
    ok: true,

    customerId:
      customer.id,

    jobId:
      latestJob.id,

    stateBefore:
      conversation.state,

    stateAfter:
      nextState,

    phoneAccepted:
      true,

    phone:
      phoneForDb,

    botReply,
  };
}
  
  // -------------------------------------------------------
  // OTHER STATES
  // -------------------------------------------------------

  return {
    ok: true,
    customerId: customer.id,
    stateBefore: conversation.state,
    stateAfter: conversation.state,
    botReply: null,
    note:
      "This state is not implemented yet.",
  };
}


// =========================================================
// POST TEST MESSAGE
// =========================================================

app.post("/test-message", async (req, res) => {
  try {

    const result =
      await processTestMessage({
        platform:
          req.body.platform || "line",

        platformUserId:
          req.body.platformUserId ||
          "TEST_USER_001",

        displayName:
          req.body.displayName ||
          "Test User",

        message:
          req.body.message || "",

        messageType:
          req.body.messageType || "text",
      });

    res.status(200).json(result);

  } catch (error) {

    console.error(
      "TEST MESSAGE ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});


// =========================================================
// GET TEST MESSAGE
// =========================================================

app.get("/test-message", async (req, res) => {
  try {

    const result =
      await processTestMessage({
        platform:
          req.query.platform || "line",

        platformUserId:
          req.query.platformUserId ||
          "TEST_USER_001",

        displayName:
          req.query.displayName ||
          "Test User",

        message:
          req.query.message ||
          "สนใจบริการครับ",

        messageType:
          req.query.messageType ||
          "text",
      });

    res.status(200).json(result);

  } catch (error) {

    console.error(
      "TEST MESSAGE GET ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// =========================================================
// GOOGLE MAPS TEST
// =========================================================

app.get("/test-map-search", async (req, res) => {
  try {

    const query =
      req.query.q;

    if (!query) {
      return res.status(400).json({
        ok: false,
        error:
          "Missing q parameter",
      });
    }

    const results =
      await searchPlaceByText(
        query
      );

    res.status(200).json({
      ok: true,
      query,
      count:
        results.length,
      results,
    });

  } catch (error) {

    console.error(
      "TEST MAP SEARCH ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error.message,
    });
  }
});

app.get("/test-place-reviews", async (req, res) => {
  try {
    const placeId = req.query.placeId;

    if (!placeId) {
      return res.status(400).json({
        ok: false,
        error: "Missing placeId",
      });
    }

    const result =
      await getPlaceReviews(placeId);

    res.status(200).json({
      ok: true,
      result,
    });

  } catch (error) {
    console.error(
      "TEST PLACE REVIEWS ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// =========================================================
// TEST NEWEST REVIEWS
// =========================================================

app.get("/test-newest-reviews", async (req, res) => {
  try {

    const placeId =
      req.query.placeId;

    if (!placeId) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Missing placeId",
        });
    }

    const result =
      await getNewestReviews(
        placeId
      );

    const recentReviews =
      getRecentReviews(
        result.reviews,
        14
      );

    res.status(200).json({
      ok: true,

      totalReturned:
        result.reviews.length,

      recentCount:
        recentReviews.length,

      recentReviews,

      reviews:
        result.reviews,
    });

  } catch (error) {

    console.error(
      "TEST NEWEST REVIEWS ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error.message,
    });
  }
});


// =========================================================
// TEST LOWEST REVIEWS
// =========================================================

app.get("/test-lowest-reviews", async (req, res) => {
  try {

    const placeId =
      req.query.placeId;

    if (!placeId) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Missing placeId",
        });
    }

    const result =
      await getLowestReviews(
        placeId
      );

    const oneStarReviews =
      getOneStarReviews(
        result.reviews
      );

    res.status(200).json({
      ok: true,

      totalReturned:
        result.reviews.length,

      oneStarCount:
        oneStarReviews.length,

      oneStarReviews,

      reviews:
        result.reviews,
    });

  } catch (error) {

    console.error(
      "TEST LOWEST REVIEWS ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error.message,
    });
  }
});

// =========================================================
// SALES QUOTE TEST
// =========================================================

app.get("/test-sales-quote", async (req, res) => {
  try {

    const platform =
      req.query.platform || "line";

    const platformUserId =
      req.query.platformUserId;

    const amount =
      Number(req.query.amount);

    if (!platformUserId) {
      return res.status(400).json({
        ok: false,
        error: "Missing platformUserId",
      });
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        ok: false,
        error: "Invalid amount",
      });
    }


    // หา customer
    const customer =
      await getCustomerByPlatformUserId(
        platform,
        platformUserId
      );

    if (!customer) {
      return res.status(404).json({
        ok: false,
        error: "Customer not found",
      });
    }


    // หา conversation
    const conversation =
      await getConversationByCustomerId(
        customer.id
      );

    if (!conversation) {
      throw new Error(
        "Conversation not found"
      );
    }


    if (
      conversation.state !==
      GMR_STATES.WAITING_PRICE
    ) {
      return res.status(400).json({
        ok: false,
        error:
          `Customer is not waiting for price. Current state: ${conversation.state}`,
      });
    }


    // หา job ล่าสุด
    const latestJob =
      await getLatestJobByCustomerId(
        customer.id
      );

    if (!latestJob) {
      throw new Error(
        "No active job found"
      );
    }


    const salesMessage =
      `สำหรับรีวิวดังกล่าว ราคา ${amount.toLocaleString("th-TH")} บาท/รีวิว`;


    // บันทึกราคาใน Job
    await updateJob(
      latestJob.id,
      {
        price: amount,
        currency: "THB",
        status: "waiting_confirm",
      }
    );


    // สร้าง quote
    const quote =
      await createQuote({
        jobId: latestJob.id,
        amount,
        currency: "THB",
        quotedBy: "sales",
        quoteMessage: salesMessage,
        script3Sent: false,
      });


    // อ่าน Script 3
    const template =
      await getTemplate(
        "script_3_after_quote",
        customer.language || "th"
      );

    if (!template) {
      throw new Error(
        "script_3_after_quote template not found"
      );
    }


    const script3 =
      template.content;


    // Bot reply = ราคาจาก Sales + Script 3
    const botReply =
      `${salesMessage}\n\n${script3}`;


    // เปลี่ยน State
    const nextState =
      transitionState(
        conversation.state,
        GMR_STATES.WAITING_CONFIRM
      );


    await updateConversationState({
      customerId: customer.id,
      state: nextState,
      handoff: false,
      handoffReason: null,
    });


    await updateQuote(
      quote.id,
      {
        script3_sent: true,
      }
    );


    await saveMessage({
      customerId: customer.id,
      platform,
      direction: "outbound",
      messageType: "text",
      messageText: botReply,
    });


    await updateLastBotMessage(
      customer.id,
      botReply
    );


    return res.status(200).json({
      ok: true,

      customerId:
        customer.id,

      jobId:
        latestJob.id,

      quoteId:
        quote.id,

      amount,

      stateBefore:
        conversation.state,

      stateAfter:
        nextState,

      botReply,
    });

  } catch (error) {

    console.error(
      "TEST SALES QUOTE ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});


// =========================================================
// START SERVER
// =========================================================

app.get("/test-google-sheet", async (req, res) => {
  try {

    const result =
      await appendJobToGoogleSheet({
        jobId:
          "TEST_JOB_001",

        customerId:
          "TEST_CUSTOMER_001",

        customerName:
          "Test Customer",

        platform:
          "line",

        phone:
          "+66812345678",

        businessName:
          "Wraptor Thailand",

        reviewUrl:
          "https://www.google.com/maps/reviews/test",

        price:
          5000,

        status:
          "processing",

        startedAt:
          new Date().toISOString(),

        removedAt:
          "",

        paidAt:
          "",
      });

    res.status(200).json({
      ok: true,
      sheetResult: result,
    });

  } catch (error) {

    console.error(
      "TEST GOOGLE SHEET ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `GMR Auto Chat running on port ${PORT}`
  );
});
