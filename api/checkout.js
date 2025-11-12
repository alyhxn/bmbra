import crypto from "crypto";
import { createDraftOrderFromCheckout } from "./helpers/draftOrder.js";

// Tell Vercel not to parse the body automatically
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to read raw body
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function verifyWebhook(rawBody, hmacHeader) {
  const hash = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("base64");

  console.log("Computed hash:", hash, hmacHeader);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const rawBody = await getRawBody(req);
  const hmacHeader = req.headers["x-shopify-hmac-sha256"];

  if (!verifyWebhook(rawBody, hmacHeader)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const checkout = JSON.parse(rawBody.toString("utf8"));
  console.log("Checkout received:", checkout);

  // Respond quickly to Shopify
  res.status(200).send("Webhook received");

  try {
    const draftOrder = await createDraftOrderFromCheckout(checkout);
    console.log("Draft order invoice URL:", draftOrder.invoice_url);
    // TODO: send invoice URL to customer
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
}
