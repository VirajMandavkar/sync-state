"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccessToken = getAccessToken;
const https_1 = __importDefault(require("https"));
/**
 * LWA (Login with Amazon) Token Manager
 * Exchanges refresh_token for short-lived access_token
 * Amazon access tokens expire after ~1 hour
 */
const LWA_ENDPOINT = "api.amazon.com";
const LWA_PATH = "/auth/o2/token";
let cachedAccessToken = null;
let tokenExpiry = 0;
async function getAccessToken() {
    // Return cached token if still valid (with 5-min buffer)
    if (cachedAccessToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
        return cachedAccessToken;
    }
    const clientId = process.env.SP_API_CLIENT_ID;
    const clientSecret = process.env.SP_API_CLIENT_SECRET;
    const refreshToken = process.env.SP_API_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error("Missing SP-API credentials in .env");
    }
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret
        }).toString();
        const options = {
            hostname: LWA_ENDPOINT,
            path: LWA_PATH,
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": Buffer.byteLength(postData)
            }
        };
        const req = https_1.default.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk.toString()));
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    cachedAccessToken = parsed.access_token;
                    tokenExpiry = Date.now() + parsed.expires_in * 1000;
                    console.log(`[LWA] Got new access token, expires in ${parsed.expires_in}s`);
                    resolve(parsed.access_token);
                }
                catch (err) {
                    reject(new Error(`Failed to parse LWA response: ${data}`));
                }
            });
        });
        req.on("error", (err) => reject(err));
        req.write(postData);
        req.end();
    });
}
exports.default = { getAccessToken };
//# sourceMappingURL=lwa.js.map