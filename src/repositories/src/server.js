import "dotenv/config";
import express from "express";

import {
  getOrCreateCustomer,
  getOrCreateConversation,
  getTemplate,
} from "./repositories/gmrRepository.js";

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


app.listen(PORT, () => {
  console.log(
    `GMR Auto Chat running on port ${PORT}`
  );
});
