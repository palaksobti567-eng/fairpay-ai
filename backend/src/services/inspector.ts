
import "dotenv/config";
import Kernel from "@onkernel/sdk";
import { assertSafeUrl, UnsafeUrlError } from "../utils/urlSafety";

export type InspectionStatus = "success" | "failed";

export interface InspectionObservations {
  finalUrl: string;
  title: string;
  https: boolean;
  headings: string[];
  navigationLinks: string[];
  imageCount: number;
  formCount: number;
  formFields: string[];
  textExcerpt: string;
}

export interface InspectionResult {
  status: InspectionStatus;
  observations: InspectionObservations | null;
  screenshots: {
    desktop: Buffer | null;
    mobile: Buffer | null;
  };
  errorCode?: "UNSAFE_URL" | "INSPECTION_FAILED";
}

const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;

function decodeScreenshot(value: unknown): Buffer {
  if (typeof value !== "string") {
    throw new Error("Invalid screenshot");
  }

  const buffer = Buffer.from(value, "base64");

  if (
    buffer.length === 0 ||
    buffer.length > MAX_SCREENSHOT_BYTES ||
    buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  ) {
    throw new Error("Invalid screenshot");
  }

  return buffer;
}

function failed(
  errorCode: "UNSAFE_URL" | "INSPECTION_FAILED"
): InspectionResult {
  return {
    status: "failed",
    observations: null,
    screenshots: {
      desktop: null,
      mobile: null,
    },
    errorCode,
  };
}

export async function inspectWebsite(
  submittedUrl: string
): Promise<InspectionResult> {
  let safeUrl: URL;

  try {
    safeUrl = await assertSafeUrl(submittedUrl);
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return failed("UNSAFE_URL");
    }
    return failed("INSPECTION_FAILED");
  }

  if (!process.env.KERNEL_API_KEY) {
    return failed("INSPECTION_FAILED");
  }

  const kernel = new Kernel();
  let sessionId: string | undefined;

  try {
    const session = await kernel.browsers.create({
      timeout_seconds: 90,
      headless: true,
      network: {
        allowed_hosts: [safeUrl.hostname],
        private_hosts: [],
      },
    });

    sessionId = session.session_id;

    const response = await kernel.browsers.playwright.execute(sessionId, {
      code: `
        const targetUrl = ${JSON.stringify(safeUrl.toString())};
        const expectedOrigin = ${JSON.stringify(safeUrl.origin)};

        await page.setDefaultTimeout(10000);
        await page.setViewportSize({ width: 1280, height: 800 });

        await page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: 20000
        });

        const finalUrl = page.url();
        const parsedFinal = new URL(finalUrl);

        if (
          parsedFinal.protocol !== "https:" ||
          parsedFinal.origin !== expectedOrigin
        ) {
          throw new Error("Unsafe redirect");
        }

        const observations = await page.evaluate(() => {
          const clean = (value, limit) =>
            String(value || "")
              .replace(/\\s+/g, " ")
              .trim()
              .slice(0, limit);

          return {
            finalUrl: location.href,
            title: clean(document.title, 200),
            https: location.protocol === "https:",
            headings: Array.from(document.querySelectorAll("h1"))
              .slice(0, 10)
              .map(el => clean(el.textContent, 150)),
            navigationLinks: Array.from(
              document.querySelectorAll("nav a[href]")
            )
              .slice(0, 20)
              .map(el => clean(el.textContent, 100)),
            imageCount: Math.min(
              document.querySelectorAll("img").length,
              10000
            ),
            formCount: Math.min(
              document.querySelectorAll("form").length,
              1000
            ),
            formFields: Array.from(
              document.querySelectorAll(
                "input[name], textarea[name], select[name]"
              )
            )
              .slice(0, 30)
              .map(el => clean(el.getAttribute("name"), 80)),
            textExcerpt: clean(
              document.body?.innerText,
              3000
            )
          };
        });

        if (
          observations.finalUrl !== finalUrl ||
          page.url() !== finalUrl
        ) {
          throw new Error("Page navigated during inspection");
        }

        const desktop = (
          await page.screenshot({
            type: "png",
            animations: "disabled",
            timeout: 10000
          })
        ).toString("base64");

        await page.setViewportSize({ width: 390, height: 844 });

        if (page.url() !== finalUrl) {
          throw new Error("Page navigated during inspection");
        }

        const mobile = (
          await page.screenshot({
            type: "png",
            animations: "disabled",
            timeout: 10000
          })
        ).toString("base64");

        if (page.url() !== finalUrl) {
          throw new Error("Page navigated during inspection");
        }

        return { observations, desktop, mobile };
      `,
    });

    if (response.success === false || !response.result) {
      return failed("INSPECTION_FAILED");
    }

    const result = response.result as {
      observations: InspectionObservations;
      desktop: string;
      mobile: string;
    };

    const observations = result.observations;

    if (
      !observations ||
      typeof observations.finalUrl !== "string" ||
      typeof observations.title !== "string" ||
      typeof observations.textExcerpt !== "string"
    ) {
      return failed("INSPECTION_FAILED");
    }

    // Recheck the reported final URL using the original safety validator.
    const finalSafeUrl = await assertSafeUrl(observations.finalUrl);

    if (finalSafeUrl.origin !== safeUrl.origin) {
      return failed("INSPECTION_FAILED");
    }

    return {
      status: "success",
      observations,
      screenshots: {
        desktop: decodeScreenshot(result.desktop),
        mobile: decodeScreenshot(result.mobile),
      },
    };
  } catch {
    // Never expose raw Kernel errors or page content.
    return failed("INSPECTION_FAILED");
  } finally {
    if (sessionId) {
      try {
        await kernel.browsers.deleteByID(sessionId);
      } catch {
        // Cleanup failure must not expose provider details.
      }
    }
  }
}
