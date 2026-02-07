import * as ddb from "./dynamodbService";

// Cache for performance (reduces DynamoDB queries)
const cache = new Map<string, any>();
const CACHE_TTL = 60000; // 1 minute

interface CacheItem {
  data: any;
  timestamp: number;
}

function getCached(key: string): any | null {
  const item = cache.get(key) as CacheItem | undefined;
  if (item && Date.now() - item.timestamp < CACHE_TTL) {
    return item.data;
  }
  cache.delete(key);
  return null;
}

function setCached(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

export async function initializeStore() {
  await ddb.initializeTables();
}

export async function getPhysicalCount(sku: string): Promise<number> {
  const cacheKey = `physical_${sku}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  const inventory = await ddb.getInventory(sku);
  const count = inventory?.physical ?? 0;
  setCached(cacheKey, count);
  return count;
}

export async function setPhysicalCount(sku: string, n: number) {
  await ddb.setInventory(sku, { physical: n });
  setCached(`physical_${sku}`, n);
  cache.delete(`broadcast_${sku}`); // Invalidate broadcast cache
}

export async function adjustPhysicalCount(sku: string, delta: number) {
  const cur = await getPhysicalCount(sku);
  const next = Math.max(0, cur + delta);
  await setPhysicalCount(sku, next);
  return next;
}

export async function getBuffer(sku: string): Promise<number> {
  const cacheKey = `buffer_${sku}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  const inventory = await ddb.getInventory(sku);
  const buffer = inventory?.buffer ?? 0;
  setCached(cacheKey, buffer);
  return buffer;
}

export async function setBuffer(sku: string, n: number) {
  const buffer = Math.max(0, n);
  await ddb.setInventory(sku, { buffer });
  setCached(`buffer_${sku}`, buffer);
  cache.delete(`broadcast_${sku}`); // Invalidate broadcast cache
}

export async function isEcho(tx: string): Promise<boolean> {
  return await ddb.isEcho(tx);
}

export async function saveTransaction(tx: string) {
  await ddb.recordTransaction(tx, "sync");
}

export async function saveLastBroadcast(sku: string, count: number, tx?: string) {
  await ddb.updateInventory(sku, {
    lastBroadcast: {
      count,
      txId: tx || "unknown",
      timestamp: new Date().toISOString(),
    },
  });
  cache.delete(`broadcast_${sku}`);
}

export async function getLastBroadcast(sku: string) {
  const inventory = await ddb.getInventory(sku);
  return inventory?.lastBroadcast;
}

export async function recordReturn(
  sku: string,
  quantity: number,
  disposition: string,
  timestamp: string
) {
  await ddb.recordReturn(sku, quantity, disposition, sku);
}

export async function getReturns(sku: string) {
  const returns = await ddb.getReturns(sku);
  return returns.map((r) => ({
    quantity: r.quantity,
    disposition: r.disposition,
    timestamp: r.timestamp,
  }));
}

export async function saveAlerts(alerts: unknown[]) {
  // For DynamoDB, alerts are already saved individually via alertManager
  // This function is kept for compatibility but is a no-op
}

export async function getAlerts(): Promise<any[]> {
  return await ddb.getAllAlerts();
}

export async function getInventoryStatus(sku: string) {
  const inventory = await ddb.getInventory(sku);
  if (!inventory) {
    return {
      sku,
      physical: 0,
      buffer: 0,
      broadcast: 0,
    };
  }

  return {
    sku,
    physical: inventory.physical,
    buffer: inventory.buffer,
    broadcast: Math.max(0, inventory.physical - inventory.buffer),
    lastBroadcast: inventory.lastBroadcast,
  };
}

export async function getAllInventory(): Promise<Record<string, any>> {
  return await ddb.getAllInventory();
}

export default {
  initializeStore,
  getPhysicalCount,
  setPhysicalCount,
  adjustPhysicalCount,
  getBuffer,
  setBuffer,
  isEcho,
  saveTransaction,
  saveLastBroadcast,
  getLastBroadcast,
  recordReturn,
  getReturns,
  saveAlerts,
  getAlerts,
  getInventoryStatus,
  getAllInventory,
};
