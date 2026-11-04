

import "dotenv/config";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs, tool, zodSchema } from "ai";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

async function main() {
  // 1. Load and validate environment variables.
  const modelId = process.env.GEMINI_MODEL;
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!modelId || !apiKey || !clientId || !clientSecret) {
    throw new Error("Required Gemini or PayPal environment variable is missing.");
  }

  // 2. Initialize Gemini.
  const gemini = createGoogleGenerativeAI({ apiKey });

  // 3. Initialize PayPal in Sandbox mode.
  const toolkit = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: {
      actions: {
        orders: { create: true, get: true },
      },
      context: { sandbox: true },
    },
  });

  const paypalTools = toolkit.getTools();
  const paypalCreateOrder = paypalTools.create_order;

  if (!paypalCreateOrder.execute) {
    throw new Error("PayPal create_order execution is unavailable.");
  }

  // 4. Prevent duplicate execution within this run.
  let orderCreationAttempted = false;

  // 5. Define the restricted PayPal tool.
  const createOrderTool = tool({
    description:
      "Prepare exactly one fixed $10 USD PayPal Sandbox test order.",

    inputSchema: zodSchema(paypalCreateOrder.parameters),

    execute: async (input) => {
      if (orderCreationAttempted) {
        throw new Error("Duplicate order creation blocked.");
      }

      // Validate the toolkit's original schema.
      const parsed = paypalCreateOrder.parameters.parse(input);

      // Enforce the fixed test order.
      if (
        parsed.currencyCode !== "USD" ||
        parsed.items.length !== 1 ||
        parsed.items[0].name !== "Test Product" ||
        parsed.items[0].itemCost !== 10 ||
        parsed.items[0].itemTotal !== 10 ||
        (parsed.items[0].quantity ?? 1) !== 1 ||
        (parsed.discount ?? 0) !== 0 ||
        (parsed.shippingCost ?? 0) !== 0
      ) {
        throw new Error("Order does not match the approved $10 test.");
      }

      console.log("\nValidated order:");
      console.log("Product: Test Product");
      console.log("Quantity: 1");
      console.log("Amount: 10 USD");
      console.log("Environment: PayPal Sandbox");

      // 6. Require explicit human approval.
      const rl = createInterface({
        input: stdin,
        output: stdout,
      });

      let answer: string;

      try {
        answer = await rl.question(
          "\nCreate this Sandbox order? Type YES to continue: "
        );
      } finally {
        rl.close();
      }

      if (answer.trim() !== "YES") {
        throw new Error("Order creation cancelled.");
      }

      // Mark before making the network request.
      // This prevents another attempt in the same process.
      orderCreationAttempted = true;

      console.log("\nCreating PayPal Sandbox order...");

      return await paypalCreateOrder.execute!(parsed, {
        toolCallId: "fairpay-sandbox-create-order",
        messages: [],
      });
    },
  });

  // 7. Ask Gemini to generate the order request.
  const result = await generateText({
    model: gemini(modelId),

    tools: {
      create_order: createOrderTool,
    },

    toolChoice: {
      type: "tool",
      toolName: "create_order",
    },

    stopWhen: stepCountIs(1),

    prompt:
      "Prepare exactly one PayPal Sandbox order with currency USD. " +
      "Include exactly one item named Test Product, quantity 1, " +
      "itemCost 10, itemTotal 10, discount 0, and shippingCost 0. " +
      "Do not request any additional orders.",
  });

  // 8. Display the result.
  console.log("\nGemini response:");
  console.log(result.text);

  console.log("\nTool calls:");
  console.dir(result.toolCalls, { depth: 4 });

  console.log("\nTool results:");
  console.dir(result.toolResults, { depth: 4 });

  console.log("\nSandbox integration test finished.");
}

main().catch((error) => {
  console.error("\nPayPal-Gemini test failed:", error);
  process.exit(1);
});
