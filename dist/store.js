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
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeStore = initializeStore;
exports.getPhysicalCount = getPhysicalCount;
exports.setPhysicalCount = setPhysicalCount;
exports.adjustPhysicalCount = adjustPhysicalCount;
exports.getBuffer = getBuffer;
exports.setBuffer = setBuffer;
exports.isEcho = isEcho;
exports.saveTransaction = saveTransaction;
exports.saveLastBroadcast = saveLastBroadcast;
exports.getLastBroadcast = getLastBroadcast;
exports.recordReturn = recordReturn;
exports.getReturns = getReturns;
exports.saveAlerts = saveAlerts;
exports.getAlerts = getAlerts;
exports.getInventoryStatus = getInventoryStatus;
exports.getAllInventory = getAllInventory;
const ddb = __importStar(require("./dynamodbService"));
// Cache for performance (reduces DynamoDB queries)
const cache = new Map();
const CACHE_TTL = 60000; // 1 minute
function getCached(key) {
    const item = cache.get(key);
    if (item && Date.now() - item.timestamp < CACHE_TTL) {
        return item.data;
    }
    cache.delete(key);
    return null;
}
function setCached(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}
async function initializeStore() {
    await ddb.initializeTables();
}
async function getPhysicalCount(sku) {
    var _a;
    const cacheKey = `physical_${sku}`;
    const cached = getCached(cacheKey);
    if (cached !== null)
        return cached;
    const inventory = await ddb.getInventory(sku);
    const count = (_a = inventory === null || inventory === void 0 ? void 0 : inventory.physical) !== null && _a !== void 0 ? _a : 0;
    setCached(cacheKey, count);
    return count;
}
async function setPhysicalCount(sku, n) {
    await ddb.setInventory(sku, { physical: n });
    setCached(`physical_${sku}`, n);
    cache.delete(`broadcast_${sku}`); // Invalidate broadcast cache
}
async function adjustPhysicalCount(sku, delta) {
    const cur = await getPhysicalCount(sku);
    const next = Math.max(0, cur + delta);
    await setPhysicalCount(sku, next);
    return next;
}
async function getBuffer(sku) {
    var _a;
    const cacheKey = `buffer_${sku}`;
    const cached = getCached(cacheKey);
    if (cached !== null)
        return cached;
    const inventory = await ddb.getInventory(sku);
    const buffer = (_a = inventory === null || inventory === void 0 ? void 0 : inventory.buffer) !== null && _a !== void 0 ? _a : 0;
    setCached(cacheKey, buffer);
    return buffer;
}
async function setBuffer(sku, n) {
    const buffer = Math.max(0, n);
    await ddb.setInventory(sku, { buffer });
    setCached(`buffer_${sku}`, buffer);
    cache.delete(`broadcast_${sku}`); // Invalidate broadcast cache
}
async function isEcho(tx) {
    return await ddb.isEcho(tx);
}
async function saveTransaction(tx) {
    await ddb.recordTransaction(tx, "sync");
}
async function saveLastBroadcast(sku, count, tx) {
    await ddb.updateInventory(sku, {
        lastBroadcast: {
            count,
            txId: tx || "unknown",
            timestamp: new Date().toISOString(),
        },
    });
    cache.delete(`broadcast_${sku}`);
}
async function getLastBroadcast(sku) {
    const inventory = await ddb.getInventory(sku);
    return inventory === null || inventory === void 0 ? void 0 : inventory.lastBroadcast;
}
async function recordReturn(sku, quantity, disposition, timestamp) {
    await ddb.recordReturn(sku, quantity, disposition, sku);
}
async function getReturns(sku) {
    const returns = await ddb.getReturns(sku);
    return returns.map((r) => ({
        quantity: r.quantity,
        disposition: r.disposition,
        timestamp: r.timestamp,
    }));
}
async function saveAlerts(alerts) {
    // For DynamoDB, alerts are already saved individually via alertManager
    // This function is kept for compatibility but is a no-op
}
async function getAlerts() {
    return await ddb.getAllAlerts();
}
async function getInventoryStatus(sku) {
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
async function getAllInventory() {
    return await ddb.getAllInventory();
}
exports.default = {
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
//# sourceMappingURL=store.js.map