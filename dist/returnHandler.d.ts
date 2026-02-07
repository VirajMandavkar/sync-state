/**
 * Return Handler - Processes Amazon FBA return events
 * Handles the "Ghost Restock Trap" by filtering dispositions
 */
import { ReturnEvent, ReturnDisposition } from "./dispositionFilter";
/**
 * Process an Amazon FBA return event
 * This would normally come from Amazon's FBA_INVENTORY_AVAILABILITY_CHANGES webhook
 */
export declare function processReturn(event: ReturnEvent): Promise<{
    processed: boolean;
    synced: boolean;
    action: string;
    inventoryAfter?: number;
    broadcastAfter?: number;
    alert?: {
        id: string;
        message: string;
    };
}>;
/**
 * Simulate a return event (for testing)
 * In production, this would come from Amazon's webhook
 */
export declare function createMockReturn(sku: string, quantity: number, disposition: ReturnDisposition, reason?: string): ReturnEvent;
declare const _default: {
    processReturn: typeof processReturn;
    createMockReturn: typeof createMockReturn;
};
export default _default;
//# sourceMappingURL=returnHandler.d.ts.map