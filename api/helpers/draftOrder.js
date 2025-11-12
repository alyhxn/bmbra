import axios from "axios";

export async function createDraftOrderFromCheckout(checkout) {
  try {
    const lineItems = checkout.line_items.map(item => {
      return {
        variant_id: item.variant_id,
        quantity: item.quantity,
        properties: item.properties?.map(p => ({ name: p.name, value: p.value })) || []
      };
    });

    const draftOrderData = {
      draft_order: {
        line_items: lineItems,
        customer: checkout.customer ? { id: checkout.customer.id } : undefined,
        email: checkout.email,
        shipping_address: checkout.shipping_address,
        billing_address: checkout.billing_address,
        note: `Created from checkout ${checkout.token}`,
        tags: "custom-properties,checkout-conversion",
        use_customer_default_address: true
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

    console.log("Draft order created:", response.data.draft_order.id);
    return response.data.draft_order;
  } catch (err) {
    console.error("Draft order creation error:", err.response?.data || err.message);
    throw err;
  }
}
