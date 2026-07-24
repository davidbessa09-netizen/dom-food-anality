# Chama o endpoint /api/cron/sync localmente. Usado pela Tarefa Agendada do
# Windows "DOM Food Analytics - Sync Anota AI" (a cada 10 minutos).
# Só funciona enquanto `npm run dev` (ou a versão publicada) estiver rodando.

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$cronSecret = (Get-Content $envFile | Where-Object { $_ -match '^CRON_SECRET=' }) -replace '^CRON_SECRET=', ''

if ([string]::IsNullOrWhiteSpace($cronSecret)) {
    Write-Host "CRON_SECRET não encontrado em .env.local"
    exit 1
}

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3010/api/cron/sync" -Headers @{ Authorization = "Bearer $cronSecret" } -Method Get -TimeoutSec 60
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] Sincronização executada: $($response.integrationsProcessed) integração(ões) processada(s)"
} catch {
    Write-Host "Falha ao chamar /api/cron/sync: $_"
}
