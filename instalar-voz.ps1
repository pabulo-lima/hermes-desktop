# Instala a VOZ COMPLETA (XTTS v2 + faster-whisper) do Hermes Assistente.
# Recomendado apenas com GPU NVIDIA (6+ GB de VRAM). Sem GPU, a voz leve do app
# já funciona — este script é um upgrade opcional de qualidade.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$vs = Join-Path $root 'voice-server'
if (-not (Test-Path $vs)) { throw "Pasta voice-server não encontrada ao lado deste script." }

# sem `irm | iex`: usa o Python 3.11 ja instalado (python.org ou winget install Python.Python.3.11)
if (-not (Get-Command py -ErrorAction SilentlyContinue)) { throw "Instale o Python 3.11 (python.org) e rode de novo." }

Set-Location $vs
Write-Host "Criando ambiente Python 3.11..."
py -3.11 -m venv .venv
if ($LASTEXITCODE -ne 0) { throw "Python 3.11 nao encontrado (py -3.11)." }
$py = Join-Path $vs '.venv\Scripts\python.exe'

$gpu = [bool](Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'NVIDIA' })
if ($gpu) {
    Write-Host "GPU NVIDIA detectada - instalando PyTorch CUDA (download grande, ~2,5 GB)..."
    & $py -m pip install torch==2.11.0 torchaudio==2.11.0 --index-url https://download.pytorch.org/whl/cu128
} else {
    Write-Host "AVISO: sem GPU NVIDIA. A voz completa ficara LENTA em CPU - considere ficar na voz leve."
    & $py -m pip install torch==2.11.0 torchaudio==2.11.0
}

Write-Host "Instalando dependencias de voz..."
& $py -m pip install -r requirements.txt

# aponta o app para este voice-server e ativa o motor XTTS
$sf = "$env:APPDATA\hermes-assistente\settings.json"
New-Item -ItemType Directory -Force (Split-Path $sf) | Out-Null
if (Test-Path $sf) {
    $j = Get-Content $sf -Raw | ConvertFrom-Json
} else {
    $j = [pscustomobject]@{}
}
$j | Add-Member -NotePropertyName voiceServerDir -NotePropertyValue $vs -Force
$j | Add-Member -NotePropertyName voiceEngine -NotePropertyValue 'xtts' -Force
[IO.File]::WriteAllText($sf, ($j | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "Voz completa instalada! Reinicie o Hermes Assistente."
Write-Host "Na primeira conversa os modelos de voz (~3,5 GB) serao baixados automaticamente."
