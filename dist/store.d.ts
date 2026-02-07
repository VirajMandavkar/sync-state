export declare function initializeStore(): Promise<void>;
export declare function getPhysicalCount(sku: string): Promise<number>;
export declare function setPhysicalCount(sku: string, n: number): Promise<void>;
export declare function adjustPhysicalCount(sku: string, delta: number): Promise<number>;
export declare function getBuffer(sku: string): Promise<number>;
export declare function setBuffer(sku: string, n: number): Promise<void>;
export declare function isEcho(tx: string): Promise<boolean>;
export declare function saveTransaction(tx: string): Promise<void>;
export declare function saveLastBroadcast(sku: string, count: number, tx?: string): Promise<void>;
export declare function getLastBroadcast(sku: string): Promise<{
    count: number;
    txId: string;
    timestamp: string;
} | undefined>;
export declare function recordReturn(sku: string, quantity: number, disposition: string, timestamp: string): Promise<void>;
export declare function getReturns(sku: string): Promise<{
    quantity: number;
    disposition: string;
    timestamp: string;
}[]>;
export declare function saveAlerts(alerts: unknown[]): Promise<void>;
export declare function getAlerts(): Promise<any[]>;
export declare function getInventoryStatus(sku: string): Promise<{
    sku: string;
    physical: number;
    buffer: number;
    broadcast: number;
    lastBroadcast?: undefined;
} | {
    sku: string;
    physical: number;
    buffer: number;
    broadcast: number;
    lastBroadcast: {
        count: number;
        txId: string;
        timestamp: string;
    } | undefined;
}>;
export declare function getAllInventory(): Promise<Record<string, any>>;
declare const _default: {
    initializeStore: typeof initializeStore;
    getPhysicalCount: typeof getPhysicalCount;
    setPhysicalCount: typeof setPhysicalCount;
    adjustPhysicalCount: typeof adjustPhysicalCount;
    getBuffer: typeof getBuffer;
    setBuffer: typeof setBuffer;
    isEcho: typeof isEcho;
    saveTransaction: typeof saveTransaction;
    saveLastBroadcast: typeof saveLastBroadcast;
    getLastBroadcast: typeof getLastBroadcast;
    recordReturn: typeof recordReturn;
    getReturns: typeof getReturns;
    saveAlerts: typeof saveAlerts;
    getAlerts: typeof getAlerts;
    getInventoryStatus: typeof getInventoryStatus;
    getAllInventory: typeof getAllInventory;
};
export default _default;
//# sourceMappingURL=store.d.ts.map