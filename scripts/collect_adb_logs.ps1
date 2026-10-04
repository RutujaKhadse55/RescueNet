# ==============================================================================
# RescueNet Multi-Device ADB Log Collector & Unified Timeline Generator (Phase 15)
# PowerShell version for Windows environments
# ==============================================================================

[CmdletBinding()]
param (
    [string]$OutputDir = ".\logs\field_test_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
)

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$TimelineFile = Join-Path $OutputDir "unified_timeline.log"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " Discovering connected Android handsets via ADB..." -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$rawDevices = adb devices
$deviceLines = $rawDevices -split "`r?`n" | Where-Object { $_ -match '\tdevice$' }

if (-not $deviceLines) {
    Write-Warning "No Android devices detected. Connect phones via USB or ADB-over-Wi-Fi."
    exit 1
}

$devices = @()
foreach ($line in $deviceLines) {
    $serial = ($line -split '\s+')[0].Trim()
    if ($serial) {
        $model = (adb -s $serial shell getprop ro.product.model).Trim()
        $devices += [PSCustomObject]@{
            Serial = $serial
            Model = $model
            LogFile = Join-Path $OutputDir "${serial}_${model}.log"
        }
    }
}

Write-Host " Detected $($devices.Count) connected device(s):" -ForegroundColor Green
$processes = @()

foreach ($dev in $devices) {
    Write-Host "    Device [$($dev.Serial)] ($($dev.Model)) -> Logging to $($dev.LogFile)" -ForegroundColor Yellow
    $p = Start-Process -FilePath "adb" -ArgumentList "-s $($dev.Serial) logcat -v time -s RescueNet:* RescueMesh:* RescueBle:* ReactNativeJS:*" -RedirectStandardOutput $dev.LogFile -NoNewWindow -PassThru
    $processes += $p
}

Write-Host ""
Write-Host " Collecting multi-hop packet logs in real time. Press [Ctrl+C] to stop and merge timeline..." -ForegroundColor Cyan

try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host "`n Halting log collection across all devices..." -ForegroundColor Magenta
    foreach ($p in $processes) {
        if (-not $p.HasExited) {
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host " Merging per-device logs into chronological unified timeline: $TimelineFile" -ForegroundColor Cyan

    $allLines = @()
    foreach ($dev in $devices) {
        if (Test-Path $dev.LogFile) {
            $lines = Get-Content $dev.LogFile
            foreach ($l in $lines) {
                if ($l.Trim()) {
                    $allLines += "$l [$($dev.Model)|$($dev.Serial)]"
                }
            }
        }
    }

    $allLines | Sort-Object | Set-Content -Path $TimelineFile -Encoding utf8
    Write-Host " Multi-device timeline generated: $TimelineFile" -ForegroundColor Green
}
