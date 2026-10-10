import puppeteer from "puppeteer";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const THAI_FONT_PATH =
  fileURLToPath(
    new URL(
      "../assets/fonts/NotoSansThai-Regular.ttf",
      import.meta.url
    )
  );

// =========================================================
// GOOGLE REVIEW SCREENSHOT
// =========================================================

export async function createReviewScreenshot({
  reviewUrl,
}) {

  if (!reviewUrl) {
    throw new Error(
      "Missing reviewUrl for screenshot"
    );
  }


  let browser =
    null;


  try {

    browser =
      await puppeteer.launch({
        headless:
          true,

        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });


    const page =
      await browser.newPage();


    // ให้หน้าตาใกล้ Google Maps บนมือถือ
    await page.setViewport({
      width:
        1170,

      height:
        1600,

      deviceScaleFactor:
        1,
    });


    await page.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
    );


    console.log(
      "REVIEW SCREENSHOT OPEN:",
      reviewUrl
    );


    await page.goto(
      reviewUrl,
      {
        waitUntil:
          "networkidle2",

        timeout:
          45000,
      }
    );

    // =========================================================
// FORCE THAI FONT IN GOOGLE MAPS PAGE
// =========================================================

const thaiFontBuffer =
  await readFile(
    THAI_FONT_PATH
  );


const thaiFontBase64 =
  thaiFontBuffer.toString(
    "base64"
  );


await page.addStyleTag({
  content: `
    @font-face {
      font-family: "NotoSansThaiLocal";
      src: url("data:font/ttf;base64,${thaiFontBase64}")
        format("truetype");
      font-weight: 100 900;
      font-style: normal;
    }

    html,
    body,
    body * {
      font-family:
        "NotoSansThaiLocal",
        Arial,
        sans-serif !important;
    }
  `,
});


console.log(
  "THAI FONT INJECTED INTO GOOGLE MAPS"
);


    // รอ Google render หน้ารีวิว
    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          3500
        )
    );


    // ปิด consent / cookie ถ้ามี
    const possibleButtons = [
      "Accept all",
      "I agree",
      "ยอมรับทั้งหมด",
      "ยอมรับ",
    ];


    for (
      const buttonText
      of possibleButtons
    ) {

      try {

        const clicked =
          await page.evaluate(
            (text) => {

              const elements =
                Array.from(
                  document.querySelectorAll(
                    "button"
                  )
                );


              const button =
                elements.find(
                  (element) =>
                    element
                      .innerText
                      ?.trim() ===
                    text
                );


              if (!button) {
                return false;
              }


              button.click();

              return true;
            },
            buttonText
          );


        if (clicked) {

          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                1500
              )
          );

          break;
        }

      } catch (error) {

        console.log(
          "REVIEW CONSENT BUTTON SKIP:",
          error?.message
        );
      }
    }

// =========================================================
// ปิด popup "Upgrade to a smarter Google Maps"
// =========================================================

try {

  const mapsPopupClosed =
    await page.evaluate(
      () => {

        const elements =
          Array.from(
            document.querySelectorAll(
              'button, a, [role="button"]'
            )
          );


        const target =
          elements.find(
            (element) => {

              const text =
                String(
                  element.innerText ||
                  element.textContent ||
                  ""
                )
                  .trim()
                  .toLowerCase();


              return (
                text.includes(
                  "go back to web"
                ) ||
                text.includes(
                  "back to web"
                ) ||
                text.includes(
                  "กลับไปใช้เว็บ"
                )
              );
            }
          );


        if (!target) {
          return false;
        }


        target.click();

        return true;
      }
    );


  console.log(
    "GOOGLE MAPS POPUP CLOSED:",
    mapsPopupClosed
  );


  if (mapsPopupClosed) {

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          2000
        )
    );

  }

} catch (error) {

  console.log(
    "GOOGLE MAPS POPUP CLOSE SKIPPED:",
    error?.message
  );

}
    
    // เลื่อนลงเล็กน้อยเพื่อตัด browser/header ส่วนเกิน
    await page.evaluate(
      () => {
        window.scrollTo(
          0,
          120
        );
      }
    );


    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          1000
        )
    );


    const screenshotBuffer =
      await page.screenshot({
        type:
          "png",

        fullPage:
          false,
      });


    console.log(
      "REVIEW SCREENSHOT CREATED:",
      {
        bytes:
          screenshotBuffer.length,
      }
    );


    return screenshotBuffer;

  } finally {

    if (browser) {

      await browser.close();

    }
  }
}
