$body = @{
    orderId = "ord-1"
    items = @(
        @{ sku = "SKU-123"; quantity = 1 }
    )
} | ConvertTo-Json

Write-Host "Sending webhook request..."
$response = Invoke-WebRequest -Uri http://localhost:3000/webhook/shopify `
  -Method POST `
  -ContentType "application/json" `
  -Body $body `
  -UseBasicParsing

Write-Host "Status Code: $($response.StatusCode)"
Write-Host "Response: $($response.Content)"
