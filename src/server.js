import express from "express";
import crypto from "crypto";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const app = express();

const PORT = process.env.PORT || 10000;

const LINE_CHANNEL_SECRET =
  process.env.LINE_CHANNEL_SECRET;

const LINE_CHANNEL_ACCESS_TOKEN =
  process.env.LINE_CHANNEL_ACCESS_TOKEN;

const SYNC_FOLLOWERS_SECRET =
  process.env.SYNC_FOLLOWERS_SECRET;

const FACEBOOK_VERIFY_TOKEN =
  process.env.FACEBOOK_VERIFY_TOKEN;

const FACEBOOK_PAGE_ACCESS_TOKEN =
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

const FACEBOOK_PAGE_ID =
  process.env.FACEBOOK_PAGE_ID;

const FACEBOOK_APP_SECRET =
  process.env.FACEBOOK_APP_SECRET;

const FACEBOOK_API_VERSION =
  process.env.FACEBOOK_API_VERSION ||
  "v26.0";

const MANYCHAT_API_TOKEN =
  process.env.MANYCHAT_API_TOKEN;

const MANYCHAT_WEBHOOK_SECRET =
  process.env.MANYCHAT_WEBHOOK_SECRET;

const SALES_ALERT_LINE_GROUP_ID =
  String(
    process.env.SALES_ALERT_LINE_GROUP_ID || ""
  ).trim();

const SALES_REMINDER_SECRET =
  String(
    process.env.SALES_REMINDER_SECRET || ""
  ).trim();

const parsedSalesReminderMinutes =
  Number(
    process.env.SALES_REMINDER_MINUTES ||
      "90"
  );

const SALES_REMINDER_MINUTES =
  Number.isFinite(parsedSalesReminderMinutes) &&
  parsedSalesReminderMinutes > 0
    ? parsedSalesReminderMinutes
    : 90;


const SALES_REMINDER_MODE =
  "OA_WATCHER_V5_7_5_VEHICLE_INTERIOR_FIX_LIVE";

// ============================================================
// V5.7 RACE GUARD LIVE
// Production mode: LINE sales reminders and audits are enabled.
// Keeps the tested per-chat write serialization + newest-event guard.
// ============================================================
const OA_WATCHER_DRY_RUN = false;
const OA_WATCHER_DRY_RUN_MAX_DETAILS = 100;

const OA_WATCHER_SECRET =
  String(
    process.env.OA_WATCHER_SECRET ||
    SALES_REMINDER_SECRET ||
    ""
  ).trim();

const OA_WATCHER_ONLINE_SECONDS = 180;
const OA_CHAT_FRESH_SECONDS = 600;

const OA_AUDIT_START_DATE =
  String(
    process.env.OA_AUDIT_START_DATE ||
    ""
  ).trim();


const OA_AUDIT_END_HOUR = 9;
const OA_AUDIT_END_MINUTE = 30;

// =========================
// TEST MODE
// =========================

const TEST_MODE =
  process.env.TEST_MODE === "true";

const TEST_USER_IDS =
  (process.env.TEST_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

// =========================
// GLOBAL AUTOCHAT CONTROL
// =========================

const AUTOCHAT_ADMIN_SECRET =
  process.env.AUTOCHAT_ADMIN_SECRET;

const AUTOCHAT_SETTING_KEY =
  "global_autochat_enabled";

const AUTOCHAT_COOKIE =
  "wraptor_autochat_admin";

let autochatStateCache = {
  enabled: null,
  expiresAt: 0
};


function safeStringEqual(a, b) {

  const bufferA =
    Buffer.from(
      String(a || "")
    );

  const bufferB =
    Buffer.from(
      String(b || "")
    );

  if (
    bufferA.length !==
    bufferB.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    bufferA,
    bufferB
  );
}


async function getAutochatEnabled() {

  const now =
    Date.now();

  if (
    typeof autochatStateCache.enabled ===
      "boolean" &&
    now <
      autochatStateCache.expiresAt
  ) {

    return autochatStateCache.enabled;
  }


  const {
    data,
    error
  } =
    await supabase
      .from("system_settings")
      .select("value")
      .eq(
        "key",
        AUTOCHAT_SETTING_KEY
      )
      .maybeSingle();


  if (error) {
    throw error;
  }


  const enabled =
    data
      ? data.value !== false
      : true;


  autochatStateCache = {
    enabled,
    expiresAt:
      now + 5000
  };


  return enabled;
}


async function setAutochatEnabled(
  enabled
) {

  const newValue =
    enabled === true;


  const {
    error
  } =
    await supabase
      .from("system_settings")
      .upsert(
        {
          key:
            AUTOCHAT_SETTING_KEY,

          value:
            newValue,

          updated_at:
            new Date()
              .toISOString()
        },
        {
          onConflict:
            "key"
        }
      );


  if (error) {
    throw error;
  }


  autochatStateCache = {
    enabled:
      newValue,

    expiresAt:
      Date.now() + 5000
  };


  return newValue;
}


function getCookieValue(
  req,
  name
) {

  const cookies =
    String(
      req.headers.cookie || ""
    )
      .split(";")
      .map(
        item =>
          item.trim()
      );


  const prefix =
    name + "=";


  const found =
    cookies.find(
      item =>
        item.startsWith(
          prefix
        )
    );


  if (!found) {
    return "";
  }


  return decodeURIComponent(
    found.slice(
      prefix.length
    )
  );
}


function createAdminToken() {

  const expiresAt =
    Date.now() +
    30 * 24 * 60 * 60 * 1000;


  const payload =
    String(expiresAt);


  const signature =
    crypto
      .createHmac(
        "sha256",
        AUTOCHAT_ADMIN_SECRET
      )
      .update(payload)
      .digest("hex");


  return (
    payload +
    "." +
    signature
  );
}


function isAutochatAdmin(
  req
) {

  if (!AUTOCHAT_ADMIN_SECRET) {
    return false;
  }


  const token =
    getCookieValue(
      req,
      AUTOCHAT_COOKIE
    );


  if (!token) {
    return false;
  }


  const [
    expiresAtText,
    signature
  ] =
    token.split(".");


  const expiresAt =
    Number(
      expiresAtText
    );


  if (
    !expiresAt ||
    !signature ||
    Date.now() >
      expiresAt
  ) {

    return false;
  }


  const expected =
    crypto
      .createHmac(
        "sha256",
        AUTOCHAT_ADMIN_SECRET
      )
      .update(
        expiresAtText
      )
      .digest("hex");


  return safeStringEqual(
    signature,
    expected
  );
}


function buildAutochatPage(
  enabled
) {

  const status =
    enabled
      ? "🟢 AUTOCHAT เปิดอยู่"
      : "🔴 AUTOCHAT ปิดอยู่";


  return `
<!doctype html>
<html lang="th">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

<title>WRAPTOR AUTOCHAT</title>

<style>

body {
  background: #111;
  color: white;
  font-family: Arial, sans-serif;
  padding: 25px;
}

.box {
  max-width: 450px;
  margin: auto;
  background: #1c1c1e;
  padding: 25px;
  border-radius: 20px;
  text-align: center;
}

.status {
  font-size: 24px;
  font-weight: bold;
  margin: 25px 0;
}

button {
  width: 100%;
  padding: 22px;
  border: 0;
  border-radius: 15px;
  margin-top: 15px;
  font-size: 20px;
  font-weight: bold;
}

.off {
  background: #dc2626;
  color: white;
}

.on {
  background: #16a34a;
  color: white;
}

input {
  width: 100%;
  box-sizing: border-box;
  padding: 16px;
  border-radius: 12px;
  border: 0;
  font-size: 18px;
  margin: 15px 0;
}

</style>

</head>

<body>

<div class="box">

<h2>WRAPTOR AUTOCHAT</h2>

<div class="status">
${status}
</div>

<form
  method="POST"
  action="/admin/autochat/toggle"
>

<button
  class="off"
  name="enabled"
  value="false"
>
🔴 ปิด AUTOCHAT ทั้งหมด
</button>

</form>

<form
  method="POST"
  action="/admin/autochat/toggle"
>

<button
  class="on"
  name="enabled"
  value="true"
>
🟢 เปิด AUTOCHAT ทั้งหมด
</button>

</form>

<p>
LINE + Facebook + ManyChat
</p>

</div>

</body>
</html>
`;
}


function buildAutochatLoginPage() {

  return `
<!doctype html>
<html lang="th">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

<title>WRAPTOR AUTOCHAT</title>

</head>

<body
  style="
    background:#111;
    color:white;
    font-family:Arial;
    padding:30px;
  "
>

<div
  style="
    max-width:450px;
    margin:auto;
  "
>

<h2>
WRAPTOR AUTOCHAT
</h2>

<form
  method="POST"
  action="/admin/autochat/login"
>

<input
  type="password"
  name="secret"
  placeholder="Admin password"
  required
  style="
    width:100%;
    box-sizing:border-box;
    padding:18px;
    font-size:18px;
  "
>

<button
  style="
    width:100%;
    margin-top:15px;
    padding:18px;
    font-size:18px;
  "
>
เข้าสู่ระบบ
</button>

</form>

</div>

</body>
</html>
`;
}


app.get(
  "/admin/autochat",

  async (req, res) => {

    if (
      !isAutochatAdmin(
        req
      )
    ) {

      return res.send(
        buildAutochatLoginPage()
      );
    }


    try {

      const enabled =
        await getAutochatEnabled();


      return res.send(
        buildAutochatPage(
          enabled
        )
      );

    } catch (error) {

      console.error(
        "AUTOCHAT ADMIN ERROR:",
        error
      );

      return res
        .status(500)
        .send(
          "Unable to read status"
        );
    }
  }
);


app.post(
  "/admin/autochat/login",

  express.urlencoded({
    extended: false
  }),

  (req, res) => {

    const secret =
      String(
        req.body?.secret ||
        ""
      );


    if (
      !AUTOCHAT_ADMIN_SECRET ||
      !safeStringEqual(
        secret,
        AUTOCHAT_ADMIN_SECRET
      )
    ) {

      return res
        .status(401)
        .send(
          "รหัสไม่ถูกต้อง"
        );
    }


    const token =
      createAdminToken();


    res.setHeader(
      "Set-Cookie",

      `${AUTOCHAT_COOKIE}=` +
      `${encodeURIComponent(token)}; ` +
      `Max-Age=2592000; ` +
      `Path=/admin/autochat; ` +
      `HttpOnly; Secure; SameSite=Strict`
    );


    return res.redirect(
      303,
      "/admin/autochat"
    );
  }
);


app.post(
  "/admin/autochat/toggle",

  express.urlencoded({
    extended: false
  }),

  async (req, res) => {

    if (
      !isAutochatAdmin(
        req
      )
    ) {

      return res
        .status(401)
        .send(
          "Unauthorized"
        );
    }


    const enabled =
      req.body?.enabled ===
      "true";


    try {

      await setAutochatEnabled(
        enabled
      );


      return res.redirect(
        303,
        "/admin/autochat"
      );

    } catch (error) {

      console.error(
        "AUTOCHAT TOGGLE ERROR:",
        error
      );


      return res
        .status(500)
        .send(
          "Unable to change status"
        );
    }
  }
);

// =========================
// CHECK SERVER
// =========================

app.get("/", (req, res) => {
  res.send("Wraptor LINE AI Bot is running");
});


// =========================
// VERIFY LINE SIGNATURE
// =========================

function verifySignature(rawBody, signature) {

  if (!LINE_CHANNEL_SECRET || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", LINE_CHANNEL_SECRET)
    .update(rawBody)
    .digest("base64");

  const expectedBuffer =
    Buffer.from(expectedSignature);

  const signatureBuffer =
    Buffer.from(signature);

  if (
    expectedBuffer.length !==
    signatureBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    signatureBuffer
  );
}

// =========================
// VERIFY FACEBOOK SIGNATURE
// =========================

function verifyFacebookSignature(
  rawBody,
  signature
) {

  if (
    !FACEBOOK_APP_SECRET ||
    !signature ||
    !signature.startsWith("sha256=")
  ) {
    return false;
  }


  const expectedSignature =
    "sha256=" +
    crypto
      .createHmac(
        "sha256",
        FACEBOOK_APP_SECRET
      )
      .update(rawBody)
      .digest("hex");


  const expectedBuffer =
    Buffer.from(
      expectedSignature
    );

  const signatureBuffer =
    Buffer.from(
      signature
    );


  if (
    expectedBuffer.length !==
    signatureBuffer.length
  ) {
    return false;
  }


  return crypto.timingSafeEqual(
    expectedBuffer,
    signatureBuffer
  );
}

// =========================
// MANYCHAT HELPERS
// =========================

function isManychatInstagramChannelId(value) {

  return String(
    value || ""
  ).startsWith(
    "manychat:ig:"
  );
}


function getManychatInstagramSubscriberId(value) {

  return String(
    value || ""
  ).replace(
    /^manychat:ig:/,
    ""
  );
}


function isManychatChannelId(value) {

  const id =
    String(
      value || ""
    );

  return (
    id.startsWith("manychat:") &&
    !id.startsWith("manychat:ig:")
  );
}


function getManychatSubscriberId(value) {

  return String(
    value || ""
  ).replace(
    /^manychat:/,
    ""
  );
}

async function sendManychatMessages(subscriberId, messages) {

  const out = [];
  const IMAGES_PER_GROUP = 4;

  let imageBuffer = [];
  const seenImages = new Set();


  function addImage(url) {

    if (!url) return;

    if (seenImages.has(url)) {
      return;
    }

    seenImages.add(url);
    imageBuffer.push(url);
  }


  function flushImages() {

    if (imageBuffer.length === 0) {
      return;
    }

    for (let i = 0; i < imageBuffer.length; i += IMAGES_PER_GROUP) {

      const group = imageBuffer.slice(i, i + IMAGES_PER_GROUP);

      out.push({
        type: "cards",
        elements: group.map((url) => ({
          title: "WRAPTOR THAILAND",
          subtitle: "ตัวอย่างผลงานติดตั้ง",
          image_url: url,
          action_url: url,
          buttons: []
        })),
        image_aspect_ratio: "square"
      });
    }

    imageBuffer = [];
  }


  for (const m of messages || []) {

    if (!m) continue;

    // =========================
    // TEXT
    // =========================
    if (m.type === "text" && m.text) {

      // ถ้ามีรูปค้างอยู่ ส่งรูปก่อน
      flushImages();

      out.push({
        type: "text",
        text: m.text
      });

      continue;
    }

    // =========================
    // DIRECT IMAGE
    // =========================
    if (m.type === "image") {

      const url = m.originalContentUrl || m.url;
      addImage(url);
      continue;
    }

    // =========================
    // FLEX -> ดึงรูปทั้งหมดออกมา
    // แล้วค่อยจัดใหม่เป็นชุดละ 4
    // =========================
    if (m.type === "flex") {

      const urls = [...new Set(extractFacebookImageUrls(m))];

      for (const url of urls) {
        addImage(url);
      }

      continue;
    }
  }

  // ส่งรูปชุดสุดท้าย
  flushImages();

  if (out.length === 0) {
    return;
  }

  // ManyChat ส่งได้หลาย message ต่อ 1 request
  // ถ้าเกิน 10 ก็แบ่งยิงหลายรอบ
  for (let i = 0; i < out.length; i += 10) {

    const response = await fetch(
      "https://api.manychat.com/fb/sending/sendContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MANYCHAT_API_TOKEN}`
        },
        body: JSON.stringify({
          subscriber_id: subscriberId,
          data: {
            version: "v2",
            content: {
              messages: out.slice(i, i + 10)
            }
          }
        })
      }
    );

    const result = await response.json().catch(() => ({}));

    console.log("MANYCHAT SEND RESPONSE:", {
      httpStatus: response.status,
      ok: response.ok,
      result
    });

    if (!response.ok || result.status === "error") {
      console.error("MANYCHAT SEND ERROR:", result);
      throw new Error(JSON.stringify(result));
    }
  }
}

// =========================
// MANYCHAT INSTAGRAM SENDER
// =========================

async function sendManychatInstagramMessages(
  subscriberId,
  messages
) {

  const out = [];

  // 4 รูป = 1 ชุด
  const IMAGES_PER_GROUP = 4;

  let imageBuffer = [];

  const seenImages =
    new Set();


  function addImage(url) {

    if (!url) {
      return;
    }


    if (
      seenImages.has(url)
    ) {
      return;
    }


    seenImages.add(url);

    imageBuffer.push(url);
  }


  // =========================
  // รวมรูปเป็น Gallery
  // ชุดละ 4 รูป
  // =========================

  function flushImages() {

    if (
      imageBuffer.length === 0
    ) {
      return;
    }


    for (
      let i = 0;
      i < imageBuffer.length;
      i += IMAGES_PER_GROUP
    ) {

      const group =
        imageBuffer.slice(
          i,
          i + IMAGES_PER_GROUP
        );


      out.push({
        type:
          "cards",

        elements:
          group.map(
            (url) => ({
              title:
                "WRAPTOR THAILAND",

              subtitle:
                "ตัวอย่างผลงานติดตั้ง",

              image_url:
                url,

              action_url:
                url,

              buttons:
                []
            })
          ),

        image_aspect_ratio:
          "square"
      });
    }


    imageBuffer = [];
  }


  // =========================
  // แปลง Message จาก Flow เดิม
  // =========================

  for (
    const message of
      messages || []
  ) {

    if (!message) {
      continue;
    }


    // =========================
    // TEXT
    // =========================

    if (
      message.type === "text" &&
      message.text
    ) {

      // ถ้ามีรูปค้างอยู่
      // ส่งชุดรูปก่อน
      flushImages();


      out.push({
        type:
          "text",

        text:
          message.text
      });


      continue;
    }


    // =========================
    // DIRECT IMAGE
    // =========================

    if (
      message.type === "image"
    ) {

      const imageUrl =
        message.originalContentUrl ||
        message.url;


      addImage(
        imageUrl
      );


      continue;
    }


    // =========================
    // LINE FLEX
    // ดึงรูปทั้งหมดจาก Grid
    // =========================

    if (
      message.type === "flex"
    ) {

      const imageUrls =
        [
          ...new Set(
            extractFacebookImageUrls(
              message
            )
          )
        ];


      for (
        const imageUrl of
          imageUrls
      ) {

        addImage(
          imageUrl
        );
      }


      continue;
    }
  }


  // รูปที่เหลือชุดสุดท้าย
  flushImages();


  if (
    out.length === 0
  ) {
    return;
  }


  // =========================
  // MANYCHAT LIMIT
  // สูงสุด 10 messages/request
  // =========================

  for (
    let i = 0;
    i < out.length;
    i += 10
  ) {

    const response =
      await fetch(
        "https://api.manychat.com/fb/sending/sendContent",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${MANYCHAT_API_TOKEN}`
          },

          body:
            JSON.stringify({
              // ห้าม Number()
              subscriber_id:
                subscriberId,

              data: {
                version:
                  "v2",

                content: {
                  type:
                    "instagram",

                  messages:
                    out.slice(
                      i,
                      i + 10
                    )
                }
              }
            })
        }
      );


    const result =
      await response
        .json()
        .catch(
          () => ({})
        );


    console.log(
      "MANYCHAT INSTAGRAM SEND RESPONSE:",
      {
        httpStatus:
          response.status,

        ok:
          response.ok,

        result
      }
    );


    if (
      !response.ok ||
      result.status ===
        "error"
    ) {

      console.error(
        "MANYCHAT INSTAGRAM SEND ERROR:",
        result
      );


      throw new Error(
        JSON.stringify(
          result
        )
      );
    }
  }
}


// =========================
// SEND LINE MESSAGE
// =========================

async function replyText(replyToken, text) {

  if (
  isManychatInstagramChannelId(
    replyToken
  )
) {

  await sendManychatInstagramMessages(
    getManychatInstagramSubscriberId(
      replyToken
    ),
    [
      {
        type:
          "text",

        text
      }
    ]
  );

  return;
}

    if (isManychatChannelId(replyToken)) {
    await sendManychatMessages(
      getManychatSubscriberId(replyToken),
      [{ type: "text", text }]
    );
    return;
  }

    if (
    isFacebookChannelId(
      replyToken
    )
  ) {

    await sendFacebookText(
      getFacebookChannelId(
        replyToken
      ),
      text
    );

    return;
  }

  const response = await fetch(
    "https://api.line.me/v2/bot/message/reply",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        Authorization:
          `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },

      body: JSON.stringify({
        replyToken: replyToken,

        messages: [
          {
            type: "text",
            text: text
          }
        ]
      })
    }
  );

  if (!response.ok) {

    const error = await response.text();

    console.error(
      "LINE reply error:",
      error
    );
  }
}

// =========================
// SEND FACEBOOK TEXT
// =========================

async function sendFacebookText(
  facebookUserId,
  text
) {

  const response =
    await fetch(
      `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${FACEBOOK_PAGE_ID}/messages`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${FACEBOOK_PAGE_ACCESS_TOKEN}`
        },

        body: JSON.stringify({
          recipient: {
            id: facebookUserId
          },

          messaging_type:
            "RESPONSE",

          message: {
            text: text
          }
        })
      }
    );


  if (!response.ok) {

    const error =
      await response.text();

    console.error(
      "FACEBOOK SEND ERROR:",
      error
    );

    throw new Error(error);
  }
}

// =========================
// FACEBOOK CHANNEL HELPERS
// =========================

function isFacebookChannelId(
  value
) {

  return String(
    value || ""
  ).startsWith(
    "facebook:"
  );
}


function getFacebookChannelId(
  value
) {

  return String(
    value || ""
  ).replace(
    /^facebook:/,
    ""
  );
}


// =========================
// SEND FACEBOOK IMAGE
// =========================

async function sendFacebookImage(
  facebookUserId,
  imageUrl
) {

  const response =
    await fetch(
      `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${FACEBOOK_PAGE_ID}/messages`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${FACEBOOK_PAGE_ACCESS_TOKEN}`
        },

        body: JSON.stringify({
          recipient: {
            id:
              facebookUserId
          },

          messaging_type:
            "RESPONSE",

          message: {
            attachment: {
              type:
                "image",

              payload: {
                url:
                  imageUrl
              }
            }
          }
        })
      }
    );


  if (!response.ok) {

    const error =
      await response.text();

    console.error(
      "FACEBOOK IMAGE ERROR:",
      error
    );

    throw new Error(error);
  }
}


// =========================
// SEND FACEBOOK IMAGE GROUP
// 4 IMAGES = 1 MESSAGE
// =========================

async function sendFacebookImageGroup(
  facebookUserId,
  imageUrls
) {

  const urls =
    (imageUrls || [])
      .filter(Boolean)
      .slice(0, 4);


  if (urls.length === 0) {
    return;
  }


  const response =
    await fetch(
      `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${FACEBOOK_PAGE_ID}/messages`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${FACEBOOK_PAGE_ACCESS_TOKEN}`
        },

        body: JSON.stringify({
          recipient: {
            id:
              facebookUserId
          },

          messaging_type:
            "RESPONSE",

          message: {
            attachments:
              urls.map(
                (imageUrl) => ({
                  type:
                    "image",

                  payload: {
                    url:
                      imageUrl
                  }
                })
              )
          }
        })
      }
    );


  if (!response.ok) {

    const error =
      await response.text();

    console.error(
      "FACEBOOK IMAGE GROUP ERROR:",
      error
    );

    throw new Error(error);
  }
}

// =========================
// EXTRACT IMAGE URLS
// FROM LINE FLEX MESSAGE
// =========================

function extractFacebookImageUrls(
  value,
  urls = []
) {

  if (!value) {
    return urls;
  }


  if (Array.isArray(value)) {

    for (
      const item of value
    ) {

      extractFacebookImageUrls(
        item,
        urls
      );
    }

    return urls;
  }


  if (
    typeof value !== "object"
  ) {
    return urls;
  }


  if (
    value.type === "image" &&
    typeof value.url ===
      "string"
  ) {

    urls.push(
      value.url
    );
  }


  for (
    const child of
      Object.values(value)
  ) {

    if (
      child &&
      typeof child ===
        "object"
    ) {

      extractFacebookImageUrls(
        child,
        urls
      );
    }
  }


  return urls;
}

// =========================
// SEND FACEBOOK MESSAGES
// TEXT + IMAGE GROUP
// 4 IMAGES = 1 SET
// =========================

async function sendFacebookMessages(
  facebookUserId,
  messages
) {

  const imageQueue = [];

  const IMAGES_PER_GROUP = 4;


  for (
    const message of
      messages || []
  ) {

    if (!message) {
      continue;
    }


    // =========================
    // TEXT
    // =========================

    if (
      message.type === "text" &&
      message.text
    ) {

      await sendFacebookText(
        facebookUserId,
        message.text
      );

      continue;
    }


    // =========================
    // DIRECT IMAGE
    // =========================

    if (
      message.type === "image"
    ) {

      const imageUrl =
        message.originalContentUrl ||
        message.url;


      if (imageUrl) {

        imageQueue.push(
          imageUrl
        );
      }


      continue;
    }


    // =========================
    // LINE FLEX
    // ดึงรูปจาก Grid / Carousel
    // =========================

    if (
      message.type === "flex"
    ) {

      const imageUrls =
        extractFacebookImageUrls(
          message
        );


      imageQueue.push(
        ...imageUrls
      );
    }
  }


  // =========================
  // REMOVE DUPLICATES
  // + LIMIT TOTAL IMAGES
  // =========================

  const uniqueImages =
  [
    ...new Set(
      imageQueue
    )
  ];

  // =========================
  // SEND 4 IMAGES PER MESSAGE
  // =========================

  for (
    let i = 0;
    i < uniqueImages.length;
    i += IMAGES_PER_GROUP
  ) {

    const group =
      uniqueImages.slice(
        i,
        i +
          IMAGES_PER_GROUP
      );


    await sendFacebookImageGroup(
      facebookUserId,
      group
    );
  }
}



// =========================
// SEND MULTIPLE LINE MESSAGES
// =========================

async function replyMessages(replyToken, messages) {

  // =========================
  // INSTAGRAM VIA MANYCHAT
  // =========================

  if (
    isManychatInstagramChannelId(
      replyToken
    )
  ) {

    await sendManychatInstagramMessages(
      getManychatInstagramSubscriberId(
        replyToken
      ),
      messages
    );

    return;
  }


  // =========================
  // FACEBOOK VIA MANYCHAT
  // =========================

  if (
    isManychatChannelId(
      replyToken
    )
  ) {

    await sendManychatMessages(
      getManychatSubscriberId(
        replyToken
      ),
      messages
    );

    return;
  }

    if (
    isFacebookChannelId(
      replyToken
    )
  ) {

    await sendFacebookMessages(
      getFacebookChannelId(
        replyToken
      ),
      messages
    );

    return;
  }

  const response = await fetch(
    "https://api.line.me/v2/bot/message/reply",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },

      body: JSON.stringify({
        replyToken,
        messages
      })
    }
  );

  if (!response.ok) {

    const error = await response.text();

    console.error(
      "LINE multiple reply error:",
      error
    );

    throw new Error(error);
  }
}

// =========================
// PUSH MULTIPLE LINE MESSAGES
// =========================

async function pushMessages(
  userId,
  messages
) {

  // =========================
  // INSTAGRAM VIA MANYCHAT
  // =========================

  if (
    isManychatInstagramChannelId(
      userId
    )
  ) {

    await sendManychatInstagramMessages(
      getManychatInstagramSubscriberId(
        userId
      ),
      messages
    );

    return;
  }


  // =========================
  // FACEBOOK VIA MANYCHAT
  // =========================

  if (
    isManychatChannelId(
      userId
    )
  ) {

    await sendManychatMessages(
      getManychatSubscriberId(
        userId
      ),
      messages
    );

    return;
  }

    if (
    isFacebookChannelId(
      userId
    )
  ) {

    await sendFacebookMessages(
      getFacebookChannelId(
        userId
      ),
      messages
    );

    return;
  }

  const response = await fetch(
    "https://api.line.me/v2/bot/message/push",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },

      body: JSON.stringify({
        to: userId,
        messages
      })
    }
  );


  if (!response.ok) {

    const error =
      await response.text();

    console.error(
      "LINE push error:",
      error
    );

    throw new Error(error);
  }
}


// =========================
// REPLY + PUSH UNTIL ALL SENT
// =========================

async function replyAllMessages(
  replyToken,
  userId,
  messages
) {

  if (
    !messages ||
    messages.length === 0
  ) {
    return;
  }


  // LINE Reply ส่งได้สูงสุด 5 messages
  const firstBatch =
    messages.slice(0, 5);


  await replyMessages(
    replyToken,
    firstBatch
  );


  // ที่เหลือ Push ต่อชุดละ 5
  for (
    let i = 5;
    i < messages.length;
    i += 5
  ) {

    const batch =
      messages.slice(
        i,
        i + 5
      );


    await pushMessages(
      userId,
      batch
    );
  }
}

// =========================
// OPENAI INTENT ANALYSIS
// =========================

async function analyzeCustomerMessage(
  customerText,
  vehicleCatalog = []
) {

const vehicleCatalogText =
  vehicleCatalog
    .map(
      (item) =>
        `${item.brand} | ${item.model}`
    )
    .join("\n");
  
  const response =
    await openai.responses.create({

      model: "gpt-5.6-luna",

      reasoning: {
        effort: "none"
      },

      instructions: `
You classify incoming messages for an automotive
customization shop in Thailand.

Understand both Thai and English.

Your job is NOT to answer the customer.

Extract:
- intent
- service
- vehicle brand
- model
- year
- vehicle_status

NON-CUSTOMER CONTACT:

Use intent = "supplier_outreach" when the sender is contacting
the shop to sell, present, supply, distribute, or introduce
products or services to the shop.

Examples:
- สนใจนำเสนอสินค้า
- เป็น supplier อยากนำเสนอสินค้า
- ขอเสนอผลิตภัณฑ์ให้ทางร้าน
- ติดต่อฝ่ายจัดซื้อ
- อยากนัด present สินค้า
- We are a supplier and would like to present our products
- vendor / distributor / supplier proposal

Use intent = "job_application" when the sender is asking about
employment, applying for a job, sending a CV/resume,
asking whether the shop is hiring, or asking about an open position.

Examples:
- สนใจสมัครงาน
- รับช่างไหมครับ
- มีตำแหน่งว่างไหม
- ส่ง resume ได้ที่ไหน
- อยากสมัครเป็นช่าง wrap
- สมัคร photographer
- Are you hiring?
- I would like to apply for a job
- CV / resume / job application

IMPORTANT:
Do NOT classify someone as a job applicant only because
the word "ช่าง" or "technician" appears.
There must be clear employment / hiring intent.

Normalize service exactly as follows:

PPF =
- PPF
- ฟิล์มใสกันรอย
- ฟิล์มกันรอย
- paint protection film
- clear protection film
- ฟิล์มใส
- แรปใส
- แร็ปใส
- wrap ใส
- clear wrap

CW =
- CW
- color wrap
- colour wrap
- car wrap
- wrap สี
- แรปรถ
- แรปสี
- ฟิล์มเปลี่ยนสี
- เปลี่ยนสีรถ
- สี
- ฟิล์มสี

IMPORTANT MATERIAL AMBIGUITY:

TPU and PET are film/material names, not a service by themselves.

If the customer mentions only:
- TPU
- PET
- TPU + vehicle model
- PET + vehicle model
- TPU/PET + a price question

but does NOT clearly specify PPF / clear protection / scratch protection
or color wrap / change color / CW,

then return:

service = "UNKNOWN"

Do NOT assume PPF or CW from TPU/PET alone.

Examples:

"TPU Porsche Panamera"
=> brand = "Porsche"
=> model = "Panamera"
=> service = "UNKNOWN"

"TPU Porsche Panamera ราคายังไง"
=> brand = "Porsche"
=> model = "Panamera"
=> service = "UNKNOWN"

"TPU PPF Porsche Panamera"
=> service = "PPF"

"TPU เปลี่ยนสี Porsche Panamera"
=> service = "CW"

IMPORTANT WRAP AMBIGUITY:

The word "wrap" by itself does NOT automatically mean color wrap.

If the customer says only:
- wrap
- แรป
- สนใจ wrap
- อยาก wrap
- wrap รถ
- or mentions a vehicle model together with "wrap"

but does NOT clearly specify:
- color wrap / change color / CW
or
- clear protection / PPF / scratch protection

then return:

service = "UNKNOWN"

Do NOT assume CW from the word "wrap" alone.

Exception:
If the customer clearly mentions a specific vehicle part,
such as roof, mirror, door handle, hood, spoiler, pillar, or trim,
the existing partial-wrap handling may apply.

IMPORTANT:
If the customer sends only the word "สี",
classify service = "CW".

Examples:

"สี"
=> service = "CW"

"สีครับ"
=> service = "CW"

"สนใจสี"
=> service = "CW"

MOTORCYCLE WRAP:

If the customer asks about wrapping a motorcycle,
motorbike, big bike, bike, scooter, มอเตอร์ไซค์, มอไซค์, มอไซค์
บิ๊กไบค์, Vespa, Ducati, Harley-Davidson,
or similar two-wheel vehicle:

- service = "CW"
- brand = "Motorcycle"
- model = "General"

Use this normalization even if the customer mentions
a motorcycle brand or model.

Examples:

"รับ wrap มอเตอร์ไซค์ไหม"
=> service = "CW"
=> brand = "Motorcycle"
=> model = "General"

"อยาก wrap bigbike"
=> service = "CW"
=> brand = "Motorcycle"
=> model = "General"

"wrap Ducati Panigale ได้ไหม"
=> service = "CW"
=> brand = "Motorcycle"
=> model = "General"

"เปลี่ยนสี Vespa ด้วยฟิล์ม"
=> service = "CW"
=> brand = "Motorcycle"
=> model = "General"

SERVICE =
- นัด service
- นัดเซอร์วิส
- เช็กงาน
- ตรวจเช็กงาน
- งานเดิม
- งานที่เคยทำ
- recheck
- แก้งาน
- ฟิล์มมีปัญหา
- งานมีปัญหา

FURNITURE FILM:

Furniture work must be classified separately from vehicle work.

Use service = "FURNITURE" only when the customer is clearly talking
about NON-VEHICLE furniture or building/interior surfaces, such as
furniture, table, cabinet, counter, wall, kitchen, house, condo, etc.

Use service = "FURNITURE_PPF" when the customer asks for
clear protection film / scratch protection film on NON-VEHICLE furniture.

Use service = "FURNITURE_CW" when the customer asks for
color wrap, wood pattern, stone pattern, decorative wrap,
or surface color change on NON-VEHICLE furniture.

VEHICLE INTERIOR FILM - IMPORTANT OVERRIDE:

If the same message clearly contains a vehicle brand/model or vehicle context
(e.g. Nissan Kicks, Tesla Model 3, BMW X5, Benz, รถ, ภายในรถ, คอนโซล,
dashboard, door trim, piano black), then VEHICLE context has priority.
Do NOT classify it as FURNITURE.

For clear/scratch-protection film inside a vehicle, use:
=> service = "INTERIOR_PPF"

For decorative/color-change wrap on vehicle interior trim, do NOT use Furniture.
Use service = "OTHER" so the sales team can check the specific interior-wrap job.

Examples:

"ฟิล์มกันรอย ภายใน Nissan Kicks ครับ"
=> service = "INTERIOR_PPF"
=> brand = "Nissan"
=> model = "Kicks"

"PPF ภายใน BMW X5"
=> service = "INTERIOR_PPF"
=> brand = "BMW"
=> model = "X5"

"ติดฟิล์มกันรอยคอนโซล Tesla Model 3"
=> service = "INTERIOR_PPF"
=> brand = "Tesla"
=> model = "Model 3"

IMPORTANT INTERIOR FILM RULE:

The terms below can mean furniture film ONLY when there is no vehicle context:

- อินทีเรียฟิล์ม
- อินทีเรียร์ฟิล์ม
- ฟิล์มอินทีเรีย
- ฟิล์มอินทีเรียร์
- Interior Film
- Interior Wrap

If the customer uses those terms without any vehicle brand/model or vehicle cue,
then service may be "FURNITURE".

Examples:

"สอบถามราคาอินทีเรียฟิล์ม"
=> service = "FURNITURE"

"สนใจ Interior Film"
=> service = "FURNITURE"

"รับติดฟิล์มเฟอร์นิเจอร์ไหม"
=> service = "FURNITURE"

"สนใจฟิล์มใสกันรอยเฟอร์นิเจอร์"
=> service = "FURNITURE_PPF"

"อยากติดฟิล์มกันรอยโต๊ะ"
=> service = "FURNITURE_PPF"

"อยาก wrap ตู้"
=> service = "FURNITURE_CW"

"ติดฟิล์มลายไม้เฟอร์นิเจอร์"
=> service = "FURNITURE_CW"

"อยากเปลี่ยนเคาน์เตอร์เป็นลายหิน"
=> service = "FURNITURE_CW"

IMPORTANT:
Explicit vehicle context has priority over Furniture classification.
Never classify a vehicle interior protection request as furniture.

Use service = "SERVICE" when the customer is contacting
about an existing job, after-sales service, inspection,
recheck, warranty, claim, or service appointment.

If the customer clearly asks about another service,
use service = "OTHER".

If the customer has not stated a service,
use service = "UNKNOWN".

Vehicle status:

NEW =
customer explicitly says the car is new,
brand new, ป้ายแดง, waiting for delivery,
กำลังจะรับรถ, ยังไม่ได้รับรถ, or similar.

OLD =
customer explicitly says the car is currently used,
รถใช้งานอยู่, รถเก่า, already has film,
มีฟิล์มเก่า, or similar.

Otherwise vehicle_status = "UNKNOWN".

IMPORTANT:
Do NOT decide NEW or OLD only from model year.
A 2026 vehicle may already be in use.

Mercedes, Benz and Mercedes-Benz
all mean Mercedes-Benz.

VEHICLE BRAND AND MODEL RECOGNITION:

Recognize vehicle brands and models using general automotive knowledge.

Customers may provide:
- only the model name
- Thai transliterations
- phonetic spellings
- abbreviations
- common misspellings
- incomplete model names

Infer the vehicle brand when the model is reasonably unambiguous.

Normalize vehicle brands and models to their standard English names.

Examples:

"พานาเมร่า"
=> brand = "Porsche"
=> model = "Panamera"

"คาเยน"
=> brand = "Porsche"
=> model = "Cayenne"

"มาคัน"
=> brand = "Porsche"
=> model = "Macan"

"ไทคาน"
=> brand = "Porsche"
=> model = "Taycan"

"เอเวอเรสต์"
=> brand = "Ford"
=> model = "Everest"

"แรพเตอร์"
=> brand = "Ford"
=> model = "Ranger Raptor"

"ซีวิค"
=> brand = "Honda"
=> model = "Civic"

"อัลพาร์ด"
=> brand = "Toyota"
=> model = "Alphard"

IMPORTANT:
Do not require the customer to type the exact English spelling.

If a model clearly identifies a manufacturer,
infer the brand automatically.

If the model could reasonably belong to multiple brands
and there is not enough information, do not guess.

BMW MODEL NORMALIZATION:

When the customer mentions any of the following,
infer brand = "BMW" and normalize model exactly:

- Series3, Series 3, 3 Series = model "Series3"
- Series5, Series 5, 5 Series = model "Series5"
- Series7, Series 7, 7 Series = model "Series7"
- X1 = model "X1"
- X3 = model "X3"
- X4 = model "X4"
- X5 = model "X5"
- X7 = model "X7"

If a vehicle model clearly identifies its brand,
you MAY infer the brand even if the customer did not type the brand.

Examples:

"PPF Series3"
=> brand = "BMW"
=> model = "Series3"
=> service = "PPF"

"สนใจ wrap series5"
=> brand = "BMW"
=> model = "Series5"
=> service = "CW"

"PPF BMW X5"
=> brand = "BMW"
=> model = "X5"
=> service = "PPF"

TOYOTA MODEL NORMALIZATION:

- FJ, FJ Cruiser, Toyota FJ, Toyota FJ Cruiser
  => brand = "Toyota"
  => model = "FJ"

Examples:

"PPF FJ"
=> brand = "Toyota"
=> model = "FJ"
=> service = "PPF"

"CW FJ Cruiser"
=> brand = "Toyota"
=> model = "FJ"
=> service = "CW"

If brand, model, or year is not stated,
return an empty string for that field.

If service is not stated,
return "UNKNOWN".

AVAILABLE VEHICLES IN SHOP STORAGE:

${vehicleCatalogText}

IMPORTANT VEHICLE MATCHING RULE:

The catalog above contains the exact Brand and Model names
used by this shop.

If the customer's vehicle appears to refer to one of these
vehicles, including Thai transliteration, phonetic spelling,
abbreviation, typo, or common nickname:

return the exact brand and model spelling from the catalog.

For example, if the catalog contains:

Porsche | Panamera

then:
"พานาเมร่า"
"พานาเมรา"
"panamera"
"Porsche พานาเมร่า"

must all return:

brand = "Porsche"
model = "Panamera"

Do not invent a different spelling when a matching catalog
vehicle exists.

If no suitable catalog vehicle exists, you may still identify
the vehicle using general automotive knowledge.

If vehicle status is not stated,
return "UNKNOWN".
`,

      input: customerText,

      text: {

        format: {

          type: "json_schema",

          name: "customer_intent",

          strict: true,

          schema: {

  type: "object",

  properties: {

    intent: {
  type: "string",
  enum: [
    "product_inquiry",
    "supplier_outreach",
    "job_application",
    "greeting",
    "other"
  ]
},
    service: {
      type: "string",
      enum: [
        "PPF",
        "CW",
        "FURNITURE",
        "FURNITURE_PPF",
        "FURNITURE_CW",
        "INTERIOR_PPF",
        "SERVICE",
        "OTHER",
        "UNKNOWN"
      ]
    },

    brand: {
      type: "string"
    },

    model: {
      type: "string"
    },

    year: {
      type: "string"
    },

    vehicle_status: {
      type: "string",
      enum: [
        "NEW",
        "OLD",
        "UNKNOWN"
      ]
    }
  },

  required: [
    "intent",
    "service",
    "brand",
    "model",
    "year",
    "vehicle_status"
  ],

  additionalProperties: false
            }
          }
        }
    });

  return JSON.parse(
    response.output_text
  );
}

// =========================
// BUILD 8 IMAGE GRID
// =========================

function buildImageGrid8(mediaItems, altText = "ตัวอย่างผลงาน PPF") {

  const items = mediaItems.slice(0, 8);

  const rows = [];

  for (let i = 0; i < items.length; i += 2) {

    const pair = items.slice(i, i + 2);

    rows.push({
      type: "box",
      layout: "horizontal",
      spacing: "xs",

      contents: pair.map((item) => ({
        type: "image",
        url: item.image_url,
        size: "full",
        aspectRatio: "1:1",
        aspectMode: "cover",
        flex: 1,

        action: {
          type: "uri",
          uri: item.image_url
        }
      }))
    });
  }

  return {
    type: "flex",

    altText: altText,

    contents: {
      type: "bubble",

      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "none",
        contents: rows
      }
    }
  };
}

// =========================
// BUILD MEDIA GRIDS
// =========================

function buildMediaGrids(mediaItems) {

  // ใช้รูปทั้งหมดที่อ่านได้จาก Folder
  const items =
    mediaItems;

  const grids = [];

  for (
    let i = 0;
    i < items.length;
    i += 8
  ) {

    const set =
      items.slice(
        i,
        i + 8
      );

    grids.push(
      buildImageGrid8(
        set,
        `ตัวอย่างผลงานชุดที่ ${grids.length + 1}`
      )
    );
  }

  return grids;
}

// =========================
// CUSTOMER SESSION
// =========================

async function getCustomerSession(userId) {

  const { data, error } = await supabase
    .from("customer_sessions")
    .select("*")
    .eq("line_user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}


async function saveCustomerSession(
  userId,
  updates
) {

  const { error } = await supabase
    .from("customer_sessions")
    .upsert(
      {
        line_user_id: userId,
        ...updates,
        updated_at:
          new Date().toISOString()
      },
      {
        onConflict: "line_user_id"
      }
    );

  if (error) {
    throw error;
  }
}

// =========================
// SALES RESPONSE SLA TRACKING
// =========================

function getCustomerMessageSummary(event) {
  const messageType = event?.message?.type;

  if (messageType === "text") {
    return String(event?.message?.text || "")
      .trim()
      .slice(0, 1000);
  }

  if (messageType === "image") return "[รูปภาพ]";
  if (messageType === "sticker") return "[สติกเกอร์]";
  return "[ข้อความลูกค้า]";
}

function getCustomerChannelLabel(userId) {
  const id = String(userId || "");
  if (id.startsWith("manychat:ig:")) return "Instagram";
  if (id.startsWith("manychat:")) return "Facebook";
  if (/^U[0-9a-f]{32}$/i.test(id)) return "LINE";
  return "Unknown";
}

function normalizeReminderTimestamp(value) {
  const parsed = Date.parse(String(value || ""));
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toISOString();
}

// =========================
// BANGKOK BUSINESS TIME
// =========================

const BANGKOK_OFFSET_MS =
  7 * 60 * 60 * 1000;

const SALES_OPEN_HOUR = 9;
const NEW_CHAT_CUTOFF_HOUR = 18;
const SALES_CLOSE_CHECK_HOUR = 20;

function getBangkokParts(value = new Date()) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  const local =
    new Date(
      date.getTime() +
      BANGKOK_OFFSET_MS
    );

  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds()
  };
}

function formatBangkokDateKey(value = new Date()) {
  const p =
    getBangkokParts(value);

  return [
    String(p.year).padStart(4, "0"),
    String(p.month).padStart(2, "0"),
    String(p.day).padStart(2, "0")
  ].join("-");
}

function addDaysToDateKey(
  dateKey,
  days
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/
      .exec(
        String(dateKey || "")
      );

  if (!match) {
    return "";
  }

  const date =
    new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]) +
          Number(days || 0)
      )
    );

  return [
    String(
      date.getUTCFullYear()
    ).padStart(4, "0"),

    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0"),

    String(
      date.getUTCDate()
    ).padStart(2, "0")
  ].join("-");
}

function bangkokDateTimeToUtcMs(
  dateKey,
  hour,
  minute = 0
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/
      .exec(
        String(dateKey || "")
      );

  if (!match) {
    return NaN;
  }

  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(hour) - 7,
    Number(minute),
    0,
    0
  );
}

function getBusinessDateForCustomerMessage(
  value
) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  const p =
    getBangkokParts(date);

  const dateKey =
    formatBangkokDateKey(date);

  // ข้อความตั้งแต่ 18:00 เป็นต้นไป
  // เป็นงานของวันทำการถัดไป
  if (
    p.hour >=
      NEW_CHAT_CUTOFF_HOUR
  ) {
    return addDaysToDateKey(
      dateKey,
      1
    );
  }

  return dateKey;
}

function isBangkokReminderWindow(
  value = new Date()
) {
  const p =
    getBangkokParts(value);

  return (
    p.hour >=
      SALES_OPEN_HOUR &&
    p.hour <
      SALES_CLOSE_CHECK_HOUR
  );
}

function getNextSalesReminderDueMs(
  customerMessageAt,
  lastReminderAt
) {
  const customerMs =
    Date.parse(
      String(
        customerMessageAt || ""
      )
    );

  if (
    Number.isNaN(
      customerMs
    )
  ) {
    return NaN;
  }

  const lastReminderMs =
    Date.parse(
      String(
        lastReminderAt || ""
      )
    );

  const hasLastReminder =
    !Number.isNaN(
      lastReminderMs
    );

  let cursorMs =
    hasLastReminder
      ? lastReminderMs
      : customerMs;

  let p =
    getBangkokParts(
      new Date(cursorMs)
    );

  let dateKey =
    formatBangkokDateKey(
      new Date(cursorMs)
    );

  // ข้อความใหม่ที่เข้าหลัง 18:00
  // เริ่มจับเวลาใหม่ตอน 09:00 วันถัดไป
  if (
    !hasLastReminder &&
    p.hour >=
      NEW_CHAT_CUTOFF_HOUR
  ) {
    dateKey =
      addDaysToDateKey(
        dateKey,
        1
      );

    cursorMs =
      bangkokDateTimeToUtcMs(
        dateKey,
        SALES_OPEN_HOUR,
        0
      );

  } else if (
    p.hour <
      SALES_OPEN_HOUR
  ) {
    cursorMs =
      bangkokDateTimeToUtcMs(
        dateKey,
        SALES_OPEN_HOUR,
        0
      );

  } else if (
    p.hour >=
      SALES_CLOSE_CHECK_HOUR
  ) {
    dateKey =
      addDaysToDateKey(
        dateKey,
        1
      );

    cursorMs =
      bangkokDateTimeToUtcMs(
        dateKey,
        SALES_OPEN_HOUR,
        0
      );
  }

  let remainingMinutes =
    SALES_REMINDER_MINUTES;

  while (
    remainingMinutes > 0
  ) {
    const cursorDateKey =
      formatBangkokDateKey(
        new Date(cursorMs)
      );

    const endMs =
      bangkokDateTimeToUtcMs(
        cursorDateKey,
        SALES_CLOSE_CHECK_HOUR,
        0
      );

    const availableMinutes =
      Math.max(
        0,
        Math.floor(
          (
            endMs -
            cursorMs
          ) /
          60000
        )
      );

    if (
      remainingMinutes <=
        availableMinutes
    ) {
      return (
        cursorMs +
        remainingMinutes *
          60 *
          1000
      );
    }

    remainingMinutes -=
      availableMinutes;

    const nextDateKey =
      addDaysToDateKey(
        cursorDateKey,
        1
      );

    cursorMs =
      bangkokDateTimeToUtcMs(
        nextDateKey,
        SALES_OPEN_HOUR,
        0
      );
  }

  return cursorMs;
}

async function recordLineDailyCloseWatch(
  userId,
  event,
  messageAt
) {
  const id =
    String(
      userId || ""
    );

  // เฉพาะ LINE 1:1
  if (
    !/^U[0-9a-f]{32}$/i
      .test(id)
  ) {
    return;
  }

  if (
    event?.type !==
      "message"
  ) {
    return;
  }

  const messageAtIso =
    normalizeReminderTimestamp(
      messageAt
    );

  if (!messageAtIso) {
    return;
  }

  const businessDate =
    getBusinessDateForCustomerMessage(
      new Date(
        messageAtIso
      )
    );

  const messageText =
    getCustomerMessageSummary(
      event
    );

  const {
    error
  } =
    await supabase
      .from(
        "sales_daily_chat_watch"
      )
      .upsert(
        {
          line_user_id:
            id,

          business_date:
            businessDate,

          last_customer_message_at:
            messageAtIso,

          last_customer_message_text:
            messageText,

          // ลูกค้าพิมพ์มาใหม่
          // แปลว่าเป็นรอบรอคำตอบใหม่
          answered_at:
            null,

          counted_at:
            null,

          updated_at:
            new Date()
              .toISOString()
        },
        {
          onConflict:
            "line_user_id,business_date"
        }
      );

  if (error) {
    console.error(
      "DAILY CLOSE WATCH SAVE ERROR:",
      {
        userId: id,
        businessDate,
        error
      }
    );
  }
}

async function sendSalesGroupText(
  text
) {
  // V5.6 SAFE TEST: absolute quota guard for watcher/audit alerts.
  // Customer-facing LINE replies use other functions and are unaffected.
  if (OA_WATCHER_DRY_RUN) {
    console.log(
      "OA WATCHER DRY RUN - SALES GROUP PUSH BLOCKED:",
      String(text || "").slice(0, 1000)
    );

    return {
      dryRun: true,
      blocked: true
    };
  }

  if (
    !SALES_ALERT_LINE_GROUP_ID
  ) {
    throw new Error(
      "SALES_ALERT_LINE_GROUP_ID is not configured"
    );
  }

  const response =
    await fetch(
      "https://api.line.me/v2/bot/message/push",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        },

        body:
          JSON.stringify({
            to:
              SALES_ALERT_LINE_GROUP_ID,

            messages: [
              {
                type:
                  "text",

                text:
                  String(text || "")
                    .slice(
                      0,
                      5000
                    )
              }
            ]
          })
      }
    );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `LINE SALES GROUP TEXT ERROR ${response.status}: ${errorText}`
    );
  }
}

function getMonthlyCycleForDateKey(
  dateKey
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/
      .exec(
        String(dateKey || "")
      );

  if (!match) {
    return null;
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  if (day !== 25) {
    return null;
  }

  const currentMonthDate =
    new Date(
      Date.UTC(
        year,
        month - 1,
        1
      )
    );

  const previousMonthDate =
    new Date(
      Date.UTC(
        year,
        month - 2,
        1
      )
    );

  const cycleStart =
    [
      String(
        previousMonthDate
          .getUTCFullYear()
      ).padStart(4, "0"),

      String(
        previousMonthDate
          .getUTCMonth() + 1
      ).padStart(2, "0"),

      "26"
    ].join("-");

  const cycleEnd =
    [
      String(
        currentMonthDate
          .getUTCFullYear()
      ).padStart(4, "0"),

      String(
        currentMonthDate
          .getUTCMonth() + 1
      ).padStart(2, "0"),

      "25"
    ].join("-");

  return {
    cycleStart,
    cycleEnd
  };
}

function formatThaiDateFromKey(
  dateKey
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/
      .exec(
        String(dateKey || "")
      );

  if (!match) {
    return dateKey;
  }

  return (
    `${match[3]}/` +
    `${match[2]}/` +
    `${match[1]}`
  );
}

async function getReminderCustomerMeta(userId) {
  const id = String(userId || "");

  if (/^U[0-9a-f]{32}$/i.test(id)) {
    try {
      const response = await fetch(
        `https://api.line.me/v2/bot/profile/${encodeURIComponent(id)}`,
        {
          headers: {
            Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        return {
          name: String(data?.displayName || "").trim(),
          chatUrl: ""
        };
      }
    } catch (error) {
      console.error("LINE PROFILE LOOKUP ERROR:", error);
    }
  }

  if (id.startsWith("manychat:") && MANYCHAT_API_TOKEN) {
    const subscriberId = id.startsWith("manychat:ig:")
      ? id.replace(/^manychat:ig:/, "")
      : id.replace(/^manychat:/, "");

    try {
      const url =
        "https://api.manychat.com/fb/subscriber/getInfo" +
        `?subscriber_id=${encodeURIComponent(subscriberId)}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${MANYCHAT_API_TOKEN}`,
          Accept: "application/json"
        }
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        const data = result?.data || {};

        return {
          name: String(
            data?.name ||
              [data?.first_name, data?.last_name]
                .filter(Boolean)
                .join(" ") ||
              ""
          ).trim(),
          chatUrl: String(
            data?.live_chat_url || data?.liveChatUrl || ""
          ).trim()
        };
      }
    } catch (error) {
      console.error("MANYCHAT CONTACT LOOKUP ERROR:", error);
    }
  }

  return { name: "", chatUrl: "" };
}


function normalizeOaCustomerName(
  value
) {
  const name =
    String(
      value ||
      ""
    ).trim();

  if (!name) {
    return "";
  }

  const upper =
    name.toUpperCase();

  if (
    upper === "EMPTY" ||
    upper === "UNKNOWN" ||
    name === "ไม่ทราบชื่อ"
  ) {
    return "";
  }

  return name.slice(
    0,
    300
  );
}

async function getCachedLineCustomerName(
  lineUserId
) {
  const userId =
    String(
      lineUserId ||
      ""
    ).trim();

  if (
    !/^U[0-9a-f]{32}$/i
      .test(userId)
  ) {
    return "";
  }

  try {
    const {
      data,
      error
    } =
      await supabase
        .from(
          "oa_line_identity"
        )
        .select(
          "customer_name"
        )
        .eq(
          "line_user_id",
          userId
        )
        .not(
          "customer_name",
          "is",
          null
        )
        .order(
          "updated_at",
          {
            ascending:
              false
          }
        )
        .limit(1);

    if (error) {
      throw error;
    }

    const cached =
      normalizeOaCustomerName(
        data?.[0]
          ?.customer_name
      );

    if (cached) {
      return cached;
    }

  } catch (error) {
    console.error(
      "OA IDENTITY CACHE LOOKUP ERROR:",
      error
    );
  }

  return "";
}

async function resolveLineCustomerName(
  lineUserId
) {
  const cached =
    await getCachedLineCustomerName(
      lineUserId
    );

  if (cached) {
    return cached;
  }

  try {
    const meta =
      await getReminderCustomerMeta(
        lineUserId
      );

    return normalizeOaCustomerName(
      meta?.name
    );

  } catch (error) {
    console.error(
      "OA IDENTITY PROFILE LOOKUP ERROR:",
      error
    );

    return "";
  }
}

async function patchOaChatStateIdentity({
  oaChatKey,
  lineUserId,
  customerName
}) {
  const chatKey =
    String(
      oaChatKey ||
      ""
    ).trim();

  const userId =
    String(
      lineUserId ||
      ""
    ).trim();

  const name =
    normalizeOaCustomerName(
      customerName
    );

  if (!chatKey) {
    return;
  }

  const patch = {
    updated_at:
      new Date()
        .toISOString()
  };

  if (
    /^U[0-9a-f]{32}$/i
      .test(userId)
  ) {
    patch.line_user_id =
      userId;
  }

  if (name) {
    patch.customer_name =
      name;
  }

  if (
    !patch.line_user_id &&
    !patch.customer_name
  ) {
    return;
  }

  const {
    error
  } =
    await supabase
      .from(
        "oa_chat_state"
      )
      .update(
        patch
      )
      .eq(
        "chat_key",
        chatKey
      );

  if (error) {
    throw error;
  }
}

async function syncOaChatStateFromLineWebhook({
  oaChatKey,
  lineUserId,
  customerName,
  event
}) {
  const chatKey =
    String(
      oaChatKey ||
      ""
    ).trim();

  const userId =
    String(
      lineUserId ||
      ""
    ).trim();

  if (
    !/^U[0-9a-f]{32}$/i
      .test(chatKey) ||
    !/^U[0-9a-f]{32}$/i
      .test(userId) ||
    event?.type !==
      "message"
  ) {
    return {
      synced: false,
      reason:
        "invalid_input"
    };
  }

  const eventTimestamp =
    Number(
      event?.timestamp ||
      0
    );

  const latestMessageAt =
    Number.isFinite(
      eventTimestamp
    ) &&
    eventTimestamp > 0
      ? new Date(
          eventTimestamp
        ).toISOString()
      : new Date()
          .toISOString();

  const capturedAt =
    new Date()
      .toISOString();

  const existingMap =
    await loadExistingChatStates(
      [chatKey]
    );

  const incoming = {
    chat_key:
      chatKey,

    customer_name:
      normalizeOaCustomerName(
        customerName
      ) || null,

    line_user_id:
      userId,

    latest_message_id:
      String(
        event
          ?.message
          ?.id ||
        ""
      ).trim() || null,

    latest_side:
      "customer",

    latest_message_at:
      latestMessageAt,

    latest_message_text:
      getCustomerMessageSummary(
        event
      ),

    pending_since_at:
      latestMessageAt
  };

  const merged =
    mergeWatcherChatState(
      incoming,
      existingMap.get(
        chatKey
      ),
      {
        deviceId:
          "LINE-WEBHOOK",
        capturedAt
      }
    );

  // ถ้า state ปัจจุบันใหม่กว่า webhook event นี้แล้ว
  // mergeWatcherChatState จะคืน null เพื่อกัน event เก่าย้อน state
  if (!merged) {
    return {
      synced: false,
      reason:
        "older_than_current_state"
    };
  }

  const {
    error
  } =
    await supabase
      .from(
        "oa_chat_state"
      )
      .upsert(
        merged,
        {
          onConflict:
            "chat_key"
        }
      );

  if (error) {
    throw error;
  }

  return {
    synced: true,
    chatKey,
    latestMessageAt
  };
}

async function recordLineIdentityFromWebhook(
  lineUserId,
  event
) {
  const userId =
    String(
      lineUserId ||
      ""
    ).trim();

  const messageId =
    String(
      event
        ?.message
        ?.id ||
      ""
    ).trim();

  if (
    !messageId ||
    !/^U[0-9a-f]{32}$/i
      .test(userId)
  ) {
    return;
  }

  const customerName =
    await resolveLineCustomerName(
      userId
    );

  const identityPatch = {
    message_id:
      messageId,

    line_user_id:
      userId,

    updated_at:
      new Date()
        .toISOString()
  };

  if (customerName) {
    identityPatch.customer_name =
      customerName;
  }

  const {
    error:
      upsertError
  } =
    await supabase
      .from(
        "oa_line_identity"
      )
      .upsert(
        identityPatch,
        {
          onConflict:
            "message_id"
        }
      );

  if (upsertError) {
    throw upsertError;
  }

  const {
    data:
      exactRow,
    error:
      exactError
  } =
    await supabase
      .from(
        "oa_line_identity"
      )
      .select(
        "message_id,line_user_id,oa_chat_key,customer_name"
      )
      .eq(
        "message_id",
        messageId
      )
      .maybeSingle();

  if (exactError) {
    throw exactError;
  }

  let oaChatKey =
    String(
      exactRow
        ?.oa_chat_key ||
      ""
    ).trim();

  let finalName =
    normalizeOaCustomerName(
      exactRow
        ?.customer_name ||
      customerName
    );

  if (!oaChatKey) {
    const {
      data:
        priorRows,
      error:
        priorError
    } =
      await supabase
        .from(
          "oa_line_identity"
        )
        .select(
          "oa_chat_key,customer_name"
        )
        .eq(
          "line_user_id",
          userId
        )
        .not(
          "oa_chat_key",
          "is",
          null
        )
        .order(
          "updated_at",
          {
            ascending:
              false
          }
        )
        .limit(1);

    if (priorError) {
      throw priorError;
    }

    oaChatKey =
      String(
        priorRows?.[0]
          ?.oa_chat_key ||
        ""
      ).trim();

    finalName =
      normalizeOaCustomerName(
        finalName ||
        priorRows?.[0]
          ?.customer_name
      );
  }

  if (oaChatKey) {
    // เติม oa_chat_key ลง identity row ของ message ปัจจุบันด้วย
    // เพื่อไม่ให้ข้อความใหม่ค้าง oa_chat_key = NULL แม้เรารู้ mapping แล้ว
    const identityUpdate = {
      oa_chat_key:
        oaChatKey,

      updated_at:
        new Date()
          .toISOString()
    };

    if (finalName) {
      identityUpdate.customer_name =
        finalName;
    }

    const {
      error:
        identityUpdateError
    } =
      await supabase
        .from(
          "oa_line_identity"
        )
        .update(
          identityUpdate
        )
        .eq(
          "message_id",
          messageId
        );

    if (identityUpdateError) {
      throw identityUpdateError;
    }

    // สำคัญ: LINE Messaging API webhook เป็น source ที่เสถียรสำหรับฝั่งลูกค้า
    // ถ้า EventStream พลาด inbound event อย่างเคส Bom
    // ให้ webhook sync latest customer state เข้า oa_chat_state โดยตรง
    await syncOaChatStateFromLineWebhook({
      oaChatKey,
      lineUserId:
        userId,
      customerName:
        finalName,
      event
    });
  }
}

async function recordOaIdentityFromWatcherChat(
  incoming
) {
  const messageId =
    String(
      incoming
        ?.latest_message_id ||
      ""
    ).trim();

  const oaChatKey =
    String(
      incoming
        ?.chat_key ||
      ""
    ).trim();

  if (
    !messageId ||
    !/^U[0-9a-f]{32}$/i
      .test(oaChatKey)
  ) {
    return {
      lineUserId:
        "",
      customerName:
        ""
    };
  }

  const {
    error:
      upsertError
  } =
    await supabase
      .from(
        "oa_line_identity"
      )
      .upsert(
        {
          message_id:
            messageId,

          oa_chat_key:
            oaChatKey,

          updated_at:
            new Date()
              .toISOString()
        },
        {
          onConflict:
            "message_id"
        }
      );

  if (upsertError) {
    throw upsertError;
  }

  const {
    data:
      exactRow,
    error:
      exactError
  } =
    await supabase
      .from(
        "oa_line_identity"
      )
      .select(
        "message_id,line_user_id,oa_chat_key,customer_name"
      )
      .eq(
        "message_id",
        messageId
      )
      .maybeSingle();

  if (exactError) {
    throw exactError;
  }

  let lineUserId =
    String(
      exactRow
        ?.line_user_id ||
      ""
    ).trim();

  let customerName =
    normalizeOaCustomerName(
      exactRow
        ?.customer_name
    );

  if (!lineUserId) {
    const {
      data:
        priorRows,
      error:
        priorError
    } =
      await supabase
        .from(
          "oa_line_identity"
        )
        .select(
          "line_user_id,customer_name"
        )
        .eq(
          "oa_chat_key",
          oaChatKey
        )
        .not(
          "line_user_id",
          "is",
          null
        )
        .order(
          "updated_at",
          {
            ascending:
              false
          }
        )
        .limit(1);

    if (priorError) {
      throw priorError;
    }

    lineUserId =
      String(
        priorRows?.[0]
          ?.line_user_id ||
        ""
      ).trim();

    customerName =
      normalizeOaCustomerName(
        customerName ||
        priorRows?.[0]
          ?.customer_name
      );
  }

  if (
    lineUserId ||
    customerName
  ) {
    await patchOaChatStateIdentity({
      oaChatKey,
      lineUserId,
      customerName
    });
  }

  return {
    lineUserId,
    customerName
  };
}

async function sendSalesReminderToGroup(session) {
  if (!SALES_ALERT_LINE_GROUP_ID) {
    throw new Error("SALES_ALERT_LINE_GROUP_ID is not configured");
  }

  const userId = String(session?.line_user_id || "");
  const customerMessageAt = normalizeReminderTimestamp(
    session?.last_customer_message_at
  );

  // แจ้งเตือนเฉพาะ LINE 1:1 เท่านั้น
  if (!/^U[0-9a-f]{32}$/i.test(userId)) {
    console.log(
      "SALES REMINDER BLOCKED NON-LINE:",
      {
        mode: SALES_REMINDER_MODE,
        userId
      }
    );

    return false;
  }

  if (!customerMessageAt) return false;

  const meta = await getReminderCustomerMeta(userId);
  const channel = getCustomerChannelLabel(userId);
  const vehicle = [session?.brand, session?.model]
    .filter(Boolean)
    .join(" ") || "-";
  const service = String(session?.service || "-");
  const messageText = String(
    session?.last_customer_message_text || "[ไม่มีข้อความ]"
  )
    .trim()
    .slice(0, 500);

  const waitedMinutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(customerMessageAt)) / 60000)
  );

  const bodyContents = [
    {
      type: "text",
      text: `⚠️ ลูกค้ารอการตอบเกิน ${SALES_REMINDER_MINUTES} นาที`,
      weight: "bold",
      size: "lg",
      wrap: true
    },
    {
      type: "text",
      text: `ช่องทาง: ${channel}`,
      margin: "md",
      wrap: true
    }
  ];

  if (meta.name) {
    bodyContents.push({
      type: "text",
      text: `ลูกค้า: ${meta.name}`,
      wrap: true
    });
  }

  bodyContents.push(
    { type: "text", text: `รถ: ${vehicle}`, wrap: true },
    { type: "text", text: `บริการ: ${service}`, wrap: true },
    { type: "text", text: `รอแล้ว: ${waitedMinutes} นาที`, wrap: true },
    { type: "separator", margin: "md" },
    {
      type: "text",
      text: `ข้อความล่าสุด: ${messageText}`,
      margin: "md",
      wrap: true
    }
  );

  const bubble = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: bodyContents
    }
  };

  // Facebook / Instagram อาจมีลิงก์เปิดแชทจาก ManyChat
  // LINE ไม่มีลิงก์นี้ จึงไม่สร้าง footer ว่าง
  if (meta.chatUrl) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          action: {
            type: "uri",
            label: "เปิดแชท",
            uri: meta.chatUrl
          }
        }
      ]
    };
  }

  const response = await fetch(
    "https://api.line.me/v2/bot/message/push",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: SALES_ALERT_LINE_GROUP_ID,
        messages: [
          {
            type: "flex",
            altText: `⚠️ ลูกค้ารอการตอบเกิน ${SALES_REMINDER_MINUTES} นาที`,
            contents: bubble
          }
        ]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LINE SALES REMINDER ERROR ${response.status}: ${errorText}`
    );
  }

  return true;
}

async function checkOverdueSalesChats() {
  const now =
    new Date();

  const nowMs =
    now.getTime();

  // 90-minute reminders only run
  // from 09:00 until before 20:00 Bangkok time.
  // New customer messages received from 18:00 onward
  // start their 90-minute clock at 09:00 the next day.
  if (
    !isBangkokReminderWindow(
      now
    )
  ) {
    return {
      checked: 0,
      sent: 0,
      skippedOffHours: true,
      skippedAnswered: 0,
      skippedNotDue: 0,
      failed: 0
    };
  }

  const {
    data,
    error
  } =
    await supabase
      .from(
        "customer_sessions"
      )
      .select(
        "line_user_id,stage,ai_enabled,service,brand,model,last_customer_message_at,last_customer_message_text,last_sales_message_at,sales_reminder_sent_at"
      )

      // LINE only
      .like(
        "line_user_id",
        "U%"
      )

      .not(
        "last_customer_message_at",
        "is",
        null
      )

      // Sales-owned chats only
      .or(
        "stage.eq.HUMAN_HANDOFF,ai_enabled.eq.false"
      )

      .order(
        "last_customer_message_at",
        {
          ascending:
            true
        }
      )

      .limit(1000);

  if (error) {
    throw error;
  }

  const lineSessions =
    (data || [])
      .filter(
        session =>
          /^U[0-9a-f]{32}$/i.test(
            String(
              session?.line_user_id ||
              ""
            )
          )
      );

  let sent = 0;
  let skippedAnswered = 0;
  let skippedNotDue = 0;
  let failed = 0;

  for (
    const session of
      lineSessions
  ) {
    const userId =
      String(
        session
          .line_user_id ||
        ""
      );

    if (
      !/^U[0-9a-f]{32}$/i
        .test(userId)
    ) {
      continue;
    }

    const customerMessageAt =
      normalizeReminderTimestamp(
        session
          .last_customer_message_at
      );

    if (!customerMessageAt) {
      continue;
    }

    const customerMessageMs =
      Date.parse(
        customerMessageAt
      );

    const salesMessageAt =
      normalizeReminderTimestamp(
        session
          .last_sales_message_at
      );

    if (salesMessageAt) {
      const salesMessageMs =
        Date.parse(
          salesMessageAt
        );

      if (
        salesMessageMs >
          customerMessageMs
      ) {
        skippedAnswered += 1;
        continue;
      }
    }

    const lastReminderAt =
      normalizeReminderTimestamp(
        session
          .sales_reminder_sent_at
      );

    const dueMs =
      getNextSalesReminderDueMs(
        customerMessageAt,
        lastReminderAt
      );

    if (
      Number.isNaN(dueMs) ||
      nowMs < dueMs
    ) {
      skippedNotDue += 1;
      continue;
    }

    try {
      const wasSent =
        await sendSalesReminderToGroup(
          session
        );

      if (!wasSent) {
        continue;
      }

      const sentAt =
        new Date()
          .toISOString();

      const {
        error:
          updateError
      } =
        await supabase
          .from(
            "customer_sessions"
          )
          .update({
            sales_reminder_sent_at:
              sentAt,

            updated_at:
              sentAt
          })
          .eq(
            "line_user_id",
            session
              .line_user_id
          )
          .eq(
            "last_customer_message_at",
            customerMessageAt
          );

      if (updateError) {
        throw updateError;
      }

      sent += 1;

    } catch (error) {
      failed += 1;

      console.error(
        "SALES REMINDER SEND ERROR:",
        {
          userId:
            session
              .line_user_id,

          error:
            String(
              error?.message ||
              error
            )
        }
      );
    }
  }

  return {
    mode:
      SALES_REMINDER_MODE,

    queried:
      Array.isArray(data)
        ? data.length
        : 0,

    checked:
      lineSessions.length,

    sent,
    skippedOffHours:
      false,
    skippedAnswered,
    skippedNotDue,
    failed
  };
}

async function syncDailyWatchAnsweredState(
  businessDate
) {
  const {
    data:
      watches,
    error:
      watchError
  } =
    await supabase
      .from(
        "sales_daily_chat_watch"
      )
      .select(
        "line_user_id,last_customer_message_at"
      )
      .eq(
        "business_date",
        businessDate
      )
      .is(
        "answered_at",
        null
      );

  if (watchError) {
    throw watchError;
  }

  const ids =
    [
      ...new Set(
        (watches || [])
          .map(
            item =>
              String(
                item
                  .line_user_id ||
                ""
              )
          )
          .filter(Boolean)
      )
    ];

  if (
    ids.length === 0
  ) {
    return;
  }

  const {
    data:
      sessions,
    error:
      sessionError
  } =
    await supabase
      .from(
        "customer_sessions"
      )
      .select(
        "line_user_id,last_sales_message_at"
      )
      .in(
        "line_user_id",
        ids
      );

  if (sessionError) {
    throw sessionError;
  }

  const sessionMap =
    new Map(
      (sessions || [])
        .map(
          item => [
            String(
              item
                .line_user_id ||
              ""
            ),
            item
          ]
        )
    );

  for (
    const watch of
      watches || []
  ) {
    const session =
      sessionMap.get(
        String(
          watch
            .line_user_id ||
          ""
        )
      );

    const salesAt =
      normalizeReminderTimestamp(
        session
          ?.last_sales_message_at
      );

    const customerAt =
      normalizeReminderTimestamp(
        watch
          .last_customer_message_at
      );

    if (
      !salesAt ||
      !customerAt
    ) {
      continue;
    }

    if (
      Date.parse(salesAt) >
      Date.parse(customerAt)
    ) {
      const {
        error:
          updateError
      } =
        await supabase
          .from(
            "sales_daily_chat_watch"
          )
          .update({
            answered_at:
              salesAt,

            updated_at:
              new Date()
                .toISOString()
          })
          .eq(
            "line_user_id",
            watch
              .line_user_id
          )
          .eq(
            "business_date",
            businessDate
          );

      if (updateError) {
        throw updateError;
      }
    }
  }
}

async function maybeRunDailyCloseSummary(
  now = new Date()
) {
  const p =
    getBangkokParts(
      now
    );

  const businessDate =
    formatBangkokDateKey(
      now
    );

  // Run only after 20:00 Bangkok
  if (
    p.hour <
      SALES_CLOSE_CHECK_HOUR
  ) {
    return {
      ran: false,
      reason:
        "before_20"
    };
  }

  const {
    data:
      existingSummary,
    error:
      existingError
  } =
    await supabase
      .from(
        "sales_daily_close_summary"
      )
      .select(
        "business_date,missed_count"
      )
      .eq(
        "business_date",
        businessDate
      )
      .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingSummary) {
    return {
      ran: false,
      reason:
        "already_done",
      missedCount:
        Number(
          existingSummary
            .missed_count ||
          0
        )
    };
  }

  await syncDailyWatchAnsweredState(
    businessDate
  );

  const {
    data:
      watchRows,
    error:
      watchError
  } =
    await supabase
      .from(
        "sales_daily_chat_watch"
      )
      .select(
        "line_user_id,last_customer_message_at,last_customer_message_text,answered_at,counted_at"
      )
      .eq(
        "business_date",
        businessDate
      )
      .is(
        "answered_at",
        null
      )
      .is(
        "counted_at",
        null
      )
      .order(
        "last_customer_message_at",
        {
          ascending:
            true
        }
      );

  if (watchError) {
    throw watchError;
  }

  // Count only chats currently owned by sales.
  const ids =
    [
      ...new Set(
        (watchRows || [])
          .map(
            row =>
              String(
                row
                  .line_user_id ||
                ""
              )
          )
          .filter(Boolean)
      )
    ];

  let salesOwnedIds =
    new Set();

  if (
    ids.length > 0
  ) {
    const {
      data:
        sessionRows,
      error:
        sessionError
    } =
      await supabase
        .from(
          "customer_sessions"
        )
        .select(
          "line_user_id,stage,ai_enabled,last_sales_message_at"
        )
        .in(
          "line_user_id",
          ids
        );

    if (sessionError) {
      throw sessionError;
    }

    salesOwnedIds =
      new Set(
        (sessionRows || [])
          .filter(
            row =>
              row.stage ===
                "HUMAN_HANDOFF" ||
              row.ai_enabled ===
                false
          )
          .map(
            row =>
              String(
                row
                  .line_user_id ||
                ""
              )
          )
      );
  }

  const missedRows =
    (watchRows || [])
      .filter(
        row =>
          salesOwnedIds.has(
            String(
              row
                .line_user_id ||
              ""
            )
          )
      );

  const details = [];

  for (
    const row of
      missedRows
  ) {
    const userId =
      String(
        row
          .line_user_id ||
        ""
      );

    const meta =
      await getReminderCustomerMeta(
        userId
      );

    details.push({
      line_user_id:
        userId,

      name:
        meta.name ||
        userId.slice(
          0,
          10
        ),

      last_customer_message_at:
        row
          .last_customer_message_at,

      text:
        String(
          row
            .last_customer_message_text ||
          ""
        )
          .trim()
          .slice(
            0,
            150
          )
    });
  }

  const missedCount =
    details.length;

  // No pending chats = record silently.
  // Do not send a group message.
  if (
    missedCount > 0
  ) {
    const maxDetailRows =
      20;

    const lines =
      details
        .slice(
          0,
          maxDetailRows
        )
        .map(
          item =>
            `-1 ${item.name}` +
            (
              item.text
                ? ` — ${item.text}`
                : ""
            )
        );

    if (
      details.length >
      maxDetailRows
    ) {
      lines.push(
        `...อีก ${
          details.length -
          maxDetailRows
        } แชท`
      );
    }

    const message =
      [
        `📊 สรุปแชทค้างก่อนกลับบ้าน ${formatThaiDateFromKey(businessDate)}`,
        "",
        ...lines,
        "",
        `รวมวันนี้: -${missedCount} (${missedCount} แชท)`
      ].join("\n");

    await sendSalesGroupText(
      message
    );
  }

  const nowIso =
    new Date()
      .toISOString();

  const {
    error:
      summarySaveError
  } =
    await supabase
      .from(
        "sales_daily_close_summary"
      )
      .insert({
        business_date:
          businessDate,

        missed_count:
          missedCount,

        details,

        sent_at:
          missedCount > 0
            ? nowIso
            : null,

        created_at:
          nowIso
      });

  if (summarySaveError) {
    throw summarySaveError;
  }

  if (
    missedRows.length > 0
  ) {
    for (
      const row of
        missedRows
    ) {
      const {
        error:
          countError
      } =
        await supabase
          .from(
            "sales_daily_chat_watch"
          )
          .update({
            counted_at:
              nowIso,

            updated_at:
              nowIso
          })
          .eq(
            "line_user_id",
            row
              .line_user_id
          )
          .eq(
            "business_date",
            businessDate
          );

      if (countError) {
        throw countError;
      }
    }
  }

  return {
    ran: true,
    businessDate,
    missedCount
  };
}

async function maybeRunMonthlyCloseSummary(
  now = new Date()
) {
  const p =
    getBangkokParts(
      now
    );

  const today =
    formatBangkokDateKey(
      now
    );

  if (
    p.hour <
      SALES_CLOSE_CHECK_HOUR
  ) {
    return {
      ran: false,
      reason:
        "before_20"
    };
  }

  const cycle =
    getMonthlyCycleForDateKey(
      today
    );

  if (!cycle) {
    return {
      ran: false,
      reason:
        "not_25"
    };
  }

  const {
    data:
      existing,
    error:
      existingError
  } =
    await supabase
      .from(
        "sales_monthly_close_summary"
      )
      .select(
        "cycle_end,missed_count"
      )
      .eq(
        "cycle_end",
        cycle.cycleEnd
      )
      .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    return {
      ran: false,
      reason:
        "already_done",
      missedCount:
        Number(
          existing
            .missed_count ||
          0
        )
    };
  }

  // Ensure today's daily summary exists first.
  await maybeRunDailyCloseSummary(
    now
  );

  const {
    data:
      dailyRows,
    error:
      dailyError
  } =
    await supabase
      .from(
        "sales_daily_close_summary"
      )
      .select(
        "business_date,missed_count"
      )
      .gte(
        "business_date",
        cycle.cycleStart
      )
      .lte(
        "business_date",
        cycle.cycleEnd
      );

  if (dailyError) {
    throw dailyError;
  }

  const totalMissed =
    (dailyRows || [])
      .reduce(
        (
          sum,
          row
        ) =>
          sum +
          Number(
            row
              .missed_count ||
            0
          ),
        0
      );

  const message =
    [
      "📅 สรุปแชทค้างรอบเดือน",
      `${formatThaiDateFromKey(cycle.cycleStart)} - ${formatThaiDateFromKey(cycle.cycleEnd)}`,
      "",
      `เซลล์ลืมตอบแชทก่อนกลับบ้านทั้งหมด: ${totalMissed} แชท`,
      `คะแนนสะสมรอบนี้: -${totalMissed}`
    ].join("\n");

  await sendSalesGroupText(
    message
  );

  const nowIso =
    new Date()
      .toISOString();

  const {
    error:
      monthlySaveError
  } =
    await supabase
      .from(
        "sales_monthly_close_summary"
      )
      .insert({
        cycle_start:
          cycle.cycleStart,

        cycle_end:
          cycle.cycleEnd,

        missed_count:
          totalMissed,

        sent_at:
          nowIso,

        created_at:
          nowIso
      });

  if (monthlySaveError) {
    throw monthlySaveError;
  }

  return {
    ran: true,
    ...cycle,
    missedCount:
      totalMissed
  };
}

async function runSalesMaintenance() {
  const reminders =
    await checkOverdueSalesChats();

  const daily =
    await maybeRunDailyCloseSummary();

  const monthly =
    await maybeRunMonthlyCloseSummary();

  return {
    reminders,
    daily,
    monthly
  };
}

// =========================
// SILENT HUMAN HANDOFF
// =========================

async function silentHandoff(
  userId
) {

  await saveCustomerSession(
    userId,
    {
      stage:
        "HUMAN_HANDOFF",

      ai_enabled:
        false
    }
  );
}

function normalizeValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, "");
}

// =========================
// DETECT CUSTOMER LANGUAGE
// =========================

function detectCustomerLanguage(
  text,
  currentLanguage = "UNKNOWN"
) {

  const value =
    String(text || "")
      .trim();


  if (!value) {
    return "UNKNOWN";
  }


  // =========================
  // ภาษาไทยชัดเจน
  // =========================

  if (
    /[\u0E00-\u0E7F]/.test(value)
  ) {
    return "TH";
  }


  // =========================
  // ภาษาอังกฤษแบบประโยคจริง
  // ไม่ใช่แค่ชื่อรถ / รุ่นรถ / PPF / CW
  // =========================

  const strongEnglishPattern =
    /\b(?:hello|hi|hey|how|much|price|pricing|please|can|could|would|want|interested|interest|looking|need|install|installation|do|does|is|are|my|your|i|we|have|has|new|used|vehicle|car|thank|thanks|available|cost|quote|quotation)\b/i;


  if (
    strongEnglishPattern.test(value)
  ) {
    return "EN";
  }


  // =========================
  // มีแค่ตัวอักษรอังกฤษ
  // เช่น PPF Eclass / BMW X5 / Model Y
  // อย่าเปลี่ยนภาษาที่จำไว้
  // =========================

  if (
    /[A-Za-z]/.test(value)
  ) {

    if (
      currentLanguage === "TH" ||
      currentLanguage === "EN"
    ) {
      return currentLanguage;
    }


    // ถ้ายังไม่เคยรู้ภาษา
    // ให้ถือว่า UNKNOWN
    // ซึ่งระบบจะตอบไทยเป็น default
    return "UNKNOWN";
  }


  return "UNKNOWN";
}


// =========================
// LOCALIZED TEXT
// =========================

function localizedText(
  languageOrSession,
  thaiText,
  englishText
) {

  const language =
    typeof languageOrSession === "string"
      ? languageOrSession
      : languageOrSession?.language;


  return (
    language === "EN"
      ? englishText
      : thaiText
  );
}

// =========================
// SHOP LOCATION REQUEST
// =========================

function getShopLocationRequestInfo(
  text
) {

  const value =
    String(text || "")
      .trim()
      .toLowerCase();


  if (!value) {

    return {
      isLocationRequest: false,
      hasOtherQuestion: false
    };
  }


  const locationPattern =
    /(?:โลเคชั่น(?:ร้าน)?|location|ที่อยู่(?:ร้าน)?|ที่ตั้ง(?:ร้าน)?|ร้านอยู่(?:ที่ไหน|ตรงไหน|ไหน|แถวไหน)|ร้านแถวไหน|อยู่(?:ที่ไหน|ตรงไหน|แถวไหน)|พิกัด(?:ร้าน)?|แผนที่(?:ร้าน)?|google\s*maps?|map\s*ร้าน|ทางไป(?:ร้าน)?|ไป(?:ที่)?ร้าน(?:ยังไง|อย่างไร)|สาขาอยู่ไหน)/i;


  if (
    !locationPattern.test(value)
  ) {

    return {
      isLocationRequest: false,
      hasOtherQuestion: false
    };
  }


  // ลบส่วนที่เป็นคำถามเรื่องโลเคชั่นออก
  // เพื่อดูว่ายังมีคำถาม/ข้อความอื่นเหลือไหม
  let remaining =
    value
      .replace(
        /(?:ขอ\s*)?(?:โลเคชั่น(?:ร้าน)?|location|ที่อยู่(?:ร้าน)?|ที่ตั้ง(?:ร้าน)?|ร้านอยู่(?:ที่ไหน|ตรงไหน|ไหน|แถวไหน)|ร้านแถวไหน|อยู่(?:ที่ไหน|ตรงไหน|แถวไหน)|พิกัด(?:ร้าน)?|แผนที่(?:ร้าน)?|google\s*maps?|map\s*ร้าน|ทางไป(?:ร้าน)?|ไป(?:ที่)?ร้าน(?:ยังไง|อย่างไร)|สาขาอยู่ไหน)/gi,
        " "
      )
      .replace(
        /(?:ครับ|ค่ะ|คะ|นะครับ|นะคะ|หน่อย|ทีครับ|ทีค่ะ|ที|ด้วยครับ|ด้วยค่ะ|please|และ|กับ|แล้ว)/gi,
        " "
      )
      .replace(
        /[^\p{L}\p{M}\p{N}\s]+/gu,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  return {
    isLocationRequest: true,

    hasOtherQuestion:
      remaining.length > 0
  };
}

// =========================
// IMAGE-DEPENDENT REFERENCE
// ลูกค้าให้ดูข้อมูลจากรูป
// =========================

function isImageDependentReference(
  text
) {

  const value =
    String(text || "")
      .trim()
      .toLowerCase();


  if (!value) {
    return false;
  }


  return (
    /(?:รุ่นนี้|คันนี้|สีนี้|สีตามรูป|ตามรูป|ตามภาพ|แบบในรูป|แบบในภาพ|รูปนี้|ภาพนี้|this\s*model|this\s*car|this\s*color|this\s*colour|same\s*as\s*(?:the\s*)?(?:photo|picture)|like\s*(?:the\s*)?(?:photo|picture))/i
      .test(value)
  );
}

// =========================
// GENERIC WRAP REQUEST
// Wrap เฉย ๆ ยังไม่ระบุประเภท
// =========================

function isGenericWrapRequest(
  text
) {

  const value =
    String(text || "")
      .trim()
      .toLowerCase();


  if (!value) {
    return false;
  }


  const hasWrapWord =
    /(wrap|wrapping|แรป|แร็ป|แร๊ป)/i
      .test(value);


  if (!hasWrapWord) {
    return false;
  }


  // ระบุว่าเป็น PPF / กันรอยแล้ว
const hasPPFIntent =
  /(ppf|กันรอย|ใสกันรอย|ฟิล์มใส|แรปใส|แร็ปใส|แร๊ปใส|wrap\s*ใส|clear\s*wrap|paint\s*protection|clear\s*protection)/i
    .test(value);


  if (hasPPFIntent) {
    return false;
  }


  // ระบุชัดว่าเปลี่ยนสีแล้ว
const hasColorIntent = new RegExp(
  [
    "wrap\\s*สี",
    "แรป\\s*สี",
    "แร็ป\\s*สี",
    "เปลี่ยนสี",
    "color\\s*wrap",
    "colour\\s*wrap",
    "\\bcw\\b",
    "สีดำ",
    "สีขาว",
    "สีเทา",
    "สีเงิน",
    "สีฟ้า",
    "สีน้ำเงิน",
    "สีเขียว",
    "สีเหลือง",
    "สีส้ม",
    "สีแดง",
    "สีชมพู",
    "สีม่วง",
    "สีทอง",
    "สีน้ำตาล",
    "\\bblack\\b",
    "\\bwhite\\b",
    "\\bgray\\b",
    "\\bgrey\\b",
    "\\bsilver\\b",
    "\\bblue\\b",
    "\\bgreen\\b",
    "\\byellow\\b",
    "\\borange\\b",
    "\\bred\\b",
    "\\bpink\\b",
    "\\bpurple\\b",
    "\\bgold\\b",
    "\\bbrown\\b",
    "\\bbronze\\b",
    "\\bmatte\\b",
    "\\bmatt\\b",
    "\\bsatin\\b",
    "\\bgloss\\b",
    "\\bglossy\\b"
  ].join("|"),
  "i"
).test(value);


  if (hasColorIntent) {
    return false;
  }


  // Wrap เฉพาะชิ้นที่ระบบเรารู้จัก
  // ให้ใช้ Partial Wrap Flow เดิม
  const hasSpecificPart =
    detectPartialWrapParts(
      value
    ).length > 0;


  if (hasSpecificPart) {
    return false;
  }


  return true;
}

// =========================
// PARTIAL WRAP
// ตรวจ Wrap เฉพาะส่วน
// =========================

const PARTIAL_WRAP_RULES = [
  {
    key: "ROOF",
    th: "หลังคา",
    en: "roof",
    pattern:
      /(หลังคา|roof)/i
  },

  {
    key: "SIDE_MIRROR",
    th: "กระจกมองข้าง",
    en: "side mirrors",
    pattern:
      /(กระจกมองข้าง|ฝาครอบกระจก|ครอบกระจก|กระจกข้าง|side\s*mirror|side\s*mirrors|mirror\s*cap|mirror\s*caps)/i
  },

  {
    key: "DOOR_HANDLE",
    th: "มือจับประตู",
    en: "door handles",
    pattern:
      /(มือจับ|มือจับประตู|ที่จับประตู|door\s*handle|door\s*handles)/i
  },

  {
    key: "HEADLIGHT",
    th: "ไฟหน้า",
    en: "headlights",
    pattern:
      /(ไฟหน้า|โคมไฟหน้า|headlight|headlights)/i
  },

  {
    key: "HOOD",
    th: "ฝากระโปรงหน้า",
    en: "hood",
    pattern:
      /(ฝากระโปรง|ฝากระโปรงหน้า|hood|bonnet)/i
  },

  {
    key: "SPOILER",
    th: "สปอยเลอร์",
    en: "spoiler",
    pattern:
      /(สปอยเลอร์|spoiler)/i
  },

  {
    key: "PILLAR",
    th: "เสารถ",
    en: "pillars",
    pattern:
      /(เสารถ|เสา\s*a|เสา\s*b|เสา\s*c|a[\s-]?pillar|b[\s-]?pillar|c[\s-]?pillar)/i
  },

  {
    key: "TRIM",
    th: "คิ้วรถ",
    en: "trim",
    pattern:
      /(คิ้วรถ|คิ้วประตู|คิ้วโครเมียม|chrome\s*trim|trim|chrome\s*delete)/i
  }
];


function detectPartialWrapParts(
  text
) {

  const value =
    String(text || "")
      .trim();


  if (!value) {
    return [];
  }


  return PARTIAL_WRAP_RULES
    .filter(
      (item) =>
        item.pattern.test(value)
    )
    .map(
      (item) =>
        item.key
    );
}


function parsePartialWrapParts(
  value
) {

  if (Array.isArray(value)) {
    return value;
  }


  return String(value || "")
    .split(",")
    .map(
      (item) =>
        item.trim()
    )
    .filter(Boolean);
}


function formatPartialWrapParts(
  parts,
  language = "TH"
) {

  const keys =
    parsePartialWrapParts(
      parts
    );


  const labels =
    keys
      .map((key) => {

        const matched =
          PARTIAL_WRAP_RULES.find(
            (item) =>
              item.key === key
          );


        if (!matched) {
          return "";
        }


        return (
          language === "EN"
            ? matched.en
            : matched.th
        );
      })
      .filter(Boolean);


  return (
    language === "EN"
      ? labels.join(", ")
      : labels.join(" / ")
  );
}

// CHECK OLD VEHICLE BY YEAR
// =========================

function isPastVehicleYear(year) {

  const value =
    String(year || "")
      .trim();


  if (!value) {
    return false;
  }


  const match =
    value.match(/\d{4}/);


  if (!match) {
    return false;
  }


  let vehicleYear =
    Number(match[0]);


  // รองรับปี พ.ศ. เช่น 2563
  if (
    vehicleYear >= 2400
  ) {
    vehicleYear -= 543;
  }


  const currentYear =
    new Date().getFullYear();


  return (
    vehicleYear < currentYear
  );
}

// =========================
// CHECK MATTE PPF
// =========================

function isMattePPFRequest(text) {

  const value =
    String(text || "")
      .trim()
      .toLowerCase();


  return (
    /(ฟิล์มใสด้าน|ใสด้าน|ฟิล์มด้านใส|ppf\s*ด้าน|ppf\s*matte|matte\s*ppf|ppf\s*satin|satin\s*ppf|ppf\s*stealth|stealth\s*ppf)/i
      .test(value)
  );
}

// =========================
// CHECK DELIVERY DATE INFO
// =========================

function hasDeliveryDateInfo(text) {

  const value =
    String(text || "")
      .trim()
      .toLowerCase();


  if (!value) {
    return false;
  }


  // วันที่แบบตัวเลข เช่น 25/9, 25-9, 25.9
  const hasNumericDate =
    /\d{1,2}\s*[\/\-.]\s*\d{1,2}/i
      .test(value);


  // วันที่ / วัน แบบภาษาพูด
  const hasRelativeDate =
    /(วันนี้|พรุ่งนี้|มะรืน|วันจันทร์|วันอังคาร|วันพุธ|วันพฤหัส|วันศุกร์|วันเสาร์|วันอาทิตย์|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i
      .test(value);


  // วันที่ + เดือน เช่น 25 ก.ย.
  const hasThaiMonthDate =
    /\d{1,2}\s*(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/i
      .test(value);


  return (
    hasNumericDate ||
    hasRelativeDate ||
    hasThaiMonthDate
  );
}


// =========================
// FIND STORAGE FOLDER
// =========================

async function findStorageFolder(
  parentPath,
  wantedName
) {

  const { data, error } =
    await supabase
      .storage
      .from("product-media")
      .list(
        parentPath || "",
        {
          limit: 1000,
          sortBy: {
            column: "name",
            order: "asc"
          }
        }
      );

  if (error) {
    throw error;
  }


  const wanted =
    normalizeValue(wantedName);


  const matched =
    (data || []).find((item) => {

      return (
        normalizeValue(item.name) ===
        wanted
      );
    });


  return matched
    ? matched.name
    : null;
}

// =========================
// VEHICLE CATALOG CACHE
// อ่าน Brand / Model จาก Storage อัตโนมัติ
// =========================

let vehicleCatalogCache = {
  expiresAt: 0,
  items: []
};


async function getVehicleCatalog() {

  const now =
    Date.now();


  // Cache 10 นาที
  if (
    vehicleCatalogCache.items.length > 0 &&
    now < vehicleCatalogCache.expiresAt
  ) {

    return vehicleCatalogCache.items;
  }


  const bucket =
    supabase
      .storage
      .from("product-media");


  const {
    data: rootItems,
    error
  } =
    await bucket.list(
      "",
      {
        limit: 1000,
        sortBy: {
          column: "name",
          order: "asc"
        }
      }
    );


  if (error) {
    throw error;
  }


  const ignoredRoots =
    new Set([
      "furniture",
      "cwcolor",
      "motorcycle"
    ]);


  const brandFolders =
    (rootItems || [])
      .filter((item) => {

        const name =
          normalizeValue(
            item.name
          );


        return (
          name &&
          !ignoredRoots.has(name) &&
          !name.endsWith("group")
        );
      });


  const catalogLists =
    await Promise.all(

      brandFolders.map(
        async (brandItem) => {

          const {
            data: children,
            error: childError
          } =
            await bucket.list(
              brandItem.name,
              {
                limit: 1000,
                sortBy: {
                  column: "name",
                  order: "asc"
                }
              }
            );


          if (childError) {
            return [];
          }


          return (
            children || []
          )
            .filter((item) => {

              const name =
                normalizeValue(
                  item.name
                );


              return (
                name &&
                name !== "ppf" &&
                name !== "cw" &&
                !name.endsWith("group")
              );
            })
            .map((item) => ({
              brand:
                brandItem.name,

              model:
                item.name
            }));
        }
      )
    );


  const catalog =
    catalogLists.flat();


  vehicleCatalogCache = {
    items:
      catalog,

    expiresAt:
      now +
      10 * 60 * 1000
  };


  return catalog;
}

// =========================
// FIND BRAND BY MODEL
// =========================

async function findBrandFolderByModel(
  model
) {

  const { data, error } =
    await supabase
      .storage
      .from("product-media")
      .list(
        "",
        {
          limit: 1000,
          sortBy: {
            column: "name",
            order: "asc"
          }
        }
      );

  if (error) {
    throw error;
  }

  const matches = [];

  for (const item of data || []) {

    const modelFolder =
      await findStorageFolder(
        item.name,
        model
      );

    if (modelFolder) {
      matches.push(
        item.name
      );
    }
  }

  // เจอรุ่นนี้อยู่ใน Brand เดียวเท่านั้น
  if (matches.length === 1) {
    return matches[0];
  }

  // ถ้าไม่เจอ หรือซ้ำหลาย Brand
  // ไม่เดา
  return null;
}

// =========================
// READ IMAGE FILES
// FROM ONE SERVICE FOLDER
// =========================

async function getMediaFromServiceFolder(
  bucket,
  brandFolder,
  modelFolder,
  serviceFolder
) {

 const servicePath =
  modelFolder
    ? `${brandFolder}/${modelFolder}/${serviceFolder}`
    : `${brandFolder}/${serviceFolder}`;

  const { data: files, error } =
    await bucket.list(
      servicePath,
      {
        limit: 1000,
        sortBy: {
          column: "name",
          order: "asc"
        }
      }
    );

  if (error) {
    throw error;
  }

  const imageFiles =
    (files || [])
      .filter((file) => {
        return /\.(jpg|jpeg|png|webp)$/i
          .test(file.name);
      })
      .sort((a, b) => {
        return a.name.localeCompare(
          b.name,
          undefined,
          {
            numeric: true,
            sensitivity: "base"
          }
        );
      });

  return imageFiles.map(
    (file, index) => {

      const storagePath =
        `${servicePath}/${file.name}`;

      const { data: urlData } =
  bucket.getPublicUrl(
    storagePath
  );


const version =
  encodeURIComponent(
    file.updated_at ||
    file.created_at ||
    file.id ||
    ""
  );


const imageUrl =
  version
    ? `${urlData.publicUrl}?v=${version}`
    : urlData.publicUrl;

      return {
        id:
          file.id ||
          storagePath,

        category:
          serviceFolder,

        brand:
          brandFolder,

        model:
          modelFolder,

        storage_path:
          storagePath,

        sort_order:
          index + 1,

        active:
          true,

        image_url:
          imageUrl
      };
    }
  );
}

// =========================
// FURNITURE MEDIA
// Furniture > PPF / CW
// =========================

async function getFurnitureMedia(
  furnitureService
) {

  const bucket =
    supabase
      .storage
      .from("product-media");


  const furnitureFolder =
    await findStorageFolder(
      "",
      "Furniture"
    );


  if (!furnitureFolder) {
    return [];
  }


  const wantedService =
    furnitureService ===
    "FURNITURE_PPF"
      ? "PPF"
      : "CW";


  const serviceFolder =
    await findStorageFolder(
      furnitureFolder,
      wantedService
    );


  if (!serviceFolder) {
    return [];
  }


  return await getMediaFromServiceFolder(
    bucket,
    furnitureFolder,
    "",
    serviceFolder
  );
}


// =========================
// CLASSIFY FURNITURE TYPE
// =========================

function classifyFurnitureType(
  text
) {

  const value =
    String(text || "")
      .trim()
      .toLowerCase();


  // ฟิล์มใสกันรอย
  if (
    value.includes("กันรอย") ||
    value.includes("ฟิล์มใส") ||
    value.includes("แบบใส") ||
    value.includes("ใส") ||
    value.includes("ppf") ||
    value.includes("protection") ||
    value.includes("อันแรก") ||
    value.includes("แบบแรก") ||
    value.includes("ตัวแรก")
  ) {
    return "FURNITURE_PPF";
  }


  // Wrap / เปลี่ยนสี / ลาย
  if (
    value.includes("เปลี่ยนสี") ||
    value.includes("wrap") ||
    value.includes("แรป") ||
    value.includes("ลายไม้") ||
    value.includes("ลายหิน") ||
    value.includes("ลาย") ||
    value.includes("wood") ||
    value.includes("stone") ||
    value.includes("อันสอง") ||
    value.includes("แบบสอง") ||
    value.includes("ตัวสอง") ||
    value === "สี" ||
    value === "สีครับ" ||
    value === "สีค่ะ"
  ) {
    return "FURNITURE_CW";
  }


  return null;
}

// =========================
// FURNITURE CW
// HORIZONTAL IMAGE CAROUSEL
// =========================

function buildFurnitureCWCarousels(
  mediaItems
) {

  // สูงสุด 36 รูป
  // 12 รูป / 1 Carousel
  // รวมสูงสุด 3 Carousel
  const items =
    mediaItems.slice(0, 36);

  const messages = [];


  for (
    let i = 0;
    i < items.length;
    i += 12
  ) {

    const set =
      items.slice(
        i,
        i + 12
      );


    messages.push({
      type: "flex",

      altText:
        "ตัวอย่างฟิล์มลายไม้ ลายหิน และฟิล์มเปลี่ยนสี",

      contents: {
        type: "carousel",

        contents:
          set.map((item) => ({

            type: "bubble",

            size: "kilo",

            hero: {
              type: "image",

              url:
                item.image_url,

              size: "full",

              aspectRatio:
                "3:4",

              aspectMode:
                "cover",

              action: {
                type: "uri",
                uri:
                  item.image_url
              }
            }
          }))
      }
    });
  }


  return messages;
}

// =========================
// CW COLOR TONE MEDIA
// CW-Color > Pink
// =========================

async function getCWColorToneMedia(
  toneFolderName
) {

  const bucket =
    supabase
      .storage
      .from("product-media");


  const colorRoot =
    await findStorageFolder(
      "",
      "CW-Color"
    );


  if (!colorRoot) {
    return [];
  }


  const toneFolder =
    await findStorageFolder(
      colorRoot,
      toneFolderName
    );


  if (!toneFolder) {
    return [];
  }


  return await getMediaFromServiceFolder(
    bucket,
    colorRoot,
    "",
    toneFolder
  );
}

// =========================
// CW COLOR GRID
// =========================

function buildCWColorCarousels(
  mediaItems,
  altText =
    "ตัวอย่างฟิล์มเปลี่ยนสี"
) {

  return buildMediaGrids(
    mediaItems
  );
}

// =========================
// BUILD FURNITURE RESPONSE
// =========================

async function buildFurnitureMessages(
  furnitureService,
  includeGreeting = false,
  language = "TH"
) {

const media =
  await getFurnitureMedia(
    furnitureService
  );


let mediaMessages = [];


if (
  furnitureService ===
  "FURNITURE_CW"
) {

  mediaMessages =
    buildFurnitureCWCarousels(
      media
    );

} else {

  // Furniture PPF
  // ยังใช้ Grid แบบเดิม
  mediaMessages =
    buildMediaGrids(media)
      .slice(0, 3);
}


  let text = "";


  if (includeGreeting) {

  text +=
    localizedText(
      language,
      "Wraptor Thailand สวัสดีครับ แอดมินต้นกล้ายินดีให้บริการครับ\n\n",
      "WRAPTOR THAILAND, hello. My name is Tonkla and I'll be happy to assist you.\n\n"
    );
}


text +=
  localizedText(
    language,

    "คุณลูกค้าทราบขนาด หรือ หากมีรูปภาพประกอบสามารถส่งให้แอดมินตรวจสอบได้เลยครับ 😊\n\n" +
    "ตัวอย่างงานติดตั้งครับ\n" +
    "https://youtu.be/bkKU0ftLqJc?si=aE10cazNUqXuriaX\n\n" +
    "หมายเหตุ : กรุณาส่งภาพ และขนาดของทุกจุดที่ต้องการติดตั้งเพื่อคำนวณราคา หากมีพื้นที่ส่วนอื่นจะมีค่าใช้จ่ายเพิ่มเติมในวันที่ติดตั้ง",

    "If you know the approximate dimensions, please send them to us. You may also send photos for our team to review.\n\n" +
    "Installation example:\n" +
    "https://youtu.be/bkKU0ftLqJc?si=aE10cazNUqXuriaX\n\n" +
    "Note: Please provide photos and approximate dimensions of every area you would like to have installed so we can calculate the quotation. Any additional areas may incur extra charges on the installation date."
  );


return [
  {
    type: "text",
    text: text
  },

  ...mediaMessages

].slice(0, 4);
}

// =========================
// TESLA ALL MODEL MEDIA
// รวมผลงาน Tesla ทุกรุ่น
// =========================

async function getTeslaAllModelMedia(
  service
) {

  const bucket =
    supabase
      .storage
      .from("product-media");


  const brandFolder =
    await findStorageFolder(
      "",
      "Tesla"
    );


  if (!brandFolder) {
    return [];
  }


  const normalizedService =
    normalizeValue(service);


  if (
    normalizedService !== "ppf" &&
    normalizedService !== "cw"
  ) {
    return [];
  }


  const {
    data: modelItems,
    error
  } =
    await bucket.list(
      brandFolder,
      {
        limit: 1000,
        sortBy: {
          column: "name",
          order: "asc"
        }
      }
    );


  if (error) {
    throw error;
  }


  // =========================
  // อ่าน Service ที่ลูกค้าถามก่อน
  // =========================

  async function collectService(
    wantedService
  ) {

    const mediaByModel = [];


    const orderedModelItems =
  [...(modelItems || [])]
    .sort((a, b) => {

      const aName =
        normalizeValue(a.name);

      const bName =
        normalizeValue(b.name);


      if (aName === "model3") {
        return 1;
      }

      if (bName === "model3") {
        return -1;
      }

      return 0;
    });


for (
  const item
  of orderedModelItems
) {

      const modelFolder =
        item.name;


      // ข้าม Tesla-Group
      if (
        normalizeValue(modelFolder)
          .endsWith("group")
      ) {
        continue;
      }


      const serviceFolder =
        await findStorageFolder(
          `${brandFolder}/${modelFolder}`,
          wantedService
        );


      if (!serviceFolder) {
        continue;
      }


      const modelMedia =
        await getMediaFromServiceFolder(
          bucket,
          brandFolder,
          modelFolder,
          serviceFolder
        );


      if (
        modelMedia.length > 0
      ) {

        mediaByModel.push(
          modelMedia
        );
      }
    }


    // =========================
// รวมรูปเรียงทีละ Model
// ไม่สลับรูปข้ามรุ่น
// =========================

const combined =
  mediaByModel.flat();

return combined;
}
  // ลอง Service ที่ลูกค้าสนใจก่อน
  const directMedia =
    await collectService(
      service
    );


  if (
    directMedia.length > 0
  ) {

    console.log(
      "TESLA: all model direct media",
      {
        service,
        count:
          directMedia.length
      }
    );

    return directMedia;
  }


  // =========================
  // ถ้าไม่มีเลย
  // fallback PPF <-> CW
  // =========================

  const fallbackService =
    normalizedService === "ppf"
      ? "CW"
      : "PPF";


  const fallbackMedia =
    await collectService(
      fallbackService
    );


  console.log(
    "TESLA: all model fallback media",
    {
      requestedService:
        service,

      fallbackService,

      count:
        fallbackMedia.length
    }
  );


  return fallbackMedia;
}

// =========================
// GET MEDIA FROM STORAGE
// Brand > Model > Service
// with PPF/CW fallback
// =========================

async function getMediaForVehicle(
  service,
  brand,
  model
) {

  if (
    !service ||
    !model
  ) {
    return [];
  }

  const bucket =
    supabase
      .storage
      .from("product-media");


  let brandFolder = null;


  // ลูกค้าระบุ Brand มา
  if (brand) {

    brandFolder =
      await findStorageFolder(
        "",
        brand
      );

  } else {

    // ลูกค้าไม่ได้ระบุ Brand
    // หา Brand จาก Model ใน Storage
    brandFolder =
      await findBrandFolderByModel(
        model
      );
  }


  if (!brandFolder) {

    console.log(
      "MEDIA: Brand folder not found",
      {
        brand,
        model
      }
    );

    return [];
  }

  // -------------------------
// TESLA SPECIAL CASE
// PPF / CW = รวมทุกรุ่น
// -------------------------

if (
  normalizeValue(brandFolder) ===
  "tesla"
) {

  const normalizedService =
    normalizeValue(service);


  if (
    normalizedService === "ppf" ||
    normalizedService === "cw"
  ) {

    return await getTeslaAllModelMedia(
      service
    );
  }
}

    // -------------------------
  // MOTORCYCLE SPECIAL CASE
  // Motorcycle > Service
  // -------------------------

  if (
    normalizeValue(brandFolder) ===
    "motorcycle"
  ) {

    // หา Service ที่ลูกค้าถามก่อน
    const serviceFolder =
      await findStorageFolder(
        brandFolder,
        service
      );


    if (serviceFolder) {

      const motorcycleMedia =
        await getMediaFromServiceFolder(
          bucket,
          brandFolder,
          "",
          serviceFolder
        );


      if (
        motorcycleMedia.length > 0
      ) {
        return motorcycleMedia;
      }
    }


    // -------------------------
    // Fallback เฉพาะ CW <-> PPF
    // -------------------------

    const normalizedService =
      normalizeValue(service);


    if (
      normalizedService === "cw" ||
      normalizedService === "ppf"
    ) {

      const fallbackService =
        normalizedService === "cw"
          ? "PPF"
          : "CW";


      const fallbackFolder =
        await findStorageFolder(
          brandFolder,
          fallbackService
        );


      if (fallbackFolder) {

        const fallbackMedia =
          await getMediaFromServiceFolder(
            bucket,
            brandFolder,
            "",
            fallbackFolder
          );


        if (
          fallbackMedia.length > 0
        ) {
          return fallbackMedia;
        }
      }
    }


    return [];
  }


  // -------------------------
  // 2. หา Model
  // -------------------------

  const modelFolder =
    await findStorageFolder(
      brandFolder,
      model
    );

  if (!modelFolder) {

    console.log(
      "MEDIA: Model folder not found",
      {
        brand,
        model
      }
    );

    return [];
  }


  const modelPath =
    `${brandFolder}/${modelFolder}`;


  // -------------------------
  // 3. หา Service ที่ลูกค้าถามก่อน
  // -------------------------

  const requestedServiceFolder =
    await findStorageFolder(
      modelPath,
      service
    );

  if (requestedServiceFolder) {

    const directMedia =
      await getMediaFromServiceFolder(
        bucket,
        brandFolder,
        modelFolder,
        requestedServiceFolder
      );

    if (directMedia.length > 0) {

      console.log(
        "MEDIA: Found direct service images",
        {
          brand,
          model,
          requestedService: service,
          usedService:
            requestedServiceFolder,
          count:
            directMedia.length
        }
      );

      return directMedia;
    }
  }


  // -------------------------
  // 4. Fallback เฉพาะ PPF/CW
  // -------------------------

  const normalizedService =
    normalizeValue(service);

  const canFallback =
    normalizedService === "ppf" ||
    normalizedService === "cw";

  if (!canFallback) {

    console.log(
      "MEDIA: No direct media and fallback not allowed",
      {
        brand,
        model,
        service
      }
    );

    return [];
  }

  const fallbackServiceName =
    normalizedService === "ppf"
      ? "CW"
      : "PPF";

  const fallbackServiceFolder =
    await findStorageFolder(
      modelPath,
      fallbackServiceName
    );

  if (!fallbackServiceFolder) {

    console.log(
      "MEDIA: Fallback service folder not found",
      {
        brand,
        model,
        requestedService: service,
        fallbackService:
          fallbackServiceName
      }
    );

    return [];
  }

  const fallbackMedia =
    await getMediaFromServiceFolder(
      bucket,
      brandFolder,
      modelFolder,
      fallbackServiceFolder
    );

  if (fallbackMedia.length > 0) {

    console.log(
      "MEDIA: Using fallback service images",
      {
        brand,
        model,
        requestedService: service,
        usedService:
          fallbackServiceFolder,
        count:
          fallbackMedia.length
      }
    );

    return fallbackMedia;
  }

  console.log(
    "MEDIA: No media found after fallback",
    {
      brand,
      model,
      requestedService: service
    }
  );

  return [];
}

// =========================
// REVIEW LINKS
// =========================

async function getReviewLinksForVehicle(
  service,
  brand,
  model,
  includeMattePPF = false
) {

  const { data, error } =
    await supabase
      .from("review_links")
      .select(
        "id, service, brand, model, platform, url, sort_order, active"
      )
      .eq("service", service)
      .eq("active", true)
      .order("sort_order", {
        ascending: true
      });


  if (error) {
    throw error;
  }


  const rows =
    data || [];


  const customerBrand =
    normalizeValue(brand);

  const customerModel =
    normalizeValue(model);

  const customerService =
    normalizeValue(service);


  // =========================
  // 1. หา Clip ตรง Brand + Model
  // =========================

  const exactLinks =
    rows.filter((item) => {

      return (
        normalizeValue(item.brand) ===
          customerBrand &&

        normalizeValue(item.model) ===
          customerModel
      );
    });


  let resultLinks = [];


  if (
    exactLinks.length > 0
  ) {

    // ตรงรุ่น
    resultLinks =
      exactLinks
        .slice(0, 3)
        .map((item) => ({
          ...item,

          review_fallback:
            "EXACT"
        }));

  } else {

    // =========================
    // 2. ไม่มีตรงรุ่น
    // หา Brand เดียวกัน + Service เดียวกัน
    // แต่เป็นรุ่นอื่น
    //
    // Service ถูกล็อกตั้งแต่ query ด้านบนแล้ว
    // =========================

    const sameBrandOtherModel =
      rows.filter((item) => {

        const itemBrand =
          normalizeValue(
            item.brand
          );

        const itemModel =
          normalizeValue(
            item.model
          );


        return (
          customerBrand &&
          itemBrand ===
            customerBrand &&

          itemModel &&

          itemModel !==
            customerModel &&

          itemModel !==
            "all" &&

          itemModel !==
            "matte"
        );
      });


    // =========================
    // แยกตาม Model
    // =========================

    const modelGroups =
      new Map();


    for (
      const item of
        sameBrandOtherModel
    ) {

      const key =
        normalizeValue(
          item.model
        );


      if (!key) {
        continue;
      }


      if (
        !modelGroups.has(
          key
        )
      ) {

        modelGroups.set(
          key,
          []
        );
      }


      modelGroups
        .get(key)
        .push(item);
    }


    const availableModels =
      [
        ...modelGroups.keys()
      ];


    // =========================
    // มี VDO รุ่นอื่นใน Brand เดียวกัน
    // สุ่มมา 1 รุ่น
    // =========================

    if (
      availableModels.length > 0
    ) {

      const randomIndex =
        Math.floor(
          Math.random() *
          availableModels.length
        );


      const selectedModelKey =
        availableModels[
          randomIndex
        ];


      const selectedModelLinks =
        modelGroups.get(
          selectedModelKey
        ) || [];


      resultLinks =
        selectedModelLinks
          .slice(0, 3)
          .map((item) => ({
            ...item,

            review_fallback:
              "SAME_BRAND",

            requested_brand:
              brand || "",

            requested_model:
              model || "",

            fallback_brand:
              item.brand || "",

            fallback_model:
              item.model || ""
          }));


      console.log(
        "REVIEW SAME BRAND FALLBACK:",
        {
          service,
          requestedBrand:
            brand,
          requestedModel:
            model,

          selectedBrand:
            resultLinks[0]
              ?.fallback_brand,

          selectedModel:
            resultLinks[0]
              ?.fallback_model,

          clips:
            resultLinks.length
        }
      );

    } else {

      // =========================
      // 3. ไม่มีรุ่นอื่นใน Brand
      // ใช้ ALL / ALL
      // =========================

      const fallbackLinks =
        rows.filter((item) => {

          return (
            normalizeValue(
              item.brand
            ) === "all" &&

            normalizeValue(
              item.model
            ) === "all"
          );
        });


      resultLinks =
        fallbackLinks
          .slice(0, 1)
          .map((item) => ({
            ...item,

            review_fallback:
              "ALL"
          }));
    }
  }


  // =========================
  // 4. PPF MATTE
  // เพิ่มคลิป Matte อีก 1
  // =========================

  console.log(
    "REVIEW DEBUG:",
    {
      service:
        customerService,

      brand:
        customerBrand,

      model:
        customerModel,

      includeMattePPF,

      fallbackType:
        resultLinks[0]
          ?.review_fallback ||
        "NONE",

      matteRows:
        rows
          .filter((item) => {

            return (
              normalizeValue(
                item.brand
              ) === "all" &&

              normalizeValue(
                item.model
              ) === "matte"
            );
          })
          .length
    }
  );


  if (
    customerService === "ppf" &&
    includeMattePPF
  ) {

    const matteLinks =
      rows.filter((item) => {

        return (
          normalizeValue(
            item.brand
          ) === "all" &&

          normalizeValue(
            item.model
          ) === "matte"
        );
      });


    if (
      matteLinks.length > 0
    ) {

      resultLinks.push({
        ...matteLinks[0],

        review_fallback:
          "MATTE"
      });
    }
  }


  return resultLinks;
}

// =========================
// BUILD REVIEW LINKS TEXT
// =========================

function buildReviewLinksText(
  reviewLinks
) {

  return reviewLinks
    .slice(0, 4)
    .map((item) => {

      const platform =
        item.platform ||
        "Clip";

      return (
        platform +
        ":\n" +
        item.url
      );
    })
    .join("\n\n");
}

// =========================
// BUILD REVIEW LINK MESSAGES
// ส่ง Clip แยกข้อความละ 1 Link
// =========================

function buildReviewLinkMessages(
  reviewLinks,
  introText =
    "ขออนุญาตส่ง Clip ผลงานของทางร้านเพิ่มเติมครับ"
) {

  const messages = [];


  if (
    !reviewLinks ||
    reviewLinks.length === 0
  ) {
    return messages;
  }


  // =========================
  // ตรวจว่าเป็นการใช้
  // VDO รุ่นอื่นใน Brand เดียวกันหรือไม่
  // =========================

  const sameBrandFallback =
    reviewLinks.find(
      (item) =>
        item.review_fallback ===
          "SAME_BRAND"
    );


  let finalIntroText =
    introText;


  if (
    sameBrandFallback
  ) {

    const fallbackBrand =
      sameBrandFallback
        .fallback_brand ||
      sameBrandFallback
        .requested_brand ||
      "";


    finalIntroText =
      fallbackBrand
        ? (
            `ขอส่งรีวิวงานติดตั้งของ ${fallbackBrand} รุ่นอื่นของทางร้านเพิ่มเติมก่อนครับ`
          )
        : (
            "ขอส่งรีวิวงานติดตั้งของทางร้านเพิ่มเติมก่อนครับ"
          );
  }


  // =========================
  // ข้อความเกริ่น
  // =========================

  messages.push({
    type: "text",
    text:
      finalIntroText
  });


  // =========================
  // Clip ละ 1 Message
  // สูงสุด 4
  // =========================

  reviewLinks
    .slice(0, 4)
    .forEach((item) => {

      const platform =
        item.platform ||
        "Clip";


      messages.push({
        type: "text",

        text:
          platform +
          ":\n" +
          item.url
      });
    });


  return messages;
}
// =========================
// BRAND / MODEL TRUST PROOF
// AUTO FIND GROUP FROM STORAGE
// =========================

async function getBrandProof(
  brand,
  model,
  service
) {

  if (!brand) {
    return null;
  }

  const bucket =
    supabase
      .storage
      .from("product-media");


  // =========================
  // หา Brand Folder จริง
  // =========================

  const brandFolder =
    await findStorageFolder(
      "",
      brand
    );

  if (!brandFolder) {
    return null;
  }


  // =========================
  // อ่านรูปทั้งหมดจาก Group Folder
  // สูงสุด 8 รูป
  // =========================

  async function readGroupImages(
    folderPath
  ) {

    const {
      data: files,
      error
    } =
      await bucket.list(
        folderPath,
        {
          limit: 100,
          sortBy: {
            column: "name",
            order: "asc"
          }
        }
      );

    if (error) {
      throw error;
    }


    const imageFiles =
      (files || [])
        .filter((file) => {

          return /\.(jpg|jpeg|png|webp)$/i
            .test(file.name);

        })
        .sort((a, b) => {

          return a.name.localeCompare(
            b.name,
            undefined,
            {
              numeric: true,
              sensitivity: "base"
            }
          );

        })
        .slice(0, 8);


    return imageFiles.map((file) => {

      const fullPath =
        `${folderPath}/${file.name}`;

      const { data: urlData } =
        bucket.getPublicUrl(
          fullPath
        );

      const version =
  encodeURIComponent(
    file.updated_at ||
    file.created_at ||
    file.id ||
    ""
  );

return version
  ? `${urlData.publicUrl}?v=${version}`
  : urlData.publicUrl;
    });
  }


  // =========================
  // PRIORITY 1
  // Group เฉพาะ Model
  //
  // Toyota/FJ/FJ-Group
  // Porsche/911/911-Group
  // =========================

  if (model) {

    const modelFolder =
      await findStorageFolder(
        brandFolder,
        model
      );


    if (modelFolder) {

      const modelPath =
        `${brandFolder}/${modelFolder}`;


      const modelGroupFolder =
        await findStorageFolder(
          modelPath,
          `${modelFolder}-Group`
        );


      if (modelGroupFolder) {

        const groupPath =
          `${modelPath}/${modelGroupFolder}`;


        const imageUrls =
          await readGroupImages(
            groupPath
          );


        if (imageUrls.length > 0) {

          return {
            brand:
              brandFolder,

            model:
              modelFolder,

            service:
              service,

            storage_path:
              groupPath,

            message:
              `สำหรับ ${brandFolder} ${modelFolder} ทางร้านมีผลงานติดตั้งมาแล้วหลายคันครับ คุณลูกค้าวางใจได้เลยครับ`,

            image_urls:
              imageUrls,

            image_url:
              imageUrls[0]
          };
        }
      }
    }
  }


  // =========================
  // PRIORITY 2
  // Group รวมทั้ง Brand
  //
  // Tesla/Tesla-Group
  // Toyota/Toyota-Group
  // =========================

  const brandGroupFolder =
    await findStorageFolder(
      brandFolder,
      `${brandFolder}-Group`
    );


  if (brandGroupFolder) {

    const groupPath =
      `${brandFolder}/${brandGroupFolder}`;


    const imageUrls =
      await readGroupImages(
        groupPath
      );


    if (imageUrls.length > 0) {

      return {
        brand:
          brandFolder,

        model:
          "ALL",

        service:
          service,

        storage_path:
          groupPath,

        message:
          `สำหรับ ${brandFolder} ทางร้านมีประสบการณ์ติดตั้งมาแล้วหลายคันครับ คุณลูกค้าวางใจได้เลยครับ`,

        image_urls:
          imageUrls,

        image_url:
          imageUrls[0]
      };
    }
  }


  return null;
}

// =========================
// BUILD BRAND PROOF MESSAGE
// 1 รูป หรือหลายรูป
// =========================

function buildBrandProofMessage(
  proof,
  language = "TH"
) {

  const proofText =
    language === "EN"
      ? (
          proof.model &&
          proof.model !== "ALL"
            ? `We have completed installations on many ${proof.brand} ${proof.model} vehicles, so you can feel confident leaving your vehicle with our team.`
            : `We have extensive installation experience with ${proof.brand} vehicles, so you can feel confident leaving your vehicle with our team.`
        )
      : proof.message;


  const proofAltText =
    language === "EN"
      ? "Our installation experience"
      : "ประสบการณ์ติดตั้งของทางร้าน";

  const imageUrls =
    proof.image_urls ||
    (
      proof.image_url
        ? [proof.image_url]
        : []
    );


  // =========================
  // มีรูปเดียว
  // =========================

  if (imageUrls.length === 1) {

    return {
      type: "flex",

      altText:
  proofAltText,

      contents: {
        type: "bubble",

        hero: {
          type: "image",
          url: imageUrls[0],
          size: "full",
          aspectRatio: "16:9",
          aspectMode: "cover"
        },

        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "16px",

          contents: [
            {
              type: "text",
              text: proofText,
              wrap: true,
              size: "md"
            }
          ]
        }
      }
    };
  }


  // =========================
  // มีหลายรูป
  // ทำ Grid 2 Columns
  // =========================

  const rows = [];

  for (
    let i = 0;
    i < imageUrls.length;
    i += 2
  ) {

    const pair =
      imageUrls.slice(
        i,
        i + 2
      );


    rows.push({
      type: "box",
      layout: "horizontal",
      spacing: "xs",

      contents:
        pair.map((url) => ({
          type: "image",
          url: url,
          size: "full",
          aspectRatio: "1:1",
          aspectMode: "cover",
          flex: 1,

          action: {
            type: "uri",
            uri: url
          }
        }))
    });
  }


  rows.push({
    type: "box",
    layout: "vertical",
    paddingAll: "16px",

    contents: [
      {
        type: "text",
        text: proofText,
        wrap: true,
        size: "md"
      }
    ]
  });


  return {
    type: "flex",

    altText:
  proofAltText,

    contents: {
      type: "bubble",

      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "none",
        contents: rows
      }
    }
  };
}

// =========================
// INTERIOR LIGHT SERVICE
// STARLIGHT / AMBIENT LIGHT
// =========================

function detectInteriorLightService(text) {

  const value =
    String(text || "")
      .trim()
      .toLowerCase();

  if (!value) {
    return null;
  }


  // =========================
  // STARLIGHT / ไฟดาว
  // =========================

  if (
    /(?:ไฟดาว|ไฟเพดานดาว|ดาวบนเพดาน|ไฟดาวเพดาน|starlight|star\s*light|starlight\s*headliner|star\s*roof|shooting\s*star)/i
      .test(value)
  ) {

    return "STARLIGHT";
  }


  // =========================
  // AMBIENT LIGHT
  // =========================

  if (
    /(?:ambient\s*light|ambient\s*lighting|ไฟ\s*ambient|แอมเบี้ยน|แอมเบียน|แอมเบี้ยน\s*ไลท์|แอมเบียน\s*ไลท์|ไฟแอมเบี้ยน|ไฟแอมเบียน)/i
      .test(value)
  ) {

    return "AMBIENT_LIGHT";
  }


  return null;
}


function getInteriorLightName(
  service,
  language = "TH"
) {

  if (service === "STARLIGHT") {

    return language === "EN"
      ? "Starlight Headliner"
      : "ไฟดาว";
  }


  if (service === "AMBIENT_LIGHT") {

    return language === "EN"
      ? "Ambient Light"
      : "Ambient Light";
  }


  return "";
}


function isPositiveConfirmation(text) {

  return /^(?:ใช่|ใช่ครับ|ใช่ค่ะ|ครับ|ค่ะ|ถูกต้อง|ถูกครับ|ถูกค่ะ|yes|yes\s*please|correct|that's\s*right|right)$/i
    .test(
      String(text || "").trim()
    );
}


function isNegativeConfirmation(text) {

  return /^(?:ไม่ใช่|ไม่ใช่ครับ|ไม่ใช่ค่ะ|ไม่ครับ|ไม่ค่ะ|no|nope|not\s*this|not\s*that)$/i
    .test(
      String(text || "").trim()
    );
}


// =========================
// PRE-FLOW CONVERSATION OWNERSHIP DETECTOR
// ใช้เฉพาะตอน Bot ยังไม่ได้เริ่ม Flow
// ถ้าข้อความดูเหมือนเป็นคำตอบ/บทสนทนาที่คุยกับคนมาก่อน
// ให้ส่ง HUMAN_HANDOFF เพื่อไม่ให้ AI กลับมาแทรกภายหลัง
// =========================

async function detectPreFlowHumanConversation(text) {

  const value =
    String(text || "")
      .trim();


  if (!value) {
    return {
      action: "WAIT",
      confidence: 0,
      reason: "empty"
    };
  }


  try {

    const response =
      await openai.responses.create({

        model: "gpt-5.6-luna",

        reasoning: {
          effort: "none"
        },

        instructions: `
You are a conversation ownership classifier for an automotive shop.

The AI bot has NOT started its sales flow yet and has NOT asked the
customer a question in the current bot session.

Decide whether the incoming customer message is highly likely to be a
reply or continuation of a conversation with a HUMAN salesperson that
is happening outside the bot context.

Choose exactly one action:

1) action = "START_FLOW" when the incoming message itself contains a
clear vehicle brand/model or recognizable vehicle model, even if it is
short and even if no service is stated. A vehicle model is useful
standalone sales information and should be allowed to start the AI flow.

Examples of START_FLOW:
- Benz cla250+
- CLA250+
- Porsche Panamera
- พานาเมร่า
- Tesla Model 3
- BMW X5

2) action = "HUMAN_HANDOFF" only when the message strongly looks
like a contextual answer/continuation that requires an unseen previous
question or human conversation to make sense.

Examples of likely HUMAN_HANDOFF:
- ยังไม่ได้รับครับ
- เดือนหน้าครับ
- พรุ่งนี้สะดวกครับ
- เดี๋ยวเข้าไปช่วงบ่ายครับ
- สีเดิมครับ
- งบประมาณประมาณแสนครับ
- รับรถวันที่ 20 ครับ
- โอเคตามที่คุยครับ

Do NOT hand off merely because the message is short.
Do NOT hand off greetings or generic conversation starters such as:
- สวัสดีครับ
- สอบถามหน่อยครับ
- ขอราคาได้ไหมครับ
- สนใจครับ
- hello
- hi

If uncertain, choose action = "WAIT".
Be conservative: HUMAN_HANDOFF should normally require confidence >= 0.85.
`,

        input: value,

        text: {
          format: {
            type: "json_schema",
            name: "preflow_ownership",
            strict: true,
            schema: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: [
                    "START_FLOW",
                    "HUMAN_HANDOFF",
                    "WAIT"
                  ]
                },
                confidence: {
                  type: "number",
                  minimum: 0,
                  maximum: 1
                },
                reason: {
                  type: "string"
                }
              },
              required: [
                "action",
                "confidence",
                "reason"
              ],
              additionalProperties: false
            }
          }
        }
      });


    const result =
      JSON.parse(
        response.output_text
      );


    return {
      action:
        result.action === "START_FLOW"
          ? "START_FLOW"
          : result.action === "HUMAN_HANDOFF"
            ? "HUMAN_HANDOFF"
            : "WAIT",

      confidence:
        Number(result.confidence) || 0,

      reason:
        String(result.reason || "")
    };

  } catch (error) {

    console.error(
      "PRE-FLOW OWNERSHIP DETECTOR ERROR:",
      error
    );


    // Fail-safe: ถ้าตรวจไม่ได้ อย่ารีบ handoff
    return {
      action: "WAIT",
      confidence: 0,
      reason: "detector_error"
    };
  }
}

// =========================
// START FLOW KEYWORDS
// ใช้เป็นประตูเริ่ม AI Flow เท่านั้น
// หลัง Flow เริ่มแล้ว ข้อความถัดไปไม่ต้องมี keyword ซ้ำ
// =========================

function hasFlowStartKeyword(value) {

  const text =
    String(value || "")
      .trim();


  if (!text) {
    return false;
  }


  const patterns = [

    // Film material names
    // เป็นแค่ประตูเริ่ม Flow เท่านั้น ไม่บังคับว่าเป็น PPF หรือ CW
    /\btpu\b/i,
    /\bpet\b/i,

    // Generic price enquiry
    // เริ่ม Flow ปกติ แล้วให้ระบบถามข้อมูลบริการ/รุ่นรถต่อ
    /ราคา/i,
    /เท่า\s*ไหร่/i,
    /เท่า\s*ไร/i,
    /กี่\s*บาท/i,
    /\bhow\s*much\b/i,
    /\bprice\b/i,
    /\bcost\b/i,

    // PPF / ฟิล์มกันรอย
    /\bppf\b/i,
    /\bpaint\s*protection\s*film\b/i,
    /\bclear\s*(?:protection\s*)?film\b/i,
    /ฟิล์ม\s*ใส(?:\s*กันรอย)?/i,
    /ฟิล์ม\s*กันรอย/i,
    /กันรอย/i,

    // Color Wrap
    /\b(?:color|colour)\s*wrap\b/i,
    /\bcar\s*wrap\b/i,
    /\bwrap\b/i,
    /แร็?ป/i,
    /ฟิล์ม\s*เปลี่ยนสี/i,
    /เปลี่ยนสี/i,

    // Interior / Furniture film
    /อินทีเรีย(?:ร์)?\s*ฟิล์ม/i,
    /ฟิล์ม\s*อินทีเรีย(?:ร์)?/i,
    /\binterior\s*(?:film|wrap)\b/i,

    // Lighting
    /\bambient(?:\s*light)?\b/i,
    /ไฟ\s*(?:ambient|แอมเบียนท์|แอมเบียนต์)/i,
    /\bstarlight\b/i,
    /ไฟดาว/i,
    /ดาวตก/i,

    // Body kit / Autoparts
    /\bbody\s*kit\b/i,
    /\bautoparts?\b/i,
    /ชุดแต่ง/i,
    /กระจัง/i,
    /\bgrill?e\b/i,

    // Steering / Brakes / Wheels / Tires / Suspension
    /พวงมาลัย/i,
    /\bsteering\s*wheel\b/i,
    /เบรก/i,
    /คาลิเปอร์/i,
    /\bbrakes?\b/i,
    /\bcalipers?\b/i,
    /ล้อแม็ก/i,
    /แม็ก/i,
    /\bwheels?\b/i,
    /\brims?\b/i,
    /ยางรถ/i,
    /\btires?\b/i,
    /\btyres?\b/i,
    /ช่วงล่าง/i,
    /\bsuspension\b/i,

    // Accessories
    /ประตูดูด/i,
    /\bsoft\s*close\b/i,
    /บันไดไฟฟ้า/i,
    /\bside\s*step\b/i,
    /ฝากระโปรงไฟฟ้า/i,
    /ฝาท้ายไฟฟ้า/i,
    /\bpower\s*tailgate\b/i,
    /กล้องติดรถ/i,
    /\bdash\s*cam\b/i,
    /จอ\s*android/i,
    /\bandroid\s*(?:screen|display)\b/i,
    /เข็มขัดนิรภัย/i,
    /\bseat\s*belt\b/i,

    // Window Film / Tint
/ฟิล์ม\s*กรองแสง/i,
/ฟิล์ม\s*กระจก/i,
/ฟิล์ม\s*กันร้อน/i,
/\bwindow\s*tint\b/i,
/\bwindow\s*film\b/i,
/\b3m\s*crystalline\b/i,
/\bcrystalline\s*black\b/i,
/\bcrystalline\b/i,
    
    // Detailing / Coating
    /เคลือบแก้ว/i,
    /เซรามิก/i,
    /\bceramic\s*coating\b/i,
    /\bdetailing\b/i
  ];


  return patterns.some(
    (pattern) =>
      pattern.test(text)
  );
}


// =========================
// HANDLE LINE EVENT
// =========================

async function handleEvent(event) {

  const sourceType =
    event.source?.type;

  if (
    sourceType === "group" ||
    sourceType === "room"
  ) {

    console.log(
      "LINE GROUP EVENT:",
      {
        groupId:
          event.source?.groupId ||
          null,
        roomId:
          event.source?.roomId ||
          null,
        userId:
          event.source?.userId ||
          null
      }
    );

    return;
  }

  const userId =
    event.source?.userId;


  if (!userId) {
    return;
  }

  // ==================================
  // LINE OA IDENTITY MAPPING
  // message.id เชื่อม Messaging API userId
  // กับ OA Manager EventStream chatId
  // ==================================
  if (
    event.type === "message" &&
    event.message?.id &&
    /^U[0-9a-f]{32}$/i.test(
      String(userId)
    )
  ) {
    try {
      await recordLineIdentityFromWebhook(
        userId,
        event
      );
    } catch (identityError) {
      console.error(
        "OA IDENTITY WEBHOOK ERROR:",
        identityError
      );
    }
  }

  // ==================================
  // DAILY CLOSE KPI WATCH
  // เก็บทุกข้อความ LINE 1:1 ก่อนเข้า Flow
  // เพื่อให้ข้อความหลัง 18:00 ถูกย้ายไปนับวันทำการถัดไป
  // ==================================
  if (
    event.type === "message"
  ) {
    try {
      await recordLineDailyCloseWatch(
        userId,
        event,
        new Date().toISOString()
      );
    } catch (watchError) {
      console.error(
        "DAILY CLOSE WATCH ERROR:",
        watchError
      );
    }
  }

// =========================
// GLOBAL AUTOCHAT KILL SWITCH
// =========================

try {

  const autochatEnabled =
    await getAutochatEnabled();


  if (!autochatEnabled) {

    // ถ้ามีข้อความเข้ามาระหว่าง AUTOCHAT ปิด
    // ให้ถือว่าเคสนี้เข้าสู่การดูแลโดยเซลล์แล้ว
    if (event.type === "message") {

      const now =
        new Date().toISOString();

      try {

        const existingSession =
          await getCustomerSession(
            userId
          );


        // =========================
        // ลูกค้าใหม่ที่ยังไม่มี Session
        // =========================
        if (!existingSession) {

          await saveCustomerSession(
            userId,
            {
              greeted: true,

              stage:
                "HUMAN_HANDOFF",

              vehicle_status:
                "UNKNOWN",

              ppf_matte:
                false,

              ai_enabled:
                false,

              language:
                "UNKNOWN",

              legacy:
                false,

              first_seen_at:
                now,

              last_seen_at:
                now,

              last_customer_message_at:
                now,

              last_customer_message_text:
                getCustomerMessageSummary(event),

              sales_acknowledged_at:
                null,

              sales_reminder_sent_at:
                null
            }
          );

        } else {

          // =========================
          // ลูกค้าที่มี Session อยู่แล้ว
          // ถ้าทักตอน Bot ปิด
          // ให้เซลล์รับช่วงต่อและ Bot ห้ามกลับมาแทรก
          // =========================

          await saveCustomerSession(
            userId,
            {
              stage:
                "HUMAN_HANDOFF",

              ai_enabled:
                false,

              last_seen_at:
                now,

              last_customer_message_at:
                now,

              last_customer_message_text:
                getCustomerMessageSummary(event),

              sales_acknowledged_at:
                null,

              sales_reminder_sent_at:
                null
            }
          );
        }


        console.log(
          "GLOBAL AUTOCHAT OFF - MANUAL HANDOFF:",
          userId
        );

      } catch (sessionError) {

        console.error(
          "AUTOCHAT OFF SESSION SAVE ERROR:",
          sessionError
        );
      }
    }


    console.log(
      "GLOBAL AUTOCHAT OFF - IGNORED:",
      userId
    );

    return;
  }

} catch (error) {

  console.error(
    "AUTOCHAT STATE CHECK ERROR:",
    error
  );

  // ถ้าเช็กสถานะไม่ได้
  // ให้หยุด Bot ไว้ก่อนเพื่อความปลอดภัย
  return;
}

// =========================
// TEST MODE FILTER
// ใช้กับทุก Event รวมถึง follow
// =========================

// =========================
// TEST MODE FILTER
// ใช้กับทุก Event รวมถึง follow
// =========================

const isFacebookChannel =
  String(userId).startsWith("facebook:") ||
  String(userId).startsWith("manychat:");

if (
  TEST_MODE &&
  !isFacebookChannel
) {

  console.log(
    "LINE USER ID:",
    userId
  );


  if (
    !TEST_USER_IDS.includes(
      userId
    )
  ) {

    console.log(
      "TEST MODE - ignored user:",
      userId
    );

    return;
  }
}


// =========================
// NEW FOLLOWER
// เปิด AI เฉพาะกรณียังไม่มี Session
// =========================

if (
  event.type === "follow"
) {

  const existingSession =
    await getCustomerSession(
      userId
    );


  if (!existingSession) {

    await saveCustomerSession(
      userId,
      {
        greeted: false,
        stage: "WAITING_START_KEYWORD",
        vehicle_status: "UNKNOWN",
        ppf_matte: false,
        ai_enabled: true,
        language: "UNKNOWN"
      }
    );
  }


  return;
}


// =========================
// MESSAGE ONLY
// =========================

if (
  event.type !== "message" ||
  !event.message ||
  (
    event.message.type !== "text" &&
    event.message.type !== "image" &&
    event.message.type !== "sticker"
  )
) {
  return;
}


const isImage =
  event.message.type === "image";


const isSticker =
  event.message.type === "sticker";


const text =
  event.message.type === "text"
    ? event.message.text.trim()
    : "";

const customerMessageAt =
  new Date().toISOString();

const customerMessageSummary =
  getCustomerMessageSummary(event);


  // ==================================
  // โหลดข้อมูลลูกค้า
  // ==================================

  let session =
    await getCustomerSession(userId);

  // Facebook / Instagram จะอนุญาตให้สร้าง session ใหม่
  // เฉพาะเมื่อ webhook ผ่าน cutoff และ contact เพิ่ง subscribe
  // ส่วน LINE ลูกค้าใหม่จริงต้องมี follow event สร้าง session ไว้ก่อนแล้ว
  const allowNewSession =
    event.allowNewSession === true;


if (!session) {

  const now =
    new Date().toISOString();

  // ==================================
  // NEW / UNKNOWN SESSION POLICY
  //
  // LINE:
  // ถ้าเป็น LINE user ID จริง แต่ยังไม่มี session
  // ให้ถือเป็น candidate ลูกค้าใหม่
  // แล้วรอ START KEYWORD ก่อนตอบ
  //
  // Facebook / Instagram:
  // ยังใช้ allowNewSession จาก webhook
  // ==================================

  const isLineUser =
    /^U[0-9a-f]{32}$/i.test(
      String(userId || "")
    );

  const canCreateNewSession =
    isLineUser ||
    allowNewSession;

  // ==================================
  // ยังยืนยันไม่ได้ว่าเป็นลูกค้าใหม่
  // เช่น FB / IG ที่ไม่ผ่านเงื่อนไข
  // ==================================
  if (!canCreateNewSession) {

    await saveCustomerSession(
      userId,
      {
        greeted: true,
        stage: "HUMAN_HANDOFF",
        vehicle_status: "UNKNOWN",
        ppf_matte: false,
        ai_enabled: false,
        language: "UNKNOWN",
        legacy: true,
        first_seen_at: now,
        last_seen_at: now,
        last_customer_message_at:
          customerMessageAt,
        last_customer_message_text:
          customerMessageSummary,
        sales_reminder_sent_at:
          null
      }
    );

    console.log(
      "UNVERIFIED SESSION - HUMAN HANDOFF:",
      {
        userId,
        allowNewSession,
        isLineUser
      }
    );

    return;
  }

  // ==================================
  // NEW CUSTOMER CANDIDATE
  // ยังไม่ตอบจนกว่าจะเจอ START KEYWORD
  // ==================================

  await saveCustomerSession(
    userId,
    {
      greeted: false,
      stage: "WAITING_START_KEYWORD",
      vehicle_status: "UNKNOWN",
      ppf_matte: false,
      ai_enabled: true,
      language: "UNKNOWN",
      legacy: false,
      first_seen_at: now,
      last_seen_at: now,
      last_customer_message_at:
        customerMessageAt,
      last_customer_message_text:
        customerMessageSummary,
      sales_reminder_sent_at:
        null
    }
  );

  session =
    await getCustomerSession(
      userId
    );

} else {

  const hadPreviousMessage =
    Boolean(
      session.last_seen_at
    );


  // เคยทักเข้ามาก่อนแล้ว
  // แต่ greeted ยัง false ค้างอยู่
  // ให้ถือว่าเป็นลูกค้าเดิม
  if (
    hadPreviousMessage &&
    session.greeted !== true &&
    session.stage !==
      "WAITING_START_KEYWORD"
  ) {

    await saveCustomerSession(
      userId,
      {
        greeted:
          true
      }
    );

    session.greeted =
      true;
  }


  await saveCustomerSession(
    userId,
    {
      last_seen_at:
        customerMessageAt,
      last_customer_message_at:
        customerMessageAt,
      last_customer_message_text:
        customerMessageSummary,
      sales_reminder_sent_at:
        null
    }
  );
}


// ==================================
// LICENSE PLATE -> HUMAN HANDOFF
// ลูกค้าปิดการขายจากช่องทางอื่น
// ส่งทะเบียนเข้ามาเพื่อให้เซลล์รับช่วงต่อ
// ==================================

if (text) {

  const normalizedPlateText =
    String(text)
      .trim()
      .replace(/\s+/g, " ");

const hasPlateKeyword =
  /(?:ทะเบียน|เลขทะเบียน|ป้ายทะเบียน|license\s*plate)/i
    .test(normalizedPlateText);

const platePattern =
  /(?:\d{1,2}\s*)?[ก-ฮ]{1,3}\s*-?\s*\d{1,4}/;

const hasPlateNumber =
  platePattern.test(
    normalizedPlateText
  );

const looksLikeStandalonePlate =
  /^(?:\d{1,2}\s*)?[ก-ฮ]{1,3}\s*-?\s*\d{1,4}(?:\s+[\u0E00-\u0E7F\s.]{2,30})?$/
    .test(
      normalizedPlateText
    );

const looksLikeThaiPlate =
  (
    hasPlateKeyword &&
    hasPlateNumber
  ) ||
  looksLikeStandalonePlate;


  if (looksLikeThaiPlate) {

    await saveCustomerSession(
      userId,
      {
        greeted: true,

        stage:
          "HUMAN_HANDOFF",

        ai_enabled:
          false,

        last_seen_at:
          new Date().toISOString()
      }
    );


    console.log(
      "LICENSE PLATE HANDOFF:",
      {
        userId,
        text:
          normalizedPlateText
      }
    );


    return;
  }
}

// ==================================
// UNIVERSAL HUMAN-HANDOFF SAFETY
// ใช้ร่วมกัน LINE + Facebook + Instagram
// ==================================

// ถ้าเคสนี้ถูกส่งให้คนแล้ว
// หรือ AI ถูกปิดเฉพาะคนนี้
// ต้องหยุดก่อนเข้า Flow ทุกกรณี
if (
  session.ai_enabled !== true ||
  session.stage === "HUMAN_HANDOFF"
) {

  console.log(
    "AI SESSION LOCKED - IGNORED:",
    {
      userId,
      stage:
        session.stage,
      ai_enabled:
        session.ai_enabled
    }
  );

  return;
}


// ==================================
// EXISTING CUSTOMER / EXISTING JOB
// เคสที่ชัดเจนว่าคุย/ทำ/จ่าย/นัดไว้แล้ว
// ห้าม Bot เริ่มถามข้อมูลใหม่
// ==================================

const existingCustomerSignal =
  Boolean(text) &&
  /(?:งานเดิม|งานที่เคยทำ|เคยทำกับ(?:ทาง)?ร้าน|เคยติดกับ(?:ทาง)?ร้าน|เคยคุยกับ(?:แอดมิน|เซลล์)|คุยไว้(?:เมื่อวาน|ก่อนหน้านี้)?|โอน(?:เงิน|มัดจำ)แล้ว|มัดจำแล้ว|ชำระ(?:เงิน|มัดจำ)แล้ว|นัดไว้แล้ว|มีคิวแล้ว|ประกันแจ้ง|แก้ชื่อ|เปลี่ยนชื่อ|เอกสาร.*(?:แก้|เปลี่ยน|ไม่ตรง)|รถที่ทำ(?:สี|ฟิล์ม)|งานมีปัญหา|ฟิล์มมีปัญหา|เคลม|แก้งาน|เช็กงาน|ตรวจเช็กงาน|change(?:d)?\s+(?:my\s+)?(?:plan|appointment|booking)|reschedul(?:e|ed|ing)|drop\s+(?:off\s+)?(?:my\s+)?car|bring\s+(?:my\s+)?car|pick\s*up\s+(?:my\s+)?car|already\s+(?:paid|booked|confirmed)|deposit\s+(?:paid|done)|previous\s+(?:job|booking|conversation)|existing\s+(?:job|booking)|warranty|claim|recheck)/i
    .test(text);


if (existingCustomerSignal) {

  await saveCustomerSession(
    userId,
    {
      greeted:
        true,

      stage:
        "HUMAN_HANDOFF",

      ai_enabled:
        false,

      last_seen_at:
        new Date().toISOString()
    }
  );


  console.log(
    "EXISTING CUSTOMER - HUMAN HANDOFF:",
    {
      userId,
      text
    }
  );


  return;
}


// ==================================
// START KEYWORD GATE
// ลูกค้าที่ Flow ยังไม่เริ่มต้องพิมพ์ keyword ที่กำหนดก่อน
// จึงจะเริ่ม AI Flow
// เมื่อเริ่มแล้ว ข้อความถัดไปไม่ต้องมี keyword ซ้ำ
// ==================================

if (
  session.stage === "WAITING_START_KEYWORD" ||
  session.stage === "START"
) {

  // ถ้า Bot ยังไม่เริ่ม Flow แล้วลูกค้าส่งรูป/สติกเกอร์
  // ให้ถือว่ามีบริบทเดิมที่ Bot ไม่รู้ -> ส่งให้คนทันที
  if (!text) {

    if (isImage || isSticker) {

      await saveCustomerSession(
        userId,
        {
          greeted: true,
          stage: "HUMAN_HANDOFF",
          ai_enabled: false,
          last_seen_at:
            new Date().toISOString()
        }
      );

      console.log(
        "PRE-FLOW MEDIA - HUMAN HANDOFF:",
        {
          userId,
          type: event.message.type
        }
      );

      return;
    }


    console.log(
      "WAITING START KEYWORD - EMPTY IGNORED:",
      { userId }
    );

    return;
  }


  if (!hasFlowStartKeyword(text)) {

    const ownership =
      await detectPreFlowHumanConversation(
        text
      );


    // Facebook/Instagram customers often reply with only a vehicle model
    // after the ad/ManyChat pre-flow asked for it. That is valid standalone
    // sales context, so let the backend start its normal AI flow instead of
    // waiting forever for an explicit service keyword.
    if (
      ownership.action ===
        "START_FLOW" &&
      ownership.confidence >= 0.80
    ) {

      await saveCustomerSession(
        userId,
        {
          stage: "START",
          last_seen_at:
            new Date().toISOString()
        }
      );

      session.stage =
        "START";

      console.log(
        "PRE-FLOW VEHICLE MODEL - START FLOW:",
        {
          userId,
          text,
          confidence:
            ownership.confidence,
          reason:
            ownership.reason
        }
      );

      // Do not return: continue processing THIS SAME message below so
      // analyzeCustomerMessage() can capture brand/model immediately.

    } else if (
      ownership.action ===
        "HUMAN_HANDOFF" &&
      ownership.confidence >= 0.85
    ) {

      await saveCustomerSession(
        userId,
        {
          greeted: true,
          stage: "HUMAN_HANDOFF",
          ai_enabled: false,
          last_seen_at:
            new Date().toISOString()
        }
      );


      console.log(
        "PRE-FLOW HUMAN CONVERSATION DETECTED - HANDOFF:",
        {
          userId,
          text,
          confidence:
            ownership.confidence,
          reason:
            ownership.reason
        }
      );

      return;
    }


    if (session.stage !== "START") {
      console.log(
        "WAITING START KEYWORD - IGNORED:",
        {
          userId,
          text,
          ownership
        }
      );

      return;
    }
  }


  if (session.stage !== "START") {
    await saveCustomerSession(
    userId,
    {
      stage:
        "START",

      last_seen_at:
        new Date().toISOString()
    }
  );


  session.stage =
    "START";


  console.log(
    "START KEYWORD MATCHED:",
    {
      userId,
      text
    }
  );
}

}
  
// ==================================
// STICKER
// Sticker -> Human Handoff เหมือนเดิม
// ==================================

if (isSticker) {

  await silentHandoff(
    userId
  );

  return;
}


// ==================================
// IMAGE
//
// ถ้ารู้รุ่นรถ + บริการ PPF/CW แล้ว
// รูปที่ลูกค้าส่งเพิ่มจะไม่ปิด AI
//
// แต่ถ้ายังรู้ข้อมูลไม่ครบ
// ให้ Human Handoff เหมือนเดิม
// ==================================

if (isImage) {

  const hasVehicleModel =
    Boolean(
      String(
        session.model || ""
      ).trim()
    );


  const hasVehicleService =
    session.service === "PPF" ||
    session.service === "CW";


  const imageCanBeIgnored =
    hasVehicleModel &&
    hasVehicleService &&
    session.stage !==
      "WAITING_CW_COLOR";


  if (imageCanBeIgnored) {

    console.log(
      "IMAGE RECEIVED - KEEP AI ACTIVE:",
      {
        userId,
        service:
          session.service,
        brand:
          session.brand,
        model:
          session.model,
        stage:
          session.stage
      }
    );

    // สำคัญ:
    // ไม่ Handoff
    // ไม่เปลี่ยน Stage
    // ไม่ให้รูปวิ่งลง Main Flow
    return;
  }


  // ข้อมูลยังไม่ครบ
  // หรือกำลังรอรูปสีอ้างอิง
  // ให้คนรับช่วง
  await silentHandoff(
    userId
  );

  return;
}
  
// ==================================
// SHOP LOCATION
// ตอบได้เสมอ แม้ AI ปิดหรือ HUMAN_HANDOFF
// ==================================

if (!isImage) {

  const locationRequest =
    getShopLocationRequestInfo(
      text
    );


  if (
    locationRequest.isLocationRequest
  ) {

    const locationText =
      "โลเคชั่นร้านครับ\n\n" +

      "📌พิกัด : https://goo.gl/maps/HvG8P1NZCFNQvUrTA\n\n" +

      "- ใกล้ MEGA BANGNA\n" +

      "- ลงด่วนบางนา ถึงเลย  ติดถนนใหญ่ บางนาตราด กม.5 (เลย Index Bangna 200 เมตร)";


    // ถามเฉพาะโลเคชั่น
    // ใช้ replyToken แล้วจบ
    if (
      !locationRequest.hasOtherQuestion
    ) {

      await replyText(
        event.replyToken,
        locationText
      );

      return;
    }


    // มีคำถามอื่นด้วย
    // Push โลเคชั่นก่อน เพื่อเก็บ replyToken
    // ไว้ให้ Flow เดิมตอบคำถามอื่นต่อ
    await pushMessages(
      userId,
      [
        {
          type: "text",
          text: locationText
        }
      ]
    );


    // สำคัญ:
    // ไม่ return
    // ไม่ silentHandoff
    // ไม่เปลี่ยน stage
    // ปล่อยลง Flow เดิมต่อ
  }
}

// ==================================
// STARLIGHT / AMBIENT LIGHT FLOW
// ==================================

if (!isImage && text) {

  // จับภาษาตรงนี้ด้วย
  // เพราะ Light Flow ทำงานก่อน Main Language Flow
const lightLanguage =
  detectCustomerLanguage(
    text,
    session.language
  );

  if (
    lightLanguage !== "UNKNOWN" &&
    lightLanguage !== session.language
  ) {

    await saveCustomerSession(
      userId,
      {
        language:
          lightLanguage
      }
    );

    session.language =
      lightLanguage;
  }


  const detectedLightService =
    detectInteriorLightService(text);


  const waitingLightModel =
    session.stage ===
      "WAITING_INTERIOR_LIGHT_MODEL";


  const waitingLightConfirm =
    session.stage ===
      "WAITING_INTERIOR_LIGHT_CONFIRM";


  // ==================================
  // CASE 1
  // เราถามรุ่นรถไปแล้ว
  // ลูกค้ากำลังตอบรุ่น
  //
  // เช่น:
  // Bot: ขออนุญาตสอบถามรุ่นรถ...
  // Customer: Porsche Cayenne
  //
  // ไม่ต้องถาม Cayenne ซ้ำ
  // ==================================

  if (waitingLightModel) {

    let vehicleCatalog = [];

    try {

      vehicleCatalog =
        await getVehicleCatalog();

    } catch (error) {

      console.error(
        "VEHICLE CATALOG ERROR:",
        error
      );
    }


    const result =
      await analyzeCustomerMessage(
        text,
        vehicleCatalog
      );


    const brand =
      result.brand ||
      "";

    const model =
      result.model ||
      "";


    // ยังอ่านรุ่นไม่ได้
// เราถามรุ่นไปแล้ว ห้ามถามซ้ำ
// เช่น ลูกค้าส่งรูป / ManyChat ส่งข้อความเดิมซ้ำ / ข้อความไม่ใช่รุ่นรถ
// ให้แอดมินรับช่วงต่อแบบเงียบ
if (!model) {

  await silentHandoff(
    userId
  );

  console.log(
    "WAITING MODEL - UNRECOGNIZED INPUT - HUMAN HANDOFF:",
    {
      userId,
      text
    }
  );

  return;
}


    const service =
      session.service;


    const serviceName =
      getInteriorLightName(
        service,
        session.language
      );


    const vehicleName =
      [brand, model]
        .filter(Boolean)
        .join(" ");


    // ลูกค้าเพิ่งตอบรุ่นมาเองแล้ว
    // ไม่ต้องถามยืนยันรุ่นซ้ำ
    // ส่งต่อแอดมินเลย

    await saveCustomerSession(
      userId,
      {
        service,
        brand,
        model,

        stage:
          "HUMAN_HANDOFF"
      }
    );


    await replyText(
      event.replyToken,

      localizedText(
        session,

        `รับทราบครับ ต้องการติด${serviceName}กับรถ ${vehicleName} แอดมินขอเช็กราคาและรายละเอียดให้ครับ กรุณาสักครู่ครับ`,

        `Understood. You're interested in installing ${serviceName} on your ${vehicleName}. Please allow our team a moment to check the price and details for you.`
      )
    );


    return;
  }


  // ==================================
  // CASE 2
  // Bot ใช้รุ่นรถจากบริการก่อนหน้า
  // และกำลังถามว่าเป็นรถคันเดิมไหม
  //
  // เช่น:
  // ก่อนหน้า PPF Porsche Cayenne
  // แล้วลูกค้าพิมพ์ "สนใจไฟดาว"
  // ==================================

  if (waitingLightConfirm) {

    // =========================
    // ลูกค้าตอบ YES
    // =========================

    if (
      isPositiveConfirmation(text)
    ) {

      const serviceName =
        getInteriorLightName(
          session.service,
          session.language
        );


      const vehicleName =
        [
          session.brand,
          session.model
        ]
          .filter(Boolean)
          .join(" ");


      await saveCustomerSession(
        userId,
        {
          stage:
            "HUMAN_HANDOFF"
        }
      );


      await replyText(
        event.replyToken,

        localizedText(
          session,

          `รับทราบครับ ต้องการติด${serviceName}กับรถ ${vehicleName} แอดมินขอเช็กราคาและรายละเอียดให้ครับ กรุณาสักครู่ครับ`,

          `Understood. You're interested in installing ${serviceName} on your ${vehicleName}. Please allow our team a moment to check the price and details for you.`
        )
      );


      return;
    }


    // =========================
    // ลูกค้าตอบ NO
    // =========================

    if (
      isNegativeConfirmation(text)
    ) {

      await saveCustomerSession(
        userId,
        {
          brand:
            null,

          model:
            null,

          stage:
            "WAITING_INTERIOR_LIGHT_MODEL"
        }
      );


      await replyText(
        event.replyToken,

        localizedText(
          session,

          "ขออนุญาตสอบถามรุ่นรถที่ต้องการติดตั้งครับ",

          "May I know the vehicle model you'd like this installed on?"
        )
      );


      return;
    }


    // ==================================
    // ลูกค้าไม่ตอบ Yes / No
    // แต่แจ้งรุ่นใหม่มาเลย
    //
    // เช่น:
    // Bot: Cayenne ใช่ไหมครับ
    // Customer: E-Class ครับ
    //
    // ไม่ต้องถาม E-Class ซ้ำ
    // ==================================

    let vehicleCatalog = [];

    try {

      vehicleCatalog =
        await getVehicleCatalog();

    } catch (error) {

      console.error(
        "VEHICLE CATALOG ERROR:",
        error
      );
    }


    const result =
      await analyzeCustomerMessage(
        text,
        vehicleCatalog
      );


    if (result.model) {

      const brand =
        result.brand ||
        "";

      const model =
        result.model;


      const serviceName =
        getInteriorLightName(
          session.service,
          session.language
        );


      const vehicleName =
        [brand, model]
          .filter(Boolean)
          .join(" ");


      await saveCustomerSession(
        userId,
        {
          brand,
          model,

          stage:
            "HUMAN_HANDOFF"
        }
      );


      await replyText(
        event.replyToken,

        localizedText(
          session,

          `รับทราบครับ ต้องการติด${serviceName}กับรถ ${vehicleName} แอดมินขอเช็กราคาและรายละเอียดให้ครับ กรุณาสักครู่ครับ`,

          `Understood. You're interested in installing ${serviceName} on your ${vehicleName}. Please allow our team a moment to check the price and details for you.`
        )
      );


      return;
    }


    // ตอบอย่างอื่นที่ระบบตีความไม่ได้
    // ส่งให้คนรับต่อ
    await silentHandoff(
      userId
    );

    return;
  }


  // ==================================
  // CASE 3
  // ลูกค้าเพิ่งถามไฟดาว / Ambient
  // ==================================

  if (detectedLightService) {

    let vehicleCatalog = [];

    try {

      vehicleCatalog =
        await getVehicleCatalog();

    } catch (error) {

      console.error(
        "VEHICLE CATALOG ERROR:",
        error
      );
    }


    const result =
      await analyzeCustomerMessage(
        text,
        vehicleCatalog
      );


    // ==================================
    // สำคัญ:
    // แยกรุ่นที่อยู่ใน "ข้อความปัจจุบัน"
    // ออกจากรุ่นที่จำจาก Session เดิม
    // ==================================

    const currentBrand =
      result.brand ||
      "";

    const currentModel =
      result.model ||
      "";


    const previousBrand =
      session.brand ||
      "";

    const previousModel =
      session.model ||
      "";


    const serviceName =
      getInteriorLightName(
        detectedLightService,
        session.language
      );


    // ==================================
    // CASE 3A
    // ลูกค้าระบุไฟ + รุ่นรถ
    // ในข้อความเดียวกันแล้ว
    //
    // "สนใจไฟดาว Cayenne"
    // "Ambient Light E-Class"
    //
    // ไม่ถามรุ่นซ้ำ
    // ==================================

    if (currentModel) {

      const vehicleName =
        [
          currentBrand,
          currentModel
        ]
          .filter(Boolean)
          .join(" ");


      await saveCustomerSession(
        userId,
        {
          service:
            detectedLightService,

          brand:
            currentBrand,

          model:
            currentModel,

          stage:
            "HUMAN_HANDOFF"
        }
      );


      await replyText(
        event.replyToken,

        localizedText(
          session,

          `รับทราบครับ ต้องการติด${serviceName}กับรถ ${vehicleName} แอดมินขอเช็กราคาและรายละเอียดให้ครับ กรุณาสักครู่ครับ`,

          `Understood. You're interested in installing ${serviceName} on your ${vehicleName}. Please allow our team a moment to check the price and details for you.`
        )
      );


      return;
    }


    // ==================================
    // CASE 3B
    // ข้อความปัจจุบันไม่ได้บอกรุ่น
    // แต่มีรุ่นจาก Session ก่อนหน้า
    //
    // เช่น:
    // ก่อนหน้า -> PPF Porsche Cayenne
    // ตอนนี้ -> สนใจไฟดาว
    //
    // ต้องถามว่ารถคันเดิมหรือไม่
    // ==================================

    if (previousModel) {

      const vehicleName =
        [
          previousBrand,
          previousModel
        ]
          .filter(Boolean)
          .join(" ");


      await saveCustomerSession(
        userId,
        {
          service:
            detectedLightService,

          stage:
            "WAITING_INTERIOR_LIGHT_CONFIRM"
        }
      );


      await replyText(
        event.replyToken,

        localizedText(
          session,

          `ลูกค้าต้องการติด${serviceName}กับรถ ${vehicleName} ใช่ไหมครับ`,

          `Would you like to install ${serviceName} on your ${vehicleName}?`
        )
      );


      return;
    }


    // ==================================
    // CASE 3C
    // ไม่มีรุ่นทั้งข้อความปัจจุบัน
    // และไม่มีใน Session
    // ==================================

    await saveCustomerSession(
      userId,
      {
        service:
          detectedLightService,

        brand:
          null,

        model:
          null,

        stage:
          "WAITING_INTERIOR_LIGHT_MODEL"
      }
    );


    await replyText(
      event.replyToken,

      localizedText(
        session,

        "ขออนุญาตสอบถามรุ่นรถที่ต้องการติดตั้งครับ",

        "May I know the vehicle model you'd like this installed on?"
      )
    );


    return;
  }
}
  
// =========================
// AI ONLY FOR NEW CUSTOMERS
// =========================

if (
  session.ai_enabled !== true
) {
  return;
}

// =========================
// REMEMBER CUSTOMER LANGUAGE
// =========================

if (
  !isImage &&
  text
) {

 const detectedLanguage =
  detectCustomerLanguage(
    text,
    session.language
  );


  if (
    detectedLanguage !== "UNKNOWN" &&
    detectedLanguage !==
      session.language
  ) {

    await saveCustomerSession(
      userId,
      {
        language:
          detectedLanguage
      }
    );


    session.language =
      detectedLanguage;
  }
}
  
// =========================
// REMEMBER MATTE PPF REQUEST
// =========================

if (
  isMattePPFRequest(text) &&
  session.ppf_matte !== true
) {

  await saveCustomerSession(
    userId,
    {
      ppf_matte: true
    }
  );

  // อัปเดตตัวแปรใน memory ด้วย
  // เพื่อให้ใช้ได้ทันทีในข้อความเดียวกัน
  session.ppf_matte = true;
}

console.log(
  "MATTE DEBUG:",
  {
    text,
    detected:
      isMattePPFRequest(text),

    sessionMatte:
      session.ppf_matte,

    stage:
      session.stage,

    service:
      session.service,

    brand:
      session.brand,

    model:
      session.model
  }
);
  
// ==================================
// HUMAN HANDOFF
// BOT หยุดตอบจนกว่าจะ Reset เอง
// ==================================

if (
  session.stage ===
  "HUMAN_HANDOFF"
) {
  return;
}


// ==================================
// ข้อความที่ต้องอาศัยรูปในการระบุ
// รุ่นรถ / สี / รายละเอียด
// ให้คนรับช่วงต่อ ไม่ให้ Bot เดา
// ==================================

if (
  !isImage &&
  isImageDependentReference(text)
) {

  await silentHandoff(
    userId
  );

  return;
}

// ==================================
// VEHICLE INTERIOR PPF
// ได้ขอบเขตงานแล้ว -> ส่งต่อแอดมินเช็กราคา
// ==================================

if (
  session.stage ===
  "WAITING_INTERIOR_PPF_SCOPE"
) {

  await replyText(
    event.replyToken,
    localizedText(
      session,
      "รับทราบครับ แอดมินขอเช็กราคาและรายละเอียดให้ครับ กรุณาสักครู่ครับ",
      "Understood. Please allow our team a moment to check the price and details for you."
    )
  );

  await saveCustomerSession(
    userId,
    {
      stage:
        "HUMAN_HANDOFF"
    }
  );

  return;
}

// ==================================
// FURNITURE
// รอเลือกประเภทฟิล์ม
// ==================================

if (
  session.stage ===
  "WAITING_FURNITURE_TYPE"
) {

  const selectedType =
    classifyFurnitureType(
      text
    );


  if (!selectedType) {

  await silentHandoff(
    userId
  );

  return;
}

  const furnitureMessages =
    await buildFurnitureMessages(
  selectedType,
  false,
  session.language
);


  await saveCustomerSession(
    userId,
    {
      service:
        selectedType,

      stage:
        "WAITING_FURNITURE_SIZE"
    }
  );


  await replyMessages(
    event.replyToken,
    furnitureMessages
  );

  return;
}


// ==================================
// FURNITURE
// รอขนาด
// ==================================

if (
  session.stage ===
  "WAITING_FURNITURE_SIZE"
) {

 const looksLikeSize =
  /\d+(?:\.\d+)?\s*(?:x|×)\s*\d+(?:\.\d+)?/i
    .test(text) ||
  /\d+(?:\.\d+)?\s*(?:cm|mm|m|ซม|มม|เมตร)/i
    .test(text) ||
  /(กว้าง|ยาว|สูง).*\d/i
    .test(text);


  if (!looksLikeSize) {

  await silentHandoff(
    userId
  );

  return;
}

 await replyText(
  event.replyToken,
  localizedText(
    session,
    "หน้างานคุณลูกค้าอยู่แถวไหนครับผม",
    "May I know the location of the installation site?"
  )
);


  await saveCustomerSession(
    userId,
    {
      stage:
        "WAITING_FURNITURE_LOCATION"
    }
  );


  return;
}


// ==================================
// FURNITURE
// ได้ Location แล้ว
// ส่งต่อ Human
// ==================================

if (
  session.stage ===
  "WAITING_FURNITURE_LOCATION"
) {

  await saveCustomerSession(
    userId,
    {
      stage:
        "HUMAN_HANDOFF"
    }
  );

  return;
}

// ==================================
// CW
// ลูกค้าตอบสี หรือส่งรูปอ้างอิงแล้ว
// ==================================

if (
  session.stage ===
  "WAITING_CW_COLOR"
) {

  let colorMessages = [];


    // ================================
  // ตรวจโทนสี
  // ================================

// ================================
// ตรวจโทนสี CW
// ================================

const cwColorTones = [
  {
    folder: "Sky-Blue",
    label: "สีฟ้า",
    pattern:
      /(สีฟ้า|โทนฟ้า|ฟ้า|sky[\s-]?blue|skyblue)/i
  },

  {
    folder: "Gold-Brown",
    label: "สีทอง / น้ำตาล",
    pattern:
      /(สีทอง|ทอง|gold|golden|สีน้ำตาล|น้ำตาล|brown|bronze|บรอนซ์)/i
  },

  {
    folder: "Grey",
    label: "สีเทา",
    pattern:
      /(สีเทา|เทา|grey|gray|graphite|กราไฟต์|gunmetal)/i
  },

  {
    folder: "Black",
    label: "สีดำ",
    pattern:
      /(สีดำ|ดำ|black)/i
  },

  {
    folder: "White",
    label: "สีขาว",
    pattern:
      /(สีขาว|ขาว|white)/i
  },

  {
    folder: "Blue",
    label: "สีน้ำเงิน",
    pattern:
      /(สีน้ำเงิน|น้ำเงิน|dark[\s-]?blue|navy|blue)/i
  },

  {
    folder: "Green",
    label: "สีเขียว",
    pattern:
      /(สีเขียว|เขียว|green)/i
  },

  {
    folder: "Orange",
    label: "สีส้ม",
    pattern:
      /(สีส้ม|ส้ม|orange)/i
  },

  {
    folder: "Pink",
    label: "สีชมพู",
    pattern:
      /(สีชมพู|ชมพู|pink|พิ้ง|พิงก์|rose|โรส)/i
  },

  {
    folder: "Purple",
    label: "สีม่วง",
    pattern:
      /(สีม่วง|ม่วง|purple|violet)/i
  },

  {
    folder: "Silver",
    label: "สีเงิน",
    pattern:
      /(สีเงิน|เงิน|silver)/i
  },

  {
    folder: "Yellow",
    label: "สีเหลือง",
    pattern:
      /(สีเหลือง|เหลือง|yellow)/i
  }
];
  
const matchedColorTone =
  !isImage
    ? cwColorTones.find(
        (tone) =>
          tone.pattern.test(text)
      )
    : null;

if (!matchedColorTone) {

  await silentHandoff(
    userId
  );

  return;
}
  
if (matchedColorTone) {

  const colorMedia =
    await getCWColorToneMedia(
      matchedColorTone.folder
    );


  colorMessages =
    buildCWColorCarousels(
      colorMedia,
      `ตัวอย่างฟิล์มโทน${matchedColorTone.label}`
    );
}    

  // ================================
  // รถใหม่
  // หลังได้สีแล้ว ส่งโปรฟิล์มกรองแสง
  // ================================

  if (
    session.vehicle_status === "NEW"
  ) {
        const reviewLinks =
      await getReviewLinksForVehicle(
        session.service,
        session.brand,
        session.model,
        session.ppf_matte === true
      );

    const nextMessages = [
      ...colorMessages,

      {
        type: "text",
        text:
          localizedText(
  session,
  "รับทราบครับผม ดูเป็นโปรจับคู่ฟิล์มกรองแสงไปด้วยเลยไหมครับ",
  "Understood. Would you also like to see our package options with window tint?"
)
      },

      {
        type: "text",
        text:
  localizedText(
    session,

    "ฟิล์มกรองแสงเซรามิก ที่นิยมติด 4 แบรนด์นี้\n\n" +
    "1. Blaupunkt\n" +
    "2. 3M\n" +
    "3. Solar Gard\n" +
    "4. Stek\n\n" +
    "สนใจแบรนด์ไหนแจ้งได้เลยครับ แอดมินทำโปรจับคู่ให้ครับ",

    "These are four of our popular ceramic window tint brands:\n\n" +
    "1. Blaupunkt\n" +
    "2. 3M\n" +
    "3. Solar Gard\n" +
    "4. Stek\n\n" +
    "Let me know which brand you're interested in and I can arrange a package offer for you."
  )
      }
    ];

        // ส่ง Clip เป็นข้อความสุดท้ายก่อน Handoff
    if (
  reviewLinks.length > 0
) {

  nextMessages.push(
    ...buildReviewLinkMessages(
      reviewLinks,
      localizedText(
  session,
  "ตัวนี้จะเป็นคลิปรีวิวงานติดตั้งจริงของทางร้าน",
  "Here are some videos of actual installations completed by our shop."
)
    )
  );
}

    await replyAllMessages(
      event.replyToken,
      userId,
      nextMessages
    );


        await saveCustomerSession(
      userId,
      {
        stage:
          "HUMAN_HANDOFF",

        clip_sent:
          reviewLinks.length > 0
      }
    );


    return;
  }


  // ================================
  // รถใช้งานแล้ว
  // หลังได้สีแล้ว ส่ง Clip ตาม Flow เดิม
  // ================================

  if (
    session.vehicle_status === "OLD"
  ) {

    const reviewLinks =
      await getReviewLinksForVehicle(
        session.service,
        session.brand,
        session.model,
        session.ppf_matte === true
      );

const followUpMessages = [];


if (
  reviewLinks.length > 0
) {

  followUpMessages.push(
    ...buildReviewLinkMessages(
      reviewLinks,
      localizedText(
  session,
  "ตัวนี้จะเป็นคลิปรีวิวงานติดตั้งจริงของทางร้าน",
  "Here are some videos of actual installations completed by our shop."
)
    )
  );

} else {

  followUpMessages.push({
  type: "text",
  text:
    localizedText(
      session,
      "รับทราบครับ",
      "Understood."
    )
});
}


// ข้อความชวนเข้าร้าน แยก Bubble
followUpMessages.push({
  type: "text",
  text:
    localizedText(
  session,
  "คุณลูกค้าสนใจเข้าชมผลงานติดตั้งที่ร้านก่อนได้นะครับ มีทีมงานคอยช่วยแนะนำผลิตภัณฑ์ให้ด้วยครับผม",
  "You're welcome to visit our shop to see our installation work in person. Our team will also be available to recommend the most suitable products for your vehicle."
)
});


await replyAllMessages(
  event.replyToken,
  userId,
  [
    ...colorMessages,
    ...followUpMessages
  ]
);


    await saveCustomerSession(
      userId,
      {
        stage:
          "HUMAN_HANDOFF",

        clip_sent:
          reviewLinks.length > 0
      }
    );


    return;
  }


  return;
}
  
  
// ==================================
// รถใหม่
// ลูกค้าตอบเรื่องวันรับรถแล้ว
// เสนอฟิล์มกรองแสง
// ==================================

if (
  session.stage ===
  "WAITING_DELIVERY_DATE"
) {

  const isDeliveryAnswer =
  hasDeliveryDateInfo(text) ||
  /(ทราบแล้ว|รู้แล้ว|ยังไม่ทราบ|ยังไม่รู้|ยังไม่แน่ใจ|ยังไม่กำหนด|ยังครับ|ยังค่ะ|รู้ครับ|รู้ค่ะ|yes|no|not yet|not sure|not sure yet|don't know|do not know|i don't know|i do not know|haven't decided|have not decided|not decided|still waiting)/i
    .test(text);


if (!isDeliveryAnswer) {

  await silentHandoff(
    userId
  );

  return;
}

  // CW: หลังลูกค้าตอบเรื่องวันรับรถ
  // ให้ถามสีที่ต้องการก่อน
  if (
    session.service === "CW"
  ) {

    await replyText(
      event.replyToken,
      localizedText(
  session,
  "ลูกค้าดูเป็นสีโทนประมาณไหนดีครับ แอดมินส่งรูปเพิ่มเติมให้ได้ครับ",
  "What color tone are you considering? I can send you some additional examples."
)
    );

    await saveCustomerSession(
      userId,
      {
        stage:
          "WAITING_CW_COLOR"
      }
    );

    return;
  }
  
    const reviewLinks =
    await getReviewLinksForVehicle(
      session.service,
      session.brand,
      session.model,
      session.ppf_matte === true
    );


  const nextMessages = [
    {
      type: "text",
      text:
        localizedText(
  session,
  "รับทราบครับผม ดูเป็นโปรจับคู่ฟิล์มกรองแสงไปด้วยเลยไหมครับ",
  "Understood. Would you also like to see our package options with window tint?"
)
    },

    {
      type: "text",
      text:
  localizedText(
    session,

    "ฟิล์มกรองแสงเซรามิก ที่นิยมติด 4 แบรนด์นี้\n\n" +
    "1. Blaupunkt\n" +
    "2. 3M\n" +
    "3. Solar Gard\n" +
    "4. Stek\n\n" +
    "สนใจแบรนด์ไหนแจ้งได้เลยครับ แอดมินทำโปรจับคู่ให้ครับ",

    "These are four of our popular ceramic window tint brands:\n\n" +
    "1. Blaupunkt\n" +
    "2. 3M\n" +
    "3. Solar Gard\n" +
    "4. Stek\n\n" +
    "Let me know which brand you're interested in and I can arrange a package offer for you."
  )
    }
  ];


  // ส่ง Clip เป็นข้อความสุดท้ายก่อน Handoff
  
if (
  reviewLinks.length > 0
) {

  nextMessages.push(
    ...buildReviewLinkMessages(
      reviewLinks,
      localizedText(
  session,
  "ตัวนี้จะเป็นคลิปรีวิวงานติดตั้งจริงของทางร้าน",
  "Here are some videos of actual installations completed by our shop."
)
    )
  );
}

  await replyAllMessages(
    event.replyToken,
    userId,
    nextMessages
  );

  await saveCustomerSession(
    userId,
    {
      stage:
        "HUMAN_HANDOFF",

      clip_sent:
        reviewLinks.length > 0
    }
  );


  return;
}

  // ==================================
  // STEP 5
  // ลูกค้าตอบเรื่องวันรับรถ
  // หรือเรื่องฟิล์มเก่า
  // ไม่ว่าจะตอบอะไร
  // ==================================

if (
  session.stage ===
  "WAITING_OLD_FILM"
) {
  
const normalizedOldFilmAnswer =
  String(text || "")
    .trim()
    .toLowerCase();


// ==================================
// ไม่มีฟิล์มเดิม / ไม่ต้องลอก
// เช็ก NO ก่อน เพราะคำว่า "ไม่มี"
// มีคำว่า "มี" อยู่ข้างใน
// ==================================

const noOldFilm =
  /(?:ไม่มี|ไม่มีฟิล์ม|ไม่มีฟิล์มเดิม|ไม่ต้องลอก|ไม่ลอก|ลอกออกแล้ว|เอาออกแล้ว|no\s*film|no\s*existing\s*film|doesn['’]?t\s*have\s*(?:any\s*)?(?:old\s*|existing\s*)?film|do\s*not\s*have\s*(?:any\s*)?(?:old\s*|existing\s*)?film|\bno\b)/i
    .test(
      normalizedOldFilmAnswer
    );


// ==================================
// มีฟิล์มเดิม / ต้องลอก
// รองรับประโยคธรรมชาติ
// ==================================

const hasOldFilm =
  !noOldFilm &&
  /(?:มี.*ฟิล์ม|ฟิล์ม.*(?:เดิม|เก่า|ติดอยู่|ยังอยู่)|ยังมี.*ฟิล์ม|ต้องลอก|needs?\s*removal|has?\s*(?:an?\s*)?(?:old\s*|existing\s*)?film|have\s*(?:an?\s*)?(?:old\s*|existing\s*)?film|existing\s*film|old\s*film|^\s*มี(?:ครับ|ค่ะ|คะ)?\s*$|^\s*yes\b)/i
    .test(
      normalizedOldFilmAnswer
    );


// ไม่สามารถแยกได้ว่า มี / ไม่มี
if (
  !hasOldFilm &&
  !noOldFilm
) {

  await silentHandoff(
    userId
  );

  return;
}


if (hasOldFilm) {

  await replyText(
    event.replyToken,
    localizedText(
      session,

      "รบกวนคุณลูกค้าส่งรูปสภาพฟิล์มปัจจุบัน เพื่อให้แอดมินช่วยประเมินพร้อมให้คำแนะนำก่อนได้ครับ",

      "Could you please send us a photo of the current condition of the existing film? Our team can review it and provide some initial recommendations for you."
    )
  );


  await saveCustomerSession(
    userId,
    {
      stage:
        "HUMAN_HANDOFF"
    }
  );


  return;
}
  
  // CW: หลังลูกค้าตอบเรื่องฟิล์มเก่า
  // ให้ถามสีที่ต้องการก่อน
  if (
    session.service === "CW"
  ) {

    await replyText(
      event.replyToken,
      localizedText(
  session,
  "ลูกค้าดูเป็นสีโทนประมาณไหนดีครับ แอดมินส่งรูปเพิ่มเติมให้ได้ครับ",
  "What color tone are you considering? I can send you some additional examples."
)
    );

    await saveCustomerSession(
      userId,
      {
        stage:
          "WAITING_CW_COLOR"
      }
    );

    return;
  }
  
  const reviewLinks =
    await getReviewLinksForVehicle(
      session.service,
      session.brand,
      session.model,
      session.ppf_matte === true
    );

const followUpMessages = [];


if (
  reviewLinks.length > 0
) {

  followUpMessages.push(
    ...buildReviewLinkMessages(
      reviewLinks,
      localizedText(
  session,
  "รับทราบครับ ตัวนี้จะเป็นคลิปรีวิวงานติดตั้งจริงของทางร้าน",
  "Understood. Here are some videos of actual installations completed by our shop."
)
    )
  );

} else {

  followUpMessages.push({
  type: "text",
  text:
    localizedText(
      session,
      "รับทราบครับ",
      "Understood."
    )
});
}


// ข้อความชวนเข้าร้าน แยกอีก 1 Bubble
followUpMessages.push({
  type: "text",
  text:
    localizedText(
  session,
  "คุณลูกค้าสนใจเข้าชมผลงานติดตั้งที่ร้านก่อนได้นะครับ มีทีมงานคอยช่วยแนะนำผลิตภัณฑ์ให้ด้วยครับผม",
  "You're welcome to visit our shop to see our installation work in person. Our team will also be available to recommend the most suitable products for your vehicle."
)
});


await replyAllMessages(
  event.replyToken,
  userId,
  followUpMessages
);

  await saveCustomerSession(
    userId,
    {
      stage:
        "HUMAN_HANDOFF",

      clip_sent:
        reviewLinks.length > 0
    }
  );

  return;
}

  // ==================================
  // กรณียังไม่รู้ว่ารถใหม่หรือรถใช้งาน
  // ==================================

  if (
    session.stage ===
    "WAITING_VEHICLE_STATUS"
  ) {

    const statusResult =
      await analyzeCustomerMessage(
        text
      );

const statusYear =
  statusResult.year ||
  session.year ||
  "";


if (
  statusResult.vehicle_status ===
    "UNKNOWN" &&
  isPastVehicleYear(statusYear)
) {

  await replyText(
    event.replyToken,
    localizedText(
  session,
  "ลูกค้ามีฟิล์มเดิมต้องลอกด้วยไหมครับ",
  "Does the vehicle currently have any existing film that needs to be removed?"
)
  );


  await saveCustomerSession(
    userId,
    {
      year:
        statusYear,

      vehicle_status:
        "OLD",

      stage:
        "WAITING_OLD_FILM"
    }
  );

  return;
}
    
    if (
  statusResult.vehicle_status ===
  "NEW"
) {

  // ลูกค้าแจ้งวันรับรถมาแล้ว
  if (
    hasDeliveryDateInfo(text)
  ) {

    // CW -> ข้ามไปถามสีเลย
    if (
      session.service === "CW"
    ) {

      await replyText(
        event.replyToken,
        localizedText(
  session,
  "ลูกค้าดูเป็นสีโทนประมาณไหนดีครับ แอดมินส่งรูปเพิ่มเติมให้ได้ครับ",
  "What color tone are you considering? I can send you some additional examples."
)
      );


      await saveCustomerSession(
        userId,
        {
          vehicle_status:
            "NEW",

          stage:
            "WAITING_CW_COLOR"
        }
      );

      return;
    }


    // PPF -> ถือว่าได้วันรับรถแล้ว
    // ให้เข้า Flow หลังทราบวันรับรถทันที

    const reviewLinks =
      await getReviewLinksForVehicle(
        session.service,
        session.brand,
        session.model,
        session.ppf_matte === true
      );


    const nextMessages = [
      {
        type: "text",
        text:
          localizedText(
  session,
  "รับทราบครับผม ดูเป็นโปรจับคู่ฟิล์มกรองแสงไปด้วยเลยไหมครับ",
  "Understood. Would you also like to see our package options with window tint?"
)
      },

      {
        type: "text",
        text:
  localizedText(
    session,

    "ฟิล์มกรองแสงเซรามิก ที่นิยมติด 4 แบรนด์นี้\n\n" +
    "1. Blaupunkt\n" +
    "2. 3M\n" +
    "3. Solar Gard\n" +
    "4. Stek\n\n" +
    "สนใจแบรนด์ไหนแจ้งได้เลยครับ แอดมินทำโปรจับคู่ให้ครับ",

    "These are four of our popular ceramic window tint brands:\n\n" +
    "1. Blaupunkt\n" +
    "2. 3M\n" +
    "3. Solar Gard\n" +
    "4. Stek\n\n" +
    "Let me know which brand you're interested in and I can arrange a package offer for you."
  )
      }
    ];
    
if (
  reviewLinks.length > 0
) {

  nextMessages.push(
    ...buildReviewLinkMessages(
      reviewLinks,
      localizedText(
  session,
  "ตัวนี้จะเป็นคลิปรีวิวงานติดตั้งจริงของทางร้าน",
  "Here are some videos of actual installations completed by our shop."
)
    )
  );
}
    
    await replyAllMessages(
      event.replyToken,
      userId,
      nextMessages
    );


    await saveCustomerSession(
      userId,
      {
        vehicle_status:
          "NEW",

        stage:
          "HUMAN_HANDOFF",

        clip_sent:
          reviewLinks.length > 0
      }
    );

    return;
  }


  // ยังไม่ได้บอกวัน
  await replyText(
    event.replyToken,
    localizedText(
  session,
  "คุณลูกค้าทราบวันรับรถแล้วหรือยังครับ",
  "Do you already know your vehicle delivery date?"
)
  );


      await saveCustomerSession(
        userId,
        {
          vehicle_status: "NEW",
          stage:
            "WAITING_DELIVERY_DATE"
        }
      );

      return;
    }


    if (
      statusResult.vehicle_status ===
      "OLD"
    ) {

      await replyText(
        event.replyToken,
        localizedText(
  session,
  "ลูกค้ามีฟิล์มเดิมต้องลอกด้วยไหมครับ",
  "Does the vehicle currently have any existing film that needs to be removed?"
)
      );


      await saveCustomerSession(
        userId,
        {
          vehicle_status: "OLD",
          stage:
            "WAITING_OLD_FILM"
        }
      );

      return;
    }


// ==================================
// ยังไม่ตอบ NEW / OLD
// แต่ลูกค้ายังระบุรุ่นรถหรือบริการอยู่
// ให้กลับเข้า Main Flow
// เพื่อส่งรูป + ถามสถานะรถอีกครั้ง
// ==================================

const stillTalkingAboutVehicleJob =
  Boolean(statusResult.model) ||
  Boolean(statusResult.brand) ||
  statusResult.service === "PPF" ||
  statusResult.service === "INTERIOR_PPF" ||
  statusResult.service === "CW" ||
  /(ppf|ฟิล์มใส|ฟิล์มกันรอย|กันรอย|wrap|wrapping|แรป|แร็ป|แร๊ป|cw|เปลี่ยนสี)/i
    .test(text);


if (stillTalkingAboutVehicleJob) {

  // ไม่ return
  // ปล่อยให้ข้อความนี้ลงไปเข้า Main Flow ด้านล่าง

} else {

  await silentHandoff(
    userId
  );

  return;
}


// ปิด WAITING_VEHICLE_STATUS
}


  
  // ==================================
  // ให้ AI อ่านข้อความลูกค้า
  // ==================================

  let vehicleCatalog = [];

try {

  vehicleCatalog =
    await getVehicleCatalog();

} catch (error) {

  console.error(
    "VEHICLE CATALOG ERROR:",
    error
  );

}

const result =
  await analyzeCustomerMessage(
    text,
    vehicleCatalog
  );

// ==================================
// VEHICLE INTERIOR FILM GUARD (V5.7.5)
// Vehicle context MUST beat furniture context.
// Deterministic guard: do not rely on the AI prompt alone.
// ==================================

const explicitFurnitureContext =
  /(?:เฟอร์นิเจอร์|โต๊ะ|ตู้|เคาน์เตอร์|เคาน์เตอร์ครัว|ท็อปครัว|ครัว|ผนัง|บ้าน|คอนโด|หน้าบาน|cabinet|counter(?:top)?|table|desk|furniture|kitchen|wall|home|condo)/i
    .test(text);

const explicitVehicleInteriorCue =
  /(?:ภายในรถ|ภายใน|คอนโซล|แดชบอร์ด|แผงประตู|ประตูรถ|ช่องแอร์|จอกลาง|หน้าจอ|เกียร์|piano\s*black|dashboard|console|door\s*trim|center\s*console|vehicle\s*interior|car\s*interior)/i
    .test(text);

const vehicleContextInCurrentMessage =
  Boolean(result.brand) ||
  Boolean(result.model) ||
  /(?:รถ|car|vehicle|benz|mercedes|bmw|tesla|porsche|audi|volvo|toyota|honda|nissan|mazda|ford|isuzu|byd|zeekr|xpeng|deepal|jaecoo|lotus|ferrari|bentley|jaguar)/i
    .test(text);

const interiorProtectionSignal =
  /(?:ppf|ฟิล์ม\s*ใส|ฟิล์ม\s*กันรอย|กันรอย|clear\s*(?:protection\s*)?film|protection\s*film)/i
    .test(text);

if (
  !explicitFurnitureContext &&
  vehicleContextInCurrentMessage &&
  explicitVehicleInteriorCue &&
  (
    interiorProtectionSignal ||
    result.service === "FURNITURE" ||
    result.service === "FURNITURE_PPF"
  )
) {
  result.service =
    "INTERIOR_PPF";

  console.log(
    "VEHICLE INTERIOR FILM OVERRIDE:",
    {
      text,
      brand: result.brand,
      model: result.model,
      service: result.service
    }
  );
}

if (
  !explicitFurnitureContext &&
  vehicleContextInCurrentMessage &&
  explicitVehicleInteriorCue &&
  result.service === "FURNITURE_CW"
) {
  result.service =
    "OTHER";

  console.log(
    "VEHICLE INTERIOR WRAP OVERRIDE:",
    {
      text,
      brand: result.brand,
      model: result.model,
      service: result.service
    }
  );
}

  // ==================================
// NON-CUSTOMER CONTACT
// SUPPLIER / JOB APPLICANT
// ==================================

if (
  result.intent === "supplier_outreach" ||
  result.intent === "job_application"
) {

  await silentHandoff(
    userId
  );

  return;
}

const isInteriorFilmRequest =
  !vehicleContextInCurrentMessage &&
  /(?:อินทีเรีย(?:ร์)?\s*ฟิล์ม|ฟิล์ม\s*อินทีเรีย(?:ร์)?|interior\s*(?:film|wrap))/i
    .test(text);
  
// ==================================
// GENERIC WRAP
// ลูกค้าพูดแค่ WRAP ยังไม่รู้ว่า
// Wrap สี หรือ Wrap ใสกันรอย
// ==================================

const genericWrapRequest =
  !isInteriorFilmRequest &&
  isGenericWrapRequest(
    text
  );

const detectedBrand =
  result.brand ||
  session.brand ||
  "";


const detectedModel =
  result.model ||
  session.model ||
  "";


const detectedYear =
  result.year ||
  session.year ||
  "";


if (genericWrapRequest) {

  const greetingPrefix =
    !session.greeted
      ? localizedText(
          session,
          "WRAPTOR THAILAND สวัสดีครับ แอดมินต้นกล้ายินดีให้บริการครับ\n\n",
          "WRAPTOR THAILAND, hello. My name is Tonkla and I'll be happy to assist you.\n\n"
        )
      : "";


  await saveCustomerSession(
    userId,
    {
      greeted:
        true,

      service:
        null,

      brand:
        detectedBrand,

      model:
        detectedModel,

      year:
        detectedYear,

      stage:
        "WAITING_WRAP_TYPE"
    }
  );


  await replyText(
    event.replyToken,

    greetingPrefix +
    localizedText(
      session,

      "คุณลูกค้าสนใจ WRAP แบบไหนครับ\n\n" +
      "• WRAP สี / ฟิล์มเปลี่ยนสี\n" +
      "• WRAP ใสกันรอย / PPF",

      "Which type of wrap are you interested in?\n\n" +
      "• Color Wrap\n" +
      "• Clear Paint Protection Film (PPF)"
    )
  );


  return;
}
  
  // รวมข้อมูลใหม่กับข้อมูลเดิม
  const service =
  isInteriorFilmRequest
    ? "FURNITURE"
    : (
        result.service !== "UNKNOWN"
          ? result.service
          : session.service
      );
  
// ลูกค้ากำลังตอบคำถามว่า
// Wrap สี หรือ Wrap ใสกันรอย
if (
  session.stage ===
    "WAITING_WRAP_TYPE" &&
  result.service !== "CW" &&
  result.service !== "PPF"
) {

  await silentHandoff(
    userId
  );

  return;
}

  const brand =
    result.brand ||
    session.brand ||
    "";


  const model =
    result.model ||
    session.model ||
    "";

  const year =
    result.year ||
    session.year ||
    "";

let vehicleStatus =
  result.vehicle_status !== "UNKNOWN"
    ? result.vehicle_status
    : (
        session.vehicle_status &&
        session.vehicle_status !== "UNKNOWN"
          ? session.vehicle_status
          : "UNKNOWN"
      );


// ถ้าลูกค้าไม่ได้ระบุ NEW / OLD เอง
// แต่แจ้งปีรถเป็นปีที่ผ่านมาแล้ว
// ให้ถือว่าเป็นรถใช้งานแล้ว
if (
  vehicleStatus === "UNKNOWN" &&
  isPastVehicleYear(year)
) {
  vehicleStatus = "OLD";
}

// ==================================
// PARTIAL WRAP FLOW
// Wrap เฉพาะส่วน
// ==================================

const detectedPartialWrapParts =
  detectPartialWrapParts(
    text
  );


const partialWrapParts =
  detectedPartialWrapParts.length > 0
    ? detectedPartialWrapParts
    : (
        session.stage ===
          "WAITING_PARTIAL_WRAP_MODEL"
          ? parsePartialWrapParts(
              session.wrap_parts
            )
          : []
      );


if (
  service === "CW" &&
  partialWrapParts.length > 0
) {

  const wrapPartsText =
    formatPartialWrapParts(
      partialWrapParts,
      session.language
    );


  // =========================
  // ยังไม่ทราบรุ่นรถ
  // =========================

// =========================
// เคยถามรุ่นรถไปแล้ว
// แต่ลูกค้ายังไม่ได้ตอบรุ่น
// ห้ามถามซ้ำ -> ส่งต่อเซลล์
// =========================

if (
  session.stage ===
    "WAITING_PARTIAL_WRAP_MODEL" &&
  !model
) {

  await silentHandoff(
    userId
  );

  return;
}


// =========================
// ยังไม่ทราบรุ่นรถครั้งแรก
// =========================
  
  if (!model) {

    await saveCustomerSession(
      userId,
      {
        service: "CW",
        brand,
        year,

        vehicle_status:
          vehicleStatus,

        wrap_parts:
          partialWrapParts.join(","),

        stage:
          "WAITING_PARTIAL_WRAP_MODEL"
      }
    );


    await replyText(
      event.replyToken,

      localizedText(
        session,

        "รับทราบครับ ต้องการ Wrap เฉพาะส่วน " +
        wrapPartsText +
        "\n\nขออนุญาตสอบถามรุ่นรถคุณลูกค้าครับ",

        "Understood. You're looking to wrap only the " +
        wrapPartsText +
        ".\n\nMay I know the model of your vehicle?"
      )
    );


    return;
  }


  // =========================
  // มีรุ่นรถแล้ว
  // ส่งต่อแอดมินเช็กราคา
  // =========================

  const vehicleName =
    [brand, model]
      .filter(Boolean)
      .join(" ");


  await saveCustomerSession(
    userId,
    {
      service: "CW",
      brand,
      model,
      year,

      vehicle_status:
        vehicleStatus,

      wrap_parts:
        partialWrapParts.join(","),

      stage:
        "HUMAN_HANDOFF"
    }
  );


  await replyText(
    event.replyToken,

    localizedText(
      session,

      "รับทราบครับ ต้องการ Wrap เฉพาะส่วน " +
      wrapPartsText +
      (
        vehicleName
          ? " ของ " + vehicleName
          : ""
      ) +
      "\n\nแอดมินขอเช็กราคาและรายละเอียดให้ครับ กรุณาสักครู่ครับ",

      "Understood. You're looking to wrap only the " +
      wrapPartsText +
      (
        vehicleName
          ? " on your " + vehicleName
          : ""
      ) +
      ".\n\nPlease allow our team a moment to check the price and details for you."
    )
  );


  return;
}
  
  await saveCustomerSession(
    userId,
    {
      service,
      brand,
      model,
      year,
      vehicle_status:
        vehicleStatus
    }
  );

// ==================================
// VEHICLE INTERIOR PPF FLOW
// ฟิล์มใสกันรอยภายในรถ - ห้ามเข้า Furniture / Full-body PPF flow
// ==================================

if (
  service === "INTERIOR_PPF"
) {

  const vehicleName =
    [brand, model]
      .filter(Boolean)
      .join(" ");

  await saveCustomerSession(
    userId,
    {
      greeted: true,
      service: "INTERIOR_PPF",
      brand,
      model,
      year,
      vehicle_status:
        vehicleStatus,
      stage:
        "WAITING_INTERIOR_PPF_SCOPE"
    }
  );

  await replyText(
    event.replyToken,
    (
      !session.greeted
        ? localizedText(
            session,
            "WRAPTOR THAILAND สวัสดีครับ แอดมินต้นกล้ายินดีให้บริการครับ\n\n",
            "WRAPTOR THAILAND, hello. My name is Tonkla and I'll be happy to assist you.\n\n"
          )
        : ""
    ) +
    localizedText(
      session,
      "รับทราบครับ สนใจฟิล์มใสกันรอยภายใน" +
        (vehicleName ? " " + vehicleName : "รถ") +
        " ครับ\n\nคุณลูกค้าต้องการติดแบบเหมาภายใน หรือเฉพาะจุดครับ หากเป็นเฉพาะจุดสามารถส่งรูปบริเวณที่ต้องการติดมาได้เลยครับ",
      "Understood. You're interested in clear interior protection film" +
        (vehicleName ? " for your " + vehicleName : " for your vehicle") +
        ".\n\nWould you like full-interior coverage or specific areas only? If specific areas, you can send photos of the parts you'd like protected."
    )
  );

  return;
}

// ==================================
// FURNITURE FLOW
// ==================================

if (
  service === "FURNITURE"
) {

  const furnitureGreetingPrefix =
    !session.greeted
      ? localizedText(
          session,
          "Wraptor Thailand สวัสดีครับ แอดมินต้นกล้ายินดีให้บริการครับ\n\n",
          "WRAPTOR THAILAND, hello. My name is Tonkla and I'll be happy to assist you.\n\n"
        )
      : "";


  await replyText(
    event.replyToken,

    furnitureGreetingPrefix +
    localizedText(
      session,

      "คุณลูกค้าสนใจติดฟิล์มใสกันรอย หรือ ฟิล์มเปลี่ยนสี / ฟิล์มลายไม้ / ลายหิน ดีครับ 😊",

      "Are you interested in clear protection film, color wrap, wood-pattern film, or stone-pattern film?"
    )
  );


  await saveCustomerSession(
    userId,
    {
      greeted:
        true,

      service:
        "FURNITURE",

      stage:
        "WAITING_FURNITURE_TYPE"
    }
  );


  return;
}

if (
  service === "FURNITURE_PPF" ||
  service === "FURNITURE_CW"
) {

  const furnitureMessages =
  await buildFurnitureMessages(
  service,
  !session.greeted,
  session.language
);


  await saveCustomerSession(
    userId,
    {
      greeted:
        true,

      service:
        service,

      stage:
        "WAITING_FURNITURE_SIZE"
    }
  );


  await replyMessages(
    event.replyToken,
    furnitureMessages
  );


  return;
}
  
  // ==================================
  // STEP 1
  // Greeting ครั้งแรกเท่านั้น
  // ==================================

const messages = [];

let greetingText =
  !session.greeted
    ? localizedText(
        session,
        "WRAPTOR THAILAND สวัสดีครับ แอดมินต้นกล้ายินดีให้บริการครับ",
        "WRAPTOR THAILAND, hello. My name is Tonkla and I'll be happy to assist you."
      )
    : "";

function withGreeting(messageText) {

  if (!greetingText) {
    return messageText;
  }

  messages.push({
    type: "text",
    text: greetingText
  });

  // ใช้ Greeting ได้ครั้งเดียวใน Response นี้
  greetingText = "";

  return messageText;
}

if (!session.greeted) {

  await saveCustomerSession(
    userId,
    {
      greeted: true
    }
  );
}


  // ==================================
  // STEP 2
  // ยังไม่ได้รุ่นรถ + บริการ
  // ==================================

// เคยถามบริการแล้ว
// แต่คำตอบล่าสุดยังจับ Service ไม่ได้
if (
  session.stage ===
    "WAITING_VEHICLE_SERVICE" &&
  !service
) {

  await silentHandoff(
    userId
  );

  return;
}
    
  if (
    !model &&
    !service
  ) {

messages.push({
  type: "text",

  text:
    localizedText(
  session,

  "คุณลูกค้าสนใจสอบถามด้านใดครับ\n\n" +
  "• ฟิล์มใสกันรอย (PPF)\n" +
  "• ฟิล์มเปลี่ยนสี (CW)\n" +
  "• นัดหมาย / Service\n" +
  "• ชุดแต่ง (Autopart)\n" +
  "• ไฟ AMBIENT LIGHT\n" +
  "• ACCESSORY อื่นๆ\n\n" +
  "แจ้งได้เลยครับ",

  "Which service are you interested in?\n\n" +
  "• Paint Protection Film (PPF)\n" +
  "• Color Wrap (CW)\n" +
  "• Appointment / Service\n" +
  "• Body Kits / Autoparts\n" +
  "• Ambient Lighting\n" +
  "• Other Accessories\n\n" +
  "Please let me know."
)
});


    await saveCustomerSession(
      userId,
      {
        stage:
          "WAITING_VEHICLE_SERVICE"
      }
    );


    await replyMessages(
      event.replyToken,
      messages
    );

    return;
  }

// ==================================
// SERVICE / งานเดิม / นัดหมาย
// ส่งต่อแอดมินทันที
// ==================================

if (service === "SERVICE") {

  await saveCustomerSession(
    userId,
    {
      stage: "HUMAN_HANDOFF"
    }
  );

  return;
}

// ถ้ามีบริการแล้ว แต่ยังไม่มีรุ่น
if (!model) {

  // เคยถามรุ่นรถไปแล้ว
  // ห้ามถามซ้ำ -> ส่งต่อเซลล์ทันที
  if (
    session.stage === "WAITING_MODEL" ||
    session.stage === "WAITING_MODEL_RETRY"
  ) {

    await silentHandoff(
      userId
    );

    return;
  }

  const isSecondQuestion = false;

 const modelQuestion =
  isSecondQuestion
    ? localizedText(
        session,
        "เป็นรุ่นไหนครับลูกค้า",
        "Which model is it?"
      )
    : localizedText(
        session,
        "ขออนุญาตสอบถามรุ่นรถคุณลูกค้าครับ",
        "May I know the model of your vehicle?"
      );


  messages.push({
    type: "text",
    text:
      withGreeting(
        modelQuestion
      )
  });


  await saveCustomerSession(
    userId,
    {
      stage:
        isSecondQuestion
          ? "WAITING_MODEL_RETRY"
          : "WAITING_MODEL"
    }
  );


  await replyMessages(
    event.replyToken,
    messages
  );

  return;
}


  // มีรถแล้ว แต่ยังไม่รู้บริการ
  if (!service) {

    messages.push({
      type: "text",

      text:
          localizedText(
  session,

  "คุณลูกค้าสนใจสอบถามด้านใดครับ\n\n" +
  "• ฟิล์มใสกันรอย (PPF)\n" +
  "• ฟิล์มเปลี่ยนสี (CW)\n" +
  "• นัดหมาย / Service\n" +
  "• ชุดแต่ง (Autopart)\n" +
  "• ไฟ AMBIENT LIGHT\n" +
  "• ACCESSORY อื่นๆ\n\n" +
  "แจ้งได้เลยครับ",

  "Which service are you interested in?\n\n" +
  "• Paint Protection Film (PPF)\n" +
  "• Color Wrap (CW)\n" +
  "• Appointment / Service\n" +
  "• Body Kits / Autoparts\n" +
  "• Ambient Lighting\n" +
  "• Other Accessories\n\n" +
  "Please let me know."
)
    });


    await saveCustomerSession(
      userId,
      {
        stage:
          "WAITING_VEHICLE_SERVICE"
      }
    );


    await replyMessages(
      event.replyToken,
      messages
    );

    return;
  }

// ==================================
// บริการนอกเหนือ PPF / CW
// ==================================

if (service === "OTHER") {

  messages.push({
    type: "text",

    text:
  withGreeting(
    localizedText(
      session,
      "แอดมินเช็คข้อมูลแจ้งกลับ กรุณาสักครู่ครับ",
      "Please allow our team a moment to check the details for you."
    )
  )
  });


  await saveCustomerSession(
    userId,
    {
      stage: "HUMAN_HANDOFF"
    }
  );


  await replyMessages(
    event.replyToken,
    messages
  );

  return;
}

  // ==================================
  // STEP 4
  // ได้รถ + PPF/CW
  // หา Media ตรงรุ่น
  // ==================================

 const media =
  await getMediaForVehicle(
    service,
    brand,
    model
  );


const effectiveBrand =
  brand ||
  (
    media.length > 0
      ? media[0].brand
      : ""
  );


if (
  !brand &&
  effectiveBrand
) {

  await saveCustomerSession(
    userId,
    {
      brand:
        effectiveBrand
    }
  );
}


const brandProof =
  await getBrandProof(
    effectiveBrand,
    model,
    service
  );

console.log(
  "BRAND PROOF DEBUG:",
  {
    service,
    brand,
    model,
    brandProof
  }
);
  
  const grids =
    buildMediaGrids(media);

if (
  grids.length > 0 ||
  brandProof
) {

  messages.push({
    type: "text",

    text:
     withGreeting(
  localizedText(
    session,
    "ตัวอย่างผลงานติดตั้งของทางร้านครับ",
    "Here are some examples of our installation work."
  )
)
  });


  if (grids.length > 0) {

    messages.push(
      ...grids
    );
  }


  if (brandProof) {

    messages.push(
      buildBrandProofMessage(
  brandProof,
  session.language
)
    );
  }
}


  // ==================================
  // รถใหม่
  // ==================================

  if (
  vehicleStatus === "NEW"
) {

  // ลูกค้าบอกวันรับรถมาแล้วตั้งแต่ข้อความนี้
  if (
    hasDeliveryDateInfo(text)
  ) {

    // CW -> ไปถามสี
    if (
      service === "CW"
    ) {

      messages.push({
        type: "text",
        text:
          localizedText(
  session,
  "ลูกค้าดูเป็นสีโทนประมาณไหนดีครับ แอดมินส่งรูปเพิ่มเติมให้ได้ครับ",
  "What color tone are you considering? I can send you some additional examples."
)
      });


      await saveCustomerSession(
        userId,
        {
          stage:
            "WAITING_CW_COLOR",

          media_sent:
            grids.length > 0
        }
      );


      await replyAllMessages(
        event.replyToken,
        userId,
        messages
      );

      return;
    }


    // PPF -> ข้ามคำถามวันรับรถ
    const reviewLinks =
  await getReviewLinksForVehicle(
    service,
    effectiveBrand,
    model,
    session.ppf_matte === true
  );


    messages.push({
      type: "text",
      text:
        localizedText(
  session,
  "รับทราบครับผม ดูเป็นโปรจับคู่ฟิล์มกรองแสงไปด้วยเลยไหมครับ",
  "Understood. Would you also like to see our package options with window tint?"
)
    });


    messages.push({
      type: "text",
      text:
  localizedText(
    session,

    "ฟิล์มกรองแสงเซรามิก ที่นิยมติด 4 แบรนด์นี้\n\n" +
    "1. Blaupunkt\n" +
    "2. 3M\n" +
    "3. Solar Gard\n" +
    "4. Stek\n\n" +
    "สนใจแบรนด์ไหนแจ้งได้เลยครับ แอดมินทำโปรจับคู่ให้ครับ",

    "These are four of our popular ceramic window tint brands:\n\n" +
    "1. Blaupunkt\n" +
    "2. 3M\n" +
    "3. Solar Gard\n" +
    "4. Stek\n\n" +
    "Let me know which brand you're interested in and I can arrange a package offer for you."
  )
    });

if (
  reviewLinks.length > 0
) {

  messages.push(
    ...buildReviewLinkMessages(
  reviewLinks,
  localizedText(
    session,
    "ขออนุญาตส่ง Clip ผลงานของทางร้านเพิ่มเติมครับ",
    "Here are some additional videos of our actual installation work."
  )
)
  );
}

    await saveCustomerSession(
      userId,
      {
        stage:
          "HUMAN_HANDOFF",

        media_sent:
          grids.length > 0,

        clip_sent:
          reviewLinks.length > 0
      }
    );


    await replyAllMessages(
      event.replyToken,
      userId,
      messages
    );

    return;
  }

  // ไม่มีวันรับรถ -> ถามตามปกติ
  messages.push({
    type: "text",

    text:
      withGreeting(
        localizedText(
  session,
  "คุณลูกค้าทราบวันรับรถแล้วหรือยังครับ",
  "Do you already know your vehicle delivery date?"
)
      )
  });


  await saveCustomerSession(
    userId,
    {
      stage:
        "WAITING_DELIVERY_DATE",

      media_sent:
        grids.length > 0
    }
  );


  await replyAllMessages(
    event.replyToken,
    userId,
    messages
  );

  return;
}

  // ==================================
  // รถใช้งานแล้ว
  // ==================================

  if (
    vehicleStatus === "OLD"
  ) {

    messages.push({
  type: "text",

  text:
    withGreeting(
      localizedText(
  session,
  "ลูกค้ามีฟิล์มเดิมต้องลอกด้วยไหมครับ",
  "Does the vehicle currently have any existing film that needs to be removed?"
)
    )
});

    await saveCustomerSession(
      userId,
      {
        stage:
          "WAITING_OLD_FILM",

        media_sent:
          grids.length > 0
      }
    );

await replyAllMessages(
  event.replyToken,
  userId,
  messages
);

    return;
  }

  // ==================================
  // ยังตัดสินไม่ได้ว่าใหม่/เก่า
  // ห้าม AI เดา
  // ==================================

  messages.push({
  type: "text",
  text:
    withGreeting(
      localizedText(
        session,
        "ขออนุญาตสอบถาม ของลูกค้าเป็นรถใหม่ หรือ เป็นรถผ่านการใช้งาน แจ้งแอดมินได้เลยครับ",
        "May I ask whether this is a new vehicle awaiting delivery or a vehicle that is already in use?"
      )
    )
});

  await saveCustomerSession(
    userId,
    {
      stage:
        "WAITING_VEHICLE_STATUS",

      media_sent:
        grids.length > 0
    }
  );


  await replyAllMessages(
  event.replyToken,
  userId,
  messages
);
}

// =========================
// SYNC EXISTING LINE FOLLOWERS
// Import ลูกค้าเก่าจาก LINE -> Supabase
// =========================

async function syncLegacyFollowers() {

  let start = "";
  let pageCount = 0;
  let followerCount = 0;

  const importedAt =
    new Date().toISOString();


  while (true) {

    const url =
      new URL(
        "https://api.line.me/v2/bot/followers/ids"
      );


    url.searchParams.set(
      "limit",
      "1000"
    );


    if (start) {
      url.searchParams.set(
        "start",
        start
      );
    }


    const response =
      await fetch(
        url.toString(),
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
          }
        }
      );


    if (!response.ok) {

      const errorText =
        await response.text();

      throw new Error(
        `LINE FOLLOWERS ERROR ${response.status}: ${errorText}`
      );
    }


    const data =
      await response.json();


    const userIds =
      Array.isArray(data.userIds)
        ? data.userIds
        : [];


    pageCount += 1;
    followerCount +=
      userIds.length;


    console.log(
      "SYNC FOLLOWERS PAGE:",
      {
        pageCount,
        received:
          userIds.length,
        total:
          followerCount
      }
    );


    if (userIds.length > 0) {

      const rows =
        userIds.map(
          (lineUserId) => ({
            line_user_id:
              lineUserId,

            greeted:
              false,

            stage:
              "START",

            vehicle_status:
              "UNKNOWN",

            ppf_matte:
              false,

            ai_enabled:
              false,

            language:
              "UNKNOWN",

            legacy:
              true,

            first_seen_at:
              importedAt,

            last_seen_at:
              null,

            updated_at:
              importedAt
          })
        );


      // แบ่งลง Supabase ชุดละ 500
      for (
        let i = 0;
        i < rows.length;
        i += 500
      ) {

        const batch =
          rows.slice(
            i,
            i + 500
          );


        const {
          error
        } =
          await supabase
            .from(
              "customer_sessions"
            )
            .upsert(
              batch,
              {
                onConflict:
                  "line_user_id",

                // คนที่มีอยู่แล้ว
                // ห้ามเขียนทับข้อมูลเดิม
                ignoreDuplicates:
                  true
              }
            );


        if (error) {
          throw error;
        }
      }
    }


    if (!data.next) {
      break;
    }


    start =
      data.next;
  }


  return {
    pages:
      pageCount,

    followers:
      followerCount
  };
}


// =========================
// ADMIN: SYNC FOLLOWERS
// =========================

app.post(
  "/admin/sync-followers",

  async (req, res) => {

    const suppliedSecret =
      req.get(
        "x-sync-secret"
      );


    if (
      !SYNC_FOLLOWERS_SECRET ||
      suppliedSecret !==
        SYNC_FOLLOWERS_SECRET
    ) {

      return res
        .status(401)
        .json({
          ok: false,
          error:
            "Unauthorized"
        });
    }


    try {

      const result =
        await syncLegacyFollowers();


      return res.json({
        ok: true,
        ...result
      });


    } catch (error) {

      console.error(
        "SYNC FOLLOWERS ERROR:",
        error
      );


      return res
        .status(500)
        .json({
          ok: false,

          error:
            error?.message ||
            "Unknown error"
        });
    }
  }
);

// =========================
// FACEBOOK WEBHOOK VERIFY
// =========================

app.get(
  "/facebook/webhook",
  (req, res) => {

    const mode =
      req.query["hub.mode"];

    const token =
      req.query["hub.verify_token"];

    const challenge =
      req.query["hub.challenge"];


    if (
      mode === "subscribe" &&
      token === FACEBOOK_VERIFY_TOKEN
    ) {

      console.log(
        "FACEBOOK WEBHOOK VERIFIED"
      );

      return res
        .status(200)
        .send(challenge);
    }


    console.error(
      "FACEBOOK WEBHOOK VERIFY FAILED"
    );

    return res.sendStatus(403);
  }
);

// =========================
// FACEBOOK WEBHOOK EVENTS
// =========================

app.post(
  "/facebook/webhook",

  express.raw({
    type: "application/json"
  }),

  (req, res) => {

    console.log(
      "FACEBOOK WEBHOOK HIT"
    );


    const signature =
      req.get(
        "x-hub-signature-256"
      );


    if (
      !verifyFacebookSignature(
        req.body,
        signature
      )
    ) {

      console.error(
        "Invalid Facebook signature"
      );

      return res.sendStatus(401);
    }


    let body;

    try {

      body =
        JSON.parse(
          req.body.toString(
            "utf8"
          )
        );

    } catch (error) {

      console.error(
        "Invalid Facebook JSON"
      );

      return res.sendStatus(400);
    }


    // ตอบ Meta ก่อน
    res.sendStatus(200);


    if (
      body.object !== "page"
    ) {
      return;
    }

    // =========================
// FACEBOOK DIRECT INPUT DISABLED
// ใช้ MANYCHAT เป็น Facebook input หลัก
// =========================

console.log(
  "FACEBOOK DIRECT WEBHOOK IGNORED - USING MANYCHAT"
);

return;

    for (
      const entry of
        body.entry || []
    ) {

      for (
        const messagingEvent of
          entry.messaging || []
      ) {

        const message =
          messagingEvent.message;


        if (!message) {
          continue;
        }


        // =========================
        // PAGE / SALES ECHO
        // ถ้าเพจเป็นฝ่ายตอบลูกค้า
        // ให้ AI หยุดทันที
        // =========================

        if (
          message.is_echo === true
        ) {

          const customerPsid =
            messagingEvent
              .recipient?.id;


          if (
            customerPsid &&
            String(customerPsid) !==
              String(FACEBOOK_PAGE_ID)
          ) {

            silentHandoff(
              `facebook:${customerPsid}`
            ).catch(
              console.error
            );
          }


          continue;
        }
        
// =========================
// CUSTOMER INBOUND
// ให้ MANYCHAT เป็นผู้รับเพียงทางเดียว
// กัน Bot ตอบซ้ำ
// =========================

console.log(
  "FACEBOOK DIRECT CUSTOMER MESSAGE IGNORED - USING MANYCHAT"
);

continue;

        
        const facebookUserId =
          messagingEvent
            .sender?.id;


        if (!facebookUserId) {
          continue;
        }


        const sessionUserId =
          `facebook:${facebookUserId}`;


        let messageType = null;
        let text = "";


        // =========================
        // TEXT
        // =========================

        if (
          typeof message.text ===
            "string" &&
          message.text.trim()
        ) {

          messageType =
            "text";

          text =
            message.text.trim();
        }


        // =========================
        // STICKER
        // =========================

        else if (
          message.sticker_id
        ) {

          messageType =
            "sticker";
        }


        // =========================
        // IMAGE
        // =========================

        else if (
          Array.isArray(
            message.attachments
          ) &&
          message.attachments.some(
            (attachment) =>
              attachment?.type ===
                "image"
          )
        ) {

          messageType =
            "image";
        }


        if (!messageType) {
          continue;
        }


        console.log(
          "FACEBOOK MESSAGE:",
          {
            userId:
              facebookUserId,

            type:
              messageType,

            text:
              text
          }
        );


        const syntheticEvent = {

          type:
            "message",

          source: {
            userId:
              sessionUserId
          },

          // ใช้เป็น Facebook reply target
          replyToken:
            sessionUserId,

          message:
            messageType === "text"
              ? {
                  type:
                    "text",

                  text:
                    text
                }
              : {
                  type:
                    messageType
                }
        };


        enqueueEvent(
  syntheticEvent
);
      }
    }
  }
);

// =========================
// USER EVENT QUEUE
// ป้องกันข้อความ + รูป
// ของลูกค้าคนเดียวกันทำงานพร้อมกัน
// =========================

const userEventQueues =
  new Map();


function enqueueEvent(event) {

  const userId =
    event.source?.userId;


  if (!userId) {

    return handleEvent(
      event
    );
  }


  const previous =
    userEventQueues.get(
      userId
    ) ||
    Promise.resolve();


  let current;


  current =
    previous
      .catch(() => {
        // กัน Error ของ Event ก่อนหน้า
        // ไม่ให้ Queue ขาด
      })

      .then(() =>
        handleEvent(
          event
        )
      )

      .catch((error) => {

        console.error(
          "HANDLE EVENT ERROR:",
          error
        );
      })

      .finally(() => {

        if (
          userEventQueues.get(
            userId
          ) === current
        ) {

          userEventQueues.delete(
            userId
          );
        }
      });


  userEventQueues.set(
    userId,
    current
  );


  return current;
}


// =========================
// LINE WEBHOOK REDELIVERY DEDUP
// ป้องกัน event เดิมถูกประมวลผลซ้ำเมื่อ LINE redeliver
// =========================

const processedLineWebhookEvents =
  new Map();

const LINE_WEBHOOK_DEDUP_TTL_MS =
  24 * 60 * 60 * 1000;


function shouldProcessLineWebhookEvent(event) {

  const eventId =
    String(
      event?.webhookEventId || ""
    ).trim();


  if (!eventId) {
    return true;
  }


  const now = Date.now();
  const seenAt =
    processedLineWebhookEvents.get(
      eventId
    );


  if (
    seenAt &&
    now - seenAt <
      LINE_WEBHOOK_DEDUP_TTL_MS
  ) {

    console.log(
      "LINE REDELIVERY DUPLICATE - IGNORED:",
      {
        webhookEventId: eventId,
        isRedelivery:
          event?.deliveryContext
            ?.isRedelivery === true
      }
    );

    return false;
  }


  processedLineWebhookEvents.set(
    eventId,
    now
  );


  // cleanup แบบเบา ๆ เมื่อ map โต
  if (
    processedLineWebhookEvents.size >
      5000
  ) {

    const cutoff =
      now - LINE_WEBHOOK_DEDUP_TTL_MS;


    for (
      const [id, timestamp]
      of processedLineWebhookEvents
    ) {

      if (timestamp < cutoff) {
        processedLineWebhookEvents.delete(id);
      }
    }
  }


  return true;
}

// =========================
// LINE WEBHOOK
// =========================

app.post(
  "/webhook",

  express.raw({
    type: "application/json"
  }),

  (req, res) => {

    const signature =
      req.get("x-line-signature");


    if (
      !verifySignature(
        req.body,
        signature
      )
    ) {

      console.error(
        "Invalid LINE signature"
      );

      return res.sendStatus(401);
    }


    let body;

    try {

      body =
        JSON.parse(
          req.body.toString("utf8")
        );

    } catch (error) {

      console.error(
        "Invalid JSON"
      );

      return res.sendStatus(400);
    }


    // LINE ต้องได้รับ 200 ก่อน
    res.sendStatus(200);


   for (
  const event
  of body.events || []
) {

  if (
    !shouldProcessLineWebhookEvent(
      event
    )
  ) {
    continue;
  }


  enqueueEvent(
    event
  );
}
  }
);

// =========================
// MANYCHAT INSTAGRAM WEBHOOK
// =========================

app.post(
  "/manychat/instagram/webhook",

  express.json(),

  (req, res) => {

    if (
      !MANYCHAT_WEBHOOK_SECRET ||
      req.get(
        "x-manychat-secret"
      ) !==
        MANYCHAT_WEBHOOK_SECRET
    ) {

      return res
        .sendStatus(401);
    }


    // ตอบ ManyChat ทันที
    // กัน External Request timeout
    res
      .status(200)
      .json({
        ok: true
      });


    const subscriberId =
  String(
    req.body?.subscriber_id ||
    String(
      req.body?.key || ""
    ).replace(
      /^user:/,
      ""
    ) ||
    ""
  )
    .trim();


const text =
  String(
    req.body?.text ||
    req.body?.last_input_text ||
    ""
  )
    .trim();

    const subscribedAt =
  String(
    req.body?.subscribed || ""
  ).trim();

const instagramAiStartAt =
  String(
    process.env.INSTAGRAM_AI_START_AT || ""
  ).trim();

const cutoffTime =
  Date.parse(
    instagramAiStartAt
  );

const subscribedTime =
  Date.parse(
    subscribedAt
  );

if (
  !instagramAiStartAt ||
  Number.isNaN(cutoffTime)
) {

  console.error(
    "INVALID INSTAGRAM_AI_START_AT:",
    instagramAiStartAt
  );

  return;
}

if (
  !subscribedAt ||
  Number.isNaN(subscribedTime)
) {

  console.log(
    "INSTAGRAM SUBSCRIBED DATE UNKNOWN - IGNORED:",
    subscriberId
  );

  return;
}

if (
  subscribedTime < cutoffTime
) {

  console.log(
    "INSTAGRAM LEGACY CONTACT - IGNORED:",
    {
      subscriberId,
      subscribedAt
    }
  );

  return;
}

    console.log(
      "MANYCHAT INSTAGRAM MESSAGE:",
      {
        subscriberId,
        text
      }
    );


    if (
      !subscriberId ||
      !text
    ) {
      return;
    }


    const sessionUserId =
      `manychat:ig:${subscriberId}`;


    // ถ้า session หาย/ไม่มี ให้สร้างใหม่ได้เฉพาะ contact
    // ที่เพิ่ง Subscribe จริง ๆ ภายใน 6 ชั่วโมง
    // ป้องกันลูกค้าที่คุยไว้ก่อนหน้าแล้วถูกมองเป็นลูกค้าใหม่
    const instagramContactAgeMs =
      Date.now() - subscribedTime;

    const allowNewSession =
      instagramContactAgeMs >= -5 * 60 * 1000 &&
      instagramContactAgeMs <= 6 * 60 * 60 * 1000;


    enqueueEvent({
      type:
        "message",

      source: {
        userId:
          sessionUserId
      },

      replyToken:
        sessionUserId,

      allowNewSession,

      message: {
        type:
          "text",

        text:
          text
      }
    });
  }
);

// =========================
// MANYCHAT WEBHOOK
// =========================

app.post(
  "/manychat/webhook",
  express.json(),
  (req, res) => {

    if (
      !MANYCHAT_WEBHOOK_SECRET ||
      req.get("x-manychat-secret") !== MANYCHAT_WEBHOOK_SECRET
    ) {
      return res.sendStatus(401);
    }

    // ตอบ ManyChat ทันที กัน timeout
    res.status(200).json({ ok: true });

const subscriberId =
  String(
    req.body?.subscriber_id || ""
  ).trim();

const text =
  String(
    req.body?.text || ""
  ).trim();

const subscribedAt =
  String(
    req.body?.subscribed || ""
  ).trim();

console.log(
  "MANYCHAT MESSAGE:",
  {
    subscriberId,
    text,
    subscribedAt
  }
);

// ==================================
// FACEBOOK INBOUND
// ลูกค้าที่ส่งข้อความเข้ามา ให้ Session เป็นตัวตัดสิน
// ห้ามใช้วัน Subscribe ตัดสินว่าเคยคุยหรือไม่
// ==================================

if (!subscriberId || !text) {
  return;
}

const sessionUserId =
  `manychat:${subscriberId}`;

// ถ้ายังไม่มี Session ให้สร้างเป็นลูกค้าใหม่ได้
// แต่ยังต้องผ่าน START KEYWORD GATE ใน handleEvent()
const allowNewSession = true;


    enqueueEvent({
      type: "message",
      source: { userId: sessionUserId },
      replyToken: sessionUserId,
      allowNewSession,
      message: { type: "text", text }
    });
  }
);


// ============================================================
// LINE OA WATCHER BACKEND
// ============================================================
// Watcher จะรันบนคอมเซลล์ในภายหลัง
// ฝั่ง Server นี้ทำเสร็จก่อนได้:
// - รับ Heartbeat จาก PC-A / PC-B
// - รับสถานะ customer/shop จาก LINE OA EventStream ผ่าน Snapshot endpoint
// - เตือน 90 นาทีเฉพาะตอน EventStream Watcher online
// - Morning Audit เฉพาะ 09:00–09:30 จาก cron เดิมทุก 5 นาที
// - ถ้าพลาดช่วงเช้า จะ mark missed_window และไม่หัก -1 ย้อนหลังตอนบ่าย
// - -1 เมื่อ current unanswered streak เริ่มใน business date นั้นและยัง latest=customer
// - สรุปรอบ 26 เดือนก่อน -> 25 เดือนปัจจุบัน
// - OA_AUDIT_START_DATE กันการ Audit ย้อนก่อนวันเริ่มใช้งานจริง
//
// สำคัญ:
// ระบบเก่า checkOverdueSalesChats() จะไม่ถูกเรียกจาก cron อีก
// เพื่อหยุด False Alarm ก่อนติดตั้ง Watcher
// ============================================================

function getWatcherRequestSecret(req) {
  const direct =
    String(
      req.get("x-oa-watcher-secret") ||
      req.get("x-reminder-secret") ||
      ""
    ).trim();

  if (direct) {
    return direct;
  }

  const authorization =
    String(
      req.get("authorization") ||
      ""
    ).trim();

  const match =
    /^Bearer\s+(.+)$/i.exec(
      authorization
    );

  return match
    ? String(match[1] || "").trim()
    : "";
}

function isWatcherAuthorized(req) {
  const supplied =
    getWatcherRequestSecret(req);

  return Boolean(
    OA_WATCHER_SECRET &&
    supplied &&
    safeStringEqual(
      supplied,
      OA_WATCHER_SECRET
    )
  );
}

function chunkArray(items, size = 100) {
  const out = [];

  for (
    let i = 0;
    i < items.length;
    i += size
  ) {
    out.push(
      items.slice(
        i,
        i + size
      )
    );
  }

  return out;
}

function normalizeWatcherSide(value) {
  const side =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  if (
    side === "customer" ||
    side === "shop"
  ) {
    return side;
  }

  return "";
}

function normalizeIsoTimestamp(value) {
  const parsed =
    Date.parse(
      String(
        value || ""
      )
    );

  if (
    Number.isNaN(parsed)
  ) {
    return "";
  }

  return new Date(
    parsed
  ).toISOString();
}

function getResponsibilityDateFromPending(
  pendingSinceAt
) {
  const iso =
    normalizeIsoTimestamp(
      pendingSinceAt
    );

  if (!iso) {
    return "";
  }

  const date =
    new Date(iso);

  const parts =
    getBangkokParts(
      date
    );

  const dateKey =
    formatBangkokDateKey(
      date
    );

  // ลูกค้าที่เริ่มค้างตั้งแต่ 18:00 เป็นต้นไป
  // ให้เป็นความรับผิดชอบของวันถัดไป
  if (
    parts.hour >=
      NEW_CHAT_CUTOFF_HOUR
  ) {
    return addDaysToDateKey(
      dateKey,
      1
    );
  }

  return dateKey;
}

function getReminderEffectiveStartMs(
  latestCustomerMessageAt
) {
  const iso =
    normalizeIsoTimestamp(
      latestCustomerMessageAt
    );

  if (!iso) {
    return NaN;
  }

  const date =
    new Date(iso);

  const parts =
    getBangkokParts(
      date
    );

  let dateKey =
    formatBangkokDateKey(
      date
    );

  // หลัง 18:00 ไม่เริ่มจับ 90 นาทีทันที
  // เริ่มเวลา 09:00 ของวันถัดไป
  if (
    parts.hour >=
      NEW_CHAT_CUTOFF_HOUR
  ) {
    dateKey =
      addDaysToDateKey(
        dateKey,
        1
      );

    return bangkokDateTimeToUtcMs(
      dateKey,
      SALES_OPEN_HOUR,
      0
    );
  }

  // ก่อน 09:00 เริ่มนับจาก 09:00 วันเดียวกัน
  if (
    parts.hour <
      SALES_OPEN_HOUR
  ) {
    return bangkokDateTimeToUtcMs(
      dateKey,
      SALES_OPEN_HOUR,
      0
    );
  }

  return date.getTime();
}

function isDaytimeWatcherReminderWindow(
  value = new Date()
) {
  const p =
    getBangkokParts(
      value
    );

  // Reminder checks stay active until 20:00.
  // NEW_CHAT_CUTOFF_HOUR (18:00) only decides which business day
  // a NEW inbound customer message belongs to; it must not stop
  // reminders for chats that started before 18:00 and become due later.
  return (
    p.hour >=
      SALES_OPEN_HOUR &&
    p.hour <
      SALES_CLOSE_CHECK_HOUR
  );
}

async function getOnlineWatcherDevices() {
  const cutoff =
    new Date(
      Date.now() -
      OA_WATCHER_ONLINE_SECONDS *
        1000
    ).toISOString();

  const {
    data,
    error
  } =
    await supabase
      .from(
        "oa_watcher_devices"
      )
      .select(
        "device_id,status,last_heartbeat_at,last_snapshot_at,app_version,online_since_at"
      )
      .eq(
        "status",
        "online"
      )
      .gte(
        "last_heartbeat_at",
        cutoff
      )
      .order(
        "last_heartbeat_at",
        {
          ascending:
            false
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}

function getWatcherCoverageStartedAt(
  onlineDevices
) {
  const values =
    (onlineDevices || [])
      .map(
        item =>
          Date.parse(
            String(
              item
                ?.online_since_at ||
              ""
            )
          )
      )
      .filter(
        value =>
          !Number.isNaN(
            value
          )
      );

  if (
    values.length === 0
  ) {
    return null;
  }

  // ถ้ามีหลายเครื่อง:
  // เครื่องที่ online ต่อเนื่องมานานที่สุด
  // เป็นหลักฐานว่า account มี watcher coverage
  // ต่อเนื่องมาตั้งแต่เวลานั้นจนถึงปัจจุบัน
  return new Date(
    Math.min(
      ...values
    )
  ).toISOString();
}

async function resolveWatcherOnlineSince({
  deviceId,
  status,
  nowIso
}) {
  if (
    status !==
    "online"
  ) {
    return null;
  }

  const {
    data,
    error
  } =
    await supabase
      .from(
        "oa_watcher_devices"
      )
      .select(
        "status,last_heartbeat_at,online_since_at"
      )
      .eq(
        "device_id",
        deviceId
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  const previousHeartbeatMs =
    Date.parse(
      String(
        data
          ?.last_heartbeat_at ||
        ""
      )
    );

  const nowMs =
    Date.parse(
      nowIso
    );

  const maxContinuousGapMs =
    OA_WATCHER_ONLINE_SECONDS *
    1000;

  const previousOnlineSince =
    normalizeIsoTimestamp(
      data
        ?.online_since_at
    );

  const remainedContinuouslyOnline =
    data
      ?.status ===
      "online" &&
    previousOnlineSince &&
    !Number.isNaN(
      previousHeartbeatMs
    ) &&
    !Number.isNaN(
      nowMs
    ) &&
    nowMs -
      previousHeartbeatMs <=
      maxContinuousGapMs;

  if (
    remainedContinuouslyOnline
  ) {
    return previousOnlineSince;
  }

  // heartbeat หายเกิน threshold / เคย error / เพิ่งเริ่มใหม่
  // ให้เริ่มช่วง coverage ใหม่จากตอนนี้
  return nowIso;
}

async function upsertWatcherHeartbeat({
  deviceId,
  status = "online",
  appVersion = "",
  lastError = ""
}) {
  const nowIso =
    new Date()
      .toISOString();

  const onlineSinceAt =
    await resolveWatcherOnlineSince({
      deviceId,
      status,
      nowIso
    });

  const {
    error
  } =
    await supabase
      .from(
        "oa_watcher_devices"
      )
      .upsert(
        {
          device_id:
            deviceId,

          status:
            status,

          app_version:
            String(
              appVersion || ""
            ).slice(
              0,
              100
            ),

          last_error:
            String(
              lastError || ""
            ).slice(
              0,
              1000
            ),

          last_heartbeat_at:
            nowIso,

          online_since_at:
            onlineSinceAt,

          updated_at:
            nowIso
        },
        {
          onConflict:
            "device_id"
        }
      );

  if (error) {
    throw error;
  }

  return nowIso;
}

async function loadExistingChatStates(
  chatKeys
) {
  const map =
    new Map();

  const keys =
    [
      ...new Set(
        (chatKeys || [])
          .map(
            item =>
              String(
                item || ""
              ).trim()
          )
          .filter(Boolean)
      )
    ];

  for (
    const batch of
      chunkArray(
        keys,
        100
      )
  ) {
    const {
      data,
      error
    } =
      await supabase
        .from(
          "oa_chat_state"
        )
        .select("*")
        .in(
          "chat_key",
          batch
        );

    if (error) {
      throw error;
    }

    for (
      const row of
        data || []
    ) {
      map.set(
        String(
          row.chat_key
        ),
        row
      );
    }
  }

  return map;
}

function mergeWatcherChatState(
  incoming,
  existing,
  {
    deviceId,
    capturedAt
  }
) {
  const chatKey =
    String(
      incoming?.chat_key ||
      ""
    )
      .trim()
      .slice(
        0,
        500
      );

  const latestSide =
    normalizeWatcherSide(
      incoming
        ?.latest_side
    );

  const latestMessageAt =
    normalizeIsoTimestamp(
      incoming
        ?.latest_message_at
    );

  if (
    !chatKey ||
    !latestSide ||
    !latestMessageAt
  ) {
    return null;
  }

  const customerName =
    normalizeOaCustomerName(
      incoming
        ?.customer_name
    ) ||
    normalizeOaCustomerName(
      existing
        ?.customer_name
    );

  const lineUserId =
    String(
      incoming
        ?.line_user_id ||
      existing
        ?.line_user_id ||
      ""
    )
      .trim()
      .slice(
        0,
        100
      );

  const latestMessageId =
    String(
      incoming
        ?.latest_message_id ||
      ""
    )
      .trim()
      .slice(
        0,
        200
      );

  const latestMessageText =
    String(
      incoming
        ?.latest_message_text ||
      ""
    )
      .trim()
      .slice(
        0,
        1000
      );

  const incomingPendingSince =
    normalizeIsoTimestamp(
      incoming
        ?.pending_since_at
    );

  const existingLatestAt =
    normalizeIsoTimestamp(
      existing
        ?.latest_message_at
    );

  // EventStream เดียวกันอาจถูกส่งมาจาก PC-1/2/3 พร้อมกัน
  // และ network timing อาจทำให้ event เก่ามาถึงหลัง event ใหม่
  // ห้ามให้ event เก่าย้อนสถานะจาก shop -> customer หรือทับข้อมูลใหม่กว่า
  if (
    existingLatestAt &&
    (
      Date.parse(existingLatestAt) >
        Date.parse(latestMessageAt) ||
      (
        Date.parse(existingLatestAt) ===
          Date.parse(latestMessageAt) &&
        existing?.latest_side ===
          "shop" &&
        latestSide ===
          "customer"
      )
    )
  ) {
    // Newest timestamp wins. On an exact timestamp tie, shop wins over
    // customer so a confirmed reply can never be reversed to unanswered.
    return null;
  }

  let pendingSinceAt = null;
  let responsibilityDate = null;
  let lastReminderAt =
    existing
      ?.last_reminder_at ||
    null;

  if (
    latestSide ===
      "customer"
  ) {
    // KPI ใช้ "จุดเริ่ม customer streak"
    // ถ้าลูกค้าพิมพ์ซ้ำหลายข้อความโดยร้านยังไม่ตอบ
    // ต้องคง pending_since_at เดิมไว้ ไม่เลื่อนไปตามข้อความล่าสุด
    if (
      existing
        ?.latest_side ===
        "customer" &&
      existing
        ?.pending_since_at
    ) {
      pendingSinceAt =
        normalizeIsoTimestamp(
          existing
            .pending_since_at
        ) ||
        latestMessageAt;

    } else if (
      incomingPendingSince
    ) {
      // customer streak ใหม่
      pendingSinceAt =
        incomingPendingSince;

    } else {
      pendingSinceAt =
        latestMessageAt;
    }

    responsibilityDate =
      getResponsibilityDateFromPending(
        pendingSinceAt
      );

    // ถ้าเพิ่งเปลี่ยนจากร้าน -> ลูกค้า
    // ให้เริ่มรอบ Reminder ใหม่
    if (
      existing
        ?.latest_side !==
        "customer"
    ) {
      lastReminderAt =
        null;
    }

  } else {
    // latest = shop
    // ถือว่าตอบแล้วทันที
    pendingSinceAt =
      null;

    responsibilityDate =
      null;

    lastReminderAt =
      null;
  }

  return {
    chat_key:
      chatKey,

    customer_name:
      customerName || null,

    line_user_id:
      lineUserId || null,

    latest_message_id:
      latestMessageId || null,

    latest_side:
      latestSide,

    latest_message_at:
      latestMessageAt,

    latest_message_text:
      latestMessageText,

    pending_since_at:
      pendingSinceAt,

    responsibility_date:
      responsibilityDate,

    last_reminder_at:
      lastReminderAt,

    last_seen_at:
      capturedAt,

    source_device_id:
      deviceId,

    updated_at:
      new Date()
        .toISOString()
  };
}

// ============================================================
// V5.7 PER-CHAT WRITE SERIALIZER
// Multiple Watcher requests (or multiple PCs) can reach this Node process
// at nearly the same time. Serialize writes by chat_key and re-read the row
// inside the lock before merging, so an older customer event cannot finish
// after a newer shop event and overwrite it.
// ============================================================
const watcherChatWriteQueues =
  new Map();

async function saveOneWatcherChatStateSerialized({
  incoming,
  deviceId,
  capturedAt
}) {
  const chatKey =
    String(
      incoming?.chat_key ||
      ""
    ).trim();

  if (!chatKey) {
    return null;
  }

  const previous =
    watcherChatWriteQueues.get(
      chatKey
    ) ||
    Promise.resolve();

  const current =
    previous
      .catch(
        () => {}
      )
      .then(
        async () => {
          const existingMap =
            await loadExistingChatStates(
              [chatKey]
            );

          const merged =
            mergeWatcherChatState(
              incoming,
              existingMap.get(
                chatKey
              ),
              {
                deviceId,
                capturedAt
              }
            );

          if (!merged) {
            console.log(
              "OA WATCHER STALE WRITE SKIPPED:",
              chatKey,
              incoming?.latest_side || "",
              incoming?.latest_message_at || ""
            );

            return null;
          }

          const {
            error
          } =
            await supabase
              .from(
                "oa_chat_state"
              )
              .upsert(
                merged,
                {
                  onConflict:
                    "chat_key"
                }
              );

          if (error) {
            throw error;
          }

          return merged;
        }
      );

  watcherChatWriteQueues.set(
    chatKey,
    current
  );

  try {
    return await current;
  } finally {
    if (
      watcherChatWriteQueues.get(
        chatKey
      ) ===
      current
    ) {
      watcherChatWriteQueues.delete(
        chatKey
      );
    }
  }
}

async function saveWatcherSnapshot({
  deviceId,
  capturedAt,
  chats
}) {
  const cleanChats =
    (chats || [])
      .filter(
        item =>
          item &&
          item.chat_key &&
          item.latest_side &&
          item.latest_message_at
      )
      .slice(
        0,
        5000
      );

  for (
    const incoming of
      cleanChats
  ) {
    if (
      normalizeWatcherSide(
        incoming
          ?.latest_side
      ) ===
        "customer" &&
      incoming
        ?.latest_message_id
    ) {
      try {
        const identity =
          await recordOaIdentityFromWatcherChat(
            incoming
          );

        if (
          identity
            ?.lineUserId
        ) {
          incoming.line_user_id =
            identity.lineUserId;
        }

        if (
          identity
            ?.customerName
        ) {
          incoming.customer_name =
            identity.customerName;
        }

      } catch (identityError) {
        console.error(
          "OA IDENTITY WATCHER ERROR:",
          identityError
        );
      }
    }
  }

  const mergedRows = [];

  // Keep concurrency bounded for large snapshots, while same-chat writes from
  // overlapping requests are serialized by saveOneWatcherChatStateSerialized.
  for (
    const batch of
      chunkArray(
        cleanChats,
        50
      )
  ) {
    const savedBatch =
      await Promise.all(
        batch.map(
          incoming =>
            saveOneWatcherChatStateSerialized({
              incoming,
              deviceId,
              capturedAt
            })
        )
      );

    mergedRows.push(
      ...savedBatch.filter(
        Boolean
      )
    );
  }

  const nowIso =
    new Date()
      .toISOString();

  const onlineSinceAt =
    await resolveWatcherOnlineSince({
      deviceId,
      status:
        "online",
      nowIso
    });

  const {
    error:
      deviceError
  } =
    await supabase
      .from(
        "oa_watcher_devices"
      )
      .upsert(
        {
          device_id:
            deviceId,

          status:
            "online",

          last_heartbeat_at:
            nowIso,

          last_snapshot_at:
            capturedAt,

          online_since_at:
            onlineSinceAt,

          updated_at:
            nowIso
        },
        {
          onConflict:
            "device_id"
        }
      );

  if (deviceError) {
    throw deviceError;
  }

  return {
    received:
      cleanChats.length,

    saved:
      mergedRows.length
  };
}

async function sendWatcherReminder(
  chatState
) {
  let customerName =
    normalizeOaCustomerName(
      chatState
        ?.customer_name
    );

  if (
    !customerName &&
    /^U[0-9a-f]{32}$/i.test(
      String(
        chatState
          ?.chat_key ||
        ""
      )
    )
  ) {
    try {
      const meta =
        await getReminderCustomerMeta(
          chatState
            ?.line_user_id ||
          chatState
            ?.chat_key
        );

      customerName =
        String(
          meta
            ?.name ||
          ""
        ).trim();

    } catch (error) {
      console.error(
        "WATCHER CUSTOMER META ERROR:",
        error
      );
    }
  }

  if (!customerName) {
    customerName =
      "ไม่ทราบชื่อ";
  }

  const text =
    String(
      chatState
        ?.latest_message_text ||
      ""
    )
      .trim()
      .slice(
        0,
        250
      );

  const messageAt =
    normalizeIsoTimestamp(
      chatState
        ?.latest_message_at
    );

  const p =
    messageAt
      ? getBangkokParts(
          new Date(
            messageAt
          )
        )
      : null;

  const timeText =
    p
      ? `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`
      : "-";

  const message =
    [
      "⚠️ แชท LINE ค้างตอบเกิน 90 นาที",
      `ลูกค้า: ${customerName}`,
      `ข้อความล่าสุด: ${text || "-"}`,
      `เวลาลูกค้าส่ง: ${timeText}`,
      "",
      "สถานะล่าสุดใน LINE OA: ลูกค้าเป็นผู้ส่งข้อความล่าสุด"
    ].join("\n");

  await sendSalesGroupText(
    message
  );
}

async function loadNewestWebhookIdentityMap(
  lineUserIds
) {
  const ids =
    Array.from(
      new Set(
        (lineUserIds || [])
          .map(
            value =>
              String(
                value || ""
              ).trim()
          )
          .filter(
            value =>
              /^U[0-9a-f]{32}$/i
                .test(value)
          )
      )
    );

  const result =
    new Map();

  if (
    ids.length === 0
  ) {
    return result;
  }

  const {
    data,
    error
  } =
    await supabase
      .from(
        "oa_line_identity"
      )
      .select(
        "line_user_id,message_id,created_at"
      )
      .in(
        "line_user_id",
        ids
      )
      .order(
        "created_at",
        {
          ascending:
            false
        }
      )
      .limit(5000);

  if (error) {
    throw error;
  }

  for (
    const row of
      data || []
  ) {
    const userId =
      String(
        row
          ?.line_user_id ||
        ""
      ).trim();

    if (
      !userId ||
      result.has(
        userId
      )
    ) {
      continue;
    }

    result.set(
      userId,
      {
        message_id:
          String(
            row
              ?.message_id ||
            ""
          ).trim(),

        created_at:
          row
            ?.created_at ||
          null
      }
    );
  }

  return result;
}

async function checkWatcherDaytimeReminders(
  now = new Date()
) {
  if (
    !isDaytimeWatcherReminderWindow(
      now
    )
  ) {
    return {
      ran: false,
      reason:
        "outside_09_20",
      sent: 0
    };
  }

  const onlineDevices =
    await getOnlineWatcherDevices();

  if (
    onlineDevices.length === 0
  ) {
    return {
      ran: false,
      reason:
        "watcher_offline",
      sent: 0
    };
  }

  const coverageStartedAt =
    getWatcherCoverageStartedAt(
      onlineDevices
    );

  if (!coverageStartedAt) {
    return {
      ran: false,
      reason:
        "watcher_coverage_unknown",
      sent: 0
    };
  }

  const coverageStartedMs =
    Date.parse(
      coverageStartedAt
    );

  const today =
    formatBangkokDateKey(
      now
    );

  const {
    data,
    error
  } =
    await supabase
      .from(
        "oa_chat_state"
      )
      .select(
        "chat_key,customer_name,line_user_id,latest_message_id,latest_side,latest_message_at,latest_message_text,pending_since_at,responsibility_date,last_reminder_at,last_seen_at"
      )
      .eq(
        "latest_side",
        "customer"
      )
      .order(
        "latest_message_at",
        {
          ascending:
            true
        }
      )
      .limit(1000);

  if (error) {
    throw error;
  }

  const newestWebhookByUser =
    await loadNewestWebhookIdentityMap(
      (data || [])
        .map(
          row =>
            row
              ?.line_user_id
        )
    );

  const nowMs =
    now.getTime();

  const intervalMs =
    SALES_REMINDER_MINUTES *
    60 *
    1000;

  let sent = 0;
  let wouldSend = 0;
  const wouldSendDetails = [];
  let notDue = 0;
  const notDueDetails = [];
  let staleStateSkipped = 0;
  let reconnectGuardSkipped = 0;

  for (
    const row of
      data || []
  ) {
    const latestMs =
      Date.parse(
        String(
          row
            .latest_message_at ||
          ""
        )
      );

    if (
      Number.isNaN(
        latestMs
      )
    ) {
      continue;
    }

    // Reminder responsibility follows the latest customer message, not the
    // historical pending_since_at streak used by KPI. This prevents a stale
    // pre-reconnect pending_since_at from suppressing a fresh customer message.
    const reminderResponsibilityDate =
      getResponsibilityDateFromPending(
        row.latest_message_at
      );

    if (
      reminderResponsibilityDate !==
        today
    ) {
      continue;
    }

    // Reconnect safety guard:
    // ถ้า Watcher เคย offline แล้วเพิ่งกลับมา online
    // state ที่เห็นล่าสุดก่อนช่วง coverage ปัจจุบัน "ยืนยันไม่ได้"
    // เพราะร้านอาจตอบจากมือถือ/คอมในช่วงที่ Watcher หลุด
    // ห้ามเอา state เก่านั้นไปเตือนจนกว่าจะมี event ใหม่หลัง reconnect
    const lastSeenMs =
      Date.parse(
        String(
          row
            ?.last_seen_at ||
          ""
        )
      );

    const stateLatestMs =
      Date.parse(
        String(
          row
            ?.latest_message_at ||
          ""
        )
      );

    // Use the newest trusted timestamp. A fresh customer webhook can update
    // latest_message_at after reconnect even if last_seen_at is still legacy/stale.
    const stateSeenMs =
      Math.max(
        Number.isNaN(lastSeenMs) ? -Infinity : lastSeenMs,
        Number.isNaN(stateLatestMs) ? -Infinity : stateLatestMs
      );

    if (
      !Number.isNaN(
        coverageStartedMs
      ) &&
      (
        Number.isNaN(
          stateSeenMs
        ) ||
        stateSeenMs <
          coverageStartedMs
      )
    ) {
      reconnectGuardSkipped +=
        1;

      console.warn(
        "OA REMINDER SKIPPED - PRE-RECONNECT STATE:",
        {
          chatKey:
            row
              ?.chat_key,
          customerName:
            row
              ?.customer_name,
          stateLastSeenAt:
            row
              ?.last_seen_at,
          stateLatestAt:
            row
              ?.latest_message_at,
          coverageStartedAt
        }
      );

      continue;
    }

    // Safety guard:
    // If LINE webhook has already received a newer customer message
    // than oa_chat_state knows about, the Watcher state is stale.
    // Never send a 90-minute reminder from that stale snapshot.
    //
    // V5.2 prevents this for new inbound messages going forward,
    // while this guard safely suppresses legacy stale rows created
    // before V5.2 or during a transient EventStream gap.
    const lineUserId =
      String(
        row
          ?.line_user_id ||
        ""
      ).trim();

    const newestWebhook =
      newestWebhookByUser.get(
        lineUserId
      );

    if (newestWebhook) {
      const stateMessageId =
        String(
          row
            ?.latest_message_id ||
          ""
        ).trim();

      const webhookMessageId =
        String(
          newestWebhook
            ?.message_id ||
          ""
        ).trim();

      const webhookCreatedMs =
        Date.parse(
          String(
            newestWebhook
              ?.created_at ||
            ""
          )
        );

      let stateIsStale =
        false;

      if (
        stateMessageId &&
        webhookMessageId &&
        stateMessageId !==
          webhookMessageId
      ) {
        stateIsStale =
          true;

      } else if (
        !stateMessageId &&
        !Number.isNaN(
          webhookCreatedMs
        ) &&
        webhookCreatedMs >
          latestMs +
          5000
      ) {
        // Legacy rows without latest_message_id:
        // allow a few seconds for normal webhook receipt latency.
        stateIsStale =
          true;
      }

      if (stateIsStale) {
        staleStateSkipped +=
          1;

        console.warn(
          "OA REMINDER SKIPPED - STALE STATE:",
          {
            chatKey:
              row
                ?.chat_key,
            customerName:
              row
                ?.customer_name,
            lineUserId,
            stateMessageId,
            webhookMessageId,
            stateLatestAt:
              row
                ?.latest_message_at,
            webhookCreatedAt:
              newestWebhook
                ?.created_at
          }
        );

        continue;
      }
    }

    const effectiveStartMs =
      getReminderEffectiveStartMs(
        row
          .latest_message_at
      );

    if (
      Number.isNaN(
        effectiveStartMs
      )
    ) {
      continue;
    }

    const firstDueMs =
      effectiveStartMs +
      intervalMs;

    const lastReminderMs =
      Date.parse(
        String(
          row
            .last_reminder_at ||
          ""
        )
      );

    let dueMs =
      firstDueMs;

    if (
      !Number.isNaN(
        lastReminderMs
      )
    ) {
      // ถ้าลูกค้าพิมพ์ข้อความใหม่หลัง Reminder ล่าสุด
      // ให้เริ่ม 90 นาทีใหม่จากข้อความล่าสุด
      if (
        latestMs >
        lastReminderMs
      ) {
        dueMs =
          firstDueMs;
      } else {
        dueMs =
          lastReminderMs +
          intervalMs;
      }
    }

    if (
      nowMs <
      dueMs
    ) {
      notDue += 1;

      if (notDueDetails.length < 50) {
        notDueDetails.push({
          chat_key: row.chat_key,
          customer_name: normalizeOaCustomerName(row.customer_name) || "ไม่ทราบชื่อ",
          latest_message_text: String(row.latest_message_text || "").trim().slice(0, 250),
          latest_message_at: row.latest_message_at,
          effective_start_at: new Date(effectiveStartMs).toISOString(),
          due_at: new Date(dueMs).toISOString(),
          last_reminder_at: row.last_reminder_at,
          server_now_at: new Date(nowMs).toISOString(),
          remaining_seconds: Math.max(0, Math.ceil((dueMs - nowMs) / 1000))
        });
      }

      continue;
    }

    // ========================================================
    // V5.6 SAFE TEST
    // A due chat is reported, but NOTHING is sent to LINE and
    // last_reminder_at is intentionally left untouched.
    // ========================================================
    if (OA_WATCHER_DRY_RUN) {
      wouldSend += 1;

      if (
        wouldSendDetails.length <
        OA_WATCHER_DRY_RUN_MAX_DETAILS
      ) {
        wouldSendDetails.push({
          chat_key:
            row.chat_key,

          customer_name:
            normalizeOaCustomerName(
              row.customer_name
            ) ||
            "ไม่ทราบชื่อ",

          latest_message_at:
            row.latest_message_at,

          latest_message_text:
            String(
              row.latest_message_text ||
              ""
            )
              .trim()
              .slice(
                0,
                250
              ),

          pending_since_at:
            row.pending_since_at,

          responsibility_date:
            row.responsibility_date,

          last_reminder_at:
            row.last_reminder_at,

          due_at:
            new Date(
              dueMs
            ).toISOString()
        });
      }

      console.log(
        "OA WATCHER DRY RUN - WOULD SEND REMINDER:",
        {
          chatKey:
            row.chat_key,
          customerName:
            row.customer_name,
          latestMessageAt:
            row.latest_message_at,
          dueAt:
            new Date(
              dueMs
            ).toISOString()
        }
      );

      continue;
    }

    await sendWatcherReminder(
      row
    );

    const sentAt =
      new Date()
        .toISOString();

    const {
      error:
        updateError
    } =
      await supabase
        .from(
          "oa_chat_state"
        )
        .update({
          last_reminder_at:
            sentAt,

          updated_at:
            sentAt
        })
        .eq(
          "chat_key",
          row
            .chat_key
        )
        // ป้องกัน race:
        // ถ้า Watcher เพิ่งเห็นว่าร้านตอบแล้ว
        // จะไม่ update row เก่า
        .eq(
          "latest_side",
          "customer"
        )
        .eq(
          "latest_message_at",
          row
            .latest_message_at
        );

    if (updateError) {
      throw updateError;
    }

    sent += 1;
  }

  return {
    ran: true,
    onlineDevices:
      onlineDevices.map(
        item =>
          item.device_id
      ),
    checked:
      Array.isArray(data)
        ? data.length
        : 0,
    dryRun:
      OA_WATCHER_DRY_RUN,
    sent,
    wouldSend,
    wouldSendDetails,
    notDue,
    notDueDetails,
    reminderMinutes: SALES_REMINDER_MINUTES,
    serverNowAt: new Date(nowMs).toISOString(),
    staleStateSkipped,
    reconnectGuardSkipped,
    coverageStartedAt
  };
}

async function claimDailyAudit(
  businessDate
) {
  const nowIso =
    new Date()
      .toISOString();

  const {
    error
  } =
    await supabase
      .from(
        "oa_daily_audit_summary"
      )
      .insert({
        business_date:
          businessDate,

        status:
          "processing",

        missed_count:
          0,

        details:
          [],

        started_at:
          nowIso,

        updated_at:
          nowIso
      });

  if (!error) {
    return true;
  }

  // PostgreSQL unique violation
  if (
    String(
      error.code ||
      ""
    ) === "23505"
  ) {
    return false;
  }

  throw error;
}

async function releaseDailyAuditClaim(
  businessDate
) {
  await supabase
    .from(
      "oa_daily_audit_summary"
    )
    .delete()
    .eq(
      "business_date",
      businessDate
    )
    .eq(
      "status",
      "processing"
    );
}

async function getDailyAuditSummary(
  businessDate
) {
  const {
    data,
    error
  } =
    await supabase
      .from(
        "oa_daily_audit_summary"
      )
      .select(
        "status,missed_count"
      )
      .eq(
        "business_date",
        businessDate
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function markMissedMorningAuditWindow(
  businessDate
) {
  const existing =
    await getDailyAuditSummary(
      businessDate
    );

  if (existing) {
    return {
      created: false,
      status:
        existing.status ||
        ""
    };
  }

  const nowIso =
    new Date()
      .toISOString();

  const {
    error
  } =
    await supabase
      .from(
        "oa_daily_audit_summary"
      )
      .insert({
        business_date:
          businessDate,

        status:
          "missed_window",

        missed_count:
          0,

        details:
          [],

        started_at:
          nowIso,

        completed_at:
          nowIso,

        updated_at:
          nowIso
      });

  if (
    error &&
    String(
      error.code ||
      ""
    ) !== "23505"
  ) {
    throw error;
  }

  if (!error) {
    await sendSalesGroupText(
      [
        "⚠️ Morning Audit ไม่ได้ทำงานในช่วงที่กำหนด",
        `วันที่ตรวจ: ${formatThaiDateFromKey(businessDate)}`,
        "ช่วงตรวจที่ปลอดภัย: 09:00–09:30 น.",
        "",
        "ระบบจะไม่หัก -1 ย้อนหลังจากสถานะตอนบ่าย",
        "กรุณาตรวจว่า Watcher และ cron ทำงานก่อน 09:00 ของวันถัดไป"
      ].join("\n")
    );
  }

  return {
    created:
      !error,
    status:
      error
        ? "existing"
        : "missed_window"
  };
}

async function maybeRunWatcherMorningAudit(
  now = new Date()
) {
  const p =
    getBangkokParts(
      now
    );

  if (
    p.hour <
      SALES_OPEN_HOUR
  ) {
    return {
      ran: false,
      reason:
        "before_09"
    };
  }

  const today =
    formatBangkokDateKey(
      now
    );

  const targetDate =
    addDaysToDateKey(
      today,
      -1
    );

  // ห้าม Audit ย้อนก่อนวันที่เริ่มใช้งานจริง
  // เพื่อไม่ให้ข้อมูลเก่าที่ Watcher ยังเก็บไม่ครบถูกนำมาหักคะแนน
  if (
    OA_AUDIT_START_DATE &&
    targetDate <
      OA_AUDIT_START_DATE
  ) {
    return {
      ran: false,
      reason:
        "before_audit_start",
      businessDate:
        targetDate,
      auditStartDate:
        OA_AUDIT_START_DATE
    };
  }

  const auditWindowClosed =
    p.hour >
      OA_AUDIT_END_HOUR ||
    (
      p.hour ===
        OA_AUDIT_END_HOUR &&
      p.minute >=
        OA_AUDIT_END_MINUTE
    );

  if (auditWindowClosed) {
    const existing =
      await getDailyAuditSummary(
        targetDate
      );

    if (
      existing
        ?.status ===
      "completed"
    ) {
      return {
        ran: false,
        reason:
          "already_done",
        businessDate:
          targetDate,
        missedCount:
          Number(
            existing
              ?.missed_count ||
            0
          )
      };
    }

    if (
      existing
        ?.status ===
      "missed_window"
    ) {
      return {
        ran: false,
        reason:
          "after_morning_window",
        businessDate:
          targetDate,
        auditWindow:
          "09:00-09:30",
        missedWindowRecorded:
          true
      };
    }

    const missedWindow =
      await markMissedMorningAuditWindow(
        targetDate
      );

    return {
      ran: false,
      reason:
        "after_morning_window",
      businessDate:
        targetDate,
      auditWindow:
        "09:00-09:30",
      missedWindowRecorded:
        missedWindow
          ?.created ===
        true
    };
  }

  // Morning Audit ต้องมี Watcher online อย่างน้อย 1 เครื่อง
  // เพื่อไม่ตัดสิน KPI จาก state ที่อาจ stale
  const onlineDevices =
    await getOnlineWatcherDevices();

  if (
    onlineDevices.length === 0
  ) {
    return {
      ran: false,
      reason:
        "watcher_offline",
      businessDate:
        targetDate
    };
  }

  const coverageStartedAt =
    getWatcherCoverageStartedAt(
      onlineDevices
    );

  if (!coverageStartedAt) {
    return {
      ran: false,
      reason:
        "watcher_coverage_unknown",
      businessDate:
        targetDate
    };
  }

  const coverageStartedMs =
    Date.parse(
      coverageStartedAt
    );

  const claimed =
    await claimDailyAudit(
      targetDate
    );

  if (!claimed) {
    const {
      data:
        existing
    } =
      await supabase
        .from(
          "oa_daily_audit_summary"
        )
        .select(
          "status,missed_count"
        )
        .eq(
          "business_date",
          targetDate
        )
        .maybeSingle();

    return {
      ran: false,
      reason:
        existing
          ?.status ===
          "completed"
            ? "already_done"
            : "already_claimed",
      businessDate:
        targetDate,
      missedCount:
        Number(
          existing
            ?.missed_count ||
          0
        )
    };
  }

  try {
    // นิยามค้างตอบ:
    // ตอน Audit ข้อความล่าสุดต้องยังอยู่ฝั่งลูกค้า
    // และ streak นี้เป็นความรับผิดชอบของเมื่อวาน
    const {
      data:
        pendingRows,
      error:
        pendingError
    } =
      await supabase
        .from(
          "oa_chat_state"
        )
        .select(
          "chat_key,customer_name,latest_message_at,latest_message_text,pending_since_at,responsibility_date,last_seen_at"
        )
        .eq(
          "latest_side",
          "customer"
        )
        .eq(
          "responsibility_date",
          targetDate
        )
        .not(
          "pending_since_at",
          "is",
          null
        )
        .order(
          "pending_since_at",
          {
            ascending:
              true
          }
        );

    if (pendingError) {
      throw pendingError;
    }

    const missedRows = [];
    let reconnectGuardSkipped = 0;

    for (
      const row of
        pendingRows || []
    ) {
      const stateSeenMs =
        Date.parse(
          String(
            row
              ?.last_seen_at ||
            row
              ?.latest_message_at ||
            ""
          )
        );

      // KPI safety:
      // ถ้า state ล่าสุดเก่ากว่าช่วง Watcher coverage ปัจจุบัน
      // เราไม่สามารถยืนยันได้ว่าร้านไม่ได้ตอบในช่วงที่ Watcher offline
      // ดังนั้น "ไม่หัก -1" แถวนี้
      if (
        !Number.isNaN(
          coverageStartedMs
        ) &&
        (
          Number.isNaN(
            stateSeenMs
          ) ||
          stateSeenMs <
            coverageStartedMs
        )
      ) {
        reconnectGuardSkipped +=
          1;

        console.warn(
          "OA DAILY AUDIT SKIPPED - PRE-RECONNECT STATE:",
          {
            chatKey:
              row
                ?.chat_key,
            customerName:
              row
                ?.customer_name,
            stateLastSeenAt:
              row
                ?.last_seen_at,
            coverageStartedAt
          }
        );

        continue;
      }

      const pendingSince =
        normalizeIsoTimestamp(
          row
            .pending_since_at
        );

      if (!pendingSince) {
        continue;
      }

      const {
        data:
          existingMiss
      } =
        await supabase
          .from(
            "oa_daily_missed_chat"
          )
          .select(
            "id"
          )
          .eq(
            "chat_key",
            row
              .chat_key
          )
          .eq(
            "pending_since_at",
            pendingSince
          )
          .maybeSingle();

      if (
        existingMiss
      ) {
        continue;
      }

      const detail = {
        chat_key:
          row
            .chat_key,

        customer_name:
          row
            .customer_name,

        latest_message_at:
          row
            .latest_message_at,

        latest_message_text:
          row
            .latest_message_text,

        pending_since_at:
          pendingSince,

        business_date:
          targetDate
      };

      const {
        error:
          insertError
      } =
        await supabase
          .from(
            "oa_daily_missed_chat"
          )
          .insert({
            chat_key:
              row
                .chat_key,

            customer_name:
              row
                .customer_name,

            latest_message_at:
              row
                .latest_message_at,

            latest_message_text:
              row
                .latest_message_text,

            pending_since_at:
              pendingSince,

            business_date:
              targetDate,

            counted_at:
              new Date()
                .toISOString()
          });

      if (insertError) {
        if (
          String(
            insertError.code ||
            ""
          ) !== "23505"
        ) {
          throw insertError;
        }

        continue;
      }

      missedRows.push(
        detail
      );
    }

    const missedCount =
      missedRows.length;

    // ไม่มีค้าง = บันทึกเงียบ ๆ
    // ไม่ส่งข้อความเข้ากลุ่ม
    if (
      missedCount > 0
    ) {
      const maxLines = 25;

      const lines =
        missedRows
          .slice(
            0,
            maxLines
          )
          .map(
            row =>
              `-1 ${
                normalizeOaCustomerName(
                  row.customer_name
                ) ||
                "ไม่ทราบชื่อ"
              }` +
              (
                row.latest_message_text
                  ? ` — ${String(row.latest_message_text).slice(0, 120)}`
                  : ""
              )
          );

      if (
        missedRows.length >
        maxLines
      ) {
        lines.push(
          `...อีก ${
            missedRows.length -
            maxLines
          } แชท`
        );
      }

      await sendSalesGroupText(
        [
          `📊 สรุปแชทลืมตอบ ${formatThaiDateFromKey(targetDate)}`,
          "",
          ...lines,
          "",
          `รวมวันนี้: -${missedCount} (${missedCount} แชท)`
        ].join("\n")
      );
    }

    const nowIso =
      new Date()
        .toISOString();

    const {
      error:
        summaryError
    } =
      await supabase
        .from(
          "oa_daily_audit_summary"
        )
        .update({
          status:
            "completed",

          missed_count:
            missedCount,

          details:
            missedRows,

          completed_at:
            nowIso,

          updated_at:
            nowIso
        })
        .eq(
          "business_date",
          targetDate
        );

    if (summaryError) {
      throw summaryError;
    }

    return {
      ran: true,
      businessDate:
        targetDate,
      missedCount,
      reconnectGuardSkipped,
      coverageStartedAt
    };

  } catch (error) {
    await releaseDailyAuditClaim(
      targetDate
    );

    throw error;
  }
}

async function claimMonthlyAudit(
  cycleEnd,
  cycleStart
) {
  const nowIso =
    new Date()
      .toISOString();

  const {
    error
  } =
    await supabase
      .from(
        "oa_monthly_audit_summary"
      )
      .insert({
        cycle_end:
          cycleEnd,

        cycle_start:
          cycleStart,

        status:
          "processing",

        missed_count:
          0,

        started_at:
          nowIso,

        updated_at:
          nowIso
      });

  if (!error) {
    return true;
  }

  if (
    String(
      error.code ||
      ""
    ) === "23505"
  ) {
    return false;
  }

  throw error;
}

async function releaseMonthlyAuditClaim(
  cycleEnd
) {
  await supabase
    .from(
      "oa_monthly_audit_summary"
    )
    .delete()
    .eq(
      "cycle_end",
      cycleEnd
    )
    .eq(
      "status",
      "processing"
    );
}

async function maybeRunWatcherMonthlyAudit(
  auditedBusinessDate
) {
  const cycle =
    getMonthlyCycleForDateKey(
      auditedBusinessDate
    );

  if (!cycle) {
    return {
      ran: false,
      reason:
        "audited_day_not_25"
    };
  }

  const claimed =
    await claimMonthlyAudit(
      cycle.cycleEnd,
      cycle.cycleStart
    );

  if (!claimed) {
    return {
      ran: false,
      reason:
        "already_done_or_claimed",
      ...cycle
    };
  }

  try {
    const {
      count,
      error
    } =
      await supabase
        .from(
          "oa_daily_missed_chat"
        )
        .select(
          "id",
          {
            count:
              "exact",
            head:
              true
          }
        )
        .gte(
          "business_date",
          cycle.cycleStart
        )
        .lte(
          "business_date",
          cycle.cycleEnd
        );

    if (error) {
      throw error;
    }

    const missedCount =
      Number(
        count || 0
      );

    await sendSalesGroupText(
      [
        "📅 สรุปแชทลืมตอบรอบเดือน",
        `${formatThaiDateFromKey(cycle.cycleStart)} - ${formatThaiDateFromKey(cycle.cycleEnd)}`,
        "",
        `เซลล์ลืมตอบแชททั้งหมด: ${missedCount} แชท`,
        `คะแนนสะสมรอบนี้: -${missedCount}`
      ].join("\n")
    );

    const nowIso =
      new Date()
        .toISOString();

    const {
      error:
        updateError
    } =
      await supabase
        .from(
          "oa_monthly_audit_summary"
        )
        .update({
          status:
            "completed",

          missed_count:
            missedCount,

          completed_at:
            nowIso,

          updated_at:
            nowIso
        })
        .eq(
          "cycle_end",
          cycle.cycleEnd
        );

    if (updateError) {
      throw updateError;
    }

    return {
      ran: true,
      ...cycle,
      missedCount
    };

  } catch (error) {
    await releaseMonthlyAuditClaim(
      cycle.cycleEnd
    );

    throw error;
  }
}

async function runOaWatcherMaintenance() {
  const now =
    new Date();

  const reminders =
    await checkWatcherDaytimeReminders(
      now
    );

  // V5.6 SAFE TEST:
  // Do not claim/write Daily Audit rows, do not count -1,
  // do not create Monthly Audit rows, and do not push LINE alerts.
  if (OA_WATCHER_DRY_RUN) {
    return {
      mode:
        SALES_REMINDER_MODE,

      dryRun:
        true,

      lineQuotaMessagesSent:
        0,

      reminders,

      dailyAudit: {
        ran: false,
        reason:
          "dry_run_no_audit"
      },

      monthlyAudit: {
        ran: false,
        reason:
          "dry_run_no_audit"
      }
    };
  }

  const dailyAudit =
    await maybeRunWatcherMorningAudit(
      now
    );

  let monthlyAudit = {
    ran: false,
    reason:
      "daily_not_resolved"
  };

  // ถ้า Daily Audit ของวันเป้าหมายรันแล้ว
  // หรือเคย completed ไปแล้ว ก็ให้เช็ก Monthly ต่อได้
  if (
    dailyAudit
      ?.businessDate &&
    (
      dailyAudit
        ?.ran === true ||
      dailyAudit
        ?.reason ===
        "already_done"
    )
  ) {
    monthlyAudit =
      await maybeRunWatcherMonthlyAudit(
        dailyAudit
          .businessDate
      );
  }

  return {
    mode:
      SALES_REMINDER_MODE,

    reminders,
    dailyAudit,
    monthlyAudit
  };
}


// =========================
// WATCHER CANDIDATES
// =========================
// ส่งเฉพาะ LINE chats ที่ควรตรวจให้ Watcher
// - แชทที่อยู่ในการดูแลของเซลล์และมีข้อความลูกค้าภายใน 7 วัน
// - แชทเก่าที่ยังมีสถานะ latest_side = customer ใน oa_chat_state
// Watcher ไม่ต้องไล่เปิดทุกห้องใน LINE OA

app.post(
  "/internal/oa-watcher/candidates",

  express.json({
    limit:
      "100kb"
  }),

  async (req, res) => {
    if (
      !isWatcherAuthorized(
        req
      )
    ) {
      return res
        .status(401)
        .json({
          ok: false,
          error:
            "Unauthorized"
        });
    }

    try {
      const recentSince =
        new Date(
          Date.now() -
          7 * 24 * 60 * 60 * 1000
        ).toISOString();

      const {
        data:
          sessionRows,
        error:
          sessionError
      } =
        await supabase
          .from(
            "customer_sessions"
          )
          .select(
            "line_user_id,last_customer_message_at,last_customer_message_text,stage,ai_enabled"
          )
          .like(
            "line_user_id",
            "U%"
          )
          .not(
            "last_customer_message_at",
            "is",
            null
          )
          .gte(
            "last_customer_message_at",
            recentSince
          )
          .or(
            "stage.eq.HUMAN_HANDOFF,ai_enabled.eq.false"
          )
          .order(
            "last_customer_message_at",
            {
              ascending:
                false
            }
          )
          .limit(1000);

      if (sessionError) {
        throw sessionError;
      }

      const {
        data:
          pendingRows,
        error:
          pendingError
      } =
        await supabase
          .from(
            "oa_chat_state"
          )
          .select(
            "chat_key,latest_message_at,latest_message_text,pending_since_at,customer_name"
          )
          .eq(
            "latest_side",
            "customer"
          )
          .order(
            "latest_message_at",
            {
              ascending:
                false
            }
          )
          .limit(1000);

      if (pendingError) {
        throw pendingError;
      }

      const byChat =
        new Map();

      for (
        const row of
          sessionRows || []
      ) {
        const chatKey =
          String(
            row
              .line_user_id ||
            ""
          );

        if (
          !/^U[0-9a-f]{32}$/i
            .test(chatKey)
        ) {
          continue;
        }

        const messageAt =
          normalizeIsoTimestamp(
            row
              .last_customer_message_at
          );

        if (!messageAt) {
          continue;
        }

        byChat.set(
          chatKey,
          {
            chat_key:
              chatKey,

            last_customer_message_at:
              messageAt,

            last_customer_message_text:
              String(
                row
                  .last_customer_message_text ||
                ""
              )
                .trim()
                .slice(
                  0,
                  1000
                )
          }
        );
      }

      // เก็บ unresolved เก่าที่ยัง latest = customer
      // แม้ last_customer_message_at จะเกิน 7 วัน
      for (
        const row of
          pendingRows || []
      ) {
        const chatKey =
          String(
            row
              .chat_key ||
            ""
          );

        if (
          !/^U[0-9a-f]{32}$/i
            .test(chatKey)
        ) {
          continue;
        }

        const messageAt =
          normalizeIsoTimestamp(
            row
              .latest_message_at
          );

        if (!messageAt) {
          continue;
        }

        const existing =
          byChat.get(
            chatKey
          );

        if (
          !existing ||
          Date.parse(
            messageAt
          ) >
          Date.parse(
            existing
              .last_customer_message_at
          )
        ) {
          byChat.set(
            chatKey,
            {
              chat_key:
                chatKey,

              last_customer_message_at:
                messageAt,

              last_customer_message_text:
                String(
                  row
                    .latest_message_text ||
                  ""
                )
                  .trim()
                  .slice(
                    0,
                    1000
                  ),

              customer_name:
                String(
                  row
                    .customer_name ||
                  ""
                )
                  .trim()
                  .slice(
                    0,
                    300
                  )
            }
          );
        }
      }

      const candidates =
        [
          ...byChat
            .values()
        ]
          .sort(
            (a, b) =>
              Date.parse(
                b.last_customer_message_at
              ) -
              Date.parse(
                a.last_customer_message_at
              )
          )
          .slice(
            0,
            1000
          );

      return res.json({
        ok: true,
        mode:
          SALES_REMINDER_MODE,

        generated_at:
          new Date()
            .toISOString(),

        count:
          candidates.length,

        candidates
      });

    } catch (error) {
      console.error(
        "OA WATCHER CANDIDATES ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            String(
              error
                ?.message ||
              error
            )
        });
    }
  }
);


// =========================
// WATCHER HEARTBEAT
// =========================

app.post(
  "/internal/oa-watcher/heartbeat",

  express.json({
    limit:
      "100kb"
  }),

  async (req, res) => {
    if (
      !isWatcherAuthorized(
        req
      )
    ) {
      return res
        .status(401)
        .json({
          ok: false,
          error:
            "Unauthorized"
        });
    }

    const deviceId =
      String(
        req.body
          ?.device_id ||
        ""
      )
        .trim()
        .slice(
          0,
          100
        );

    if (!deviceId) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "device_id is required"
        });
    }

    const rawStatus =
      String(
        req.body
          ?.status ||
        "online"
      )
        .trim()
        .toLowerCase();

    const status =
      [
        "online",
        "login_required",
        "error"
      ].includes(
        rawStatus
      )
        ? rawStatus
        : "online";

    try {
      const heartbeatAt =
        await upsertWatcherHeartbeat({
          deviceId,
          status,
          appVersion:
            req.body
              ?.app_version,
          lastError:
            req.body
              ?.last_error
        });

      return res.json({
        ok: true,
        mode:
          SALES_REMINDER_MODE,
        device_id:
          deviceId,
        heartbeat_at:
          heartbeatAt
      });

    } catch (error) {
      console.error(
        "OA WATCHER HEARTBEAT ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            String(
              error
                ?.message ||
              error
            )
        });
    }
  }
);

// =========================
// WATCHER SNAPSHOT
// =========================

app.post(
  "/internal/oa-watcher/snapshot",

  express.json({
    limit:
      "5mb"
  }),

  async (req, res) => {
    if (
      !isWatcherAuthorized(
        req
      )
    ) {
      return res
        .status(401)
        .json({
          ok: false,
          error:
            "Unauthorized"
        });
    }

    const deviceId =
      String(
        req.body
          ?.device_id ||
        ""
      )
        .trim()
        .slice(
          0,
          100
        );

    const capturedAt =
      normalizeIsoTimestamp(
        req.body
          ?.captured_at
      ) ||
      new Date()
        .toISOString();

    const chats =
      Array.isArray(
        req.body
          ?.chats
      )
        ? req.body.chats
        : [];

    const complete =
      req.body
        ?.complete ===
      true;

    if (!deviceId) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "device_id is required"
        });
    }

    try {
      const snapshot =
        await saveWatcherSnapshot({
          deviceId,
          capturedAt,
          chats
        });

      let dailyAudit = {
        ran: false,
        reason:
          "snapshot_not_complete"
      };

      let monthlyAudit = {
        ran: false,
        reason:
          "daily_not_run"
      };

      // Morning Audit ทำหลัง Watcher ส่ง Full Snapshot เท่านั้น
      // แต่ V5.6 SAFE TEST ห้าม Audit/หักคะแนน/ส่ง LINE โดยเด็ดขาด
      if (
        complete &&
        !OA_WATCHER_DRY_RUN
      ) {
        dailyAudit =
          await maybeRunWatcherMorningAudit(
            new Date(
              capturedAt
            )
          );

        if (
          dailyAudit
            ?.businessDate
        ) {
          monthlyAudit =
            await maybeRunWatcherMonthlyAudit(
              dailyAudit
                .businessDate
            );
        }
      } else if (
        complete &&
        OA_WATCHER_DRY_RUN
      ) {
        dailyAudit = {
          ran: false,
          reason:
            "dry_run_no_audit"
        };

        monthlyAudit = {
          ran: false,
          reason:
            "dry_run_no_audit"
        };
      }

      return res.json({
        ok: true,
        mode:
          SALES_REMINDER_MODE,
        dryRun:
          OA_WATCHER_DRY_RUN,
        lineQuotaMessagesSent:
          0,
        snapshot,
        complete,
        dailyAudit,
        monthlyAudit
      });

    } catch (error) {
      console.error(
        "OA WATCHER SNAPSHOT ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            String(
              error
                ?.message ||
              error
            )
        });
    }
  }
);


// =========================
// SALES REMINDER CHECKER
// เรียกจาก cron ทุก 5 นาที
// =========================

app.post(
  "/internal/sales-reminders/check",
  express.json(),

  async (req, res) => {
    const suppliedSecret = String(
      req.get("x-reminder-secret") || ""
    );

    if (
      !SALES_REMINDER_SECRET ||
      !safeStringEqual(suppliedSecret, SALES_REMINDER_SECRET)
    ) {
      return res.sendStatus(401);
    }

    try {
      const result =
        await runOaWatcherMaintenance();

      return res.json({
        ok: true,
        ...result
      });

    } catch (error) {
      console.error("SALES REMINDER CHECK ERROR:", error);
      return res.status(500).json({
        ok: false,
        error: String(error?.message || error)
      });
    }
  }
);

// =========================
// START SERVER
// =========================

app.listen(
  PORT,
  "0.0.0.0",

  () => {

    console.log(
      `Server running on port ${PORT}`
    );


    console.log(
      "SALES REMINDER MODE:",
      SALES_REMINDER_MODE
    );

    console.log(
      "OA WATCHER DRY RUN:",
      OA_WATCHER_DRY_RUN
    );

    if (OA_WATCHER_DRY_RUN) {
      console.log(
        "OA WATCHER SAFE TEST ACTIVE - SALES GROUP LINE PUSHES AND AUDITS ARE BLOCKED"
      );
    }

    // Scheduling is handled ONLY by cron-job.org via
    // POST /internal/sales-reminders/check every 5 minutes.
    // Do not run a second in-process timer here, otherwise
    // reminder/audit checks can occur at unexpected minutes
    // relative to the external cron schedule.
  }
);
