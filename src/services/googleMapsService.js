const GOOGLE_MAPS_API_KEY =
  process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
  throw new Error(
    "Missing GOOGLE_MAPS_API_KEY"
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

  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
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

      body: JSON.stringify({
        textQuery,
        languageCode: "th",
        regionCode: "TH",
        maxResultCount: 5,
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
        place.id || null,

      businessName:
        place.displayName?.text ||
        null,

      formattedAddress:
        place.formattedAddress ||
        null,

      mapUrl:
        place.googleMapsUri ||
        null,

      rating:
        place.rating ?? null,

      userRatingCount:
        place.userRatingCount ?? null,
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
