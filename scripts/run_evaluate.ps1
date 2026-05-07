$base = "http://localhost:4000/api"
$sessionId = "sess_5a622530c17e"
$body = @{ approvedBy = 'Officer Demo' } | ConvertTo-Json
Write-Host "Calling evaluate for session $sessionId..."
$resp = Invoke-RestMethod -Uri "$base/evaluate/$sessionId" -Method Post -Body $body -ContentType 'application/json'
$resp | ConvertTo-Json -Depth 5
Write-Host "Done."