import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { lineItems, customItems, customer, email } = req.body;

    const allLineItems = [...(lineItems || [])];

    if (customItems?.length) {
      customItems.forEach(item => {
        allLineItems.push({
          title: item.title,
          price: item.price,
          quantity: item.quantity || 1,
          taxable: item.taxable ?? true,
          properties: item.properties || []
        });
      });
    }

    const draftOrderData = {
      draft_order: {
        line_items: allLineItems,
        customer,
        email,
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
    console.error("Draft order error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to create draft order" });
  }
}
