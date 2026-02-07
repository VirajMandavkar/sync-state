"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateInventoryOnAmazon = updateInventoryOnAmazon;
const https_1 = __importDefault(require("https"));
const bottleneck_1 = __importDefault(require("bottleneck"));
const lwa_1 = require("./lwa");
/**
 * Amazon SP-API Client with Mock Mode
 * Set MOCK_AMAZON=true in .env to test without real API
 */
const MOCK_MODE = process.env.MOCK_AMAZON === "true";
// Amazon allows ~0.5 req/sec per seller. We use Bottleneck to rate-limit.
const limiter = new bottleneck_1.default({ minTime: 2000 });
const SP_API_ENDPOINT = "sellingpartnerapi-na.amazon.com";
/**
 * Mock Amazon response (for testing without real API)
 */
async function updateInventoryOnAmazonMock(sku, quantity, tx) {
    // Simulate network latency
    await new Promise((res) => setTimeout(res, 500));
    console.log(`[amazon-mock] ✓ Updated SKU=${sku} qty=${quantity} tx=${tx !== null && tx !== void 0 ? tx : "-"}`);
    return { ok: true, sku, quantity, tx };
}
/**
 * Real Amazon SP-API Client
 * Uses LWA for authentication and calls the actual Selling Partner API
 */
async function updateInventoryOnAmazonReal(sku, quantity, tx) {
    return limiter.schedule(async () => {
        try {
            const accessToken = await (0, lwa_1.getAccessToken)();
            const body = {
                sku,
                fulfillmentChannelCode: "MFN", // Merchant Fulfilled Network (Shopify)
                quantity
            };
            return new Promise((resolve, reject) => {
                const options = {
                    hostname: SP_API_ENDPOINT,
                    path: `/inventory/v1/inventory/${encodeURIComponent(sku)}`,
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "x-amz-access-token": accessToken,
                        "x-amz-date": new Date().toISOString()
                    }
                };
                const req = https_1.default.request(options, (res) => {
                    let data = "";
                    res.on("data", (chunk) => (data += chunk.toString()));
                    res.on("end", () => {
                        if (res.statusCode === 200 || res.statusCode === 204) {
                            console.log(`[amazon-sp-api] ✓ Updated SKU=${sku} qty=${quantity} tx=${tx !== null && tx !== void 0 ? tx : "-"}`);
                            resolve({ ok: true, sku, quantity, tx });
                        }
                        else {
                            console.error(`[amazon-sp-api] HTTP ${res.statusCode} for SKU=${sku}: ${data}`);
                            reject(new Error(`SP-API error ${res.statusCode}: ${data}`));
                        }
                    });
                });
                req.on("error", (err) => {
                    console.error(`[amazon-sp-api] Request error:`, err);
                    reject(err);
                });
                req.write(JSON.stringify(body));
                req.end();
            });
        }
        catch (err) {
            console.error(`[amazon-sp-api] Failed to update SKU=${sku}:`, err);
            throw err;
        }
    });
}
async function updateInventoryOnAmazon(sku, quantity, tx) {
    if (MOCK_MODE) {
        return updateInventoryOnAmazonMock(sku, quantity, tx);
    }
    else {
        return updateInventoryOnAmazonReal(sku, quantity, tx);
    }
}
exports.default = { updateInventoryOnAmazon };
//# sourceMappingURL=amazonClient.js.map