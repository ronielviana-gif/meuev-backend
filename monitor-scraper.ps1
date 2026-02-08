# Monitor de Progresso do Scraper
Write-Host "`n🔍 MONITOR DO SCRAPER DE CONCESSIONÁRIAS`n" -ForegroundColor Cyan
Write-Host "Pressione Ctrl+C para sair`n" -ForegroundColor Yellow

$dbPath = ".\database\dealerships.json"
$lastCount = 0

while ($true) {
    Clear-Host
    Write-Host "`n🔍 MONITOR DO SCRAPER DE CONCESSIONÁRIAS" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Gray
    
    if (Test-Path $dbPath) {
        try {
            $data = Get-Content $dbPath | ConvertFrom-Json
            $currentCount = $data.totalDealerships
            
            # Cabeçalho
            Write-Host "📊 Total: " -NoNewline -ForegroundColor White
            Write-Host "$currentCount concessionárias" -ForegroundColor Green
            
            if ($currentCount -gt $lastCount) {
                Write-Host "   ↑ +$($currentCount - $lastCount) novas!" -ForegroundColor Green
            }
            
            Write-Host "`n🕒 Última atualização: " -NoNewline -ForegroundColor White
            $lastUpdate = [DateTime]::Parse($data.lastUpdate)
            Write-Host $lastUpdate.ToString("HH:mm:ss") -ForegroundColor Yellow
            
            Write-Host "`n📋 Marcas processadas:" -ForegroundColor Cyan
            Write-Host "───────────────────────" -ForegroundColor Gray
            
            foreach ($brand in $data.brands) {
                $bar = "█" * [Math]::Min($brand.count, 20)
                Write-Host ("  {0,-15} {1,3} {2}" -f $brand.brand, $brand.count, $bar) -ForegroundColor White
            }
            
            # Progresso estimado (15 marcas total)
            $progress = ($data.brands.Count / 15) * 100
            Write-Host "`n📈 Progresso: " -NoNewline -ForegroundColor White
            Write-Host ("{0:N0}%" -f $progress) -NoNewline -ForegroundColor $(if ($progress -eq 100) { "Green" } else { "Yellow" })
            Write-Host " ($($data.brands.Count)/15 marcas)" -ForegroundColor Gray
            
            if ($progress -eq 100) {
                Write-Host "`n✅ SCRAPER FINALIZADO!" -ForegroundColor Green
                Write-Host "   Recarregue a página para ver os dados atualizados." -ForegroundColor Yellow
            } else {
                Write-Host "`n⏳ Aguarde... O scraper está buscando dados reais do Google" -ForegroundColor Yellow
            }
            
            $lastCount = $currentCount
            
        } catch {
            Write-Host "❌ Erro ao ler arquivo: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "⏳ Aguardando início do scraper..." -ForegroundColor Yellow
    }
    
    Write-Host "`n───────────────────────────────────────────" -ForegroundColor Gray
    Write-Host "Pressione Ctrl+C para sair" -ForegroundColor DarkGray
    
    Start-Sleep -Seconds 2
}
