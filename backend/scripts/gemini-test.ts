import "dotenv/config";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";

const milestoneSchema = z.object({
  milestones: z.array(
    z.object({
      title: z.string(),
      amount: z.number(),
      acceptanceCriteria: z.array(z.string()),
    })
  ),
});

async function main() {
  const modelId = process.env.GEMINI_MODEL;
  if (!modelId) {
    throw new Error("GEMINI_MODEL is missing in .env");
  }

  console.log("Calling Gemini with model:", modelId);

  const { output } = await generateText({
    model: google(modelId),
    abortSignal: AbortSignal.timeout(30000),
    output: Output.object({ schema: milestoneSchema }),
    prompt:
      "A client wants a 3-page portfolio website for a photographer, budget 300 USD. " +
      "Split the budget across milestones. The amounts must add up to 300.",
  });

  console.log(JSON.stringify(output, null, 2));

  const total = output.milestones.reduce((sum, m) => sum + m.amount, 0);
  console.log("Total of amounts:", total);
}

main().catch((err) => {
  console.error("Gemini test failed:", err);
  process.exit(1);
});