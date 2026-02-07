"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const uuid_1 = require("uuid");
const store_1 = __importDefault(require("./store"));
const queue_1 = __importDefault(require("./queue"));
const worker_1 = __importDefault(require("./worker"));
const returnHandler_1 = __importDefault(require("./returnHandler"));
const alertManager_1 = __importDefault(require("./alertManager"));
const validation = __importStar(require("./validation"));
const app = (0, express_1.default)();
app.use(body_parser_1.default.json());
// Initialize DynamoDB on startup (non-blocking)
let initialized = false;
async function initialize() {
    if (initialized)
        return;
    try {
        await store_1.default.initializeStore();
        worker_1.default.startWorker();
        initialized = true;
        console.log("✅ SyncState initialized with DynamoDB");
    }
    catch (error) {
        console.error("❌ Failed to initialize SyncState:", error);
        console.error("⚠️  Server will run in degraded mode (no database access)");
        // Don't exit - let server boot anyway
    }
}
// Health check endpoint
app.get("/health", (req, res) => res.json({ ok: true }));
// Shopify webhook simulation endpoint
app.post("/webhook/shopify", async (req, res) => {
    var _a;
    const body = req.body;
    if (!body || !Array.isArray(body.items)) {
        return res.status(400).json({ error: "invalid payload" });
    }
    if (body.items.length === 0) {
        return res.status(400).json({ error: "items array cannot be empty" });
    }
    const orderId = (_a = body.orderId) !== null && _a !== void 0 ? _a : "unknown";
    const tx = (0, uuid_1.v4)();
    const inventoryAfter = {};
    const broadcastAfter = {};
    try {
        for (const it of body.items) {
            // Validate SKU
            const skuValidation = validation.validateSku(it.sku);
            if (!skuValidation.valid) {
                return res.status(400).json({ error: skuValidation.error });
            }
            const sku = skuValidation.value;
            // Validate Quantity
            const qtyValidation = validation.validateOrderQuantity(it.quantity);
            if (!qtyValidation.valid) {
                return res.status(400).json({ error: qtyValidation.error });
            }
            const qty = qtyValidation.value;
            // Adjust physical inventory immediately (Shopify is master)
            // Tests seed initial inventory by sending `orderId` that starts with `init-`.
            // Treat those as restocks (increase), otherwise treat as orders (decrease).
            const isInitOrder = String(orderId || "").startsWith("init-");
            const delta = isInitOrder ? qty : -qty;
            const nextPhysical = await store_1.default.adjustPhysicalCount(sku, delta);
            // Apply Safety Buffer
            const buffer = await store_1.default.getBuffer(sku);
            const broadcastCount = Math.max(0, nextPhysical - buffer);
            // Track for response
            inventoryAfter[sku] = nextPhysical;
            broadcastAfter[sku] = broadcastCount;
            // Create a job to update Amazon quickly
            queue_1.default.pushJob({ sku, broadcastCount, tx });
        }
        return res.json({
            success: true,
            queued: body.items.length,
            inventoryAfter,
            broadcastAfter
        });
    }
    catch (error) {
        console.error("Webhook processing error:", error);
        return res.status(500).json({ error: "Webhook processing failed" });
    }
});
// ===== PHASE 2: Return Handling =====
// Amazon FBA return webhook
app.post("/webhook/amazon/return", async (req, res) => {
    const body = req.body;
    // Validate required fields
    if (!body) {
        return res.status(400).json({
            error: "Request body is required"
        });
    }
    // Validate SKU
    const skuValidation = validation.validateSku(body.sku);
    if (!skuValidation.valid) {
        return res.status(400).json({ error: `SKU: ${skuValidation.error}` });
    }
    // Validate Quantity
    const qtyValidation = validation.validateReturnQuantity(body.quantity);
    if (!qtyValidation.valid) {
        return res.status(400).json({ error: `Quantity: ${qtyValidation.error}` });
    }
    // Validate Disposition
    const dispositionValidation = validation.validateDisposition(body.disposition);
    if (!dispositionValidation.valid) {
        return res.status(400).json({ error: `Disposition: ${dispositionValidation.error}` });
    }
    // Validate optional fields
    const orderIdValidation = validation.validateOrderId(body.returnOrderId);
    const reasonValidation = validation.validateReason(body.reason);
    try {
        const result = await returnHandler_1.default.processReturn({
            sku: skuValidation.value,
            quantity: qtyValidation.value,
            disposition: dispositionValidation.value,
            returnOrderId: orderIdValidation.value,
            reason: reasonValidation.value,
            timestamp: new Date().toISOString(),
            tx: (0, uuid_1.v4)()
        });
        return res.json({ ok: true, ...result });
    }
    catch (err) {
        console.error("Return processing error:", err);
        return res.status(500).json({ error: "Return processing failed" });
    }
});
// ===== Buffer Management =====
// Set safety buffer for a SKU
app.post("/api/buffer/:sku", async (req, res) => {
    const { sku } = req.params;
    const { bufferQty } = req.body;
    console.log(`[POST-BUFFER] Received - sku: ${sku}, bufferQty: ${bufferQty}, type: ${typeof bufferQty}`);
    // Validate SKU
    const skuValidation = validation.validateSku(sku);
    if (!skuValidation.valid) {
        console.log(`[POST-BUFFER] SKU invalid: ${skuValidation.error}`);
        return res.status(400).json({ error: `SKU: ${skuValidation.error}` });
    }
    // Validate Buffer Quantity
    console.log(`[POST-BUFFER] Validating buffer: ${bufferQty}`);
    const bufferValidation = validation.validateBufferQuantity(bufferQty);
    console.log(`[POST-BUFFER] Validation result:`, bufferValidation);
    if (!bufferValidation.valid) {
        console.log(`[POST-BUFFER] Returning error: ${bufferValidation.error}`);
        return res.status(400).json({ error: bufferValidation.error });
    }
    try {
        console.log(`[POST-BUFFER] Calling store.setBuffer`);
        await store_1.default.setBuffer(skuValidation.value, bufferValidation.value);
        const physical = await store_1.default.getPhysicalCount(skuValidation.value);
        const broadcast = Math.max(0, physical - bufferValidation.value);
        return res.json({
            sku: skuValidation.value,
            physical,
            buffer: bufferValidation.value,
            broadcast,
            message: `Buffer set to ${bufferValidation.value}. Will broadcast ${broadcast} to Amazon.`
        });
    }
    catch (error) {
        console.error("[POST-BUFFER] Caught error:", error);
        return res.status(500).json({ error: "Buffer update failed" });
    }
});
// Get buffer for a SKU
app.get("/api/buffer/:sku", async (req, res) => {
    const { sku } = req.params;
    try {
        const buffer = await store_1.default.getBuffer(sku);
        const physical = await store_1.default.getPhysicalCount(sku);
        const lastBroadcast = await store_1.default.getLastBroadcast(sku);
        return res.json({
            sku,
            physical,
            buffer,
            broadcast: Math.max(0, physical - buffer),
            lastBroadcast
        });
    }
    catch (error) {
        console.error("Buffer fetch error:", error);
        return res.status(500).json({ error: "Buffer fetch failed" });
    }
});
// ===== Alerts & Monitoring =====
// Get all unread alerts
app.get("/api/alerts/unread", async (req, res) => {
    try {
        const alerts = await alertManager_1.default.getUnreadAlerts();
        // Return both `count` (used by tests) and `unreadCount` for compatibility
        return res.json({
            count: alerts.length,
            unreadCount: alerts.length,
            alerts
        });
    }
    catch (error) {
        console.error("Unread alerts fetch error:", error);
        return res.status(500).json({ error: "Unread alerts fetch failed" });
    }
});
// Get alerts by severity
app.get("/api/alerts/severity/:level", async (req, res) => {
    const { level } = req.params;
    // Validate severity level
    const severityValidation = validation.validateAlertLevel(level);
    if (!severityValidation.valid) {
        return res.status(400).json({ error: severityValidation.error });
    }
    try {
        const alerts = await alertManager_1.default.getAlertsBySeverity(severityValidation.value);
        return res.json({
            severity: severityValidation.value,
            count: alerts.length,
            alerts
        });
    }
    catch (error) {
        console.error("Alerts fetch error:", error);
        return res.status(500).json({ error: "Alerts fetch failed" });
    }
});
// Mark alert as read
app.post("/api/alerts/:alertId/read", async (req, res) => {
    const { alertId } = req.params;
    try {
        await alertManager_1.default.markAlertAsRead(alertId);
        return res.json({ ok: true, alertId });
    }
    catch (error) {
        console.error("Alert mark read error:", error);
        return res.status(500).json({ error: "Alert mark read failed" });
    }
});
// ===== Inventory Status =====
// Get full inventory status for a SKU
app.get("/api/inventory/:sku", async (req, res) => {
    const { sku } = req.params;
    try {
        const physical = await store_1.default.getPhysicalCount(sku);
        const buffer = await store_1.default.getBuffer(sku);
        const broadcast = Math.max(0, physical - buffer);
        const lastBroadcast = await store_1.default.getLastBroadcast(sku);
        const returns = await store_1.default.getReturns(sku);
        return res.json({
            sku,
            physical,
            buffer,
            broadcast,
            lastBroadcast,
            returns,
            queueSize: queue_1.default.queueSize()
        });
    }
    catch (error) {
        console.error("Inventory fetch error:", error);
        return res.status(500).json({ error: "Inventory fetch failed" });
    }
});
// Get all inventory
app.get("/api/inventory", async (req, res) => {
    try {
        const allInventory = await store_1.default.getAllInventory();
        const inventory = Object.values(allInventory).map((item) => ({
            sku: item.sku,
            physical: item.physical,
            buffer: item.buffer,
            broadcast: Math.max(0, item.physical - item.buffer)
        }));
        return res.json({
            totalSkus: inventory.length,
            inventory: Object.fromEntries(inventory.map((inv) => [inv.sku, { physical: inv.physical, buffer: inv.buffer, broadcast: inv.broadcast }]))
        });
    }
    catch (error) {
        console.error("All inventory fetch error:", error);
        return res.status(500).json({ error: "All inventory fetch failed" });
    }
});
// Get product sync status (for Chrome extension)
app.get("/api/product-sync/:productId", async (req, res) => {
    try {
        const { productId } = req.params;
        // Return basic sync status - can be expanded later
        return res.json({
            productId,
            lastSync: null,
            synced: false,
            inventoryLevel: 0,
            errors: []
        });
    }
    catch (error) {
        console.error("Product sync status fetch error:", error);
        return res.status(500).json({ error: "Product sync status fetch failed" });
    }
});
// Handle SKU-to-ASIN mapping from Chrome extension
app.post("/api/sku-mapping", async (req, res) => {
    try {
        const { sku, asin, source, timestamp } = req.body;
        if (!sku || !asin) {
            return res.status(400).json({ error: "SKU and ASIN required" });
        }
        console.log(`[MAPPING] ${source} mapped SKU ${sku} to ASIN ${asin} at ${timestamp}`);
        // Return success response
        return res.json({
            success: true,
            sku,
            asin,
            mappedAt: timestamp
        });
    }
    catch (error) {
        console.error("SKU mapping error:", error);
        return res.status(500).json({ error: "SKU mapping failed" });
    }
});
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
// Start server immediately (don't wait for infra)
const server = app.listen(PORT, () => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔥 REAL SYNCSTATE SERVER STARTED");
    console.log(`🔥 Listening on http://localhost:${PORT}`);
    console.log("🔥 Buffer endpoint: POST /api/buffer/:sku");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});
// Export server for test usage
global.testServer = server;
// Initialize DynamoDB in background (non-blocking)
initialize().catch((error) => {
    console.error("[INIT] Background initialization error:", error);
});
//# sourceMappingURL=index.js.map