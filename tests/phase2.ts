/**
 * Phase 2 Tests: Return Handling & Disposition Filtering
 * Tests the "Ghost Restock Trap" prevention
 */

import axios from "axios";
import { spawn } from "child_process";
import path from "path";

const TEST_PORT = 3001;
const API_URL = `http://localhost:${TEST_PORT}`;
let serverProcess: any = null;

// Function to start the server
async function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Starting Express server on port ${TEST_PORT}...`);
    const rootDir = path.resolve(__dirname, "..");
    serverProcess = spawn("npm", ["run", "start"], {
      cwd: rootDir,
      stdio: "pipe",
      shell: true,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        MOCK_DYNAMODB: "true"
      }
    });

    const serverReadyTimeout = setTimeout(() => {
      reject(new Error(`Server failed to start within 10 seconds on port ${TEST_PORT}`));
    }, 10000);

    serverProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      console.log("[SERVER]", output);
      
      // Look for our unmistakable startup message
      if (output.includes("🔥 REAL SYNCSTATE SERVER STARTED")) {
        clearTimeout(serverReadyTimeout);
        console.log("✅ Server is ready!\n");
        resolve();
      }
    });

    serverProcess.stderr?.on("data", (data: Buffer) => {
      console.error("[SERVER-ERROR]", data.toString());
    });

    serverProcess.on("error", (err: Error) => {
      clearTimeout(serverReadyTimeout);
      reject(err);
    });
  });
}

// Function to stop the server
async function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (serverProcess) {
      console.log("\n🛑 Stopping server...");
      serverProcess.kill();
      setTimeout(resolve, 1000);
    } else {
      resolve();
    }
  });
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

const results: TestResult[] = [];

// Helper to send return
async function sendReturn(
  sku: string,
  quantity: number,
  disposition: string,
  reason?: string
) {
  try {
    const response = await axios.post(`${API_URL}/webhook/amazon/return`, {
      sku,
      quantity,
      disposition,
      returnOrderId: `RET-${Date.now()}`,
      reason: reason ?? "Test return"
    });
    return response.data;
  } catch (err) {
    throw err;
  }
}

// Helper to set buffer
async function setBuffer(sku: string, buffer: number) {
  try {
    console.log(`[TEST-DEBUG] Sending buffer request - sku: "${sku}", buffer: ${buffer}, type: ${typeof buffer}`);
    const payload = { bufferQty: buffer };
    console.log(`[TEST-DEBUG] Payload:`, JSON.stringify(payload));
    const response = await axios.post(`${API_URL}/api/buffer/${sku}`, payload);
    console.log(`[TEST-DEBUG] Buffer success:`, response.data);
    return response.data;
  } catch (err) {
    console.log(`[TEST-DEBUG] Buffer error caught:`, err instanceof Error ? err.message : String(err));
    if (axios.isAxiosError(err) && err.response) {
      console.log(`[TEST-DEBUG] Response status: ${err.response.status}, data: ${JSON.stringify(err.response.data)}`);
      throw new Error(`Buffer API error [${err.response.status}]: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

// Helper to set initial inventory
async function setInitialInventory(sku: string, quantity: number) {
  for (let i = 0; i < quantity; i++) {
    await axios.post(`${API_URL}/webhook/shopify`, {
      orderId: `init-${sku}-${i}`,
      items: [{ sku, quantity: 1 }]
    });
  }
}

// Test 1: SELLABLE return - should sync back to Shopify
async function test_sellableReturn() {
  try {
    const sku = "SELLABLE-" + Date.now();

    // Start: create inventory
    await setInitialInventory(sku, 5);

    // Simulate order (decrements to 4)
    await axios.post(`${API_URL}/webhook/shopify`, {
      orderId: "order-1",
      items: [{ sku, quantity: 1 }]
    });

    // Wait for processing
    await new Promise((res) => setTimeout(res, 1000));

    // Return the 1 unit as SELLABLE
    const result = await sendReturn(sku, 1, "SELLABLE", "Customer changed mind");

    results.push({
      name: "SELLABLE Return Syncs Back to Shopify",
      passed: result.processed && result.synced,
      details: {
        sku,
        synced: result.synced,
        hasAlert: !!result.alert,
        message: result.alert?.message ?? "No alert (expected)"
      }
    });
  } catch (err) {
    results.push({
      name: "SELLABLE Return Syncs Back to Shopify",
      passed: false,
      error: String(err)
    });
  }
}

// Test 2: CUSTOMER_DAMAGED - should NOT sync, should alert
async function test_customerDamagedReturn() {
  try {
    const sku = "DAMAGED-CUST-" + Date.now();

    // Create inventory
    await setInitialInventory(sku, 5);

    // Simulate order
    await axios.post(`${API_URL}/webhook/shopify`, {
      orderId: "order-damaged-1",
      items: [{ sku, quantity: 1 }]
    });

    await new Promise((res) => setTimeout(res, 500));

    // Return as CUSTOMER_DAMAGED
    const result = await sendReturn(
      sku,
      1,
      "CUSTOMER_DAMAGED",
      "Water damage, not user error"
    );

    // Verify alert was created
    const alerts = await axios.get(`${API_URL}/api/alerts/severity/warning`);
    const relevantAlert = alerts.data.alerts.some(
      (a: unknown) => typeof a === "object" && (a as Record<string, unknown>).sku === sku
    );

    results.push({
      name: "CUSTOMER_DAMAGED Return Blocks Sync + Alerts",
      passed: result.processed && !result.synced && result.alert && relevantAlert,
      details: {
        sku,
        synced: result.synced,
        alertCreated: !!result.alert,
        alertFoundInSystem: relevantAlert
      }
    });
  } catch (err) {
    results.push({
      name: "CUSTOMER_DAMAGED Return Blocks Sync + Alerts",
      passed: false,
      error: String(err)
    });
  }
}

// Test 3: WAREHOUSE_DAMAGED - should quarantine
async function test_warehouseDamagedReturn() {
  try {
    const sku = "DAMAGED-WH-" + Date.now();

    await setInitialInventory(sku, 5);
    await axios.post(`${API_URL}/webhook/shopify`, {
      orderId: "order-wh-1",
      items: [{ sku, quantity: 1 }]
    });

    await new Promise((res) => setTimeout(res, 500));

    const result = await sendReturn(
      sku,
      1,
      "WAREHOUSE_DAMAGED",
      "Damaged during pick/pack"
    );

    results.push({
      name: "WAREHOUSE_DAMAGED Return Quarantines (Critical Alert)",
      passed: result.processed && !result.synced && result.alert,
      details: {
        sku,
        synced: result.synced,
        alert: result.alert?.message ?? "None"
      }
    });
  } catch (err) {
    results.push({
      name: "WAREHOUSE_DAMAGED Return Quarantines (Critical Alert)",
      passed: false,
      error: String(err)
    });
  }
}

// Test 4: Buffer prevents over-broadcasting after SELLABLE return
async function test_bufferWithReturn() {
  try {
    const sku = "BUFFER-RETURN-" + Date.now();

    // Create 15 units FIRST (to establish the SKU in inventory)
    await setInitialInventory(sku, 15);

    // THEN set high buffer
    try {
      await setBuffer(sku, 10);
    } catch (e) {
      console.error(`Failed to set buffer for ${sku}:`, e instanceof Error ? e.message : String(e));
      throw e;
    }

    // Sell 5 (leaves 10, buffer is 10, so broadcast = 0)
    await axios.post(`${API_URL}/webhook/shopify`, {
      orderId: "order-buffer-1",
      items: [{ sku, quantity: 5 }]
    });

    await new Promise((res) => setTimeout(res, 500));

    // Return 2 units as SELLABLE (should add back, but still respect buffer)
    const result = await sendReturn(sku, 2, "SELLABLE");

    // Physical should be 12, broadcast should still be max(0, 12-10) = 2
    const inventory = await axios.get(`${API_URL}/api/inventory/${sku}`);

    results.push({
      name: "Buffer Prevents Over-Broadcasting After Return",
      passed:
        result.synced &&
        inventory.data.physical === 12 &&
        inventory.data.broadcast === 2,
      details: {
        sku,
        physicalAfterReturn: inventory.data.physical,
        buffer: inventory.data.buffer,
        broadcastCount: inventory.data.broadcast,
        expectedBroadcast: 2
      }
    });
  } catch (err) {
    results.push({
      name: "Buffer Prevents Over-Broadcasting After Return",
      passed: false,
      error: String(err)
    });
  }
}

// Test 5: UNSELLABLE - disposition ignored
async function test_unsellableReturn() {
  try {
    const sku = "UNSELLABLE-" + Date.now();

    await setInitialInventory(sku, 5);
    await axios.post(`${API_URL}/webhook/shopify`, {
      orderId: "order-unsellable-1",
      items: [{ sku, quantity: 1 }]
    });

    await new Promise((res) => setTimeout(res, 500));

    const result = await sendReturn(
      sku,
      1,
      "UNSELLABLE",
      "Item will be disposed"
    );

    results.push({
      name: "UNSELLABLE Return Not Synced (No Inventory Added)",
      passed: result.processed && !result.synced && result.alert,
      details: {
        sku,
        synced: result.synced,
        alertCreated: !!result.alert
      }
    });
  } catch (err) {
    results.push({
      name: "UNSELLABLE Return Not Synced (No Inventory Added)",
      passed: false,
      error: String(err)
    });
  }
}

// Test 6: Alert system - get unread alerts
async function test_alertSystem() {
  try {
    const sku = "ALERT-TEST-" + Date.now();

    // Create a damaged return (should alert)
    await setInitialInventory(sku, 5);
    await axios.post(`${API_URL}/webhook/shopify`, {
      orderId: "order-alert-1",
      items: [{ sku, quantity: 1 }]
    });

    await new Promise((res) => setTimeout(res, 500));

    await sendReturn(sku, 1, "CUSTOMER_DAMAGED", "Alert test");

    // Get unread alerts
    const alertsResponse = await axios.get(`${API_URL}/api/alerts/unread`);

    results.push({
      name: "Alert System Tracks Unread Alerts",
      passed: alertsResponse.data.count > 0,
      details: {
        unreadCount: alertsResponse.data.count,
        recentAlerts: alertsResponse.data.alerts.slice(0, 2).map((a: unknown) => ({
          type: (a as Record<string, unknown>).type,
          severity: (a as Record<string, unknown>).severity
        }))
      }
    });
  } catch (err) {
    results.push({
      name: "Alert System Tracks Unread Alerts",
      passed: false,
      error: String(err)
    });
  }
}

// Test 7: Multiple returns of same SKU
async function test_multipleReturnsTrack() {
  try {
    const sku = "TRACK-RETURNS-" + Date.now();

    // Create inventory and sell
    await setInitialInventory(sku, 20);
    for (let i = 0; i < 5; i++) {
      await axios.post(`${API_URL}/webhook/shopify`, {
        orderId: `order-multi-${i}`,
        items: [{ sku, quantity: 1 }]
      });
    }

    await new Promise((res) => setTimeout(res, 1000));

    // Return 3 items (1 sellable, 2 damaged)
    await sendReturn(sku, 1, "SELLABLE", "Return 1");
    await sendReturn(sku, 1, "CUSTOMER_DAMAGED", "Return 2");
    await sendReturn(sku, 1, "CUSTOMER_DAMAGED", "Return 3");

    // Check return history
    const inventory = await axios.get(`${API_URL}/api/inventory/${sku}`);

    results.push({
      name: "Return History Tracked for Audit",
      passed: Array.isArray(inventory.data.returns) && inventory.data.returns.length > 0,
      details: {
        sku,
        returnsRecorded: inventory.data.returns.length,
        totalReturns: inventory.data.returns
          .map((r: Record<string, unknown>) => r.quantity)
          .reduce((a: number, b: number) => a + b, 0)
      }
    });
  } catch (err) {
    results.push({
      name: "Return History Tracked for Audit",
      passed: false,
      error: String(err)
    });
  }
}

// Run all tests
async function runAllTests() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("SyncState Phase 2 - Return Handling & Disposition Tests");
    console.log("=".repeat(70) + "\n");

    // Start fresh server
    await startServer();

    await test_sellableReturn();
    await test_customerDamagedReturn();
    await test_warehouseDamagedReturn();
    await test_bufferWithReturn();
    await test_unsellableReturn();
    await test_alertSystem();
    await test_multipleReturnsTrack();
  } catch (error) {
    console.error("🔥 Test execution error:", error);
  } finally {
    // Stop server
    await stopServer();
  }

  // Print results
  console.log("\n" + "-".repeat(70));
  console.log("TEST RESULTS:");
  console.log("-".repeat(70) + "\n");

  let passed = 0;
  let failed = 0;

  results.forEach((result, idx) => {
    const icon = result.passed ? "✅" : "❌";
    console.log(`${idx + 1}. ${icon} ${result.name}`);

    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error.substring(0, 100)}`);
    }

    if (result.details) {
      if (typeof result.details === "object") {
        Object.entries(result.details).forEach(([key, val]) => {
          const displayVal = typeof val === "object" ? JSON.stringify(val) : val;
          console.log(`   ${key}: ${String(displayVal).substring(0, 70)}`);
        });
      }
    }

    console.log();

    if (result.passed) passed++;
    else failed++;
  });

  console.log("=".repeat(70));
  console.log(
    `SUMMARY: ${passed} passed, ${failed} failed (${Math.round((passed / results.length) * 100)}%)`
  );
  console.log("=".repeat(70) + "\n");

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error("Test suite error:", err);
  process.exit(1);
});
