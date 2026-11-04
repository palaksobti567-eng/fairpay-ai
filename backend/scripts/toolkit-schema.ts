import "dotenv/config";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";

const toolkit = new PayPalAgentToolkit({
  clientId: process.env.PAYPAL_CLIENT_ID as string,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET as string,
  configuration: {
    actions: {
      orders: { create: true, get: true },
    },
    context: { sandbox: true },
  },
});

const tools: any = toolkit.getTools();

for (const [name, tool] of Object.entries(tools as Record<string, any>)) {
  console.log("\nTOOL:", name);

  const schema = tool.parameters;
  const shape = schema.shape;

  console.log("Schema type:", schema.constructor.name);
  console.log("Input fields:", Object.keys(shape || {}));

  for (const [field, fieldSchema] of Object.entries(shape || {}) as any) {
    console.log(
      "Field:", field,
      "| Type:", fieldSchema.constructor.name,
      "| Optional:", fieldSchema.isOptional()
    );
  }
}