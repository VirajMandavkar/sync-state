"use strict";
/**
 * Alert Manager - Notifies merchant of critical inventory events
 * Tracks: Damaged returns, over-stock, low stock, sync failures
 * Storage: DynamoDB
 */
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
exports.createAlert = createAlert;
exports.getUnreadAlerts = getUnreadAlerts;
exports.getAlertsBySeverity = getAlertsBySeverity;
exports.getAllAlerts = getAllAlerts;
exports.markAlertAsRead = markAlertAsRead;
const ddb = __importStar(require("./dynamodbService"));
/**
 * Create and store an alert in DynamoDB
 */
async function createAlert(type, severity, sku, message, quantity) {
    const alert = await ddb.createAlert(type, severity, sku, message);
    // Log based on severity
    const icon = severity === "critical" ? "🚨" : severity === "warning" ? "⚠️" : "ℹ️";
    console.log(`${icon} [ALERT] ${type.toUpperCase()} - ${message}`);
    return alert;
}
/**
 * Get unread alerts
 */
async function getUnreadAlerts() {
    const alerts = await ddb.getUnreadAlerts();
    return alerts.map((a) => ({
        alertId: a.alertId,
        type: a.type,
        severity: a.severity,
        sku: a.sku,
        message: a.message,
        timestamp: a.timestamp,
        read: a.read,
    }));
}
/**
 * Get alerts by severity
 */
async function getAlertsBySeverity(severity) {
    const alerts = await ddb.getAlertsBySeverity(severity);
    return alerts.map((a) => ({
        alertId: a.alertId,
        type: a.type,
        severity: a.severity,
        sku: a.sku,
        message: a.message,
        timestamp: a.timestamp,
        read: a.read,
    }));
}
/**
 * Get all alerts
 */
async function getAllAlerts() {
    const alerts = await ddb.getAllAlerts();
    return alerts
        .map((a) => ({
        alertId: a.alertId,
        type: a.type,
        severity: a.severity,
        sku: a.sku,
        message: a.message,
        timestamp: a.timestamp,
        read: a.read,
    }))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
/**
 * Mark alert as read
 */
async function markAlertAsRead(alertId) {
    await ddb.markAlertAsRead(alertId);
}
exports.default = {
    createAlert,
    getUnreadAlerts,
    getAlertsBySeverity,
    getAllAlerts,
    markAlertAsRead
};
//# sourceMappingURL=alertManager.js.map