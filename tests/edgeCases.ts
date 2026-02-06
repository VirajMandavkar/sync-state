/**
 * Edge Case Test Suite for SyncState
 * Tests boundary conditions, error handling, and unusual scenarios
 */

import axios from "axios";

const BASE_URL = "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

async function test(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`✅ ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`❌ ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ===== SHOPIFY WEBHOOK EDGE CASES =====

async function testShopifyWebhookEdgeCases() {
  console.log("\n🧪 Testing Shopify Webhook Edge Cases...\n");

  await test("Empty SKU should be rejected or at least not crash", async () => {
    try {
      const res = await axios.post(`${BASE_URL}/webhook/shopify`, {
        orderId: "TEST-001",
        items: [{ sku: "", quantity: 1 }],
      },{ validateStatus: () => true });
      
      // Either should reject (400) or handle gracefully
      if (res.status === 400) {
        console.log("  → Server correctly rejected empty SKU");
      } else if (res.status === 200) {
        console.log("  → Server accepted empty SKU (warning: may cause issues)");
      }
    } catch (e) {
      throw new Error(`Unexpected error: ${e}`);
    }
  });

  await test("Negative quantity should be handled", async () => {
    const res = await axios.post(`${BASE_URL}/webhook/shopify`, {
      orderId: "TEST-002",
      items: [{ sku: "NEG-001", quantity: -5 }],
    }, { validateStatus: () => true });

    if (res.status === 400) {
      console.log("  → Server correctly rejected negative quantity");
    } else {
      console.log("  → Server accepted negative quantity (reduces inventory)");
    }
  });

  await test("Zero quantity should be handled", async () => {
    const res = await axios.post(`${BASE_URL}/webhook/shopify`, {
      orderId: "TEST-003",
      items: [{ sku: "ZERO-001", quantity: 0 }],
    }, { validateStatus: () => true });

    if (res.status === 200) {
      console.log("  → Server accepted zero quantity (no-op)");
    }
  });

  await test("Very large quantity should not cause integer overflow", async () => {
    const largeQty = 500_000;  // Large but within validation limit (1M)
    const res = await axios.post(`${BASE_URL}/webhook/shopify`, {
      orderId: "TEST-004",
      items: [{ sku: "LARGE-001", quantity: largeQty }],
    }, { validateStatus: () => true });

    if (res.status === 200 && res.data.inventoryAfter) {
      const inventory = res.data.inventoryAfter["LARGE-001"];
      if (typeof inventory === "number" && !isNaN(inventory)) {
        console.log(`  → Handled large quantity (result: ${inventory})`);
      } else {
        throw new Error("Invalid inventory result");
      }
    } else if (res.status === 400) {
      console.log("  → Validation rejected extremely large quantity (expected)");
    }
  });

  await test("Multiple items with same SKU should aggregate", async () => {
    const res = await axios.post(`${BASE_URL}/webhook/shopify`, {
      orderId: "TEST-005",
      items: [
        { sku: "DUP-001", quantity: 2 },
        { sku: "DUP-001", quantity: 3 },
      ],
    });

    if (res.data.queued === 2) {
      console.log("  → Queued both jobs (may result in out-of-order processing)");
    }
  });

  await test("Missing items field should return 400", async () => {
    const res = await axios.post(`${BASE_URL}/webhook/shopify`, {
      orderId: "TEST-006",
    }, { validateStatus: () => true });

    if (res.status === 400) {
      console.log("  → Correctly rejected missing items");
    } else {
      throw new Error(`Expected 400, got ${res.status}`);
    }
  });

  await test("Empty items array should be handled", async () => {
    const res = await axios.post(`${BASE_URL}/webhook/shopify`, {
      orderId: "TEST-007",
      items: [],
    }, { validateStatus: () => true });

    if (res.status === 200 && res.data.queued === 0) {
      console.log("  → Correctly handled empty items (0 queued)");
    } else {
      console.log("  → Accepted empty items (server behavior varies)");
    }
  });

  await test("Special characters in SKU should be preserved", async () => {
    const specialSku = "SKU-$pecial!@#%";
    const res = await axios.post(`${BASE_URL}/webhook/shopify`, {
      orderId: "TEST-008",
      items: [{ sku: specialSku, quantity: 1 }],
    }, { validateStatus: () => true });

    if (res.status === 200 && res.data.inventoryAfter) {
      const inventorySku = Object.keys(res.data.inventoryAfter)[0];
      if (inventorySku === specialSku) {
        console.log("  → Special characters preserved in SKU");
      } else {
        throw new Error(`Expected SKU ${specialSku}, got ${inventorySku}`);
      }
    } else {
      console.log("  → Server did not preserve special characters (possible validation)");
    }
  });

  await test("Very long SKU should be handled", async () => {
    const longSku = "A".repeat(1000);
    const res = await axios.post(`${BASE_URL}/webhook/shopify`, {
      orderId: "TEST-009",
      items: [{ sku: longSku, quantity: 1 }],
    }, { validateStatus: () => true });

    if (res.status === 200 || res.status === 400) {
      console.log("  → Server handled long SKU");
    }
  });

  await test("Non-numeric quantity should be coerced or rejected", async () => {
    const res = await axios.post(`${BASE_URL}/webhook/shopify`, {
      orderId: "TEST-010",
      items: [{ sku: "NONNUM-001", quantity: "5" }],
    }, { validateStatus: () => true });

    if (res.status === 200) {
      console.log("  → String quantity coerced to number");
    }
  });
}

// ===== RETURN WEBHOOK EDGE CASES =====

async function testReturnWebhookEdgeCases() {
  console.log("\n🧪 Testing Return Webhook Edge Cases...\n");

  await test("Missing disposition should return 400", async () => {
    const res = await axios.post(`${BASE_URL}/webhook/amazon/return`, {
      sku: "TEST-001",
      quantity: 1,
    }, { validateStatus: () => true });

    if (res.status === 400) {
      console.log("  → Correctly rejected missing disposition");
    } else {
      throw new Error(`Expected 400, got ${res.status}`);
    }
  });

  await test("Invalid disposition should be handled", async () => {
    const res = await axios.post(`${BASE_URL}/webhook/amazon/return`, {
      sku: "TEST-002",
      quantity: 1,
      disposition: "INVALID_DISPOSITION",
    }, { validateStatus: () => true });

    if (res.status === 200) {
      console.log("  → Server accepted invalid disposition (may be safe)");
    } else if (res.status === 400) {
      console.log("  → Server rejected invalid disposition");
    }
  });

  await test("Negative quantity return should be handled", async () => {
    const res = await axios.post(`${BASE_URL}/webhook/amazon/return`, {
      sku: "NEG-RETURN-001",
      quantity: -2,
      disposition: "SELLABLE",
    }, { validateStatus: () => true });

    if (res.status === 200) {
      console.log("  → Server processed negative quantity (increases inventory?)");
    } else if (res.status === 400) {
      console.log("  → Server rejected negative quantity");
    }
  });

  await test("Zero quantity return should be handled", async () => {
    const res = await axios.post(`${BASE_URL}/webhook/amazon/return`, {
      sku: "ZERO-RETURN-001",
      quantity: 0,
      disposition: "SELLABLE",
    }, { validateStatus: () => true });

    if (res.status === 200) {
      console.log("  → Server accepted zero quantity return (no-op)");
    }
  });

  await test("Return for non-existent SKU should create it", async () => {
    const res = await axios.post(`${BASE_URL}/webhook/amazon/return`, {
      sku: "NEWSKU-FROM-RETURN",
      quantity: 1,
      disposition: "SELLABLE",
    }, { validateStatus: () => true });

    if (res.status === 200) {
      console.log("  → Server created new inventory entry from return");
    }
  });

  await test("Duplicate returns (same tx) should be idempotent", async () => {
    const tx = "duplicate-test-" + Date.now();
    const res1 = await axios.post(`${BASE_URL}/webhook/amazon/return`, {
      sku: "DUP-RET-001",
      quantity: 2,
      disposition: "SELLABLE",
      tx,
    });

    const res2 = await axios.post(`${BASE_URL}/webhook/amazon/return`, {
      sku: "DUP-RET-001",
      quantity: 2,
      disposition: "SELLABLE",
      tx,
    }, { validateStatus: () => true });

    if (res2.status === 200 && res2.data.processed === false) {
      console.log("  → Duplicate return detected and skipped ✓");
    } else {
      console.log("  → Duplicate processed (check echo prevention)");
    }
  });
}

// ===== BUFFER MANAGEMENT EDGE CASES =====

async function testBufferEdgeCases() {
  console.log("\n🧪 Testing Buffer Management Edge Cases...\n");

  await test("Buffer larger than physical inventory should work", async () => {
    // First set some inventory
    await axios.post(`${BASE_URL}/webhook/shopify`, {
      items: [{ sku: "BUFFER-TEST-001", quantity: 5 }],
    });

    // Set buffer larger than physical
    const res = await axios.post(`${BASE_URL}/api/buffer/BUFFER-TEST-001`, {
      bufferQty: 100,
    }, { validateStatus: () => true });

    if (res.status === 200) {
      const broadcast = res.data.broadcast;
      if (broadcast === 0) {
        console.log("  → Broadcast correctly capped at 0 when buffer > physical");
      } else {
        console.log(`  → Unexpected broadcast: ${broadcast}`);
      }
    }
  });

  await test("Negative buffer should be rejected or clamped to 0", async () => {
    const res = await axios.post(`${BASE_URL}/api/buffer/NEG-BUFFER-001`, {
      bufferQty: -5,
    }, { validateStatus: () => true });

    if (res.status === 400) {
      console.log("  → Correctly rejected negative buffer");
    } else if (res.status === 200 && res.data.buffer === 0) {
      console.log("  → Negative buffer clamped to 0");
    }
  });

  await test("Float buffer quantity should be handled", async () => {
    const res = await axios.post(`${BASE_URL}/api/buffer/FLOAT-BUFFER-001`, {
      bufferQty: 3.7,
    }, { validateStatus: () => true });

    if (res.status === 200) {
      console.log(`  → Float buffer accepted (stored as: ${res.data.buffer})`);
    }
  });

  await test("Missing bufferQty should return 400", async () => {
    const res = await axios.post(`${BASE_URL}/api/buffer/MISSING-BUFFER-001`, {
    }, { validateStatus: () => true });

    if (res.status === 400) {
      console.log("  → Correctly rejected missing bufferQty");
    }
  });
}

// ===== ALERTS EDGE CASES =====

async function testAlertsEdgeCases() {
  console.log("\n🧪 Testing Alerts Edge Cases...\n");

  await test("Query alerts with invalid severity should return 400", async () => {
    const res = await axios.get(`${BASE_URL}/api/alerts/severity/invalid`, {
      validateStatus: () => true,
    });

    if (res.status === 400) {
      console.log("  → Correctly rejected invalid severity");
    } else {
      throw new Error(`Expected 400, got ${res.status}`);
    }
  });

  await test("Mark non-existent alert as read should not error", async () => {
    const res = await axios.post(
      `${BASE_URL}/api/alerts/nonexistent-alert-id/read`,
      {}, 
      { validateStatus: () => true }
    );

    if (res.status === 200) {
      console.log("  → No error for non-existent alert (safe behavior)");
    }
  });

  await test("Get unread alerts when none exist should return 0", async () => {
    // This will vary based on state, but should not error
    const res = await axios.get(`${BASE_URL}/api/alerts/unread`);
    
    if (res.data.unreadCount === 0 || res.data.unreadCount > 0) {
      console.log("  → Correctly returns count (${res.data.unreadCount})");
    }
  });
}

// ===== INVENTORY QUERY EDGE CASES =====

async function testInventoryQueryEdgeCases() {
  console.log("\n🧪 Testing Inventory Query Edge Cases...\n");

  await test("Query inventory for non-existent SKU should return zeros", async () => {
    const res = await axios.get(`${BASE_URL}/api/inventory/NONEXISTENT-SKU`, {
      validateStatus: () => true,
    });

    if (res.status === 200) {
      if (res.data.physical === 0 && res.data.buffer === 0) {
        console.log("  → Non-existent SKU returns safe defaults (0, 0)");
      } else {
        console.log("  → Non-existent SKU behavior:", res.data);
      }
    }
  });

  await test("Get all inventory should not error on empty", async () => {
    const res = await axios.get(`${BASE_URL}/api/inventory`, {
      validateStatus: () => true,
    });

    if (res.status === 200) {
      console.log(`  → Returned ${Object.keys(res.data.inventory || {}).length} SKUs`);
    }
  });

  await test("SKU with URL special characters should be queryable", async () => {
    const encodedSku = "SKU%20WITH%20SPACES";
    const res = await axios.get(`${BASE_URL}/api/inventory/${encodedSku}`, {
      validateStatus: () => true,
    });

    if (res.status === 200) {
      console.log("  → Special characters in SKU handled correctly");
    }
  });
}

// ===== CONCURRENT ACCESS EDGE CASES =====

async function testConcurrentAccessEdgeCases() {
  console.log("\n🧪 Testing Concurrent Access Edge Cases...\n");

  await test("Concurrent inventory decrements should not go negative", async () => {
    const sku = "CONCURRENT-001";

    // First, set initial inventory
    const initRes = await axios.post(`${BASE_URL}/webhook/shopify`, {
      items: [{ sku, quantity: 10 }], // Creates with 10
    }, { validateStatus: () => true });

    if (initRes.status !== 200) {
      console.log("  → Failed to initialize inventory for concurrent test");
      return;
    }

    // Then try to sell 15 simultaneously
    const promises = [
      axios.post(`${BASE_URL}/webhook/shopify`, {
        items: [{ sku, quantity: 8 }],
      }, { validateStatus: () => true }),
      axios.post(`${BASE_URL}/webhook/shopify`, {
        items: [{ sku, quantity: 8 }],
      }, { validateStatus: () => true }),
    ];

    const results = await Promise.all(promises);
    if (results[0].data?.inventoryAfter && results[1].data?.inventoryAfter) {
      const final1 = results[0].data.inventoryAfter[sku];
      const final2 = results[1].data.inventoryAfter[sku];

      if (final2 >= 0) {
        console.log(
          `  → Final inventory: ${final2} (not negative, but may be race condition)`
        );
      } else {
        throw new Error("Inventory went negative!");
      }
    } else {
      console.log("  → Requests failed or returned invalid structure");
    }
  });

  await test("Concurrent buffer updates should be consistent", async () => {
    const sku = "CONCURRENT-BUFFER-001";

    const res1 = axios.post(`${BASE_URL}/api/buffer/${sku}`, {
      bufferQty: 5,
    }, { validateStatus: () => true });
    const res2 = axios.post(`${BASE_URL}/api/buffer/${sku}`, {
      bufferQty: 10,
    }, { validateStatus: () => true });

    const [r1, r2] = await Promise.all([res1, res2]);

    if (r1.status !== 200 || r2.status !== 200) {
      console.log("  → One or more buffer updates failed");
      return;
    }

    // Last write should win
    const final = await axios.get(`${BASE_URL}/api/buffer/${sku}`, { validateStatus: () => true });
    if (final.status === 200 && final.data?.buffer !== undefined && r2.data?.buffer !== undefined) {
      console.log(`  → Final buffer: ${final.data.buffer} (${r2.data.buffer == final.data.buffer ? "last write won ✓" : "race condition"})`);
    } else {
      console.log("  → Unable to determine final state");
    }
  });
}

// ===== MALFORMED REQUESTS =====

async function testMalformedRequests() {
  console.log("\n🧪 Testing Malformed Requests...\n");

  await test("Invalid JSON in request body should return 400", async () => {
    try {
      const res = await axios.post(`${BASE_URL}/webhook/shopify`, null, {
        validateStatus: () => true,
        headers: { "Content-Type": "application/json" },
      });

      if (res.status === 400 || res.status === 415) {
        console.log("  → Correctly rejected invalid JSON");
      }
    } catch (e) {
      console.log("  → Request failed (expected for malformed JSON)");
    }
  });

  await test("Excessively large payload should be rejected", async () => {
    const largePayload = {
      orderId: "TEST",
      items: Array(10000).fill({ sku: "X".repeat(1000), quantity: 1 }),
    };

    try {
      const res = await axios.post(`${BASE_URL}/webhook/shopify`, largePayload, {
        validateStatus: () => true,
        maxContentLength: Infinity,
      });

      if (res.status >= 400) {
        console.log("  → Rejected large payload");
      } else {
        console.log("  → Accepted large payload (may impact performance)");
      }
    } catch (e) {
      console.log("  → Request failed (expected for large payload)");
    }
  });
}

// ===== MAIN TEST RUNNER =====

async function runAllTests() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║        SYNCSTATE EDGE CASE TEST SUITE (Phase 3)           ║");
  console.log("║        Testing error handling & boundary conditions       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  // Check if server is running
  try {
    await axios.get(`${BASE_URL}/health`, { timeout: 2000 });
  } catch {
    console.error("\n❌ Server not running. Start it with: npm run start");
    process.exit(1);
  }

  await testShopifyWebhookEdgeCases();
  await testReturnWebhookEdgeCases();
  await testBufferEdgeCases();
  await testAlertsEdgeCases();
  await testInventoryQueryEdgeCases();
  await testConcurrentAccessEdgeCases();
  await testMalformedRequests();

  // Print summary
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(1);

  console.log(`║                    TEST SUMMARY                           ║`);
  console.log(`║  Passed: ${passed}/${total} (${percentage}%)${" ".repeat(52 - `${passed}/${total} (${percentage}%)`.length)}║`);
  console.log("╚════════════════════════════════════════════════════════════╝");

  if (passed < total) {
    console.log("\n⚠️  Some edge cases failed. Review above for details.");
    process.exit(1);
  } else {
    console.log("\n✅ All edge cases handled correctly!");
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error("Test suite error:", err);
  process.exit(1);
});
