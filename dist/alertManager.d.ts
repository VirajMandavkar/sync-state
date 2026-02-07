/**
 * Alert Manager - Notifies merchant of critical inventory events
 * Tracks: Damaged returns, over-stock, low stock, sync failures
 * Storage: DynamoDB
 */
export interface Alert {
    alertId: string;
    type: "return_damaged" | "return_unsellable" | "stock_low" | "sync_failed" | "manual_review";
    severity: "info" | "warning" | "critical";
    sku: string;
    message: string;
    quantity?: number;
    timestamp: number;
    read: boolean;
}
/**
 * Create and store an alert in DynamoDB
 */
export declare function createAlert(type: Alert["type"], severity: Alert["severity"], sku: string, message: string, quantity?: number): Promise<Alert>;
/**
 * Get unread alerts
 */
export declare function getUnreadAlerts(): Promise<Alert[]>;
/**
 * Get alerts by severity
 */
export declare function getAlertsBySeverity(severity: Alert["severity"]): Promise<Alert[]>;
/**
 * Get all alerts
 */
export declare function getAllAlerts(): Promise<Alert[]>;
/**
 * Mark alert as read
 */
export declare function markAlertAsRead(alertId: string): Promise<void>;
declare const _default: {
    createAlert: typeof createAlert;
    getUnreadAlerts: typeof getUnreadAlerts;
    getAlertsBySeverity: typeof getAlertsBySeverity;
    getAllAlerts: typeof getAllAlerts;
    markAlertAsRead: typeof markAlertAsRead;
};
export default _default;
//# sourceMappingURL=alertManager.d.ts.map