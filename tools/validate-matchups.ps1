# Validates resources/characters/MATCHUPS.md against the LMNTLZ derivation rule
# and reports the effectiveness spread across all nine damage types.
#
#   strengths = { primary, secondary }
#   bane      = counter(primary)      // super-effective against that hero
#   fault     = counter(secondary)    // moderately effective
#
# Distinctness constraints (all four slots must differ):
#   secondary != primary
#   counter(primary)   != secondary
#   counter(secondary) != primary
#
# Exits non-zero if any hero violates the rule.
#
# Usage:  pwsh tools/validate-matchups.ps1

$ErrorActionPreference = 'Stop'

# counter[X] = the type that beats X
$counter = @{
    Earth = 'Air';   Air    = 'Earth'
    Fire  = 'Water'; Water  = 'Fire'
    Light = 'Dark';  Dark   = 'Light'
    Slash = 'Crush'; Pierce = 'Slash'; Crush = 'Pierce'
}

# Damage multipliers. Only the Bane value is pinned by design so far
# (resources/01-hero-card.md: "Major weakness - takes +50% damage").
# The others are placeholders for comparison purposes; the *ranking* below is
# insensitive to their exact values so long as the Fault bonus and the resist
# penalty are of similar magnitude.
$MULT = @{ Bane = 1.50; Fault = 1.25; Resist = 0.75; Neutral = 1.00 }

$path = Join-Path $PSScriptRoot '..\resources\characters\MATCHUPS.md'
$rows = Get-Content $path | Where-Object { $_ -match '^\|\s*\d+\s*\|' }

$heroes = foreach ($row in $rows) {
    $c = ($row -split '\|') | ForEach-Object { $_.Trim() }
    [pscustomobject]@{
        Num = $c[1]; Name = $c[2]; Primary = $c[3]; Secondary = $c[4]
        Strong = (($c[5] -split '·') | ForEach-Object { $_.Trim() })
        Bane = $c[6]; Fault = $c[7]
    }
}

# --- Rule validation -------------------------------------------------------
$fail = 0
foreach ($h in $heroes) {
    $errs = @()
    if ($h.Strong.Count -ne 2 -or $h.Strong[0] -ne $h.Primary -or $h.Strong[1] -ne $h.Secondary) {
        $errs += "strengths are not {primary, secondary}"
    }
    if ($h.Bane  -ne $counter[$h.Primary])   { $errs += "bane '$($h.Bane)' != counter($($h.Primary))='$($counter[$h.Primary])'" }
    if ($h.Fault -ne $counter[$h.Secondary]) { $errs += "fault '$($h.Fault)' != counter($($h.Secondary))='$($counter[$h.Secondary])'" }
    if ($h.Secondary -eq $h.Primary)             { $errs += "secondary == primary" }
    if ($counter[$h.Primary] -eq $h.Secondary)   { $errs += "secondary is the primary's counter - strong AND bane-weak to it" }
    if ($counter[$h.Secondary] -eq $h.Primary)   { $errs += "fault == primary - strong AND fault-weak to it" }

    if ($errs) {
        $fail++
        Write-Host "FAIL #$($h.Num) $($h.Name)" -ForegroundColor Red
        $errs | ForEach-Object { Write-Host "      $_" }
    }
}

Write-Host ""
Write-Host "Heroes checked: $($heroes.Count)   Rule violations: $fail" -ForegroundColor $(if ($fail) { 'Red' } else { 'Green' })

# --- Effectiveness spread --------------------------------------------------
# For an attacking type T, every hero falls in exactly one bucket (the
# distinctness constraints guarantee no overlap):
#   super-effective : hero.Bane  == T
#   effective       : hero.Fault == T
#   resisted        : hero resists T (primary or secondary is T)
#   neutral         : everything else
Write-Host ""
Write-Host "Effectiveness spread per attacking type, over all $($heroes.Count) heroes:"
Write-Host ""
Write-Host ("  {0,-7} {1,4} {2,4} {3,4} {4,4}   {5,8}" -f 'TYPE','SE','EFF','RES','NEU','AVG MULT')

$report = foreach ($t in ($counter.Keys | Sort-Object)) {
    $se  = @($heroes | Where-Object { $_.Bane  -eq $t }).Count
    $eff = @($heroes | Where-Object { $_.Fault -eq $t }).Count
    $res = @($heroes | Where-Object { $_.Primary -eq $t -or $_.Secondary -eq $t }).Count
    $neu = $heroes.Count - $se - $eff - $res
    $avg = ($se * $MULT.Bane + $eff * $MULT.Fault + $res * $MULT.Resist + $neu * $MULT.Neutral) / $heroes.Count
    [pscustomobject]@{ Type = $t; SE = $se; Eff = $eff; Res = $res; Neu = $neu; Avg = $avg }
}

foreach ($r in $report) {
    Write-Host ("  {0,-7} {1,4} {2,4} {3,4} {4,4}   {5,8:N3}" -f $r.Type, $r.SE, $r.Eff, $r.Res, $r.Neu, $r.Avg)
}

$spread = ($report | Measure-Object Avg -Maximum).Maximum - ($report | Measure-Object Avg -Minimum).Minimum
Write-Host ""
Write-Host ("  Spread between best and worst attacking type: {0:N3}" -f $spread)
Write-Host "  (A type's standing is driven by count(secondary == counter(T)) - count(secondary == T);"
Write-Host "   equal counts within an opposed pair means equal average effectiveness.)"

exit $fail
