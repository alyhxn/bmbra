import crypto from "crypto";
import { createDraftOrderFromCheckout } from "./helpers/draftOrder.js";
import express from "express";

const app = express();

// Middleware to capture raw body
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf; // store raw body for HMAC verification
    },
  })
);

function verifyWebhook(req) {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  const hash = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(req.rawBody, "utf8") // use raw body
    .digest("base64");

  console.log("Computed hash:", hash, hmac);
  return hash === hmac;
}

app.post("/webhook", async (req, res) => {
  if (!verifyWebhook(req)) {
    return res.status(401).send("Invalid signature");
  }

  const checkout = req.body;
  console.log("Checkout received:", checkout);

  res.status(200).send("Webhook received");

  try {
    const draftOrder = await createDraftOrderFromCheckout(checkout);
    console.log("Draft order URL:", draftOrder.invoice_url);
  } catch (err) {
    console.error(err);
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
