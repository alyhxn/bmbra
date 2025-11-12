import crypto from "crypto";
import { createDraftOrderFromCheckout } from "./helpers/draftOrder.js";

function verifyWebhook(req) {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("base64");
  console.log("Computed hash:", hash, hmac);
  return hash === hmac;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  if (process.env.SHOPIFY_WEBHOOK_SECRET && !verifyWebhook(req)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  try {
    const checkout = req.body;
    console.log("Checkout received:", JSON.stringify(checkout, null, 2));

    // Respond quickly to Shopify
    res.status(200).send("Webhook received");

    // Process draft order asynchronously
    const draftOrder = await createDraftOrderFromCheckout(checkout);
    console.log("Draft order invoice URL:", draftOrder.invoice_url);

    // TODO: Send invoice URL to customer via email or SMS
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
}
