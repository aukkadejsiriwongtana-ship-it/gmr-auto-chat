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
