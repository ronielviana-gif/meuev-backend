# Script de diagnostico - APIs do Render
param([string]$RenderUrl = "https://meuev-backend.onrender.com")

Write-Host "`nDIAGNOSTICO DO RENDER - MEUEV`n" -ForegroundColor Cyan

# Teste 1: Veiculos
Write-Host "1. Testando API de Veiculos..." -NoNewline
try {
    $vehicles = Invoke-RestMethod -Uri "$RenderUrl/api/vehicles" -Method Get -TimeoutSec 30
    Write-Host " OK" -ForegroundColor Green
    Write-Host "   Total: $($vehicles.totalVehicles) veiculos" -ForegroundColor Yellow
    $lastUpdate = [DateTime]::Parse($vehicles.lastUpdate)
    Write-Host "   Ultima atualizacao: $($lastUpdate.ToString('dd/MM/yyyy HH:mm'))" -ForegroundColor Yellow
    $dias = ([DateTime]::Now - $lastUpdate).Days
    if ($dias -gt 7) {
        Write-Host "   ALERTA: $dias dias desatualizado!" -ForegroundColor Red
    } elseif ($dias -gt 1) {
        Write-Host "   Aviso: $dias dias" -ForegroundColor Yellow  
    } else {
        Write-Host "   Status: Atualizado" -ForegroundColor Green
    }
} catch {
    Write-Host " ERRO" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Yellow
}

# Teste 2: Concessionarias
Write-Host "`n2. Testando API de Concessionarias..." -NoNewline
try {
    $dealers = Invoke-RestMethod -Uri "$RenderUrl/api/dealerships" -Method Get -TimeoutSec 30
    Write-Host " OK" -ForegroundColor Green
    Write-Host "   Total: $($dealers.data.totalDealerships) concessionarias" -ForegroundColor Yellow
} catch {
    Write-Host " ERRO" -ForegroundColor Red
}

# Teste 3: Carregadores
Write-Host "`n3. Testando API de Carregadores..." -NoNewline
try {
    $chargers = Invoke-RestMethod -Uri "$RenderUrl/api/chargers" -Method Get -TimeoutSec 30
    Write-Host " OK" -ForegroundColor Green
    Write-Host "   Total: $($chargers.totalChargers) carregadores" -ForegroundColor Yellow
} catch {
    Write-Host " ERRO" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Gray
Write-Host "DIAGNOSTICO CONCLUIDO" -ForegroundColor Green
Write-Host "`nPara forcar atualizacao:" -ForegroundColor Cyan
Write-Host "Invoke-RestMethod -Uri https://meuev-backend.onrender.com/api/force-update -Method Post`n" -ForegroundColor White
