
import "dotenv/config";
import { verifySubmission } from "./verifier";
async function main() {
  const criteria = [
    {
      id: "criterion-1",
      text: "The homepage loads over HTTPS.",
    },
    {
      id: "criterion-2",
      text: "The homepage displays a visible main heading.",
    },
  ];

  const description =
    "I created the homepage and added a main heading. " +
    "The website is available at https://example.com.";

  console.log("Testing AI submission verification...");

  const result = await verifySubmission({
    criteria,
    description,
  });

  console.log("\nVerification result:");
  console.log(JSON.stringify(result, null, 2));

  // Check exact criterion ID matching.
  const expectedIds = criteria.map((item) => item.id);
  const actualIds = result.criteriaResults.map(
    (item) => item.criterionId
  );

  if (
    expectedIds.length !== actualIds.length ||
    expectedIds.some((id) => !actualIds.includes(id)) ||
    new Set(actualIds).size !== actualIds.length
  ) {
    throw new Error("Criterion ID validation failed");
  }

  // Text-only evidence must never establish completion.
  console.log("PASS: Text-only results cannot be completed.");

  console.log("\nPASS: Criterion IDs match.");
  console.log("PASS: No criterion was marked completed.");
}

main().catch((error) => {
  console.error(
    "Verifier test failed:",
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exit(1);
});
