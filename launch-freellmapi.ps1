# FreeLLMAPI 开机自启 + 自愈启动脚本 (V4 - Node 路径动态解析)
# V3 → V4 修复：V3 硬编码 C:\...\node\versions\22.22.2，
# 但 .workbuddy 于 2026-10-06 把该目录改名为 22.22.2-6，导致自启静默失败。
# V4 改为读取 versions\current 指针 + 22.* 目录兜底，目录再改名也不会断。
$ErrorActionPreference = 'Continue'

$dir = 'C:\Users\Administrator\freellmapi'

# ---- Node 22 路径动态解析 ----
$nodeRoot = 'C:\Users\Administrator\.workbuddy\binaries\node\versions'
$nodeDir  = $null
$curFile  = Join-Path $nodeRoot 'current'
if (Test-Path $curFile) {
    $cur = (Get-Content $curFile -TotalCount 1).Trim()
    if ($cur -and (Test-Path (Join-Path $nodeRoot "$cur\node.exe"))) {
        $nodeDir = Join-Path $nodeRoot $cur
    }
}
if (-not $nodeDir) {
    $cand = Get-ChildItem $nodeRoot -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like '22.*' -and (Test-Path (Join-Path $_.FullName 'node.exe')) } |
            Sort-Object Name -Descending | Select-Object -First 1
    if ($cand) { $nodeDir = $cand.FullName }
}

$log = Join-Path $dir 'freellmapi-startup.log'
$out = Join-Path $dir 'server.out.log'
$err = Join-Path $dir 'server.err.log'

function Write-Log($m) {
    Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m"
}

Write-Log "LAUNCH_V4 dynamic-node script loaded. nodeDir=$nodeDir"

if (-not $nodeDir) {
    Write-Log 'ERROR: cannot resolve any Node 22 dir under ' + $nodeRoot
    exit 1
}

# better-sqlite3 原生模块按 Node 22 (ABI 127) 编译，必须用 Node 22，
# 误用系统 Node 24 (ABI 137) 会直接崩溃。这里把 Node 22 置顶 PATH 兜底整条调用链。
$env:PATH = "$nodeDir;$env:PATH"

# 端口检测：已监听则跳过，避免重复实例争抢 3001
$occupied = $false
try {
    $tcp = Test-NetConnection -ComputerName localhost -Port 3001 -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($tcp -eq $true) { $occupied = $true }
} catch {}

if ($occupied) {
    Write-Log 'port 3001 already listening, skip launch'
    exit 0
}

Write-Log 'port 3001 free, launching FreeLLMAPI server (node22 + tsx watch)...'
$serverDir = Join-Path $dir 'server'
$node22    = Join-Path $nodeDir 'node.exe'
$tsxCli    = Join-Path $dir 'node_modules/tsx/dist/cli.mjs'
$entry     = Join-Path $serverDir 'src/index.ts'

if (-not (Test-Path $node22)) { Write-Log "ERROR: node not found at $node22"; exit 1 }
if (-not (Test-Path $tsxCli)) { Write-Log "ERROR: tsx cli not found at $tsxCli"; exit 1 }
if (-not (Test-Path $entry))  { Write-Log "ERROR: entry not found at $entry"; exit 1 }

# 关键：cwd 必须是 freellmapi/server，入口是 server/src/index.ts
Start-Process -FilePath $node22 -ArgumentList $tsxCli,'watch',$entry `
    -WorkingDirectory $serverDir -WindowStyle Hidden `
    -RedirectStandardOutput $out -RedirectStandardError $err
Write-Log "launched with $node22 . out=$out err=$err"
