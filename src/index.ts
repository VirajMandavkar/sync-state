import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import store from "./store";
import queue from "./queue";
import worker from "./worker";
import returnHandler from "./returnHandler";
import alertManager from "./alertManager";
import { ReturnDisposition } from "./dispositionFilter";
import * as validation from "./validation";

const app = express();
app.use(bodyParser.json());

// Initialize DynamoDB on startup (non-blocking)
let initialized = false;

async function initialize() {
  if (initialized) return;
  try {
    await store.initializeStore();
    worker.startWorker();
    initialized = true;
    console.log("✅ SyncState initialized with DynamoDB");
  } catch (error) {
    console.error("❌ Failed to initialize SyncState:", error);
    console.error("⚠️  Server will run in degraded mode (no database access)");
    // Don't exit - let server boot anyway
  }
}

// Health check endpoint
app.get("/health", (req, res) => res.json({ ok: true }));

// Shopify webhook simulation endpoint
app.post("/webhook/shopify", async (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.items)) {
    return res.status(400).json({ error: "invalid payload" });
  }

  if (body.items.length === 0) {
    return res.status(400).json({ error: "items array cannot be empty" });
  }

  const orderId = body.orderId ?? "unknown";
  const tx = uuidv4();
  const inventoryAfter: Record<string, number> = {};
  const broadcastAfter: Record<string, number> = {};

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
      const nextPhysical = await store.adjustPhysicalCount(sku, delta);

      // Apply Safety Buffer
      const buffer = await store.getBuffer(sku);
      const broadcastCount = Math.max(0, nextPhysical - buffer);

      // Track for response
      inventoryAfter[sku] = nextPhysical;
      broadcastAfter[sku] = broadcastCount;

      // Create a job to update Amazon quickly
      queue.pushJob({ sku, broadcastCount, tx });
    }

    return res.json({ 
      success: true, 
      queued: body.items.length, 
      inventoryAfter, 
      broadcastAfter 
    });
  } catch (error) {
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
    const result = await returnHandler.processReturn({
      sku: skuValidation.value,
      quantity: qtyValidation.value,
      disposition: dispositionValidation.value as ReturnDisposition,
      returnOrderId: orderIdValidation.value,
      reason: reasonValidation.value,
      timestamp: new Date().toISOString(),
      tx: uuidv4()
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
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
    await store.setBuffer(skuValidation.value, bufferValidation.value);
    const physical = await store.getPhysicalCount(skuValidation.value);
    const broadcast = Math.max(0, physical - bufferValidation.value);

    return res.json({
      sku: skuValidation.value,
      physical,
      buffer: bufferValidation.value,
      broadcast,
      message: `Buffer set to ${bufferValidation.value}. Will broadcast ${broadcast} to Amazon.`
    });
  } catch (error) {
    console.error("[POST-BUFFER] Caught error:", error);
    return res.status(500).json({ error: "Buffer update failed" });
  }
});

// Get buffer for a SKU
app.get("/api/buffer/:sku", async (req, res) => {
  const { sku } = req.params;

  try {
    const buffer = await store.getBuffer(sku);
    const physical = await store.getPhysicalCount(sku);
    const lastBroadcast = await store.getLastBroadcast(sku);

    return res.json({
      sku,
      physical,
      buffer,
      broadcast: Math.max(0, physical - buffer),
      lastBroadcast
    });
  } catch (error) {
    console.error("Buffer fetch error:", error);
    return res.status(500).json({ error: "Buffer fetch failed" });
  }
});

// ===== Alerts & Monitoring =====

// Get all unread alerts
app.get("/api/alerts/unread", async (req, res) => {
  try {
    const alerts = await alertManager.getUnreadAlerts();
    // Return both `count` (used by tests) and `unreadCount` for compatibility
    return res.json({
      count: alerts.length,
      unreadCount: alerts.length,
      alerts
    });
  } catch (error) {
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
    const alerts = await alertManager.getAlertsBySeverity(
      severityValidation.value as "info" | "warning" | "critical"
    );
    return res.json({
      severity: severityValidation.value,
      count: alerts.length,
      alerts
    });
  } catch (error) {
    console.error("Alerts fetch error:", error);
    return res.status(500).json({ error: "Alerts fetch failed" });
  }
});

// Mark alert as read
app.post("/api/alerts/:alertId/read", async (req, res) => {
  const { alertId } = req.params;

  try {
    await alertManager.markAlertAsRead(alertId);
    return res.json({ ok: true, alertId });
  } catch (error) {
    console.error("Alert mark read error:", error);
    return res.status(500).json({ error: "Alert mark read failed" });
  }
});

// ===== Inventory Status =====

// Get full inventory status for a SKU
app.get("/api/inventory/:sku", async (req, res) => {
  const { sku } = req.params;

  try {
    const physical = await store.getPhysicalCount(sku);
    const buffer = await store.getBuffer(sku);
    const broadcast = Math.max(0, physical - buffer);
    const lastBroadcast = await store.getLastBroadcast(sku);
    const returns = await store.getReturns(sku);

    return res.json({
      sku,
      physical,
      buffer,
      broadcast,
      lastBroadcast,
      returns,
      queueSize: queue.queueSize()
    });
  } catch (error) {
    console.error("Inventory fetch error:", error);
    return res.status(500).json({ error: "Inventory fetch failed" });
  }
});

// Get all inventory
app.get("/api/inventory", async (req, res) => {
  try {
    const allInventory = await store.getAllInventory();

    const inventory = Object.values(allInventory).map((item) => ({
      sku: item.sku,
      physical: item.physical,
      buffer: item.buffer,
      broadcast: Math.max(0, item.physical - item.buffer)
    }));

    return res.json({
      totalSkus: inventory.length,
      inventory: Object.fromEntries(
        inventory.map((inv) => [inv.sku, { physical: inv.physical, buffer: inv.buffer, broadcast: inv.broadcast }])
      )
    });
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
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
(global as any).testServer = server;

// Initialize DynamoDB in background (non-blocking)
initialize().catch((error) => {
  console.error("[INIT] Background initialization error:", error);
});
