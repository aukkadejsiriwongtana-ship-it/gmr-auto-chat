const LINE_CHANNEL_ACCESS_TOKEN =
  process.env.LINE_CHANNEL_ACCESS_TOKEN;

export async function sendLineTextMessage(
  userId,
  text
) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error(
      "Missing LINE_CHANNEL_ACCESS_TOKEN"
    );
  }

  if (!userId) {
    throw new Error(
      "Missing LINE userId"
    );
  }

  const response = await fetch(
    "https://api.line.me/v2/bot/message/push",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },

      body: JSON.stringify({
        to: userId,

        messages: [
          {
            type: "text",
            text,
          },
        ],
      }),
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `LINE customer push failed: ${response.status} ${responseText}`
    );
  }

  return true;
}

export async function getLineUserProfile(
  userId
) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error(
      "Missing LINE_CHANNEL_ACCESS_TOKEN"
    );
  }

  if (!userId) {
    throw new Error(
      "Missing LINE userId"
    );
  }

  const response = await fetch(
    `https://api.line.me/v2/bot/profile/${userId}`,
    {
      method: "GET",

      headers: {
        Authorization:
          `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `LINE profile fetch failed: ${response.status} ${responseText}`
    );
  }

  let data = {};

  if (responseText) {
    try {
      data =
        JSON.parse(responseText);
    } catch {
      data = {};
    }
  }

  return {
    userId:
      data.userId || userId,

    displayName:
      data.displayName || null,

    pictureUrl:
      data.pictureUrl || null,

    statusMessage:
      data.statusMessage || null,
  };
}


export async function sendMessageToCustomer({
  platform,
  platformUserId,
  text,
}) {
  if (platform === "line") {
    return sendLineTextMessage(
      platformUserId,
      text
    );
  }

  throw new Error(
    `Unsupported customer platform: ${platform}`
  );
}

export async function replyLineTextMessage(
  replyToken,
  text
) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error(
      "Missing LINE_CHANNEL_ACCESS_TOKEN"
    );
  }

  if (!replyToken) {
    throw new Error(
      "Missing LINE replyToken"
    );
  }

  const response = await fetch(
    "https://api.line.me/v2/bot/message/reply",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },

      body: JSON.stringify({
        replyToken,

        messages: [
          {
            type: "text",
            text,
          },
        ],
      }),
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `LINE reply failed: ${response.status} ${responseText}`
    );
  }

  return true;
}

export async function downloadLineMessageContent(
  messageId
) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error(
      "Missing LINE_CHANNEL_ACCESS_TOKEN"
    );
  }

  if (!messageId) {
    throw new Error(
      "Missing LINE messageId"
    );
  }

  const response = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      method: "GET",

      headers: {
        Authorization:
          `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    const responseText =
      await response.text();

    throw new Error(
      `LINE content download failed: ${response.status} ${responseText}`
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  const buffer =
    Buffer.from(arrayBuffer);

  const contentType =
    response.headers.get(
      "content-type"
    ) || "application/octet-stream";

  return {
    buffer,
    contentType,
  };
}
