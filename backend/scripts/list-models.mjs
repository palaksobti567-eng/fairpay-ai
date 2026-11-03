import "dotenv/config";

const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!key) {
  console.log("API key is missing in .env");
  process.exit(1);
}

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`
);
const data = await res.json();

if (!res.ok) {
  console.log("Error:", res.status, data.error?.message);
  process.exit(1);
}

for (const m of data.models) {
  if (m.supportedGenerationMethods?.includes("generateContent")) {
    console.log(m.name.replace("models/", ""));
  }
}