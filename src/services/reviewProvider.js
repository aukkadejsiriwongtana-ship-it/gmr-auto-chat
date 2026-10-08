import {
  getNewestReviews,
  getLowestReviews,
  getRecentReviews,
  getOneStarReviews,
} from "./services/reviewProvider.js";

const SERPAPI_API_KEY =
  process.env.SERPAPI_API_KEY;

if (!SERPAPI_API_KEY) {
  throw new Error(
    "Missing SERPAPI_API_KEY"
  );
}


// =========================================================
// INTERNAL REQUEST
// =========================================================

async function fetchGoogleMapsReviews({
  placeId,
  sortBy,
  nextPageToken = null,
}) {
  if (!placeId) {
    throw new Error(
      "Missing placeId"
    );
  }

  const params =
    new URLSearchParams({
      engine: "google_maps_reviews",
      place_id: placeId,
      api_key: SERPAPI_API_KEY,
    });

  if (sortBy) {
    params.set(
      "sort_by",
      sortBy
    );
  }

  if (nextPageToken) {
    params.set(
      "next_page_token",
      nextPageToken
    );
  }

  const url =
    `https://serpapi.com/search.json?${params.toString()}`;

  const response =
    await fetch(url);

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "SERPAPI HTTP ERROR:",
      data
    );

    throw new Error(
      data?.error ||
      "SerpApi request failed"
    );
  }

  if (data.error) {
    console.error(
      "SERPAPI API ERROR:",
      data
    );

    throw new Error(
      data.error
    );
  }

  const reviews =
    Array.isArray(data.reviews)
      ? data.reviews
      : [];

  return {
    reviews:
      reviews.map(
        normalizeReview
      ),

    nextPageToken:
      data.serpapi_pagination
        ?.next_page_token ||
      null,

    rawCount:
      reviews.length,
  };
}


// =========================================================
// NORMALIZE REVIEW
// =========================================================

function normalizeReview(review) {

  const rating =
    Number(
      review.rating ??
      review.stars ??
      0
    ) || null;

  const reviewText =
    review.snippet ??
    review.text ??
    "";

  const reviewUrl =
    review.link ??
    review.review_link ??
    null;

  const reviewerName =
    review.user?.name ??
    review.author_name ??
    review.name ??
    null;

  const dateText =
    review.date ??
    review.iso_date ??
    null;

  const isoDate =
    review.iso_date ??
    null;

  return {
    reviewerName,

    rating,

    text:
      reviewText,

    dateText,

    isoDate,

    reviewUrl,

    reviewId:
      review.review_id ??
      null,

    userProfileUrl:
      review.user?.link ??
      null,

    source:
      "serpapi",
  };
}


// =========================================================
// NEWEST REVIEWS
// =========================================================

export async function getNewestReviews(
  placeId
) {
  return fetchGoogleMapsReviews({
    placeId,

    // SerpApi Google Maps Reviews
    // newest first
    sortBy:
      "newestFirst",
  });
}


// =========================================================
// LOWEST REVIEWS
// =========================================================

export async function getLowestReviews(
  placeId
) {
  return fetchGoogleMapsReviews({
    placeId,

    // lowest rating first
    sortBy:
      "ratingLow",
  });
}


// =========================================================
// HELPERS
// =========================================================

export function getReviewAgeDays(
  review
) {
  if (!review) {
    return null;
  }

  if (review.isoDate) {

    const published =
      new Date(
        review.isoDate
      );

    if (
      !Number.isNaN(
        published.getTime()
      )
    ) {
      const now =
        new Date();

      const diffMs =
        now.getTime() -
        published.getTime();

      return Math.floor(
        diffMs /
        (1000 * 60 * 60 * 24)
      );
    }
  }

  return null;
}


export function isRecentReview(
  review,
  maxAgeDays = 14
) {
  const ageDays =
    getReviewAgeDays(
      review
    );

  if (ageDays === null) {
    return false;
  }

  return (
    ageDays >= 0 &&
    ageDays <= maxAgeDays
  );
}


export function getRecentReviews(
  reviews,
  maxAgeDays = 14
) {
  if (!Array.isArray(reviews)) {
    return [];
  }

  return reviews.filter(
    (review) =>
      isRecentReview(
        review,
        maxAgeDays
      )
  );
}


export function getOneStarReviews(
  reviews
) {
  if (!Array.isArray(reviews)) {
    return [];
  }

  return reviews.filter(
    (review) =>
      Number(
        review.rating
      ) === 1
  );
}
