"use strict";
/**
 * Return Handler - Processes Amazon FBA return events
 * Handles the "Ghost Restock Trap" by filtering dispositions
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processReturn = processReturn;
exports.createMockReturn = createMockReturn;
const uuid_1 = require("uuid");
const store_1 = __importDefault(require("./store"));
const queue_1 = __importDefault(require("./queue"));
const alertManager_1 = __importDefault(require("./alertManager"));
const dispositionFilter_1 = require("./dispositionFilter");
/**
 * Process an Amazon FBA return event
 * This would normally come from Amazon's FBA_INVENTORY_AVAILABILITY_CHANGES webhook
 */
async function processReturn(event) {
    const tx = (0, uuid_1.v4)();
    // Check for echo (already processed this return)
    const isEcho = await store_1.default.isEcho(tx);
    if (isEcho) {
        console.log(`[returns] Echo detected for return ${event.returnOrderId}. Skipping.`);
        return { processed: false, synced: false, action: "skipped" };
    }
    // Filter by disposition
    const decision = (0, dispositionFilter_1.filterByDisposition)(event);
    console.log(`[returns] Processing return: ${event.sku} (qty: ${event.quantity})`);
    console.log(`[returns] Disposition: ${event.disposition}`);
    console.log(`[returns] Decision: ${decision.action}`);
    // Record return in store for audit trail
    await store_1.default.recordReturn(event.sku, event.quantity, event.disposition, event.timestamp);
    let alertRecord = undefined;
    let inventoryAfter = 0;
    let broadcastAfter = 0;
    // Handle based on disposition
    if (decision.shouldSyncToShopify) {
        // SELLABLE: Sync back to Shopify
        console.log(`[returns] ✓ Syncing ${event.quantity} units of ${event.sku} back to Shopify`);
        // Increase physical count
        inventoryAfter = await store_1.default.adjustPhysicalCount(event.sku, event.quantity);
        console.log(`[returns] Physical stock now: ${inventoryAfter} for ${event.sku}`);
        // Queue job to update Amazon with new count
        const buffer = await store_1.default.getBuffer(event.sku);
        broadcastAfter = Math.max(0, inventoryAfter - buffer);
        queue_1.default.pushJob({
            sku: event.sku,
            broadcastCount: broadcastAfter,
            tx
        });
        // Record transaction for idempotency
        await store_1.default.saveTransaction(tx);
    }
    if (decision.shouldAlert) {
        // Create alert for merchant
        alertRecord = await alertManager_1.default.createAlert(decision.action === "quarantine" ? "return_damaged" : "return_unsellable", decision.alertSeverity, event.sku, decision.reason, event.quantity);
        console.log(`[returns] Alert created: ${alertRecord.alertId}`);
    }
    return {
        processed: true,
        synced: decision.shouldSyncToShopify,
        action: decision.action,
        inventoryAfter,
        broadcastAfter,
        alert: alertRecord ? {
            id: alertRecord.alertId,
            message: alertRecord.message
        } : undefined
    };
}
/**
 * Simulate a return event (for testing)
 * In production, this would come from Amazon's webhook
 */
function createMockReturn(sku, quantity, disposition, reason = "Unknown") {
    return {
        sku,
        quantity,
        disposition,
        returnOrderId: `RET-${Date.now()}`,
        reason,
        timestamp: new Date().toISOString(),
        tx: (0, uuid_1.v4)()
    };
}
exports.default = { processReturn, createMockReturn };
//# sourceMappingURL=returnHandler.js.map