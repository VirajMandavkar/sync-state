/**
 * Return Handler - Processes Amazon FBA return events
 * Handles the "Ghost Restock Trap" by filtering dispositions
 */

import { v4 as uuidv4 } from "uuid";
import store from "./store";
import queue from "./queue";
import alertManager from "./alertManager";
import {
  filterByDisposition,
  ReturnEvent,
  ReturnDisposition
} from "./dispositionFilter";

/**
 * Process an Amazon FBA return event
 * This would normally come from Amazon's FBA_INVENTORY_AVAILABILITY_CHANGES webhook
 */
export async function processReturn(event: ReturnEvent): Promise<{
  processed: boolean;
  synced: boolean;
  action: string;
  inventoryAfter?: number;
  broadcastAfter?: number;
  alert?: { id: string; message: string };
}> {
  const tx = uuidv4();

  // Check for echo (already processed this return)
  const isEcho = await store.isEcho(tx);
  if (isEcho) {
    console.log(`[returns] Echo detected for return ${event.returnOrderId}. Skipping.`);
    return { processed: false, synced: false, action: "skipped" };
  }

  // Filter by disposition
  const decision = filterByDisposition(event);

  console.log(`[returns] Processing return: ${event.sku} (qty: ${event.quantity})`);
  console.log(`[returns] Disposition: ${event.disposition}`);
  console.log(`[returns] Decision: ${decision.action}`);

  // Record return in store for audit trail
  await store.recordReturn(event.sku, event.quantity, event.disposition, event.timestamp);

  let alertRecord = undefined;
  let inventoryAfter = 0;
  let broadcastAfter = 0;

  // Handle based on disposition
  if (decision.shouldSyncToShopify) {
    // SELLABLE: Sync back to Shopify
    console.log(
      `[returns] ✓ Syncing ${event.quantity} units of ${event.sku} back to Shopify`
    );

    // Increase physical count
    inventoryAfter = await store.adjustPhysicalCount(event.sku, event.quantity);
    console.log(
      `[returns] Physical stock now: ${inventoryAfter} for ${event.sku}`
    );

    // Queue job to update Amazon with new count
    const buffer = await store.getBuffer(event.sku);
    broadcastAfter = Math.max(0, inventoryAfter - buffer);
    queue.pushJob({
      sku: event.sku,
      broadcastCount: broadcastAfter,
      tx
    });

    // Record transaction for idempotency
    await store.saveTransaction(tx);
  }

  if (decision.shouldAlert) {
    // Create alert for merchant
    alertRecord = await alertManager.createAlert(
      decision.action === "quarantine" ? "return_damaged" : "return_unsellable",
      decision.alertSeverity,
      event.sku,
      decision.reason,
      event.quantity
    );

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
export function createMockReturn(
  sku: string,
  quantity: number,
  disposition: ReturnDisposition,
  reason = "Unknown"
): ReturnEvent {
  return {
    sku,
    quantity,
    disposition,
    returnOrderId: `RET-${Date.now()}`,
    reason,
    timestamp: new Date().toISOString(),
    tx: uuidv4()
  };
}

export default { processReturn, createMockReturn };
