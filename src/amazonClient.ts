import https from "https";
import { IncomingMessage } from "http";
import Bottleneck from "bottleneck";
import { getAccessToken } from "./lwa";

/**
 * Amazon SP-API Client with Mock Mode
 * Set MOCK_AMAZON=true in .env to test without real API
 */

const MOCK_MODE = process.env.MOCK_AMAZON === "true";

// Amazon allows ~0.5 req/sec per seller. We use Bottleneck to rate-limit.
const limiter = new Bottleneck({ minTime: 2000 });

const SP_API_ENDPOINT = "sellingpartnerapi-na.amazon.com";

interface UpdateInventoryBody {
  sku: string;
  fulfillmentChannelCode: string;
  quantity: number;
}

/**
 * Mock Amazon response (for testing without real API)
 */
async function updateInventoryOnAmazonMock(
  sku: string,
  quantity: number,
  tx?: string
): Promise<{ ok: boolean; sku: string; quantity: number; tx?: string }> {
  // Simulate network latency
  await new Promise((res) => setTimeout(res, 500));
  console.log(
    `[amazon-mock] ✓ Updated SKU=${sku} qty=${quantity} tx=${tx ?? "-"}`
  );
  return { ok: true, sku, quantity, tx };
}

/**
 * Real Amazon SP-API Client
 * Uses LWA for authentication and calls the actual Selling Partner API
 */
async function updateInventoryOnAmazonReal(
  sku: string,
  quantity: number,
  tx?: string
): Promise<{ ok: boolean; sku: string; quantity: number; tx?: string }> {
  return limiter.schedule(async () => {
    try {
      const accessToken = await getAccessToken();

      const body: UpdateInventoryBody = {
        sku,
        fulfillmentChannelCode: "MFN", // Merchant Fulfilled Network (Shopify)
        quantity
      };

      return new Promise((resolve, reject) => {
        const options = {
          hostname: SP_API_ENDPOINT,
          path: `/inventory/v1/inventory/${encodeURIComponent(sku)}`,
          method: "PUT" as const,
          headers: {
            "Content-Type": "application/json",
            "x-amz-access-token": accessToken,
            "x-amz-date": new Date().toISOString()
          }
        };

        const req = https.request(options, (res: IncomingMessage) => {
          let data = "";
          res.on("data", (chunk: Buffer) => (data += chunk.toString()));
          res.on("end", () => {
            if (res.statusCode === 200 || res.statusCode === 204) {
              console.log(
                `[amazon-sp-api] ✓ Updated SKU=${sku} qty=${quantity} tx=${tx ?? "-"}`
              );
              resolve({ ok: true, sku, quantity, tx });
            } else {
              console.error(
                `[amazon-sp-api] HTTP ${res.statusCode} for SKU=${sku}: ${data}`
              );
              reject(new Error(`SP-API error ${res.statusCode}: ${data}`));
            }
          });
        });

        req.on("error", (err: Error) => {
          console.error(`[amazon-sp-api] Request error:`, err);
          reject(err);
        });

        req.write(JSON.stringify(body));
        req.end();
      });
    } catch (err) {
      console.error(`[amazon-sp-api] Failed to update SKU=${sku}:`, err);
      throw err;
    }
  });
}

export async function updateInventoryOnAmazon(
  sku: string,
  quantity: number,
  tx?: string
): Promise<{ ok: boolean; sku: string; quantity: number; tx?: string }> {
  if (MOCK_MODE) {
    return updateInventoryOnAmazonMock(sku, quantity, tx);
  } else {
    return updateInventoryOnAmazonReal(sku, quantity, tx);
  }
}

export default { updateInventoryOnAmazon };
