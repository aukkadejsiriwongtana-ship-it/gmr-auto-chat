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


  try {

    const url =
      new URL(input);

    const hostname =
      url.hostname
        .toLowerCase();


    // -----------------------------------------
    // Short URL ต้องตาม redirect ก่อน
    // -----------------------------------------

    if (
      hostname ===
        "maps.app.goo.gl" ||
      hostname ===
        "goo.gl"
    ) {

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
                "Mozilla/5.0",
            },
          }
        );


      if (
        response.url
      ) {
        resolvedUrl =
          response.url;
      }


      console.log(
        "GOOGLE MAP SHORT URL RESOLVED:",
        {
          originalUrl:
            input,

          resolvedUrl,
        }
      );
    }

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
    // เพื่อไม่ให้ flow ลูกค้าพัง
  }


  const placeName =
    extractPlaceNameFromGoogleMapsUrl(
      resolvedUrl
    );


  return {
    originalUrl:
      input,

    resolvedUrl,

    placeName,
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
