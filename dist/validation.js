"use strict";
/**
 * Input Validation Utilities
 * Ensures all inputs meet expected types, ranges, and formats
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSku = validateSku;
exports.validateOrderQuantity = validateOrderQuantity;
exports.validateReturnQuantity = validateReturnQuantity;
exports.validateBufferQuantity = validateBufferQuantity;
exports.validateDisposition = validateDisposition;
exports.validateSeverity = validateSeverity;
exports.validateAlertLevel = validateAlertLevel;
exports.validateOrderId = validateOrderId;
exports.validateReason = validateReason;
/**
 * Validate SKU
 * - Must be non-empty string (after trim)
 * - Max 200 characters
 */
function validateSku(sku) {
    const cleaned = String(sku || "").trim();
    if (!cleaned) {
        return { valid: false, error: "SKU cannot be empty" };
    }
    if (cleaned.length > 200) {
        return { valid: false, error: "SKU cannot exceed 200 characters" };
    }
    return { valid: true, value: cleaned };
}
/**
 * Validate Quantity (for orders/sales)
 * - Must be positive integer
 * - Range: 1 to 1,000,000
 */
function validateOrderQuantity(qty) {
    const num = Number(qty !== null && qty !== void 0 ? qty : 0);
    if (!Number.isInteger(num)) {
        return { valid: false, error: "Quantity must be an integer" };
    }
    if (num <= 0) {
        return { valid: false, error: "Quantity must be positive (>0)" };
    }
    if (num > 1000000) {
        return { valid: false, error: "Quantity too large (max: 1,000,000)" };
    }
    return { valid: true, value: num };
}
/**
 * Validate Return Quantity
 * - Must be positive integer
 * - Range: 1 to 1,000,000
 */
function validateReturnQuantity(qty) {
    const num = Number(qty !== null && qty !== void 0 ? qty : 0);
    if (!Number.isInteger(num)) {
        return { valid: false, error: "Return quantity must be an integer" };
    }
    if (num <= 0) {
        return { valid: false, error: "Return quantity must be positive (>0)" };
    }
    if (num > 1000000) {
        return { valid: false, error: "Return quantity too large" };
    }
    return { valid: true, value: num };
}
/**
 * Validate Buffer Quantity
 * - Must be non-negative integer
 * - Range: 0 to 1,000,000
 */
function validateBufferQuantity(buffer) {
    if (buffer === null || buffer === undefined || buffer === "") {
        return { valid: false, error: "Buffer is required" };
    }
    if (typeof buffer === "string" && buffer.trim() === "") {
        return { valid: false, error: "Buffer cannot be empty" };
    }
    const num = Number(buffer);
    if (!Number.isFinite(num)) {
        return { valid: false, error: "Buffer must be a number" };
    }
    if (!Number.isInteger(num)) {
        return { valid: false, error: "Buffer must be an integer (no decimals)" };
    }
    if (num < 0) {
        return { valid: false, error: "Buffer cannot be negative" };
    }
    if (num > 1000000) {
        return { valid: false, error: "Buffer too large (max: 1,000,000)" };
    }
    return { valid: true, value: num };
}
/**
 * Validate Disposition
 * - Must be one of the valid disposition types
 */
function validateDisposition(disposition) {
    const valid = [
        "SELLABLE",
        "CUSTOMER_DAMAGED",
        "WAREHOUSE_DAMAGED",
        "CARRIER_DAMAGED",
        "UNSELLABLE",
        "UNKNOWN"
    ];
    const normalized = String(disposition || "").toUpperCase();
    if (!valid.includes(normalized)) {
        return {
            valid: false,
            error: `Invalid disposition. Must be one of: ${valid.join(", ")}`
        };
    }
    return { valid: true, value: normalized };
}
/**
 * Validate Severity
 * - Must be one of: info, warning, critical
 */
function validateSeverity(severity) {
    const valid = ["info", "warning", "critical"];
    const normalized = String(severity || "").toLowerCase();
    if (!valid.includes(normalized)) {
        return {
            valid: false,
            error: `Invalid severity. Must be one of: ${valid.join(", ")}`
        };
    }
    return { valid: true, value: normalized };
}
/**
 * Validate Alert Level (alias for severity in queries)
 */
function validateAlertLevel(level) {
    return validateSeverity(level);
}
/**
 * Validate Order ID
 * - Must be non-empty string
 * - Max 100 characters
 */
function validateOrderId(orderId) {
    const cleaned = String(orderId || "").trim();
    if (cleaned.length > 100) {
        return { valid: false, error: "Order ID cannot exceed 100 characters" };
    }
    // Allow empty string (will use "unknown" as fallback)
    return { valid: true, value: cleaned || "unknown" };
}
/**
 * Validate Reason
 * - Optional string field
 * - Max 500 characters
 */
function validateReason(reason) {
    const cleaned = String(reason || "").trim();
    if (cleaned.length > 500) {
        return { valid: false, error: "Reason cannot exceed 500 characters" };
    }
    return { valid: true, value: cleaned || "No reason provided" };
}
exports.default = {
    validateSku,
    validateOrderQuantity,
    validateReturnQuantity,
    validateBufferQuantity,
    validateDisposition,
    validateSeverity,
    validateAlertLevel,
    validateOrderId,
    validateReason,
};
//# sourceMappingURL=validation.js.map