import axios from "axios";
import cors, { runMiddleware } from "./helpers/cors.js";

export default async function handler(req, res) {
  await runMiddleware(req, res, cors);
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { lineItems, customer, email, shippingAddress, billingAddress } = req.body;

    const draftOrderData = {
      draft_order: {
        line_items: lineItems,
        customer,
        email,
        shipping_address: shippingAddress,
        billing_address: billingAddress,
        note: "Manual draft order creation via API"
      }
    };

    const response = await axios.post(
      `https://${process.env.SHOP}/admin/api/2025-10/draft_orders.json`,
      draftOrderData,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(201).json({
      success: true,
      draft_order_id: response.data.draft_order.id,
      invoice_url: response.data.draft_order.invoice_url,
      order_status_url: response.data.draft_order.order_status_url
    });
  } catch (err) {
    console.error("Draft order error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to create draft order", details: err.response?.data });
  }
}
