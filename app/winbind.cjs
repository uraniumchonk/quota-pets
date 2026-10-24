// Window binding (Windows only): a long-lived PowerShell loop reports the foreground
// window and, every few ticks, the list of open top-level windows, one JSON line each.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT = String.raw`
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class QpFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$n = 0
while ($true) {
  $h = [QpFg]::GetForegroundWindow(); $p = [uint32]0
  [void][QpFg]::GetWindowThreadProcessId($h, [ref]$p)
  $sb = New-Object Text.StringBuilder 512
  [void][QpFg]::GetWindowText($h, $sb, 512)
  $name = ''
  try { $name = (Get-Process -Id $p -ErrorAction Stop).ProcessName } catch {}
  $o = @{ fg = @{ proc = $name; title = $sb.ToString(); pid = [int]$p } }
  if ($n % 5 -eq 0) {
    $o.open = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } |
      ForEach-Object { @{ proc = $_.ProcessName; title = $_.MainWindowTitle; pid = $_.Id } })
  }
  $n++
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 400
}
`;

function matches(rule, w) {
  if (!w) return false;
  if (rule.process && String(w.proc || '').toLowerCase() !== String(rule.process).toLowerCase().replace(/\.exe$/, '')) return false;
  if (rule.title && !String(w.title || '').toLowerCase().includes(String(rule.title).toLowerCase())) return false;
  return !!(rule.process || rule.title);
}

class WinBind {
  constructor(dir, onChange) {
    this.dir = dir; this.onChange = onChange;
    this.fg = null; this.open = []; this.proc = null;
  }

  start() {
    if (process.platform !== 'win32' || this.proc) return;
    const file = path.join(this.dir, 'winwatch.ps1');
    fs.writeFileSync(file, '﻿' + SCRIPT);
    this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true });
    let buf = '';
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const o = JSON.parse(line);
          if (o.fg) this.fg = o.fg;
          if (o.open) this.open = [].concat(o.open);
          this.onChange();
        } catch {}
      }
    });
    this.proc.stderr.on('data', d => console.error('winwatch', String(d).slice(0, 300)));
    this.proc.on('exit', () => { this.proc = null; setTimeout(() => this.start(), 5000); });
  }

  stop() { if (this.proc) { this.proc.removeAllListeners('exit'); this.proc.kill(); this.proc = null; } }

  // true / false, or null when the answer should not change (our own window is in front, no data yet)
  shouldShow(bind) {
    if (!bind || !bind.enabled || !(bind.match || []).length || process.platform !== 'win32') return true;
    if (bind.mode === 'open') return this.open.some(w => bind.match.some(r => matches(r, w)));
    if (!this.fg) return null;
    if (this.fg.pid === process.pid) return null;
    return bind.match.some(r => matches(r, this.fg));
  }

  // open windows, one per process, for the "add binding" menu
  openList() {
    const seen = new Set(), out = [];
    for (const w of this.open) {
      if (w.pid === process.pid || seen.has(w.proc)) continue;
      seen.add(w.proc); out.push(w);
    }
    return out.sort((a, b) => a.proc.localeCompare(b.proc));
  }
}

module.exports = { WinBind, matches };
