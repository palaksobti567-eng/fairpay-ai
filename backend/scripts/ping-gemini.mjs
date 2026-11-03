import "dotenv/config";

const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const model = process.env.GEMINI_MODEL;
const start = Date.now();

try {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply with the single word: ok" }] }],
      }),
      signal: AbortSignal.timeout(60000),
    }
  );
  const data = await res.json();
  console.log("status", res.status, "time(ms)", Date.now() - start);
  console.log(JSON.stringify(data).slice(0, 400));
} catch (e) {
  console.log("ERR", e.cause?.code || e.name, "time(ms)", Date.now() - start);
}