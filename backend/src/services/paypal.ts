
import "dotenv/config";

const PAYPAL_BASE_URL =
  process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

export interface CreatePayPalOrderInput {
  amount: number;
  currency: string;
  requestId: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface PayPalOrder {
  id: string;
  status: string;
  links?: {
    href: string;
    rel: string;
    method: string;
  }[];
  purchase_units?: {
    amount?: {
      value: string;
      currency_code: string;
    };
    payments?: {
      captures?: {
        id: string;
        status: string;
        amount: {
          value: string;
          currency_code: string;
        };
      }[];
    };
  }[];
}

class PayPalError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

async function paypalRequest<T>(
  path: string,
  options: RequestInit
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${PAYPAL_BASE_URL}${path}`, options);
  } catch {
    throw new PayPalError("Unable to reach PayPal. Payment status must be reconciled.");
  }

  let data: any;

  try {
    data = await response.json();
  } catch {
    throw new PayPalError("PayPal returned an invalid response.", response.status);
  }

  if (!response.ok) {
    throw new PayPalError(
      `PayPal request failed with status ${response.status}.`,
      response.status
    );
  }

  return data as T;
}

export async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !secret) {
    throw new PayPalError("PayPal credentials are not configured.");
  }

  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");

  const data = await paypalRequest<{ access_token: string }>(
    "/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }
  );

  if (!data.access_token) {
    throw new PayPalError("PayPal did not return an access token.");
  }

  return data.access_token;
}

export async function createPayPalOrder(
  input: CreatePayPalOrderInput
): Promise<PayPalOrder> {
  const token = await getPayPalAccessToken();

  const amount = input.amount.toFixed(2);

  return paypalRequest<PayPalOrder>("/v2/checkout/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": input.requestId,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: input.currency.toUpperCase(),
            value: amount,
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
            user_action: "PAY_NOW",
          },
        },
      },
    }),
  });
}

export async function getPayPalOrder(
  orderId: string
): Promise<PayPalOrder> {
  const token = await getPayPalAccessToken();

  return paypalRequest<PayPalOrder>(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
}

export interface WebhookHeaders {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
}

export async function verifyPayPalWebhookSignature(input: {
  headers: WebhookHeaders;
  webhookEvent: unknown;
}): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new PayPalError("PayPal webhook ID is not configured.");
  }

  const token = await getPayPalAccessToken();

  const data = await paypalRequest<{ verification_status: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: input.headers.authAlgo,
        cert_url: input.headers.certUrl,
        transmission_id: input.headers.transmissionId,
        transmission_sig: input.headers.transmissionSig,
        transmission_time: input.headers.transmissionTime,
        webhook_id: webhookId,
        webhook_event: input.webhookEvent,
      }),
    }
  );

  return data.verification_status === "SUCCESS";
}

export async function capturePayPalOrder(
  orderId: string,
  requestId: string
): Promise<PayPalOrder> {
  const token = await getPayPalAccessToken();

  return paypalRequest<PayPalOrder>(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId,
      },
      body: JSON.stringify({}),
    }
  );
}
