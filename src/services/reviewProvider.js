// =========================================================
// GMR REVIEW PROVIDER V2.2.27 — T2 TELEGRAM ON-DEMAND CHECK
//
// Rules:
// 1) Direct review URL / T0-T2 / active-job monitor = Google direct page only.
// 2) SerpApi is reserved for old-customer reactivation map watch only.
// 3) Generic newest/lowest functions are intentionally blocked so an old
//    flow cannot silently burn SerpApi quota.
// =========================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const DIRECT_META_TTL_MS = 10 * 60 * 1000;
const ACCOUNT_TTL_MS = 2 * 60 * 1000;

const directMetaCache = new Map();
let serpAccountCache = null;

function getSerpApiKey() {
  return String(process.env.SERPAPI_API_KEY || "").trim();
}

function makeError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function decodeBasicHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)); } catch { return _; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try { return String.fromCodePoint(parseInt(n, 16)); } catch { return _; }
    });
}

function decodeGooglePageText(value) {
  return decodeBasicHtmlEntities(String(value || ""))
    .replace(/\\u003d/gi, "=")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u002f/gi, "/")
    .replace(/\\u003a/gi, ":")
    .replace(/\\u0022/gi, '"')
    .replace(/\\x3d/gi, "=")
    .replace(/\\x26/gi, "&")
    .replace(/\\x2f/gi, "/")
    .replace(/\\x3a/gi, ":")
    .replace(/\\x22/gi, '"');
}

function normalizeInboundUrl(value) {
  return String(value || "")
    .trim()
    .replace(/[)\]}>，。、,.;]+$/g, "");
}

function extractSkid(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const skid = parsed.searchParams.get("skid");
    return skid ? String(skid).trim().toLowerCase() : null;
  } catch {
    const match = raw.match(/[?&]skid=([^&#]+)/i);
    if (!match?.[1]) return null;
    try { return decodeURIComponent(match[1]).trim().toLowerCase(); }
    catch { return String(match[1]).trim().toLowerCase(); }
  }
}

function extractReviewIdentityTokens(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];

  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch {}

  const tokens = new Set();
  const add = (token) => {
    const safe = String(token || "").trim().toLowerCase();
    if (!safe || safe.startsWith("0x")) return;
    tokens.add(safe);
  };

  add(extractSkid(decoded));

  const patterns = [
    /!2m5!1s([^!&]+)/ig,
    /!2m3!1s([^!&]+)/ig,
    /!1s([^!/?&]+)/ig,
  ];

  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern)) {
      add(match?.[1]);
    }
  }

  return [...tokens];
}

function extractBusinessDataId(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch {}
  const match = decoded.match(/(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  return match?.[1] || null;
}

function extractBusinessName(...values) {
  for (const value of values) {
    const text = decodeBasicHtmlEntities(String(value || ""))
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;

    const patterns = [
      /Google review of\s+(.+?)(?=\s*[|–—-]\s*Google Maps|$)/i,
      /^Review of\s+(.+?)\s*$/i,
      /รีวิว(?:ของ)?\s*(.+?)(?=\s*[|–—-]\s*Google Maps|$)/i,
      /^(.+?)\s*[|–—-]\s*Google Maps\s*$/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const candidate = match[1].trim().replace(/["']+$/g, "");
        if (candidate && !/^google maps$/i.test(candidate)) return candidate;
      }
    }
  }
  return null;
}

function extractReviewAgeDaysFromText(value) {
  const text = decodeBasicHtmlEntities(String(value || ""))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!text) return null;
  if (/\b(today|just now)\b/i.test(text) || /วันนี้/.test(text)) return 0;
  if (/\byesterday\b/i.test(text) || /เมื่อวาน/.test(text)) return 1;

  const englishRelative = text.match(
    /\b(?:(\d+)|(a|an|one))\s*(minute|hour|day|week|month|year)s?\s+ago\b/i
  );
  if (englishRelative) {
    const amount = englishRelative[1] ? Number(englishRelative[1]) : 1;
    const unit = String(englishRelative[3] || "").toLowerCase();
    if (Number.isFinite(amount)) {
      if (unit === "minute" || unit === "hour") return 0;
      if (unit === "day") return amount;
      if (unit === "week") return amount * 7;
      if (unit === "month") return amount * 30;
      if (unit === "year") return amount * 365;
    }
  }

  const thaiRelative = text.match(
    /(\d+)\s*(นาที|ชั่วโมง|วัน|สัปดาห์|เดือน|ปี)(?:ที่)?แล้ว/
  );
  if (thaiRelative) {
    const amount = Number(thaiRelative[1]);
    const unit = thaiRelative[2];
    if (Number.isFinite(amount)) {
      if (unit === "นาที" || unit === "ชั่วโมง") return 0;
      if (unit === "วัน") return amount;
      if (unit === "สัปดาห์") return amount * 7;
      if (unit === "เดือน") return amount * 30;
      if (unit === "ปี") return amount * 365;
    }
  }

  const absolutePatterns = [
    /\b(20\d{2}-\d{1,2}-\d{1,2})\b/,
    /\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+20\d{2})\b/i,
    /\b(\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+20\d{2})\b/i,
  ];

  for (const pattern of absolutePatterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const published = new Date(match[1]).getTime();
    if (!Number.isFinite(published)) continue;
    const diff = Date.now() - published;
    if (diff < -DAY_MS) continue;
    return Math.max(0, Math.floor(diff / DAY_MS));
  }

  return null;
}

function extractAgeNearIdentity(html, ...urlValues) {
  const rawHtml = String(html || "");
  if (!rawHtml) return null;
  const decodedHtml = decodeGooglePageText(rawHtml);

  const tokens = new Set();
  for (const value of urlValues) {
    for (const token of extractReviewIdentityTokens(value)) {
      if (!token || token.length < 8) continue;
      tokens.add(token);
      try { tokens.add(decodeURIComponent(token)); } catch {}
      try { tokens.add(encodeURIComponent(token)); } catch {}
    }
  }

  for (const token of tokens) {
    const lowerToken = String(token).toLowerCase();
    for (const haystack of [rawHtml, decodedHtml]) {
      const lower = haystack.toLowerCase();
      let offset = 0;

      while (offset < lower.length) {
        const index = lower.indexOf(lowerToken, offset);
        if (index < 0) break;

        const start = Math.max(0, index - 12000);
        const end = Math.min(haystack.length, index + lowerToken.length + 12000);
        const window = haystack
          .slice(start, end)
          .replace(/<script[^>]*>/gi, " ")
          .replace(/<\/script>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/[\[\]{}(),]/g, " ")
          .replace(/\s+/g, " ");

        const textAge = extractReviewAgeDaysFromText(window);
        if (textAge != null && Number.isFinite(Number(textAge))) {
          return Number(textAge);
        }

        const localStart = Math.max(0, index - 2500);
        const localEnd = Math.min(haystack.length, index + lowerToken.length + 2500);
        const localWindow = haystack.slice(localStart, localEnd);
        const timestampMatches = [
          ...localWindow.matchAll(/(?<!\d)(1[3-9]\d{8}|2\d{9}|1[3-9]\d{11}|2\d{12})(?!\d)/g),
        ];

        const now = Date.now();
        const minDate = new Date("2010-01-01T00:00:00Z").getTime();
        const maxDate = now + DAY_MS;
        const plausible = [];

        for (const match of timestampMatches) {
          let n = Number(match[1]);
          if (!Number.isFinite(n)) continue;
          if (String(match[1]).length >= 12) n = Math.floor(n / 1000);
          const ms = n * 1000;
          if (ms < minDate || ms > maxDate) continue;
          const distance = Math.abs((localStart + (match.index || 0)) - index);
          plausible.push({ ms, distance });
        }

        plausible.sort((a, b) => a.distance - b.distance);
        if (plausible.length) {
          const nearest = plausible[0];
          const second = plausible[1];
          if (!second || nearest.distance + 250 < second.distance) {
            return Math.max(0, Math.floor((now - nearest.ms) / DAY_MS));
          }
        }

        offset = index + lowerToken.length;
      }
    }
  }

  return null;
}

function htmlContainsReviewIdentity(html, ...urlValues) {
  const haystack = decodeGooglePageText(String(html || "")).toLowerCase();
  if (!haystack) return false;

  for (const value of urlValues) {
    for (const token of extractReviewIdentityTokens(value)) {
      const safe = String(token || "").trim().toLowerCase();
      if (safe.length >= 8 && haystack.includes(safe)) return true;
    }
  }

  return false;
}

function readMetaFromHtml(html, propertyName) {
  const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    if (match?.[1]) return decodeBasicHtmlEntities(match[1]).trim();
  }
  return null;
}

async function fetchDirectReviewMeta(reviewUrl, { force = false } = {}) {
  const inputUrl = normalizeInboundUrl(reviewUrl);
  if (!/^https?:\/\//i.test(inputUrl)) {
    throw makeError("Invalid review URL", "INVALID_REVIEW_URL");
  }

  const cached = directMetaCache.get(inputUrl);
  if (!force && cached && Date.now() - cached.cachedAt < DIRECT_META_TTL_MS) {
    return cached.value;
  }

  const userAgents = [
    "TelegramBot (like TwitterBot)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0",
  ];

  let best = null;
  let lastError = null;

  for (const userAgent of userAgents) {
    try {
      const response = await fetch(inputUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": userAgent,
          "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
        },
      });

      if (response.status === 429 || response.status >= 500) {
        throw makeError(`Google direct review HTTP ${response.status}`, "DIRECT_REVIEW_TEMPORARY_ERROR");
      }

      const finalUrl = String(response.url || inputUrl).trim();
      const html = await response.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const inlineReviewTitleMatch = html.match(/Google review of\s+([^<"'\n\r]{2,180})/i);

      const title =
        readMetaFromHtml(html, "og:title") ||
        readMetaFromHtml(html, "twitter:title") ||
        (inlineReviewTitleMatch?.[0]
          ? decodeBasicHtmlEntities(inlineReviewTitleMatch[0]).replace(/\s+/g, " ").trim()
          : null) ||
        (titleMatch?.[1]
          ? decodeBasicHtmlEntities(titleMatch[1]).replace(/\s+/g, " ").trim()
          : null);

      const description =
        readMetaFromHtml(html, "og:description") ||
        readMetaFromHtml(html, "twitter:description") ||
        readMetaFromHtml(html, "description") ||
        null;

      const businessName = extractBusinessName(title, description, inlineReviewTitleMatch?.[0]);
      const titleReviewSpecific = /\bgoogle review of\b|^review of\b|รีวิว/i.test(String(title || ""));
      const identityPresent = htmlContainsReviewIdentity(html, inputUrl, finalUrl);
      const resolvedLooksDirect =
        /google\.[^/]+\/maps\/reviews\/data=/i.test(finalUrl) ||
        Boolean(extractSkid(finalUrl)) ||
        extractReviewIdentityTokens(finalUrl).length > 0;

      let reviewAgeDays = titleReviewSpecific
        ? extractReviewAgeDaysFromText(`${title || ""} ${description || ""}`)
        : null;

      if (reviewAgeDays == null && (titleReviewSpecific || identityPresent)) {
        reviewAgeDays = extractAgeNearIdentity(html, inputUrl, finalUrl);
      }

      const current = {
        httpStatus: response.status,
        finalUrl,
        title,
        description,
        businessName,
        titleReviewSpecific,
        identityPresent,
        resolvedLooksDirect,
        reviewAgeDays,
        reviewId:
          extractSkid(finalUrl) ||
          extractReviewIdentityTokens(finalUrl)[0] ||
          extractReviewIdentityTokens(inputUrl)[0] ||
          null,
        dataId: extractBusinessDataId(finalUrl) || extractBusinessDataId(inputUrl),
        userAgent,
      };

      if (
        !best ||
        (!best.titleReviewSpecific && current.titleReviewSpecific) ||
        (!best.identityPresent && current.identityPresent) ||
        (best.reviewAgeDays == null && current.reviewAgeDays != null)
      ) {
        best = current;
      }

      if (current.titleReviewSpecific && current.reviewAgeDays != null) break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!best && lastError) throw lastError;

  directMetaCache.set(inputUrl, {
    cachedAt: Date.now(),
    value: best,
  });

  return best;
}

// =========================================================
// DIRECT REVIEW URL — FREE PATH (NO SERPAPI)
// =========================================================

export async function getReviewFromDirectUrl(reviewUrl, { force = false } = {}) {
  const inputUrl = normalizeInboundUrl(reviewUrl);
  if (!inputUrl) {
    return {
      found: false,
      reason: "EMPTY_URL",
      review: null,
      businessName: null,
    };
  }

  const meta = await fetchDirectReviewMeta(inputUrl, { force });
  if (!meta) {
    return {
      found: false,
      reason: "DIRECT_REVIEW_META_NOT_AVAILABLE",
      review: null,
      businessName: null,
    };
  }

  // We require review-specific evidence from the fetched page. A mere redirect
  // to /maps/reviews/data= is not enough because a removed review can leave an
  // old share URL behind.
  const visible = Boolean(meta.titleReviewSpecific || meta.identityPresent);

  if (!visible) {
    return {
      found: false,
      reason: meta.resolvedLooksDirect
        ? "DIRECT_REVIEW_NOT_VISIBLE"
        : "NOT_DIRECT_REVIEW_URL",
      review: null,
      businessName: meta.businessName || null,
      placeInfo: null,
      resolvedUrl: meta.finalUrl || inputUrl,
      directMeta: meta,
    };
  }

  return {
    found: true,
    reason: null,
    businessName: meta.businessName || null,
    placeInfo: null,
    resolvedUrl: meta.finalUrl || inputUrl,
    directMeta: meta,
    review: {
      reviewerName: null,
      rating: null,
      text: "",
      reviewText: "",
      dateText: null,
      isoDate: null,
      ageDays:
        meta.reviewAgeDays == null
          ? null
          : Number(meta.reviewAgeDays),
      reviewUrl: meta.finalUrl || inputUrl,
      reviewId: meta.reviewId || null,
      userProfileUrl: null,
      source: "google_direct_page",
    },
  };
}

// =========================================================
// REVIEW AGE HELPERS
// =========================================================

export function getReviewAgeDays(review) {
  if (!review) return null;

  const explicitAge = Number(review.ageDays ?? review.age_days);
  if (Number.isFinite(explicitAge) && explicitAge >= 0) {
    return Math.floor(explicitAge);
  }

  if (review.isoDate || review.iso_date) {
    const published = new Date(review.isoDate || review.iso_date);
    if (!Number.isNaN(published.getTime())) {
      const diffMs = Date.now() - published.getTime();
      if (diffMs >= -DAY_MS) {
        return Math.max(0, Math.floor(diffMs / DAY_MS));
      }
    }
  }

  const relative = [
    review.dateText,
    review.date,
    review.relativeDate,
    review.relative_date,
  ].filter(Boolean).join(" ");

  return extractReviewAgeDaysFromText(relative);
}

export function isRecentReview(review, maxAgeDays = 14) {
  const ageDays = getReviewAgeDays(review);
  return ageDays !== null && ageDays >= 0 && ageDays <= maxAgeDays;
}

export function getRecentReviews(reviews, maxAgeDays = 14) {
  if (!Array.isArray(reviews)) return [];
  return reviews.filter((review) => isRecentReview(review, maxAgeDays));
}

export function getOneStarReviews(reviews) {
  if (!Array.isArray(reviews)) return [];
  return reviews.filter((review) => Number(review.rating) === 1);
}

// =========================================================
// SERPAPI — REACTIVATION ONLY
// =========================================================

function normalizeSerpReview(review) {
  const rating = Number(review?.rating ?? review?.stars ?? 0) || null;
  return {
    reviewerName:
      review?.user?.name ??
      review?.author_name ??
      review?.name ??
      null,
    rating,
    text:
      review?.extracted_snippet?.original ??
      review?.snippet ??
      review?.text ??
      "",
    dateText: review?.date ?? review?.iso_date ?? null,
    isoDate: review?.iso_date ?? null,
    reviewUrl: review?.link ?? review?.review_link ?? null,
    reviewId: review?.review_id ?? null,
    userProfileUrl: review?.user?.link ?? null,
    source: "serpapi_reactivation",
  };
}

export async function getSerpApiQuotaStatus({ force = false } = {}) {
  const apiKey = getSerpApiKey();
  if (!apiKey) {
    throw makeError("Missing SERPAPI_API_KEY", "SERPAPI_KEY_MISSING");
  }

  if (
    !force &&
    serpAccountCache &&
    Date.now() - serpAccountCache.cachedAt < ACCOUNT_TTL_MS
  ) {
    return serpAccountCache.value;
  }

  const endpoint = new URL("https://serpapi.com/account.json");
  endpoint.searchParams.set("api_key", apiKey);

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: { "User-Agent": "GMR-Reactivation/2.2.25" },
  });
  const data = await response.json();

  if (!response.ok || data?.error) {
    throw makeError(
      data?.error || `SerpApi Account API HTTP ${response.status}`,
      "SERPAPI_ACCOUNT_API_ERROR"
    );
  }

  const value = {
    searchesPerMonth: Number(data.searches_per_month ?? 0),
    searchesLeft: Number(data.total_searches_left ?? data.plan_searches_left ?? 0),
    thisMonthUsage: Number(data.this_month_usage ?? 0),
    renewalDate: data.plan_renewal_date || null,
  };

  serpAccountCache = {
    cachedAt: Date.now(),
    value,
  };

  return value;
}

async function fetchReactivationNewestPage(placeId) {
  const apiKey = getSerpApiKey();
  if (!apiKey) {
    throw makeError("Missing SERPAPI_API_KEY", "SERPAPI_KEY_MISSING");
  }

  const reserve = Math.max(
    0,
    Number(process.env.SERPAPI_REACTIVATION_RESERVE_SEARCHES || 10)
  );

  try {
    const quota = await getSerpApiQuotaStatus();
    if (Number.isFinite(quota.searchesLeft) && quota.searchesLeft <= reserve) {
      throw makeError(
        `SerpApi quota guard: ${quota.searchesLeft} searches left (reserve ${reserve})`,
        "SERPAPI_LOW_QUOTA_GUARD"
      );
    }
  } catch (error) {
    if (error?.code === "SERPAPI_LOW_QUOTA_GUARD") throw error;
    // Account API is free. If it is temporarily unavailable, do not burn
    // multiple retries; continue with exactly one review search.
    console.warn("SERPAPI ACCOUNT CHECK FAILED:", error?.message || String(error));
  }

  const params = new URLSearchParams({
    engine: "google_maps_reviews",
    api_key: apiKey,
    place_id: String(placeId),
    sort_by: "newestFirst",
    hl: "en",
  });

  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  const data = await response.json();

  if (!response.ok || data?.error) {
    const message = data?.error || `SerpApi HTTP ${response.status}`;
    const code = /run out of searches|no searches remaining|quota/i.test(message)
      ? "SERPAPI_QUOTA_EXHAUSTED"
      : "SERPAPI_REACTIVATION_ERROR";
    throw makeError(message, code);
  }

  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  return {
    reviews: reviews.map(normalizeSerpReview),
    nextPageToken: data.serpapi_pagination?.next_page_token || null,
    rawCount: reviews.length,
    placeInfo: data.place_info || null,
    source: "serpapi_reactivation",
  };
}

export async function getReactivationNewestReviews(placeId) {
  if (!placeId) {
    throw makeError("Missing placeId", "MISSING_PLACE_ID");
  }
  // Exactly one SerpApi search per map check. No pagination here by design.
  return fetchReactivationNewestPage(placeId);
}

// =========================================================
// GENERIC MAP REVIEW SEARCH — BLOCKED IN V25
// =========================================================

function blockedGenericSerpApiCall(name) {
  throw makeError(
    `${name} is disabled in V2.2.27. SerpApi is reserved for reactivation map watch only.`,
    "SERPAPI_GENERIC_FLOW_DISABLED"
  );
}

export async function getNewestReviews() {
  return blockedGenericSerpApiCall("getNewestReviews");
}

export async function getLowestReviews() {
  return blockedGenericSerpApiCall("getLowestReviews");
}

export function parseGoogleReviewUrl(reviewUrl) {
  const rawUrl = String(reviewUrl || "").trim();
  return {
    dataId: extractBusinessDataId(rawUrl),
    reviewId:
      extractSkid(rawUrl) ||
      extractReviewIdentityTokens(rawUrl)[0] ||
      null,
  };
}
