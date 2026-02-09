# Script para sincronizar dados do Render com o Git
# Este script baixa os dados atualizados do Render e faz commit no repositório

param(
    [string]$RenderUrl = "https://meuev-backend.onrender.com",
    [switch]$ForceUpdate = $false,
    [switch]$AutoCommit = $false
)

Write-Host "`n🔄 SINCRONIZAÇÃO DE DADOS - RENDER → GIT" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Gray

$projectRoot = "c:\Temp\MeuEV\Projeto"
$databasePath = "$projectRoot\meuev-backend\database"

# Função para baixar dados de um endpoint
function Get-DatabaseFromRender {
    param(
        [string]$Endpoint,
        [string]$FileName
    )
    
    Write-Host "📥 Baixando $FileName..." -NoNewline
    
    try {
        $url = "$RenderUrl$Endpoint"
        $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 60
        
        # Salvar arquivo
        $filePath = "$databasePath\$FileName"
        $response | ConvertTo-Json -Depth 10 | Set-Content -Path $filePath -Encoding UTF8
        
        Write-Host " ✅" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host " ❌" -ForegroundColor Red
        Write-Host "   Erro: $($_.Exception.Message)" -ForegroundColor Yellow
        return $false
    }
}

# 1. Verificar se o repositório Git está limpo
Write-Host "🔍 Verificando status do Git..." -ForegroundColor Cyan
cd $projectRoot

$gitStatus = git status --porcelain
if ($gitStatus -and !$AutoCommit) {
    Write-Host "⚠️  ATENÇÃO: Você tem mudanças não commitadas" -ForegroundColor Yellow
    Write-Host $gitStatus -ForegroundColor Gray
    
    $continue = Read-Host "`nDeseja continuar mesmo assim? (s/n)"
    if ($continue -ne "s") {
        Write-Host "❌ Operação cancelada" -ForegroundColor Red
        exit
    }
}

# 2. Forçar atualização no Render (se solicitado)
if ($ForceUpdate) {
    Write-Host "`n🔄 Forçando atualização no Render..." -ForegroundColor Cyan
    
    try {
        Write-Host "   Atualizando veículos..." -NoNewline
        Invoke-RestMethod -Uri "$RenderUrl/api/force-update" -Method Post -TimeoutSec 120 | Out-Null
        Write-Host " ✅" -ForegroundColor Green
        
        Write-Host "   Atualizando concessionárias..." -NoNewline
        Invoke-RestMethod -Uri "$RenderUrl/api/dealerships/force-update" -Method Post -TimeoutSec 120 | Out-Null
        Write-Host " ✅" -ForegroundColor Green
        
        Write-Host "   Atualizando carregadores..." -NoNewline
        Invoke-RestMethod -Uri "$RenderUrl/api/chargers/force-update" -Method Post -TimeoutSec 120 | Out-Null
        Write-Host " ✅" -ForegroundColor Green
        
        Write-Host "`n⏳ Aguardando 5 segundos para processar..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
    catch {
        Write-Host " ❌" -ForegroundColor Red
        Write-Host "   Erro: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# 3. Baixar dados atualizados
Write-Host "`n📥 Baixando dados atualizados do Render..." -ForegroundColor Cyan
Write-Host "───────────────────────────────────────────" -ForegroundColor Gray

$success = @()
$failed = @()

# Baixar veículos
if (Get-DatabaseFromRender "/api/vehicles" "vehicles.json") {
    $success += "vehicles.json"
} else {
    $failed += "vehicles.json"
}

# Baixar concessionárias
try {
    Write-Host "📥 Baixando dealerships.json..." -NoNewline
    $dealerships = Invoke-RestMethod -Uri "$RenderUrl/api/dealerships" -Method Get -TimeoutSec 60
    $dealerships.data | ConvertTo-Json -Depth 10 | Set-Content -Path "$databasePath\dealerships.json" -Encoding UTF8
    Write-Host " ✅" -ForegroundColor Green
    $success += "dealerships.json"
}
catch {
    Write-Host " ❌" -ForegroundColor Red
    $failed += "dealerships.json"
}

# Baixar carregadores
try {
    Write-Host "📥 Baixando chargers.json..." -NoNewline
    $chargers = Invoke-RestMethod -Uri "$RenderUrl/api/chargers" -Method Get -TimeoutSec 60
    $chargers | ConvertTo-Json -Depth 10 | Set-Content -Path "$databasePath\chargers.json" -Encoding UTF8
    Write-Host " ✅" -ForegroundColor Green
    $success += "chargers.json"
}
catch {
    Write-Host " ❌" -ForegroundColor Red
    $failed += "chargers.json"
}

# 4. Verificar mudanças
Write-Host "`n📊 Verificando mudanças..." -ForegroundColor Cyan
Write-Host "───────────────────────────────────────────" -ForegroundColor Gray

cd $projectRoot
$changes = git status --porcelain meuev-backend/database/

if (!$changes) {
    Write-Host "ℹ️  Nenhuma mudança detectada nos dados" -ForegroundColor Yellow
    Write-Host "   Os dados já estão atualizados no Git" -ForegroundColor Gray
}
else {
    Write-Host "✅ Mudanças detectadas:" -ForegroundColor Green
    Write-Host $changes -ForegroundColor White
    
    # 5. Commit e push (se solicitado)
    if ($AutoCommit) {
        Write-Host "`n💾 Fazendo commit das mudanças..." -ForegroundColor Cyan
        
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        
        git add meuev-backend/database/*.json
        git commit -m "🔄 Sync database from Render - $timestamp"
        git push
        
        Write-Host "✅ Dados commitados e enviados para o Git!" -ForegroundColor Green
        Write-Host "   O Render fará redeploy automaticamente" -ForegroundColor Yellow
    }
    else {
        Write-Host "`n💡 Para fazer commit, execute:" -ForegroundColor Cyan
        Write-Host "   git add meuev-backend/database/*.json" -ForegroundColor White
        Write-Host "   git commit -m 'Update database from Render'" -ForegroundColor White
        Write-Host "   git push" -ForegroundColor White
        Write-Host "`nOu execute novamente com -AutoCommit" -ForegroundColor Yellow
    }
}

# 6. Resumo
Write-Host "`n📊 RESUMO DA SINCRONIZAÇÃO" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Gray

Write-Host "✅ Sucessos: " -NoNewline
Write-Host $success.Count -ForegroundColor Green
if ($success.Count -gt 0) {
    $success | ForEach-Object { Write-Host "   - $_" -ForegroundColor Gray }
}

if ($failed.Count -gt 0) {
    Write-Host "`n❌ Falhas: " -NoNewline
    Write-Host $failed.Count -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "   - $_" -ForegroundColor Gray }
}

Write-Host "`n═══════════════════════════════════════════`n" -ForegroundColor Gray

# Instruções de uso
Write-Host "💡 DICAS DE USO:" -ForegroundColor Cyan
Write-Host "   -ForceUpdate    : Força atualização no Render antes de baixar" -ForegroundColor White
Write-Host "   -AutoCommit     : Faz commit e push automaticamente" -ForegroundColor White
Write-Host "`n   Exemplo: .\sync-render-database.ps1 -ForceUpdate -AutoCommit" -ForegroundColor Gray
Write-Host ""
