
import "dotenv/config";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  throw new Error("PayPal credentials are missing from environment variables.");
}

const toolkit = new PayPalAgentToolkit({
  clientId,
  clientSecret,
  configuration: {
    actions: {
      orders: {
        create: true,
        get: true,
        capture: true,
      },
    },
    context: {
      sandbox: true,
    },
  },
});

const tools: any = toolkit.getTools();

for (const [name, tool] of Object.entries(
  tools as Record<string, any>
)) {
  console.log("\n================================");
  console.log("TOOL:", name);
  console.log("================================");

  const schema = tool.parameters;
  const shape = schema?.shape;

  console.log("Schema type:", schema?.constructor?.name);
  console.log("Input fields:", Object.keys(shape || {}));

  for (const [field, fieldSchema] of Object.entries(
    shape || {}
  ) as [string, any][]) {
    console.log(
      "Field:", field,
      "| Type:", fieldSchema?.constructor?.name,
      "| Optional:", fieldSchema?.isOptional?.()
    );
  }
}