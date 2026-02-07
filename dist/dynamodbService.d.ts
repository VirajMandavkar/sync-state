declare const TABLES: {
    INVENTORY: string;
    TRANSACTIONS: string;
    RETURNS: string;
    ALERTS: string;
};
interface InventoryItem {
    sku: string;
    physical: number;
    buffer: number;
    broadcast: number;
    lastBroadcast?: {
        count: number;
        txId: string;
        timestamp: string;
    };
    updatedAt: string;
}
interface ReturnItem {
    sku: string;
    timestamp: string;
    quantity: number;
    disposition: string;
    orderId: string;
}
interface AlertItem {
    alertId: string;
    type: string;
    severity: "info" | "warning" | "critical";
    sku: string;
    message: string;
    timestamp: number;
    read: boolean;
}
/**
 * Initialize all DynamoDB tables
 */
export declare function initializeTables(): Promise<void>;
/**
 * Inventory Operations
 */
export declare function getInventory(sku: string): Promise<InventoryItem | null>;
export declare function getAllInventory(): Promise<Record<string, InventoryItem>>;
export declare function updateInventory(sku: string, updates: Partial<InventoryItem>): Promise<void>;
export declare function setInventory(sku: string, inventory: Partial<InventoryItem>): Promise<void>;
/**
 * Transaction Operations (Echo Prevention)
 */
export declare function isEcho(txId: string): Promise<boolean>;
export declare function recordTransaction(txId: string, action: string): Promise<void>;
/**
 * Return Operations (Audit Trail)
 */
export declare function recordReturn(sku: string, quantity: number, disposition: string, orderId: string): Promise<void>;
export declare function getReturns(sku: string): Promise<ReturnItem[]>;
export declare function createAlert(type: string, severity: "info" | "warning" | "critical", sku: string, message: string): Promise<AlertItem>;
export declare function getUnreadAlerts(): Promise<AlertItem[]>;
export declare function getAlertsBySeverity(severity: string): Promise<AlertItem[]>;
export declare function getAllAlerts(): Promise<AlertItem[]>;
export declare function markAlertAsRead(alertId: string): Promise<void>;
export { TABLES };
//# sourceMappingURL=dynamodbService.d.ts.map