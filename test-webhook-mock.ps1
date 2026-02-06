$body = @{
    orderId = "ord-mock-1"
    items = @(
        @{ sku = "SHOPIFY-SHIRT-001"; quantity = 2 }
    )
} | ConvertTo-Json

Write-Host "Testing with mock Amazon mode..."
Write-Host "Sending 2 units of SHOPIFY-SHIRT-001"
$response = Invoke-WebRequest -Uri http://localhost:3000/webhook/shopify `
  -Method POST `
  -ContentType "application/json" `
  -Body $body `
  -UseBasicParsing

Write-Host "Status: $($response.StatusCode)"
Write-Host "Response: $($response.Content)"
Write-Host ""
Write-Host "Check server logs below for mock Amazon response..."
