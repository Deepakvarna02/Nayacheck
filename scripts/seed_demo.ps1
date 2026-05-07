$base = "http://localhost:4000/api"
Write-Host "Seeding sample tender..."
$resp = Invoke-WebRequest -UseBasicParsing -Uri "$base/tender/sample" -Method Post
$session = $resp.Content | ConvertFrom-Json
$sessionId = $session.sessionId
Write-Host "Created session: $sessionId"

Write-Host "Seeding demo bidders..."
$resp2 = Invoke-WebRequest -UseBasicParsing -Uri "$base/bidder/sample/$sessionId" -Method Post
Write-Host $resp2.Content

Write-Host "Triggering evaluation (approvedBy: Officer Demo)..."
$body = @{ approvedBy = 'Officer Demo' } | ConvertTo-Json
$resp3 = Invoke-WebRequest -UseBasicParsing -Uri "$base/$sessionId" -Method Post -Body $body -ContentType 'application/json'
Write-Host $resp3.Content

Write-Host "Done. Session: $sessionId"