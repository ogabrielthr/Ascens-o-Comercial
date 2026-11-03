# Ascensão Comercial - servidor de desenvolvimento Vite
param(
  [int]$Porta = 5174,
  [switch]$SemAbrir
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$npm = 'C:\Program Files\nodejs\npm.cmd'

if (-not (Test-Path -LiteralPath $npm)) {
  throw 'Node.js nao encontrado. Instale a versao LTS antes de iniciar o projeto.'
}

$url = "http://127.0.0.1:$Porta/"
Write-Host ''
Write-Host '  ASCENSÃO COMERCIAL - ambiente de desenvolvimento' -ForegroundColor Yellow
Write-Host "  Endereco: $url" -ForegroundColor Green
Write-Host '  Para parar, pressione Ctrl+C.' -ForegroundColor DarkGray
Write-Host ''

if (-not $SemAbrir) { Start-Process $url }
Set-Location -LiteralPath $raiz
if (-not (Test-Path -LiteralPath (Join-Path $raiz 'node_modules\vite'))) {
  & $npm ci
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível instalar as dependências.' }
}
& $npm run dev -- --host 127.0.0.1 --port $Porta --strictPort
exit $LASTEXITCODE
