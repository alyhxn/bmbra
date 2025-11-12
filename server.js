import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();
const app = express();
app.use(express.json());

// Verify webhook signature
function verifyWebhook(req) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64');
  return hash === hmac;
}

// Webhook endpoint for checkout creation
app.post("/api/checkout", async (req, res) => {
  // Verify webhook
  if (process.env.SHOPIFY_WEBHOOK_SECRET && !verifyWebhook(req)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  try {
    const checkout = req.body;
    console.log("Checkout received:", JSON.stringify(checkout, null, 2));
    
    // Respond quickly to Shopify
    res.status(200).send("Webhook received");

    // Process the draft order asynchronously
    const draftOrder = await createDraftOrderFromCheckout(checkout);
    
    // Get the invoice URL to redirect customer
    const invoiceUrl = draftOrder.invoice_url;
    console.log("Draft order created. Invoice URL:", invoiceUrl);
    
    // TODO: Send invoice URL to customer via email or SMS
    
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
});

// Create draft order from checkout data
async function createDraftOrderFromCheckout(checkout) {
  try {
    // Build line items with custom properties from cart
    const lineItems = checkout.line_items.map(item => {
      const lineItem = {
        variant_id: item.variant_id,
        quantity: item.quantity,
        properties: []
      };

      // Extract properties from line item
      // Properties come as key-value pairs like "Timber Type: Messmate ($30.00)"
      if (item.properties && Array.isArray(item.properties)) {
        item.properties.forEach(prop => {
          lineItem.properties.push({
            name: prop.name,
            value: prop.value
          });
        });
      }

      return lineItem;
    });

    // Create draft order payload
    const draftOrderData = {
      draft_order: {
        line_items: lineItems,
        customer: checkout.customer ? {
          id: checkout.customer.id
        } : undefined,
        email: checkout.email,
        shipping_address: checkout.shipping_address,
        billing_address: checkout.billing_address,
        note: `Created from checkout ${checkout.token}`,
        tags: "custom-properties,checkout-conversion",
        use_customer_default_address: true
      }
    };

    // Create draft order via Admin API
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

    console.log("Draft order created:", response.data.draft_order.id);
    return response.data.draft_order;
    
  } catch (err) {
    if (err.response && err.response.data) {
      console.error("Draft order creation error:", err.response.status, JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("Draft order error:", err.message || err);
    }
    throw err;
  }
}

// Manual endpoint to create draft order (for testing without webhook)
app.post("/api/draft-orders", async (req, res) => {
  try {
    const { lineItems, customer, email, shippingAddress, billingAddress } = req.body;

    const draftOrderData = {
      draft_order: {
        line_items: lineItems,
        customer: customer,
        email: email,
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
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));