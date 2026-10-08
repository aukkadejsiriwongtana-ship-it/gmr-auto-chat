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
} from "./repositories/gmrRepository.js";

import {
  GMR_STATES,
  transitionState,
} from "./flows/gmrStateMachine.js";

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

    const conversation = await getOrCreateConversation(
      customer.id
    );

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
  displayName = "Test User",
}) {

  if (!platform) {
    throw new Error("Missing platform");
  }

  if (!platformUserId) {
    throw new Error("Missing platformUserId");
  }

  if (!message) {
    throw new Error("Missing message");
  }


  // -------------------------------------------------------
  // 1. หา หรือ สร้าง customer
  // -------------------------------------------------------

  const customer = await getOrCreateCustomer({
    platform,
    platformUserId,
    displayName,
    language: "th",
  });


  // -------------------------------------------------------
  // 2. หา หรือ สร้าง conversation
  // -------------------------------------------------------

  const conversation =
    await getOrCreateConversation(customer.id);


  // -------------------------------------------------------
  // 3. บันทึกข้อความลูกค้า
  // -------------------------------------------------------

  await saveMessage({
    customerId: customer.id,
    platform,
    direction: "inbound",
    messageType: "text",
    messageText: message,
  });


  await updateLastUserMessage(
    customer.id,
    message
  );


  // -------------------------------------------------------
  // 4. เช็ก handoff ก่อน
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
      note: "Conversation is currently in human handoff mode",
    };
  }


  // -------------------------------------------------------
  // 5. STATE = NEW
  // ลูกค้าทักครั้งแรก
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


    // เปลี่ยน state
    await updateConversationState({
      customerId: customer.id,
      state: nextState,
      handoff: false,
      handoffReason: null,
    });


    // เก็บข้อความ bot
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
      botReply,
    };
  }


  // -------------------------------------------------------
  // 6. STATE = WAITING_MAP
  // ตอนนี้ยังไม่ทำ Map logic
  // จะทำใน Step ต่อไป
  // -------------------------------------------------------

  if (
    conversation.state ===
    GMR_STATES.WAITING_MAP
  ) {

    return {
      ok: true,
      customerId: customer.id,
      stateBefore: conversation.state,
      stateAfter: conversation.state,
      botReply: null,
      note:
        "Customer is waiting to submit Google Map / Review link. Map classifier will be added next.",
    };
  }


  // -------------------------------------------------------
  // STATE อื่น ๆ
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
          req.body.message,
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
// สำหรับทดสอบง่าย ๆ จาก browser
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
// START SERVER
// =========================================================

app.listen(PORT, () => {
  console.log(
    `GMR Auto Chat running on port ${PORT}`
  );
});
