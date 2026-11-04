import "dotenv/config";
import readline from "readline";

const BASE = "https://api-m.sandbox.paypal.com";
const clientId = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;

async function getToken() {
  const auth = Buffer.from(clientId + ":" + secret).toString("base64");
  const res = await fetch(BASE + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error("Token error " + res.status + ": " + JSON.stringify(data));
  return data.access_token as string;
}

async function createOrder(token: string) {
  const res = await fetch(BASE + "/v2/checkout/orders", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "PayPal-Request-Id": "fairpay-test-create-" + Date.now(),
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: "USD", value: "10.00" } }],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: "https://example.com/return",
            cancel_url: "https://example.com/cancel",
            user_action: "PAY_NOW",
          },
        },
      },
    }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error("Create order error " + res.status + ": " + JSON.stringify(data));
  return data;
}

async function captureOrder(token: string, orderId: string) {
  const res = await fetch(BASE + "/v2/checkout/orders/" + orderId + "/capture", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "PayPal-Request-Id": "fairpay-test-capture-" + orderId,
    },
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error("Capture error " + res.status + ": " + JSON.stringify(data));
  return data;
}

function waitForEnter(question: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<void>((resolve) => rl.question(question, () => { rl.close(); resolve(); }));
}

async function main() {
  if (!clientId || !secret) throw new Error("PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is missing in .env");

  const token = await getToken();
  console.log("1. Got access token (sandbox).");

  const order = await createOrder(token);
  console.log("2. Order created:", order.id, "status:", order.status);

  const link = (order.links || []).find((l: any) => l.rel === "approve" || l.rel === "payer-action");
  if (!link) throw new Error("No approval link found: " + JSON.stringify(order.links));
  console.log("3. Open this link in your browser and approve with the SANDBOX PERSONAL account:");
  console.log(link.href);

  await waitForEnter("After approving, press Enter here to capture the payment... ");

  const capture = await captureOrder(token, order.id);
  const cap = capture.purchase_units?.[0]?.payments?.captures?.[0];
  console.log("4. Capture status:", capture.status);
  console.log("   Capture id:", cap?.id, "amount:", cap?.amount?.value, cap?.amount?.currency_code);
}

main().catch((err) => {
  console.error("PayPal test failed:", err);
  process.exit(1);
});