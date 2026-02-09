# Script de sincronizacao de dados do Render para Git
param(
    [string]$RenderUrl = "https://meuev-backend.onrender.com",
    [switch]$ForceUpdate,
    [switch]$AutoCommit
)

Write-Host "`nSINCRONIZACAO DE DADOS - RENDER -> GIT`n" -ForegroundColor Cyan

$databasePath = ".\database"

# 1. Verificar Git status
Write-Host "Verificando status do Git..." -ForegroundColor Yellow
$gitStatus = git status --porcelain
if ($gitStatus -and !$AutoCommit) {
    Write-Host "Voce tem mudancas nao commitadas" -ForegroundColor Yellow
    Write-Host $gitStatus
}

# 2. Forcar atualizacao no Render se solicitado
if ($ForceUpdate) {
    Write-Host "`nForcando atualizacao no Render...`n" -ForegroundColor Cyan
    
    try {
        Write-Host "  Atualizando veiculos..." -NoNewline
        Invoke-RestMethod -Uri "$RenderUrl/api/force-update" -Method Post -TimeoutSec 120 | Out-Null
        Write-Host " OK" -ForegroundColor Green
        
        Write-Host "  Atualizando concessionarias..." -NoNewline
        Invoke-RestMethod -Uri "$RenderUrl/api/dealerships/force-update" -Method Post -TimeoutSec 120 | Out-Null
        Write-Host " OK" -ForegroundColor Green
        
        Write-Host "`nAguardando 5 segundos..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
    catch {
        Write-Host " ERRO: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 3. Baixar dados atualizados
Write-Host "`nBaixando dados do Render..." -ForegroundColor Cyan

$success = @()
$failed = @()

# Veiculos
Write-Host "  Baixando vehicles.json..." -NoNewline
try {
    $vehicles = Invoke-RestMethod -Uri "$RenderUrl/api/vehicles" -Method Get -TimeoutSec 60
    $vehicles | ConvertTo-Json -Depth 10 | Set-Content -Path "$databasePath\vehicles.json" -Encoding UTF8
    Write-Host " OK" -ForegroundColor Green
    $success += "vehicles.json"
}
catch {
    Write-Host " ERRO" -ForegroundColor Red
    $failed += "vehicles.json"
}

# Concessionarias
Write-Host "  Baixando dealerships.json..." -NoNewline
try {
    $dealers = Invoke-RestMethod -Uri "$RenderUrl/api/dealerships" -Method Get -TimeoutSec 60
    $dealers.data | ConvertTo-Json -Depth 10 | Set-Content -Path "$databasePath\dealerships.json" -Encoding UTF8
    Write-Host " OK" -ForegroundColor Green
    $success += "dealerships.json"
}
catch {
    Write-Host " ERRO" -ForegroundColor Red
    $failed += "dealerships.json"
}

# Carregadores
Write-Host "  Baixando chargers.json..." -NoNewline
try {
    $chargers = Invoke-RestMethod -Uri "$RenderUrl/api/chargers" -Method Get -TimeoutSec 60
    $chargers | ConvertTo-Json -Depth 10 | Set-Content -Path "$databasePath\chargers.json" -Encoding UTF8
    Write-Host " OK" -ForegroundColor Green
    $success += "chargers.json"
}
catch {
    Write-Host " ERRO" -ForegroundColor Red
    $failed += "chargers.json"
}

# 4. Verificar mudancas
Write-Host "`nVerificando mudancas..." -ForegroundColor Cyan
$changes = git status --porcelain database/

if (!$changes) {
    Write-Host "Nenhuma mudanca detectada" -ForegroundColor Yellow
}
else {
    Write-Host "Mudancas detectadas:" -ForegroundColor Green
    Write-Host $changes
    
    # 5. Commit e push se solicitado
    if ($AutoCommit) {
        Write-Host "`nFazendo commit..." -ForegroundColor Cyan
        
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        
        git add database/*.json
        git commit -m "Sync database from Render - $timestamp"
        git push
        
        Write-Host "Dados commitados e enviados!" -ForegroundColor Green
    }
    else {
        Write-Host "`nPara fazer commit, execute:" -ForegroundColor Cyan
        Write-Host "git add database/*.json" -ForegroundColor White
        Write-Host "git commit -m 'Update database from Render'" -ForegroundColor White
        Write-Host "git push" -ForegroundColor White
    }
}

# 6. Resumo
Write-Host "`n========================================" -ForegroundColor Gray
Write-Host "RESUMO DA SINCRONIZACAO" -ForegroundColor Cyan
Write-Host "Sucessos: $($success.Count)" -ForegroundColor Green
if ($success.Count -gt 0) {
    $success | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
}

if ($failed.Count -gt 0) {
    Write-Host "Falhas: $($failed.Count)" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
}

Write-Host "`n========================================`n" -ForegroundColor Gray
