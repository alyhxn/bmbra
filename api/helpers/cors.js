import Cors from "cors";

// Configure CORS for the API. origin:true will echo the request origin which
// is convenient for development; change to a specific origin string or list
// for production if you want to lock it down.
const cors = Cors({
  origin: true,
  methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Shopify-Hmac-Sha256", "Authorization"],
});

export function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

export default cors;
