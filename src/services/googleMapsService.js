const GOOGLE_MAPS_API_KEY =
  process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
  throw new Error(
    "Missing GOOGLE_MAPS_API_KEY"
  );
}


// =========================================================
// GOOGLE MAP URL HELPERS
// =========================================================

function isGoogleMapsUrl(value) {
  try {
    const url =
      new URL(
        String(value || "").trim()
      );

    const hostname =
      url.hostname
        .toLowerCase();

    return (
      hostname ===
        "maps.app.goo.gl" ||
      hostname ===
        "goo.gl" ||
      hostname.endsWith(
        ".google.com"
      ) ||
      hostname ===
        "google.com"
    );
  } catch {
    return false;
  }
}


function extractPlaceNameFromGoogleMapsUrl(
  mapUrl
) {
  try {
    const url =
      new URL(mapUrl);


    // -----------------------------------------
    // แบบ:
    // google.com/maps/place/Business+Name/...
    // -----------------------------------------

    const placeMatch =
      url.pathname.match(
        /\/maps\/place\/([^/]+)/
      );

    if (
      placeMatch?.[1]
    ) {
      return decodeURIComponent(
        placeMatch[1]
      )
        .replace(/\+/g, " ")
        .trim();
    }


    // -----------------------------------------
    // แบบ ?q=Business Name
    // -----------------------------------------

    const q =
      url.searchParams.get(
        "q"
      );

    if (q) {
      return q.trim();
    }


    // -----------------------------------------
    // แบบ ?query=Business Name
    // -----------------------------------------

    const query =
      url.searchParams.get(
        "query"
      );

    if (query) {
      return query.trim();
    }


    return null;

  } catch {
    return null;
  }
}

function extractPlaceNameFromGoogleMapsHtml(
  html
) {
  const text =
    String(html || "");


  // -----------------------------------------
  // og:title
  // -----------------------------------------

  const ogTitleMatch =
    text.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
    ) ||
    text.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i
    );


  if (
    ogTitleMatch?.[1]
  ) {
    return ogTitleMatch[1]
      .replace(
        /\s*[-–—]\s*Google Maps.*$/i,
        ""
      )
      .trim();
  }


  // -----------------------------------------
  // HTML title fallback
  // -----------------------------------------

  const titleMatch =
    text.match(
      /<title[^>]*>(.*?)<\/title>/is
    );


  if (
    titleMatch?.[1]
  ) {
    return titleMatch[1]
      .replace(
        /\s*[-–—]\s*Google Maps.*$/i,
        ""
      )
      .replace(
        /&amp;/gi,
        "&"
      )
      .trim();
  }


  return null;
}


// =========================================================
// RESOLVE GOOGLE MAP SHORT URL
// maps.app.goo.gl → Google Maps URL เต็ม
// =========================================================

export async function resolveGoogleMapsUrl(
  mapUrl
) {
  if (!mapUrl) {
    throw new Error(
      "Missing mapUrl"
    );
  }


  const input =
    String(mapUrl)
      .trim();


  if (
    !isGoogleMapsUrl(input)
  ) {
    return {
      originalUrl:
        input,

      resolvedUrl:
        input,

      placeName:
        null,
    };
  }


  let resolvedUrl =
    input;

  let html =
    "";


  try {

    // ========================================
    // เปิด Google Maps URL จริง
    //
    // รองรับ:
    // maps.app.goo.gl
    // goo.gl
    // maps.google.com/?cid=...
    // google.com/maps/...
    // ========================================

    const response =
      await fetch(
        input,
        {
          method:
            "GET",

          redirect:
            "follow",

          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",

            "Accept-Language":
              "th-TH,th;q=0.9,en;q=0.8",
          },
        }
      );


    if (
      response.url
    ) {
      resolvedUrl =
        response.url;
    }


    try {
      html =
        await response.text();
    } catch {
      html = "";
    }


    console.log(
      "GOOGLE MAP URL RESOLVED:",
      {
        originalUrl:
          input,

        resolvedUrl,

        hasHtml:
          Boolean(html),
      }
    );

  } catch (error) {

    console.error(
      "GOOGLE MAP URL RESOLVE FAILED:",
      {
        mapUrl:
          input,

        error:
          error.message,
      }
    );

    // ไม่ throw
    // ปล่อย fallback ด้านล่างทำงาน
  }


  // ========================================
  // วิธี 1:
  // ดึงชื่อจาก URL หลัง redirect
  // เช่น /maps/place/Seacon+Square/...
  // ========================================

  let placeName =
    extractPlaceNameFromGoogleMapsUrl(
      resolvedUrl
    );


  // ========================================
  // วิธี 2:
  // CID URL อาจยังไม่มีชื่อใน URL
  // → อ่านชื่อจาก HTML / og:title
  // ========================================

  if (
    !placeName &&
    html
  ) {
    placeName =
      extractPlaceNameFromGoogleMapsHtml(
        html
      );
  }


  console.log(
    "GOOGLE MAP RESOLVE RESULT:",
    {
      originalUrl:
        input,

      resolvedUrl,

      placeName:
        placeName ||
        null,
    }
  );


  return {
    originalUrl:
      input,

    resolvedUrl,

    placeName:
      placeName ||
      null,
  };
}

// =========================================================
// NORMALIZE TEXT QUERY
// =========================================================

async function normalizePlaceTextQuery(
  input
) {
  const text =
    String(input || "")
      .trim();


  if (!text) {
    throw new Error(
      "Missing textQuery"
    );
  }


  // ถ้าไม่ใช่ Google Maps URL
  // ใช้ชื่อธุรกิจตรง ๆ
  if (
    !isGoogleMapsUrl(text)
  ) {
    return text;
  }


  const resolved =
    await resolveGoogleMapsUrl(
      text
    );


  // กรณีดึงชื่อร้านออกจาก URL ได้
  if (
    resolved.placeName
  ) {
    console.log(
      "GOOGLE MAP PLACE NAME EXTRACTED:",
      {
        placeName:
          resolved.placeName,
      }
    );

    return (
      resolved.placeName
    );
  }


  // ถ้าดึงชื่อไม่ได้
  // ลองใช้ URL เต็มเป็น fallback
  return (
    resolved.resolvedUrl
  );
}


// =========================================================
// TEXT SEARCH - PLACES API (NEW)
// =========================================================

export async function searchPlaceByText(
  textQuery
) {
  if (!textQuery) {
    throw new Error(
      "Missing textQuery"
    );
  }


  const normalizedQuery =
    await normalizePlaceTextQuery(
      textQuery
    );


  console.log(
    "GOOGLE PLACES SEARCH QUERY:",
    {
      original:
        textQuery,

      normalized:
        normalizedQuery,
    }
  );


  const response =
    await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "X-Goog-Api-Key":
            GOOGLE_MAPS_API_KEY,

          "X-Goog-FieldMask":
            [
              "places.id",
              "places.displayName",
              "places.formattedAddress",
              "places.googleMapsUri",
              "places.rating",
              "places.userRatingCount",
            ].join(","),
        },

        body:
          JSON.stringify({
            textQuery:
              normalizedQuery,

            languageCode:
              "th",

            regionCode:
              "TH",

            maxResultCount:
              5,
          }),
      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    console.error(
      "GOOGLE PLACES SEARCH ERROR:",
      data
    );


    throw new Error(
      data?.error?.message ||
        "Google Places search failed"
    );
  }


  const places =
    data.places || [];


  return places.map(
    (place) => ({
      placeId:
        place.id ||
        null,

      businessName:
        place
          .displayName
          ?.text ||
        null,

      formattedAddress:
        place
          .formattedAddress ||
        null,

      mapUrl:
        place
          .googleMapsUri ||
        null,

      rating:
        place.rating ??
        null,

      userRatingCount:
        place
          .userRatingCount ??
        null,
    })
  );
}


// =========================================================
// BEST MATCH
// =========================================================

export async function findBestPlaceByText(
  textQuery
) {
  const results =
    await searchPlaceByText(
      textQuery
    );


  if (!results.length) {
    return null;
  }


  return results[0];
}
