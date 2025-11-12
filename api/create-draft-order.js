import axios from "axios";
import cors, { runMiddleware } from "./helpers/cors.js";

export default async function handler(req, res) {
  await runMiddleware(req, res, cors);
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { cartItems, customer, email, note } = req.body;

    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: "No cart items provided" });
    }

    // Transform cart items to draft order line items
    const lineItems = cartItems.map(item => 
      { console.log(item.properties)
        return {
          variant_id: item.variant_id,
          quantity: item.quantity,
          properties: item.properties || []
        }
    });

    const draftOrderData = {
      draft_order: {
        line_items: lineItems,
        email: email,
        note: note || "Custom order with properties",
        tags: "custom-properties",
        ...(customer && { customer: { id: customer.id } })
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

    const draftOrder = response.data.draft_order;

    res.status(201).json({
      success: true,
      draft_order_id: draftOrder.id,
      invoice_url: draftOrder.invoice_url,
      checkout_url: draftOrder.invoice_url // URL to redirect to
    });

  } catch (err) {
    if (err.response && err.response.data) {
      console.error("Shopify error:", err.response.status, err.response.data);
      res.status(err.response.status).json({
        error: "Failed to create draft order",
        details: err.response.data
      });
    } else {
      console.error(err.message || err);
      res.status(500).json({ error: "Failed to create draft order" });
    }
  }
}
