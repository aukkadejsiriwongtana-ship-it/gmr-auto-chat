const LINE_CHANNEL_ACCESS_TOKEN =
  process.env.LINE_CHANNEL_ACCESS_TOKEN;

const FACEBOOK_GRAPH_VERSION =
  process.env.FACEBOOK_GRAPH_VERSION || "v26.0";

function getFacebookPageToken(pageId = null) {
  const mappingRaw = process.env.FACEBOOK_PAGE_TOKENS_JSON;
  if (mappingRaw) {
    try {
      const mapping = JSON.parse(mappingRaw);
      if (pageId && mapping?.[String(pageId)]) {
        return String(mapping[String(pageId)]);
      }
    } catch (error) {
      console.error("FACEBOOK_PAGE_TOKENS_JSON parse failed:", error.message);
    }
  }
  return process.env.FACEBOOK_PAGE_ACCESS_TOKEN || null;
}

function parseFacebookPlatform(platform) {
  const value = String(platform || "").trim();
  if (value === "facebook") return { isFacebook: true, pageId: null };
  if (value.startsWith("facebook:")) {
    return { isFacebook: true, pageId: value.slice("facebook:".length) || null };
  }
  if (value === "facebook_th" || value === "fb_th" || value === "facebook_en" || value === "fb_en") {
    return { isFacebook: true, pageId: null };
  }
  return { isFacebook: false, pageId: null };
}

export async function sendLineTextMessage(userId, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  if (!userId) throw new Error("Missing LINE userId");
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ to: userId, messages: [{ type: "text", text }] }),
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`LINE customer push failed: ${response.status} ${responseText}`);
  return true;
}

export async function getLineUserProfile(userId) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  if (!userId) throw new Error("Missing LINE userId");
  const response = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    method: "GET", headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`LINE profile fetch failed: ${response.status} ${responseText}`);
  let data = {};
  if (responseText) { try { data = JSON.parse(responseText); } catch { data = {}; } }
  return { userId: data.userId || userId, displayName: data.displayName || null, pictureUrl: data.pictureUrl || null, statusMessage: data.statusMessage || null };
}

export async function sendLineImageMessage(userId, imageUrl) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  if (!userId) throw new Error("Missing LINE userId");
  if (!imageUrl) throw new Error("Missing LINE imageUrl");
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ to: userId, messages: [{ type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl }] }),
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`LINE customer image push failed: ${response.status} ${responseText}`);
  return true;
}

export async function sendFacebookTextMessage({ pageId = null, userId, text }) {
  const token = getFacebookPageToken(pageId);
  if (!token) throw new Error("Missing Facebook Page Access Token");
  if (!userId) throw new Error("Missing Facebook userId");
  const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: userId }, messaging_type: "RESPONSE", message: { text } }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Facebook customer push failed: ${response.status} ${body}`);
  return true;
}

export async function sendFacebookImageMessage({ pageId = null, userId, imageUrl }) {
  const token = getFacebookPageToken(pageId);
  if (!token) throw new Error("Missing Facebook Page Access Token");
  if (!userId) throw new Error("Missing Facebook userId");
  if (!imageUrl) throw new Error("Missing Facebook imageUrl");
  const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: userId }, messaging_type: "RESPONSE", message: { attachment: { type: "image", payload: { url: imageUrl, is_reusable: true } } } }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Facebook customer image push failed: ${response.status} ${body}`);
  return true;
}

export async function getFacebookUserProfile({ pageId = null, userId }) {
  const token = getFacebookPageToken(pageId);
  if (!token || !userId) return { userId, displayName: null, pictureUrl: null };
  const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(userId)}?fields=first_name,last_name,profile_pic&access_token=${encodeURIComponent(token)}`;
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) throw new Error(`Facebook profile fetch failed: ${response.status} ${body}`);
  let data = {};
  try { data = JSON.parse(body); } catch { data = {}; }
  return {
    userId: data.id || userId,
    displayName: [data.first_name, data.last_name].filter(Boolean).join(" ") || null,
    pictureUrl: data.profile_pic || null,
  };
}

export async function sendMessageToCustomer({ platform, platformUserId, text = null, imageUrl = null }) {
  if (platform === "line") {
    if (imageUrl) return sendLineImageMessage(platformUserId, imageUrl);
    if (text) return sendLineTextMessage(platformUserId, text);
    throw new Error("Missing customer message content");
  }

  const fb = parseFacebookPlatform(platform);
  if (fb.isFacebook) {
    if (imageUrl) return sendFacebookImageMessage({ pageId: fb.pageId, userId: platformUserId, imageUrl });
    if (text) return sendFacebookTextMessage({ pageId: fb.pageId, userId: platformUserId, text });
    throw new Error("Missing customer message content");
  }

  throw new Error(`Unsupported customer platform: ${platform}`);
}

export async function replyLineTextMessage(replyToken, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  if (!replyToken) throw new Error("Missing LINE replyToken");
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`LINE reply failed: ${response.status} ${responseText}`);
  return true;
}

export async function downloadLineMessageContent(messageId) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  if (!messageId) throw new Error("Missing LINE messageId");
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    method: "GET", headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`LINE content download failed: ${response.status} ${responseText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  return { buffer, contentType };
}
