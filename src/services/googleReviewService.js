const GOOGLE_MAPS_API_KEY =
  process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
  throw new Error("Missing GOOGLE_MAPS_API_KEY");
}

export async function getPlaceReviews(placeId) {
  if (!placeId) {
    throw new Error("Missing placeId");
  }

  const url =
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": [
        "id",
        "displayName",
        "rating",
        "userRatingCount",
        "reviews"
      ].join(","),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(
      "GOOGLE PLACE REVIEWS ERROR:",
      data
    );

    throw new Error(
      data?.error?.message ||
      "Google Place Reviews request failed"
    );
  }

  const reviews = Array.isArray(data.reviews)
    ? data.reviews
    : [];

  return {
    placeId: data.id || placeId,
    businessName:
      data.displayName?.text || null,
    rating:
      data.rating ?? null,
    userRatingCount:
      data.userRatingCount ?? null,

    reviews: reviews.map((review) => ({
      authorName:
        review.authorAttribution?.displayName ||
        null,

      rating:
        review.rating ?? null,

      text:
        review.text?.text ||
        review.originalText?.text ||
        "",

      relativeTimeDescription:
        review.relativePublishTimeDescription ||
        null,

      publishTime:
        review.publishTime ||
        null,

      googleMapsUri:
        review.googleMapsUri ||
        null,
    })),
  };
}
