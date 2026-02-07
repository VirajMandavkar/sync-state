"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReturnDisposition = void 0;
exports.filterByDisposition = filterByDisposition;
var ReturnDisposition;
(function (ReturnDisposition) {
    ReturnDisposition["SELLABLE"] = "SELLABLE";
    ReturnDisposition["UNSELLABLE"] = "UNSELLABLE";
    ReturnDisposition["CUSTOMER_DAMAGED"] = "CUSTOMER_DAMAGED";
    ReturnDisposition["WAREHOUSE_DAMAGED"] = "WAREHOUSE_DAMAGED";
    ReturnDisposition["CARRIER_DAMAGED"] = "CARRIER_DAMAGED";
    ReturnDisposition["UNKNOWN"] = "UNKNOWN";
})(ReturnDisposition || (exports.ReturnDisposition = ReturnDisposition = {}));
/**
 * Filter return event by disposition
 * Returns decision on whether to sync back to Shopify
 */
function filterByDisposition(event) {
    switch (event.disposition) {
        case ReturnDisposition.SELLABLE:
            return {
                shouldSyncToShopify: true,
                shouldAlert: false,
                alertSeverity: "info",
                reason: `Return is sellable. Syncing ${event.quantity} units of ${event.sku} back to Shopify.`,
                action: "sync"
            };
        case ReturnDisposition.CUSTOMER_DAMAGED:
            return {
                shouldSyncToShopify: false,
                shouldAlert: true,
                alertSeverity: "warning",
                reason: `Customer damaged return. DO NOT sync ${event.quantity} units of ${event.sku}. Review before restocking. Reason: ${event.reason}`,
                action: "alert_only"
            };
        case ReturnDisposition.WAREHOUSE_DAMAGED:
            return {
                shouldSyncToShopify: false,
                shouldAlert: true,
                alertSeverity: "critical",
                reason: `Warehouse damaged during processing. ${event.quantity} units of ${event.sku} quarantined. Reason: ${event.reason}`,
                action: "quarantine"
            };
        case ReturnDisposition.CARRIER_DAMAGED:
            return {
                shouldSyncToShopify: false,
                shouldAlert: true,
                alertSeverity: "warning",
                reason: `Carrier damaged in transit. ${event.quantity} units of ${event.sku} quarantined. Submit damage claim.`,
                action: "quarantine"
            };
        case ReturnDisposition.UNSELLABLE:
            return {
                shouldSyncToShopify: false,
                shouldAlert: true,
                alertSeverity: "info",
                reason: `Unsellable return for ${event.sku} (qty: ${event.quantity}). Will be disposed of. Reason: ${event.reason}`,
                action: "ignore"
            };
        default:
            return {
                shouldSyncToShopify: false,
                shouldAlert: true,
                alertSeverity: "warning",
                reason: `Unknown disposition for return. ${event.sku} (qty: ${event.quantity}). Manual review required.`,
                action: "alert_only"
            };
    }
}
exports.default = { filterByDisposition, ReturnDisposition };
//# sourceMappingURL=dispositionFilter.js.map