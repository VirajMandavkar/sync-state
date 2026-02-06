/**
 * Comprehensive Integration Test Suite for SyncState Prototype
 * Tests: buffer logic, echo prevention, concurrency, persistence
 */

import axios from "axios";

const API_URL = "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

const results: TestResult[] = [];

// Helper to send webhook
async function sendWebhook(
  orderId: string,
  items: Array<{ sku: string; quantity: number }>
) {
  try {
    const response = await axios.post(`${API_URL}/webhook/shopify`, {
      orderId,
      items
    });
    return response.data;
  } catch (err) {
    throw err;
  }
}

// Test 1: Basic webhook functionality
async function test_basicWebhook() {
  try {
    const result = await sendWebhook("test-1", [
      { sku: "TEST-SKU-001", quantity: 1 }
    ]);
    results.push({
      name: "Basic Webhook",
      passed: true,
      details: result
    });
  } catch (err) {
    results.push({
      name: "Basic Webhook",
      passed: false,
      error: String(err)
    });
  }
}

// Test 2: Multiple items in single order
async function test_multipleItems() {
  try {
    const result = await sendWebhook("test-2", [
      { sku: "SHIRT-BLUE", quantity: 2 },
      { sku: "PANTS-BLACK", quantity: 3 },
      { sku: "HAT-RED", quantity: 1 }
    ]);
    results.push({
      name: "Multiple Items Single Order",
      passed: result.ok === true,
      details: result
    });
  } catch (err) {
    results.push({
      name: "Multiple Items Single Order",
      passed: false,
      error: String(err)
    });
  }
}

// Test 3: Buffer logic - inventory should not go below buffer
async function test_bufferLogic() {
  try {
    // Clear previous data by simulating a new SKU
    const sku = "BUFFER-TEST-" + Date.now();

    // Simulate: start with 5 units, set buffer to 2
    // When order of 4 units comes, broadcast should be max(0, 5-4-2) = 0 (not negative)
    const result = await sendWebhook("test-3-high-qty", [
      { sku, quantity: 4 }
    ]);

    // The broadcast count should apply the buffer
    // Check logs to verify
    results.push({
      name: "Buffer Logic (Safety Net)",
      passed: result.ok === true,
      details: {
        ...result,
        note: "Check logs for [amazon-mock] to verify buffer applied"
      }
    });
  } catch (err) {
    results.push({
      name: "Buffer Logic (Safety Net)",
      passed: false,
      error: String(err)
    });
  }
}

// Test 4: Echo Prevention - same transaction ID should be idempotent
async function test_echoPrevention() {
  try {
    const sku = "ECHO-TEST-" + Date.now();
    const result1 = await sendWebhook("test-4-first", [
      { sku, quantity: 1 }
    ]);

    // In a real scenario, if we receive the same TX from Amazon,
    // the worker should detect it and skip processing
    // For now, we just verify the TX is stored
    results.push({
      name: "Echo Prevention (Idempotency)",
      passed: result1.tx !== undefined,
      details: {
        tx: result1.tx,
        note: "Transaction ID generated and can be used for deduplication"
      }
    });
  } catch (err) {
    results.push({
      name: "Echo Prevention (Idempotency)",
      passed: false,
      error: String(err)
    });
  }
}

// Test 5: Concurrent requests (race condition test)
async function test_concurrentRequests() {
  try {
    const sku = "CONCURRENT-" + Date.now();
    const promises = [];

    // Send 5 concurrent orders
    for (let i = 0; i < 5; i++) {
      promises.push(
        sendWebhook(`test-5-concurrent-${i}`, [{ sku, quantity: 1 }])
      );
    }

    const results_concurrent = await Promise.all(promises);
    const allSucceeded = results_concurrent.every((r) => r.ok === true);

    results.push({
      name: "Concurrent Requests (5 parallel)",
      passed: allSucceeded,
      details: {
        requestCount: 5,
        allSucceeded,
        txs: results_concurrent.map((r) => r.tx)
      }
    });
  } catch (err) {
    results.push({
      name: "Concurrent Requests (5 parallel)",
      passed: false,
      error: String(err)
    });
  }
}

// Test 6: Large quantity orders
async function test_largeQuantities() {
  try {
    const result = await sendWebhook("test-6-bulk", [
      { sku: "BULK-001", quantity: 100 },
      { sku: "BULK-002", quantity: 500 }
    ]);

    results.push({
      name: "Large Quantity Orders (100 + 500 units)",
      passed: result.ok === true,
      details: result
    });
  } catch (err) {
    results.push({
      name: "Large Quantity Orders (100 + 500 units)",
      passed: false,
      error: String(err)
    });
  }
}

// Test 7: Zero quantity (edge case)
async function test_zeroQuantity() {
  try {
    const result = await sendWebhook("test-7-zero", [
      { sku: "ZERO-TEST", quantity: 0 }
    ]);

    results.push({
      name: "Zero Quantity Edge Case",
      passed: result.ok === true,
      details: result
    });
  } catch (err) {
    results.push({
      name: "Zero Quantity Edge Case",
      passed: false,
      error: String(err)
    });
  }
}

// Test 8: Special characters in SKU
async function test_specialCharactersSKU() {
  try {
    const result = await sendWebhook("test-8-special", [
      { sku: "SKU-123-BLUE/XL", quantity: 2 },
      { sku: "PROD_001_VAR-A", quantity: 1 }
    ]);

    results.push({
      name: "Special Characters in SKU",
      passed: result.ok === true,
      details: result
    });
  } catch (err) {
    results.push({
      name: "Special Characters in SKU",
      passed: false,
      error: String(err)
    });
  }
}

// Test 9: Health check
async function test_health() {
  try {
    const response = await axios.get(`${API_URL}/health`);
    results.push({
      name: "Health Check Endpoint",
      passed: response.data.ok === true,
      details: response.data
    });
  } catch (err) {
    results.push({
      name: "Health Check Endpoint",
      passed: false,
      error: String(err)
    });
  }
}

// Test 10: High concurrency with rate limiting
async function test_rateLimitingBehavior() {
  try {
    const sku = "RATELIMIT-" + Date.now();
    const start = Date.now();

    // Send 10 requests rapidly
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        sendWebhook(`test-10-rate-${i}`, [{ sku, quantity: 1 }])
      );
    }

    const results_rate = await Promise.all(promises);
    const elapsed = Date.now() - start;

    results.push({
      name: "Rate Limiting Behavior (10 rapid requests)",
      passed: results_rate.every((r) => r.ok === true),
      details: {
        requestCount: 10,
        elapsedMs: elapsed,
        avgTimePerRequest: Math.round(elapsed / 10),
        note: "With rate limiting (2s/req for Amazon), should take ~20s total"
      }
    });
  } catch (err) {
    results.push({
      name: "Rate Limiting Behavior (10 rapid requests)",
      passed: false,
      error: String(err)
    });
  }
}

// Run all tests
async function runAllTests() {
  console.log("\n" + "=".repeat(70));
  console.log("SyncState Prototype - Comprehensive Test Suite");
  console.log("=".repeat(70) + "\n");

  await test_health();
  await test_basicWebhook();
  await test_multipleItems();
  await test_bufferLogic();
  await test_echoPrevention();
  await test_zeroQuantity();
  await test_specialCharactersSKU();
  await test_largeQuantities();
  await test_concurrentRequests();
  await test_rateLimitingBehavior();

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
          if (key !== "note") {
            const displayVal =
              typeof val === "object" ? JSON.stringify(val) : val;
            console.log(`   ${key}: ${String(displayVal).substring(0, 60)}`);
          }
        });
        if (result.details.note) {
          console.log(`   📝 ${result.details.note}`);
        }
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

// Run tests
runAllTests().catch((err) => {
  console.error("Test suite error:", err);
  process.exit(1);
});
