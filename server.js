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

// Fetch metaobjects or anything else from Shopify
app.get("/api/shop", async (req, res) => {
  try {
    const response = await axios.get(
      `https://${process.env.SHOP}/admin/api/2025-10/shop.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.ACCESS_TOKEN,
        },
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch metaobjects" });
  }
});

// Create a new product in Shopify
app.get("/api/products", async (req, res) => {
  try {
    const response = await axios.post(
      `https://${process.env.SHOP}/admin/api/2025-10/products.json`,
      { product: {
        title: "Hiking backpack"
      }},
      {
        headers: {
          "X-Shopify-Access-Token": process.env.ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );
    res.status(201).json(response.data);
  } catch (err) {
    if (err.response && err.response.data) {
      console.error("Shopify error:", err.response.status, err.response.data);
    } else {
      console.error(err.message || err);
    }
    res.status(500).json({ error: "Failed to create product" });
  }
});

// Webhook endpoint for checkout creation
app.post("/webhooks/checkout/create", async (req, res) => {
  // Verify webhook (optional but recommended)
  if (process.env.SHOPIFY_WEBHOOK_SECRET && !verifyWebhook(req)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  try {
    const checkout = req.body;
    
    // Respond quickly to Shopify
    res.status(200).send("Webhook received");

    // Process the draft order asynchronously
    await createDraftOrderWithProperties(checkout);
  } catch (err) {
    console.error("Webhook processing error:", err);
    res.status(500).json({ error: "Failed to process webhook" });
  }
});

// Create draft order with custom properties
async function createDraftOrderWithProperties(checkout) {
  try {
    // Build line items with custom properties
    const lineItems = checkout.line_items.map(item => {
      const lineItem = {
        variant_id: item.variant_id,
        quantity: item.quantity,
        properties: []
      };

      // Add custom properties from metaobjects
      // These would typically be stored in item.properties or retrieved from metaobjects
      if (item.properties) {
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
        customer: {
          id: checkout.customer?.id
        },
        email: checkout.email,
        shipping_address: checkout.shipping_address,
        billing_address: checkout.billing_address,
        note: `Created from checkout ${checkout.token}`,
        tags: "custom-properties,metaobject-variant"
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
    
    // Optionally, complete the draft order immediately
    if (process.env.AUTO_COMPLETE_DRAFT_ORDER === 'true') {
      await completeDraftOrder(response.data.draft_order.id);
    }

    return response.data.draft_order;
  } catch (err) {
    if (err.response && err.response.data) {
      console.error("Draft order creation error:", err.response.status, err.response.data);
    } else {
      console.error("Draft order error:", err.message || err);
    }
    throw err;
  }
}

// Complete a draft order (convert to actual order)
async function completeDraftOrder(draftOrderId) {
  try {
    const response = await axios.put(
      `https://${process.env.SHOP}/admin/api/2025-10/draft_orders/${draftOrderId}/complete.json`,
      {},
      {
        headers: {
          "X-Shopify-Access-Token": process.env.ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Draft order completed:", response.data.draft_order.id);
    return response.data.draft_order;
  } catch (err) {
    console.error("Failed to complete draft order:", err.response?.data || err.message);
    throw err;
  }
}

// Manual endpoint to create draft order (for testing)
app.post("/api/draft-orders", async (req, res) => {
  try {
    const { lineItems, customItems, customer, email } = req.body;

    // Combine regular line items with custom items
    const allLineItems = [...(lineItems || [])];

    // Add custom items (items without variant_id)
    if (customItems && customItems.length > 0) {
      customItems.forEach(item => {
        allLineItems.push({
          title: item.title,
          price: item.price,
          quantity: item.quantity || 1,
          taxable: item.taxable !== undefined ? item.taxable : true,
          properties: item.properties || []
        });
      });
    }

    const draftOrderData = {
      draft_order: {
        line_items: allLineItems,
        customer: customer,
        email: email,
        note: "Manual draft order creation"
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

    res.status(201).json(response.data);
  } catch (err) {
    if (err.response && err.response.data) {
      console.error("Shopify error:", err.response.status, err.response.data);
    } else {
      console.error(err.message || err);
    }
    res.status(500).json({ error: "Failed to create draft order" });
  }
});

// Endpoint to add custom item to existing draft order
app.post("/api/draft-orders/:id/custom-items", async (req, res) => {
  try {
    const draftOrderId = req.params.id;
    const { title, price, quantity, taxable, properties } = req.body;

    // First, get the existing draft order
    const existingOrder = await axios.get(
      `https://${process.env.SHOP}/admin/api/2025-10/draft_orders/${draftOrderId}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.ACCESS_TOKEN,
        },
      }
    );

    // Add the new custom item to existing line items
    const updatedLineItems = [
      ...existingOrder.data.draft_order.line_items,
      {
        title: title,
        price: price,
        quantity: quantity || 1,
        taxable: taxable !== undefined ? taxable : true,
        properties: properties || []
      }
    ];

    // Update the draft order
    const response = await axios.put(
      `https://${process.env.SHOP}/admin/api/2025-10/draft_orders/${draftOrderId}.json`,
      {
        draft_order: {
          line_items: updatedLineItems
        }
      },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json(response.data);
  } catch (err) {
    if (err.response && err.response.data) {
      console.error("Shopify error:", err.response.status, err.response.data);
    } else {
      console.error(err.message || err);
    }
    res.status(500).json({ error: "Failed to add custom item" });
  }
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));