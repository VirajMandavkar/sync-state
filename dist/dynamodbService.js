"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TABLES = void 0;
exports.initializeTables = initializeTables;
exports.getInventory = getInventory;
exports.getAllInventory = getAllInventory;
exports.updateInventory = updateInventory;
exports.setInventory = setInventory;
exports.isEcho = isEcho;
exports.recordTransaction = recordTransaction;
exports.recordReturn = recordReturn;
exports.getReturns = getReturns;
exports.createAlert = createAlert;
exports.getUnreadAlerts = getUnreadAlerts;
exports.getAlertsBySeverity = getAlertsBySeverity;
exports.getAllAlerts = getAllAlerts;
exports.markAlertAsRead = markAlertAsRead;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
// Initialize DynamoDB client
const dynamodbClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AMAZON_REGION || "us-east-1",
    endpoint: process.env.DYNAMODB_LOCAL_ENDPOINT || undefined,
    credentials: process.env.DYNAMODB_LOCAL_ENDPOINT || process.env.NODE_ENV === "test"
        ? {
            accessKeyId: "local",
            secretAccessKey: "local",
        }
        : undefined,
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamodbClient);
// Table names
const MOCK_DDB = process.env.MOCK_DYNAMODB === "true";
// In-memory fallback for tests when real DynamoDB is unavailable
const inMemoryDB = {
    inventory: new Map(),
    transactions: new Map(),
    returns: new Map(),
    alerts: new Map(),
};
const TABLES = {
    INVENTORY: "SyncState-Inventory",
    TRANSACTIONS: "SyncState-Transactions",
    RETURNS: "SyncState-Returns",
    ALERTS: "SyncState-Alerts",
};
exports.TABLES = TABLES;
/**
 * Initialize all DynamoDB tables
 */
async function initializeTables() {
    console.log("📦 Initializing DynamoDB tables...");
    try {
        // Check and create Inventory table
        await ensureTable({
            TableName: TABLES.INVENTORY,
            KeySchema: [{ AttributeName: "sku", KeyType: "HASH" }],
            AttributeDefinitions: [{ AttributeName: "sku", AttributeType: "S" }],
            BillingMode: "PAY_PER_REQUEST",
        });
        console.log("✓ Inventory table ready");
        // Check and create Transactions table
        await ensureTable({
            TableName: TABLES.TRANSACTIONS,
            KeySchema: [{ AttributeName: "txId", KeyType: "HASH" }],
            AttributeDefinitions: [{ AttributeName: "txId", AttributeType: "S" }],
            BillingMode: "PAY_PER_REQUEST",
            TimeToLiveSpecification: {
                AttributeName: "expiresAt",
                Enabled: true,
            },
        });
        console.log("✓ Transactions table ready");
        // Check and create Returns table
        await ensureTable({
            TableName: TABLES.RETURNS,
            KeySchema: [
                { AttributeName: "sku", KeyType: "HASH" },
                { AttributeName: "timestamp", KeyType: "RANGE" },
            ],
            AttributeDefinitions: [
                { AttributeName: "sku", AttributeType: "S" },
                { AttributeName: "timestamp", AttributeType: "S" },
            ],
            BillingMode: "PAY_PER_REQUEST",
        });
        console.log("✓ Returns table ready");
        // Check and create Alerts table
        await ensureTable({
            TableName: TABLES.ALERTS,
            KeySchema: [{ AttributeName: "alertId", KeyType: "HASH" }],
            AttributeDefinitions: [
                { AttributeName: "alertId", AttributeType: "S" },
                { AttributeName: "sku", AttributeType: "S" },
                { AttributeName: "timestamp", AttributeType: "N" },
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: "sku-timestamp-index",
                    KeySchema: [
                        { AttributeName: "sku", KeyType: "HASH" },
                        { AttributeName: "timestamp", KeyType: "RANGE" },
                    ],
                    Projection: { ProjectionType: "ALL" },
                },
            ],
            BillingMode: "PAY_PER_REQUEST",
        });
        console.log("✓ Alerts table ready");
        console.log("✅ All DynamoDB tables initialized");
    }
    catch (error) {
        console.error("❌ Failed to initialize DynamoDB tables:", error);
        throw error;
    }
}
/**
 * Ensure a table exists, create if not
 */
async function ensureTable(params) {
    var _a;
    const tableName = params.TableName;
    console.log(`[DDB] ensureTable start: ${tableName}`);
    try {
        // Step 1: Check if table exists
        console.log(`[DDB] Attempting DescribeTable for: ${tableName}`);
        const startDescribe = Date.now();
        let tableExists = false;
        try {
            const response = await withTimeout(dynamodbClient.send(new client_dynamodb_1.DescribeTableCommand({ TableName: tableName })), 5000, `DescribeTable timeout for ${tableName}`);
            tableExists = ((_a = response.Table) === null || _a === void 0 ? void 0 : _a.TableStatus) === "ACTIVE";
            console.log(`[DDB] Table exists and active: ${tableName}`);
        }
        catch (err) {
            if (err.name === "ResourceNotFoundException") {
                console.log(`[DDB] Table not found, will create: ${tableName}`);
            }
            else {
                console.error(`[DDB] DescribeTable error (${Date.now() - startDescribe}ms):`, err.message);
                throw err;
            }
        }
        if (tableExists) {
            console.log(`[DDB] ensureTable done (already existed): ${tableName}`);
            return;
        }
        // Step 2: Create table
        console.log(`[DDB] Creating table: ${tableName}`);
        const startCreate = Date.now();
        await withTimeout(dynamodbClient.send(new client_dynamodb_1.CreateTableCommand(params)), 10000, `CreateTable timeout for ${tableName}`);
        console.log(`[DDB] CreateTable returned (${Date.now() - startCreate}ms)`);
        // Step 3: Wait for table to be ACTIVE
        console.log(`[DDB] Waiting for table to become ACTIVE: ${tableName}`);
        const startWait = Date.now();
        await waitForTableActive(tableName);
        console.log(`[DDB] Table ACTIVE (${Date.now() - startWait}ms): ${tableName}`);
        console.log(`[DDB] ensureTable done: ${tableName}`);
    }
    catch (error) {
        console.error(`[DDB] ensureTable FAILED for ${tableName}:`, error.message);
        throw error;
    }
}
/**
 * Wait for table to become ACTIVE with timeout
 */
async function waitForTableActive(tableName, timeoutMs = 5000) {
    var _a, _b;
    const startTime = Date.now();
    while (true) {
        try {
            const response = await dynamodbClient.send(new client_dynamodb_1.DescribeTableCommand({ TableName: tableName }));
            if (((_a = response.Table) === null || _a === void 0 ? void 0 : _a.TableStatus) === "ACTIVE") {
                console.log(`[DDB] Table ACTIVE confirmed: ${tableName}`);
                return;
            }
            console.log(`[DDB] Table status ${(_b = response.Table) === null || _b === void 0 ? void 0 : _b.TableStatus}, retrying...`);
        }
        catch (err) {
            console.error(`[DDB] DescribeTable during wait error:`, err.message);
        }
        // Check timeout
        if (Date.now() - startTime > timeoutMs) {
            throw new Error(`[DDB] Timeout (${timeoutMs}ms) waiting for table ACTIVE: ${tableName}`);
        }
        // Wait before retrying
        await new Promise((r) => setTimeout(r, 500));
    }
}
/**
 * Wrapper to add timeout to any async operation
 */
function withTimeout(promise, timeoutMs, message) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
    ]);
}
/**
 * Inventory Operations
 */
async function getInventory(sku) {
    try {
        const response = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: TABLES.INVENTORY,
            Key: { sku },
        }));
        return response.Item || null;
    }
    catch (error) {
        console.error(`Error getting inventory for ${sku}:`, error);
        throw error;
    }
}
async function getAllInventory() {
    try {
        const response = await docClient.send(new lib_dynamodb_1.ScanCommand({
            TableName: TABLES.INVENTORY,
        }));
        const inventory = {};
        if (response.Items) {
            for (const item of response.Items) {
                const invItem = item;
                inventory[invItem.sku] = invItem;
            }
        }
        return inventory;
    }
    catch (error) {
        console.error("Error getting all inventory:", error);
        throw error;
    }
}
async function updateInventory(sku, updates) {
    try {
        const updateExpression = [];
        const expressionAttributeValues = {};
        const expressionAttributeNames = {};
        for (const [key, value] of Object.entries(updates)) {
            if (key !== "sku") {
                const placeholderName = `#${key}`;
                expressionAttributeNames[placeholderName] = key;
                updateExpression.push(`${placeholderName} = :${key}`);
                expressionAttributeValues[`:${key}`] = value;
            }
        }
        expressionAttributeNames["#updatedAt"] = "updatedAt";
        expressionAttributeValues[":updatedAt"] = new Date().toISOString();
        updateExpression.push("#updatedAt = :updatedAt");
        if (updateExpression.length === 0)
            return;
        // Use SET prefix and attribute name placeholders to avoid reserved word issues
        await docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: TABLES.INVENTORY,
            Key: { sku },
            UpdateExpression: `SET ${updateExpression.join(", ")}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
        }));
    }
    catch (error) {
        console.error(`Error updating inventory for ${sku}:`, error);
        throw error;
    }
}
async function setInventory(sku, inventory) {
    try {
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: TABLES.INVENTORY,
            Item: {
                sku,
                ...inventory,
                updatedAt: new Date().toISOString(),
            },
        }));
    }
    catch (error) {
        console.error(`Error setting inventory for ${sku}:`, error);
        throw error;
    }
}
/**
 * Transaction Operations (Echo Prevention)
 */
async function isEcho(txId) {
    try {
        if (MOCK_DDB) {
            return inMemoryDB.transactions.has(txId);
        }
        const response = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: TABLES.TRANSACTIONS,
            Key: { txId },
        }));
        return !!response.Item;
    }
    catch (error) {
        console.error(`Error checking echo for ${txId}:`, error);
        throw error;
    }
}
async function recordTransaction(txId, action) {
    try {
        if (MOCK_DDB) {
            inMemoryDB.transactions.set(txId, {
                txId,
                timestamp: new Date().toISOString(),
                action,
                status: "completed",
                expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            });
            return;
        }
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: TABLES.TRANSACTIONS,
            Item: {
                txId,
                timestamp: new Date().toISOString(),
                action,
                status: "completed",
                // TTL: 30 days
                expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            },
        }));
    }
    catch (error) {
        console.error(`Error recording transaction ${txId}:`, error);
        throw error;
    }
}
/**
 * Return Operations (Audit Trail)
 */
async function recordReturn(sku, quantity, disposition, orderId) {
    try {
        const timestamp = new Date().toISOString();
        if (MOCK_DDB) {
            const existing = inMemoryDB.returns.get(sku) || [];
            existing.push({ sku, timestamp, quantity, disposition, orderId });
            inMemoryDB.returns.set(sku, existing);
            return;
        }
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: TABLES.RETURNS,
            Item: {
                sku,
                timestamp,
                quantity,
                disposition,
                orderId,
            },
        }));
    }
    catch (error) {
        console.error(`Error recording return for ${sku}:`, error);
        throw error;
    }
}
async function getReturns(sku) {
    try {
        if (MOCK_DDB) {
            return (inMemoryDB.returns.get(sku) || []);
        }
        const response = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: TABLES.RETURNS,
            KeyConditionExpression: "sku = :sku",
            ExpressionAttributeValues: {
                ":sku": sku,
            },
        }));
        return response.Items || [];
    }
    catch (error) {
        console.error(`Error getting returns for ${sku}:`, error);
        throw error;
    }
}
async function createAlert(type, severity, sku, message) {
    try {
        const alert = {
            alertId: (0, uuid_1.v4)(),
            type,
            severity,
            sku,
            message,
            timestamp: Date.now(),
            read: false,
        };
        if (MOCK_DDB) {
            const arr = inMemoryDB.alerts.get(sku) || [];
            arr.push(alert);
            inMemoryDB.alerts.set(sku, arr);
            return alert;
        }
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: TABLES.ALERTS,
            Item: alert,
        }));
        return alert;
    }
    catch (error) {
        console.error("Error creating alert:", error);
        throw error;
    }
}
async function getUnreadAlerts() {
    try {
        if (MOCK_DDB) {
            const all = [];
            for (const arr of inMemoryDB.alerts.values()) {
                for (const a of arr)
                    if (!a.read)
                        all.push(a);
            }
            return all;
        }
        const response = await docClient.send(new lib_dynamodb_1.ScanCommand({
            TableName: TABLES.ALERTS,
            FilterExpression: "#read = :false",
            ExpressionAttributeNames: {
                "#read": "read",
            },
            ExpressionAttributeValues: {
                ":false": false,
            },
        }));
        return response.Items || [];
    }
    catch (error) {
        console.error("Error getting unread alerts:", error);
        throw error;
    }
}
async function getAlertsBySeverity(severity) {
    try {
        if (MOCK_DDB) {
            const out = [];
            for (const arr of inMemoryDB.alerts.values()) {
                for (const a of arr)
                    if (a.severity === severity)
                        out.push(a);
            }
            return out;
        }
        const response = await docClient.send(new lib_dynamodb_1.ScanCommand({
            TableName: TABLES.ALERTS,
            FilterExpression: "severity = :severity",
            ExpressionAttributeValues: {
                ":severity": severity,
            },
        }));
        return response.Items || [];
    }
    catch (error) {
        console.error(`Error getting alerts with severity ${severity}:`, error);
        throw error;
    }
}
async function getAllAlerts() {
    try {
        if (MOCK_DDB) {
            const all = [];
            for (const arr of inMemoryDB.alerts.values()) {
                for (const a of arr)
                    all.push(a);
            }
            return all;
        }
        const response = await docClient.send(new lib_dynamodb_1.ScanCommand({
            TableName: TABLES.ALERTS,
        }));
        return response.Items || [];
    }
    catch (error) {
        console.error("Error getting all alerts:", error);
        throw error;
    }
}
async function markAlertAsRead(alertId) {
    try {
        if (MOCK_DDB) {
            for (const arr of inMemoryDB.alerts.values()) {
                const idx = arr.findIndex((a) => a.alertId === alertId);
                if (idx >= 0) {
                    arr[idx].read = true;
                    return;
                }
            }
            return;
        }
        await docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: TABLES.ALERTS,
            Key: { alertId },
            UpdateExpression: "SET #read = :true",
            ExpressionAttributeNames: {
                "#read": "read",
            },
            ExpressionAttributeValues: {
                ":true": true,
            },
        }));
    }
    catch (error) {
        console.error(`Error marking alert ${alertId} as read:`, error);
        throw error;
    }
}
//# sourceMappingURL=dynamodbService.js.map