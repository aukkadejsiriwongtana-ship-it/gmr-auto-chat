import { createClient } from "@supabase/supabase-js";
import { Resvg } from "@resvg/resvg-js";
import crypto from "crypto";
import { readFile } from "node:fs/promises";



const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const REVIEW_BUCKET =
  "gmr-review-evidence";

const THAI_FONT_PATH =
  new URL(
    "../../node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff2",
    import.meta.url
  );

if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error(
    "Missing Supabase configuration for review evidence"
  );
}


const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );


// =========================================================
// XML / SVG SAFE TEXT
// =========================================================

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


// =========================================================
// WRAP TEXT
// =========================================================

function wrapText(
  text,
  maxCharacters = 38,
  maxLines = 7
) {
  const normalized =
    String(text || "")
      .replace(/\s+/g, " ")
      .trim();

  if (!normalized) {
    return [
      "ไม่มีข้อความรีวิว",
    ];
  }


  const lines = [];

  let remaining =
    normalized;


  while (
    remaining.length > 0 &&
    lines.length < maxLines
  ) {

    if (
      remaining.length <=
      maxCharacters
    ) {
      lines.push(
        remaining
      );

      remaining =
        "";

      break;
    }


    let cutAt =
      maxCharacters;


    const lastSpace =
      remaining.lastIndexOf(
        " ",
        maxCharacters
      );


    if (
      lastSpace >
      Math.floor(
        maxCharacters * 0.5
      )
    ) {
      cutAt =
        lastSpace;
    }


    const line =
      remaining
        .slice(
          0,
          cutAt
        )
        .trim();


    lines.push(
      line
    );


    remaining =
      remaining
        .slice(
          cutAt
        )
        .trim();
  }


  if (
    remaining &&
    lines.length === maxLines
  ) {
    const lastIndex =
      lines.length - 1;

    lines[lastIndex] =
      lines[lastIndex]
        .slice(
          0,
          Math.max(
            0,
            maxCharacters - 3
          )
        ) +
      "...";
  }


  return lines;
}

// =========================================================
// CREATE REVIEW CARD PNG
// =========================================================

export async function createReviewEvidenceImage({
  businessName,
  reviewerName,
  rating,
  reviewText,
  reviewDateText,
  index = 1,
}) {

  const safeBusinessName =
    escapeXml(
      businessName ||
      "Google Map"
    );

  const safeReviewerName =
    escapeXml(
      reviewerName ||
      "ไม่ทราบชื่อ"
    );


  const numericRating =
    Math.max(
      1,
      Math.min(
        5,
        Number(rating) || 1
      )
    );


  const stars =
    "★".repeat(
      numericRating
    ) +
    "☆".repeat(
      5 - numericRating
    );


  const safeDate =
    escapeXml(
      reviewDateText ||
      ""
    );


  const reviewLines =
    wrapText(
      reviewText,
      46,
      7
    );


  const reviewTextSvg =
    reviewLines
      .map(
        (line, lineIndex) =>
          `
          <text
            x="70"
            y="${350 + lineIndex * 58}"
            font-size="34"
            fill="#202124"
            font-family="Noto Sans Thai"
          >
            ${escapeXml(line)}
          </text>
          `
      )
      .join("");


  const svg =
  `
  <svg
    width="1080"
    height="1080"
    xmlns="http://www.w3.org/2000/svg"
  >

  

      <rect
        width="1080"
        height="1080"
        fill="#f5f5f5"
      />


      <rect
        x="45"
        y="45"
        width="990"
        height="990"
        rx="30"
        fill="#ffffff"
      />


      <text
        x="70"
        y="115"
        font-size="30"
        fill="#5f6368"
        font-family="Noto Sans Thai"
      >
        REVIEW #${index}
      </text>


      <text
        x="70"
        y="175"
        font-size="40"
        font-weight="700"
        fill="#202124"
        font-family="Noto Sans Thai"
      >
        ${safeBusinessName}
      </text>


      <line
        x1="70"
        y1="215"
        x2="1010"
        y2="215"
        stroke="#dadce0"
        stroke-width="2"
      />


      <circle
        cx="115"
        cy="280"
        r="38"
        fill="#e8eaed"
      />


      <text
        x="175"
        y="270"
        font-size="34"
        font-weight="700"
        fill="#202124"
        font-family="Noto Sans Thai"
      >
        ${safeReviewerName}
      </text>


      <text
        x="175"
        y="315"
        font-size="31"
        fill="#f9ab00"
        font-family="Noto Sans Thai"
      >
        ${stars}
      </text>


      <text
        x="390"
        y="315"
        font-size="25"
        fill="#5f6368"
        font-family="Noto Sans Thai"
      >
        ${safeDate}
      </text>


      ${reviewTextSvg}


      <line
        x1="70"
        y1="900"
        x2="1010"
        y2="900"
        stroke="#dadce0"
        stroke-width="2"
      />


      <text
        x="70"
        y="965"
        font-size="26"
        fill="#5f6368"
        font-family="Noto Sans Thai"
      >
        เก็บไว้เป็นหลักฐานก่อนดำเนินการ
      </text>

    </svg>
    `;


 const fontPath =
  THAI_FONT_PATH.pathname;


const resvg =
  new Resvg(
    svg,
    {
      font: {
        loadSystemFonts:
          false,

        fontFiles: [
          fontPath,
        ],

        defaultFontFamily:
          "Noto Sans Thai",
      },
    }
  );


const rendered =
  resvg.render();


const pngBuffer =
  rendered.asPng();


return pngBuffer;


// =========================================================
// UPLOAD REVIEW CARD
// =========================================================

export async function uploadReviewEvidence({
  buffer,
  customerId,
  jobId,
  reviewId = null,
  index = 1,
}) {

  if (!buffer) {
    throw new Error(
      "Missing review evidence buffer"
    );
  }


  const randomId =
    crypto
      .randomBytes(8)
      .toString("hex");


  const filePath =
    [
      String(customerId),
      String(jobId),
      `${index}-${reviewId || randomId}-${Date.now()}.png`,
    ].join("/");


  const {
    error:
      uploadError,
  } =
    await supabase
      .storage
      .from(
        REVIEW_BUCKET
      )
      .upload(
        filePath,
        buffer,
        {
          contentType:
            "image/png",

          upsert:
            false,
        }
      );


  if (uploadError) {
    throw uploadError;
  }


  return {
    filePath,
  };
}


// =========================================================
// CREATE TEMP SIGNED URL FOR LINE
// =========================================================

export async function createReviewEvidenceSignedUrl(
  filePath
) {

  if (!filePath) {
    throw new Error(
      "Missing review evidence filePath"
    );
  }


  const {
    data,
    error,
  } =
    await supabase
      .storage
      .from(
        REVIEW_BUCKET
      )
      .createSignedUrl(
        filePath,

        // 24 ชั่วโมง
        60 * 60 * 24
      );


  if (error) {
    throw error;
  }


  if (
    !data?.signedUrl
  ) {
    throw new Error(
      "Review evidence signed URL not created"
    );
  }


  return (
    data.signedUrl
  );
}
