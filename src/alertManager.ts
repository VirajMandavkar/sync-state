/**
 * Alert Manager - Notifies merchant of critical inventory events
 * Tracks: Damaged returns, over-stock, low stock, sync failures
 * Storage: DynamoDB
 */

import * as ddb from "./dynamodbService";

export interface Alert {
  alertId: string;
  type:
    | "return_damaged"
    | "return_unsellable"
    | "stock_low"
    | "sync_failed"
    | "manual_review";
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
export async function createAlert(
  type: Alert["type"],
  severity: Alert["severity"],
  sku: string,
  message: string,
  quantity?: number
): Promise<Alert> {
  const alert = await ddb.createAlert(type, severity, sku, message);

  // Log based on severity
  const icon = severity === "critical" ? "🚨" : severity === "warning" ? "⚠️" : "ℹ️";
  console.log(`${icon} [ALERT] ${type.toUpperCase()} - ${message}`);

  return alert as Alert;
}

/**
 * Get unread alerts
 */
export async function getUnreadAlerts(): Promise<Alert[]> {
  const alerts = await ddb.getUnreadAlerts();
  return alerts.map((a) => ({
    alertId: a.alertId,
    type: a.type as Alert["type"],
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
export async function getAlertsBySeverity(severity: Alert["severity"]): Promise<Alert[]> {
  const alerts = await ddb.getAlertsBySeverity(severity);
  return alerts.map((a) => ({
    alertId: a.alertId,
    type: a.type as Alert["type"],
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
export async function getAllAlerts(): Promise<Alert[]> {
  const alerts = await ddb.getAllAlerts();
  return alerts
    .map((a) => ({
      alertId: a.alertId,
      type: a.type as Alert["type"],
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
export async function markAlertAsRead(alertId: string): Promise<void> {
  await ddb.markAlertAsRead(alertId);
}

export default {
  createAlert,
  getUnreadAlerts,
  getAlertsBySeverity,
  getAllAlerts,
  markAlertAsRead
};
