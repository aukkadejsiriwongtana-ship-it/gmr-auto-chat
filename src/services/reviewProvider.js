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
  placeId = null,
  dataId = null,
  sortBy,
  nextPageToken = null,
}) {
  if (!placeId && !dataId) {
    throw new Error(
      "Missing placeId or dataId"
    );
  }

const params =
  new URLSearchParams({
    engine:
      "google_maps_reviews",

    api_key:
      SERPAPI_API_KEY,
  });

if (placeId) {
  params.set(
    "place_id",
    placeId
  );
}

if (dataId) {
  params.set(
    "data_id",
    dataId
  );
}

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

  placeInfo:
    data.place_info ||
    null,
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

// =========================================================
// DIRECT REVIEW URL
// =========================================================

export function parseGoogleReviewUrl(
  reviewUrl
) {
  const rawUrl =
    String(reviewUrl || "").trim();

  if (!rawUrl) {
    return {
      dataId: null,
      reviewId: null,
    };
  }

  let decodedUrl =
    rawUrl;

  try {
    decodedUrl =
      decodeURIComponent(
        rawUrl
      );
  } catch {
    // ใช้ rawUrl ต่อ
  }

  // ------------------------------------------
  // Google Maps data_id
  // ตัวอย่าง:
  // 0x311d7ddd69a06ea3:0x75f8ea284b2c0c81
  // ------------------------------------------

  const dataIdMatch =
    decodedUrl.match(
      /(0x[0-9a-f]+:0x[0-9a-f]+)/i
    );

  const dataId =
    dataIdMatch?.[1] ||
    null;


  // ------------------------------------------
  // Review ID
  // ลิงก์ Google Review มักมี:
  // !1s<review_id>
  //
  // ต้องกันไม่ให้จับ data_id
  // ------------------------------------------

  const oneSMatches =
    [
      ...decodedUrl.matchAll(
        /!1s([^!/?&]+)/g
      ),
    ];

  let reviewId =
    null;

  for (
    const match of oneSMatches
  ) {
    const value =
      match?.[1] || "";

    if (
      value &&
      !value.startsWith("0x")
    ) {
      reviewId =
        value;

      break;
    }
  }

  return {
    dataId,
    reviewId,
  };
}


// =========================================================
// GET REVIEW FROM DIRECT URL
// =========================================================

export async function getReviewFromDirectUrl(
  reviewUrl
) {
  const {
    dataId,
    reviewId,
  } =
    parseGoogleReviewUrl(
      reviewUrl
    );

  if (!dataId) {
    return {
      found: false,
      reason:
        "DATA_ID_NOT_FOUND",
      dataId: null,
      reviewId,
      placeInfo: null,
      review: null,
    };
  }


  let nextPageToken =
  null;

let placeInfo =
  null;

let pageCount =
  0;

  const maxPages =
    5;


  do {
    const result =
      await fetchGoogleMapsReviews({
        dataId,

        sortBy:
          "newestFirst",

        nextPageToken,
      });
if (
  !placeInfo &&
  result.placeInfo
) {
  placeInfo =
    result.placeInfo;
}

    // ถ้ามี reviewId → หา review ตรงตัว
    if (reviewId) {
      const matchedReview =
        result.reviews.find(
          (review) =>
            String(
              review.reviewId ||
              ""
            ) ===
            String(reviewId)
        );

      if (matchedReview) {
        return {
  found: true,
  reason: null,
  dataId,
  reviewId,

  placeInfo,

  businessName:
    placeInfo?.title ||
    null,

  review:
    matchedReview,
};
      }
    }


    // ถ้า extract reviewId ไม่ได้
    // ยังไม่เดา review ตัวแรก
    if (!reviewId) {
      return {
        found: false,
        reason:
          "REVIEW_ID_NOT_FOUND",
        dataId,
        reviewId: null,
        review: null,
      };
    }


    nextPageToken =
      result.nextPageToken;

    pageCount += 1;

  } while (
    nextPageToken &&
    pageCount <
      maxPages
  );


  return {
  found: false,
  reason:
    "REVIEW_NOT_FOUND",
  dataId,
  reviewId,
  placeInfo,
  businessName:
    placeInfo?.title ||
    null,
  review: null,
};
}
