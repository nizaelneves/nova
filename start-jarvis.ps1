# Inicia o servidor do Jarvis carregando as variáveis do .env (ex.: ANYTYPE_API_KEY)
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {
            Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim('"')
        }
    }
}

if (-not $env:ANYTYPE_API_KEY -or $env:ANYTYPE_API_KEY -eq 'COLE_SUA_CHAVE_AQUI') {
    Write-Warning 'ANYTYPE_API_KEY nao definida no .env - as notas do Anytype ficarao indisponiveis.'
}

# Garante que o Ollama (o modelo local) esteja no ar antes do Jarvis
function Test-Ollama { try { (Invoke-WebRequest 'http://127.0.0.1:11434' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false } }
if (-not (Test-Ollama)) {
    $ollamaApp = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama app.exe'
    if (Test-Path $ollamaApp) { Start-Process $ollamaApp } else { Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden }
    for ($i = 0; $i -lt 20 -and -not (Test-Ollama); $i++) { Start-Sleep 2 }
    if (-not (Test-Ollama)) { Write-Warning 'Ollama nao respondeu - o Jarvis subira sem modelo local.' }
}

& "$PSScriptRoot\.venv\Scripts\python.exe" -m openjarvis.cli serve
