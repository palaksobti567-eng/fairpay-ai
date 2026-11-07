
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { inspectWebsite } from "../src/services/inspector";

async function main() {
  console.log("Testing public website inspection...");

  const result = await inspectWebsite("https://example.com");

  console.log("Status:", result.status);

  if (result.status !== "success" || !result.observations) {
    console.log("Error code:", result.errorCode);
    process.exitCode = 1;
    return;
  }

  console.log("Title:", result.observations.title);
  console.log("HTTPS:", result.observations.https);
  console.log("Headings:", result.observations.headings);
  console.log("Images:", result.observations.imageCount);
  console.log("Forms:", result.observations.formCount);

  mkdirSync("scripts/out", { recursive: true });

  if (result.screenshots.desktop) {
    writeFileSync(
      "scripts/out/inspection-desktop.png",
      result.screenshots.desktop
    );
  }

  if (result.screenshots.mobile) {
    writeFileSync(
      "scripts/out/inspection-mobile.png",
      result.screenshots.mobile
    );
  }

  console.log("Screenshots saved to scripts/out");

  console.log("Testing unsafe URL rejection...");

  const unsafe = await inspectWebsite(
    "http://169.254.169.254/latest/meta-data/"
  );

  if (
    unsafe.status !== "failed" ||
    unsafe.errorCode !== "UNSAFE_URL"
  ) {
    throw new Error("Unsafe URL test failed");
  }

  console.log("Unsafe URL correctly rejected.");
}

main().catch(() => {
  console.error("Inspector test failed.");
  process.exitCode = 1;
});
