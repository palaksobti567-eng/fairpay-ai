import "dotenv/config";
import { generateMilestones } from "../src/services/milestoneGenerator";

async function main() {
  const result = await generateMilestones({
    description: "A 3-page portfolio website for a photographer with a contact form.",
    totalBudget: 300,
    currency: "USD",
  });

  console.log(JSON.stringify(result, null, 2));
  const total = result.reduce((sum, m) => sum + Math.round(m.amount * 100), 0) / 100;
  console.log("Total:", total);
}

main().catch((err) => {
  console.error("Service test failed:", err.code ?? err.name, err.message);
  process.exit(1);
});
