/**
 * Input Validation Utilities
 * Ensures all inputs meet expected types, ranges, and formats
 */
export interface ValidationResult {
    valid: boolean;
    error?: string;
    value?: any;
}
/**
 * Validate SKU
 * - Must be non-empty string (after trim)
 * - Max 200 characters
 */
export declare function validateSku(sku: any): ValidationResult;
/**
 * Validate Quantity (for orders/sales)
 * - Must be positive integer
 * - Range: 1 to 1,000,000
 */
export declare function validateOrderQuantity(qty: any): ValidationResult;
/**
 * Validate Return Quantity
 * - Must be positive integer
 * - Range: 1 to 1,000,000
 */
export declare function validateReturnQuantity(qty: any): ValidationResult;
/**
 * Validate Buffer Quantity
 * - Must be non-negative integer
 * - Range: 0 to 1,000,000
 */
export declare function validateBufferQuantity(buffer: unknown): ValidationResult;
/**
 * Validate Disposition
 * - Must be one of the valid disposition types
 */
export declare function validateDisposition(disposition: any): ValidationResult;
/**
 * Validate Severity
 * - Must be one of: info, warning, critical
 */
export declare function validateSeverity(severity: any): ValidationResult;
/**
 * Validate Alert Level (alias for severity in queries)
 */
export declare function validateAlertLevel(level: any): ValidationResult;
/**
 * Validate Order ID
 * - Must be non-empty string
 * - Max 100 characters
 */
export declare function validateOrderId(orderId: any): ValidationResult;
/**
 * Validate Reason
 * - Optional string field
 * - Max 500 characters
 */
export declare function validateReason(reason: any): ValidationResult;
declare const _default: {
    validateSku: typeof validateSku;
    validateOrderQuantity: typeof validateOrderQuantity;
    validateReturnQuantity: typeof validateReturnQuantity;
    validateBufferQuantity: typeof validateBufferQuantity;
    validateDisposition: typeof validateDisposition;
    validateSeverity: typeof validateSeverity;
    validateAlertLevel: typeof validateAlertLevel;
    validateOrderId: typeof validateOrderId;
    validateReason: typeof validateReason;
};
export default _default;
//# sourceMappingURL=validation.d.ts.map