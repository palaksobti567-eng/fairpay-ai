import "dotenv/config";
import Kernel from "@onkernel/sdk";
import { writeFileSync, mkdirSync } from "fs";

const TARGET_URL = "https://example.com";

async function main() {
  if (!process.env.KERNEL_API_KEY) {
    throw new Error("KERNEL_API_KEY is missing in .env");
  }

  const kernel = new Kernel();
  mkdirSync("scripts/out", { recursive: true });

  console.log("Starting cloud browser...");
  const session = await kernel.browsers.create({ timeout_seconds: 300 });

  try {
    const shots: Array<[string, number, number]> = [
      ["desktop", 1280, 800],
      ["mobile", 390, 844],
    ];

    for (const [name, width, height] of shots) {
      const response = await kernel.browsers.playwright.execute(
        session.session_id,
        {
          code: `
            await page.setViewportSize({ width: ${width}, height: ${height} });
            await page.goto(${JSON.stringify(TARGET_URL)}, { waitUntil: "domcontentloaded" });
            const title = await page.title();
            const shot = await page.screenshot({ type: "png" });
            return { title, image: shot.toString("base64") };
          `,
        }
      );

      const result = response.result as { title: string; image: string };
      writeFileSync(`scripts/out/${name}.png`, Buffer.from(result.image, "base64"));
      console.log(`${name}: page title = "${result.title}", saved scripts/out/${name}.png`);
    }
  } finally {
    await kernel.browsers.deleteByID(session.session_id);
    console.log("Browser session closed.");
  }
}

main().catch((err) => {
  console.error("KERNEL test failed:", err);
  process.exit(1);
});