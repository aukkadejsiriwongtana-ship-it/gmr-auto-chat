import "dotenv/config";
import express from "express";

import {
  getOrCreateCustomer,
  getOrCreateConversation,
  getTemplate,
  saveMessage,
  updateConversationState,
  updateLastUserMessage,
  updateLastBotMessage,
  createJob,
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
    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      mapConfirmed: true,
      botReply: null,
      nextAction: "CHECK_GOOGLE_REVIEWS",
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


// =========================================================
// START SERVER
// =========================================================

app.listen(PORT, () => {
  console.log(
    `GMR Auto Chat running on port ${PORT}`
  );
});
