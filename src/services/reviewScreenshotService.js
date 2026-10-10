import puppeteer from "puppeteer";


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
