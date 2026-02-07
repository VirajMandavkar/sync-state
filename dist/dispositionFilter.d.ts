/**
 * Disposition Filter - The "Ghost Restock Trap" Prevention
 *
 * Amazon FBA returns have different dispositions:
 * - SELLABLE: Can be restocked immediately
 * - UNSELLABLE: Damage, defect, or customer hazard (do NOT sync back to Shopify)
 * - CUSTOMER_DAMAGED: Customer broke it (do NOT sync back to Shopify, alert merchant)
 * - WAREHOUSE_DAMAGED: We damaged it (do NOT sync to Shopify, consult with team)
 *
 * This prevents the "Ghost Restock Trap": where we add damaged inventory back to Shopify
 * and a new customer unknowingly buys a broken product.
 */
export declare enum ReturnDisposition {
    SELLABLE = "SELLABLE",
    UNSELLABLE = "UNSELLABLE",
    CUSTOMER_DAMAGED = "CUSTOMER_DAMAGED",
    WAREHOUSE_DAMAGED = "WAREHOUSE_DAMAGED",
    CARRIER_DAMAGED = "CARRIER_DAMAGED",
    UNKNOWN = "UNKNOWN"
}
export interface ReturnEvent {
    sku: string;
    quantity: number;
    disposition: ReturnDisposition;
    returnOrderId: string;
    reason: string;
    timestamp: string;
    tx: string;
}
export interface DispositionDecision {
    shouldSyncToShopify: boolean;
    shouldAlert: boolean;
    alertSeverity: "info" | "warning" | "critical";
    reason: string;
    action: "sync" | "ignore" | "alert_only" | "quarantine";
}
/**
 * Filter return event by disposition
 * Returns decision on whether to sync back to Shopify
 */
export declare function filterByDisposition(event: ReturnEvent): DispositionDecision;
declare const _default: {
    filterByDisposition: typeof filterByDisposition;
    ReturnDisposition: typeof ReturnDisposition;
};
export default _default;
//# sourceMappingURL=dispositionFilter.d.ts.map