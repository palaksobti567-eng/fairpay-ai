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
const entries: Array<[string, any]> = Array.isArray(tools)
  ? tools.map((t: any, i: number) => [t?.name ?? "tool-" + i, t])
  : Object.entries(tools);

console.log("Number of tools:", entries.length);

for (const [name, t] of entries) {
  console.log("-", name, "| fields:", Object.keys(t || {}).join(", "));
  console.log("    has inputSchema:", !!t?.inputSchema,
    "| has parameters:", !!t?.parameters);
}