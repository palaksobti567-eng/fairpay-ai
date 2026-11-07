import {
  assertSafeUrl,
  UnsafeUrlError,
} from "../src/utils/urlSafety";

const goodUrls = [
  "https://example.com",
  "https://www.google.com",
  "https://1.1.1.1",
  "https://[2606:4700:4700::1111]",
];

const badUrls = [
  "http://example.com",
  "https://localhost",
  "https://127.0.0.1",
  "https://10.0.0.1",
  "https://192.168.1.1",
  "https://172.16.0.1",
  "https://169.254.169.254",
  "https://[::1]",
  "https://[fc00::1]",
  "https://[fe80::1]",
  "https://user:password@example.com",
  "https://2130706433",
  "https://0177.0.0.1",
  "https://example.local",
  "https://@example.com",
  "https://intranet",
  "https://[3fff::1]",
  "https://[2001:db8::1]",
  "https://[::ffff:127.0.0.1]",
];

async function main() {
  console.log("\n--- SAFE URL TESTS ---");

  for (const url of goodUrls) {
    try {
      await assertSafeUrl(url);
      console.log("PASS:", url);
    } catch {
      console.log("FAIL: Safe URL rejected:", url);
      process.exitCode = 1;
    }
  }

  console.log("\n--- UNSAFE URL TESTS ---");

  for (const url of badUrls) {
    try {
      await assertSafeUrl(url);
      console.log("FAIL: Unsafe URL accepted:", url);
      process.exitCode = 1;
    } catch (error) {
      if (error instanceof UnsafeUrlError &&
          error.code === "UNSAFE_URL") {
        console.log("PASS: Rejected:", url);
      } else {
        console.log("FAIL: Unexpected error:", url);
        process.exitCode = 1;
      }
    }
  }

  if (process.exitCode === 1) {
    console.log("\nSome tests failed.");
  } else {
    console.log("\nAll URL safety tests passed.");
  }
}

main().catch(() => {
  console.error("URL safety test could not complete.");
  process.exitCode = 1;
});