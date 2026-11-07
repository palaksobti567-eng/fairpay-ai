
import type { InspectionObservations } from "./inspector";
import {
  hasPassedVerification,
  verifyBrowserEvidence,
} from "./verifier";

const exampleObservations: InspectionObservations = {
  finalUrl: "https://example.com/",
  title: "Example Domain",
  https: true,
  headings: ["Example Domain"],
  navigationLinks: [],
  imageCount: 0,
  formCount: 0,
  formFields: [],
  textExcerpt:
    "Example Domain This domain is for use in illustrative examples in documents.",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const mixedCriteria = [
    { id: "criterion-1", text: "The homepage loads over HTTPS." },
    { id: "criterion-2", text: "The homepage displays a visible main heading." },
    { id: "criterion-3", text: "Checkout uses PayPal." },
    { id: "criterion-4", text: "The page includes a contact form." },
  ];

  const mixed = verifyBrowserEvidence({
    criteria: mixedCriteria,
    observations: exampleObservations,
    hasDesktopScreenshot: true,
    hasMobileScreenshot: true,
  });

  assert(
    mixed.criteriaResults.map((result) => result.criterionId).join(",") ===
      mixedCriteria.map((criterion) => criterion.id).join(","),
    "Browser scorer must preserve exact criterion IDs in order"
  );

  const byId = Object.fromEntries(
    mixed.criteriaResults.map((result) => [result.criterionId, result])
  );

  assert(byId["criterion-1"].status === "completed", "HTTPS evidence should complete");
  assert(byId["criterion-2"].status === "completed", "Heading evidence should complete");
  assert(
    byId["criterion-3"].status === "unverified",
    "Unsupported PayPal criterion must stay unverified"
  );
  assert(
    byId["criterion-4"].status === "missing",
    "Missing contact form must be marked missing"
  );
  assert(
    mixed.criteriaResults.some((result) => result.status !== "completed"),
    "Scorer must not mark all criteria completed by default"
  );

  const httpObservations: InspectionObservations = {
    ...exampleObservations,
    finalUrl: "http://example.com/",
    https: false,
  };

  const httpsMissing = verifyBrowserEvidence({
    criteria: [{ id: "criterion-1", text: "The homepage loads over HTTPS." }],
    observations: httpObservations,
    hasDesktopScreenshot: true,
    hasMobileScreenshot: true,
  });

  assert(
    httpsMissing.criteriaResults[0].status === "missing",
    "HTTP pages must fail an HTTPS criterion"
  );

  const freelancerClaimReport = {
    source: "freelancer_claim",
    criteriaSnapshot: mixedCriteria.map((criterion) => ({ id: criterion.id })),
    criteriaResults: mixedCriteria.map((criterion) => ({
      criterionId: criterion.id,
      status: "completed",
    })),
  };

  assert(
    hasPassedVerification(freelancerClaimReport) === false,
    "freelancer_claim reports must not pass verification"
  );

  const incompleteBrowserReport = {
    source: "browser",
    criteriaSnapshot: mixedCriteria.map((criterion) => ({ id: criterion.id })),
    criteriaResults: mixed.criteriaResults,
  };

  assert(
    hasPassedVerification(incompleteBrowserReport) === false,
    "Browser reports with incomplete criteria must not pass"
  );

  const passingCriteria = mixedCriteria.slice(0, 2);
  const passing = verifyBrowserEvidence({
    criteria: passingCriteria,
    observations: exampleObservations,
    hasDesktopScreenshot: true,
    hasMobileScreenshot: true,
  });

  const passingReport = {
    source: "browser",
    criteriaSnapshot: passingCriteria.map((criterion) => ({ id: criterion.id })),
    criteriaResults: passing.criteriaResults,
  };

  assert(
    passing.criteriaResults.every((result) => result.status === "completed"),
    "Directly supported HTTPS and heading criteria should complete"
  );
  assert(
    hasPassedVerification(passingReport) === true,
    "A complete browser report must pass only when every criterion is completed"
  );

  console.log("PASS: Browser-evidence scorer preserves criterion IDs.");
  console.log("PASS: Unsupported criteria remain unverified or missing.");
  console.log("PASS: freelancer_claim reports cannot pass hasPassedVerification.");
  console.log("PASS: Incomplete browser reports cannot pass hasPassedVerification.");
  console.log("PASS: Matching completed browser reports can pass hasPassedVerification.");
}

main();
