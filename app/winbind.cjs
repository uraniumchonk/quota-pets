// Window binding (Windows only): a long-lived PowerShell loop reports the foreground
// window and, every few ticks, every visible top-level window, one JSON line each.
// A binding rule names one window by handle (hwnd), or every window of a program (process),
// or windows whose title contains some text (title).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT = String.raw`
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class QpWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
  public static string Title(IntPtr h) { var t = new StringBuilder(512); GetWindowText(h, t, 512); return t.ToString(); }
  public static string List() {
    var sb = new StringBuilder();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      if (GetWindow(h, 4) != IntPtr.Zero) return true;              // owned popup
      if ((GetWindowLong(h, -20) & 0x80) != 0) return true;         // tool window
      int cloaked = 0; DwmGetWindowAttribute(h, 14, out cloaked, 4);
      if (cloaked != 0) return true;                                 // hidden UWP / other desktop
      string t = Title(h); if (t.Length == 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      sb.Append(h.ToInt64()).Append('\t').Append(pid).Append('\t').Append(t.Replace('\t', ' ').Replace('\n', ' ')).Append('\n');
      return true;
    }, IntPtr.Zero);
    return sb.ToString();
  }
}
"@
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$n = 0
while ($true) {
  $h = [QpWin]::GetForegroundWindow(); $p = [uint32]0
  [void][QpWin]::GetWindowThreadProcessId($h, [ref]$p)
  $name = ''
  try { $name = (Get-Process -Id $p -ErrorAction Stop).ProcessName } catch {}
  $o = @{ fg = @{ hwnd = [int64]$h; pid = [int]$p; proc = $name; title = [QpWin]::Title($h) } }
  if ($n % 5 -eq 0) {
    $names = @{}
    Get-Process | ForEach-Object { $names[[int]$_.Id] = $_.ProcessName }
    $o.open = @(([QpWin]::List() -split "` + '`' + String.raw`n") | Where-Object { $_ } | ForEach-Object {
      $f = $_ -split "` + '`' + String.raw`t", 3
      @{ hwnd = [int64]$f[0]; pid = [int]$f[1]; proc = $names[[int]$f[1]]; title = $f[2] }
    })
  }
  $n++
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 400
}
`;

function matches(rule, w) {
  if (!w) return false;
  if (rule.hwnd) return Number(w.hwnd) === Number(rule.hwnd);
  if (rule.process && String(w.proc || '').toLowerCase() !== String(rule.process).toLowerCase().replace(/\.exe$/, '')) return false;
  if (rule.title && !String(w.title || '').toLowerCase().includes(String(rule.title).toLowerCase())) return false;
  return !!(rule.process || rule.title);
}

class WinBind {
  constructor(dir, onChange) {
    this.dir = dir; this.onChange = onChange;
    this.fg = null; this.lastOther = null; this.open = []; this.proc = null;
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
          if (o.fg) {
            this.fg = o.fg;
            if (o.fg.pid !== process.pid && o.fg.title) this.lastOther = o.fg;
          }
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

  isOpen(rule) { return this.open.some(w => matches(rule, w)); }

  windows() { return this.open.filter(w => w.pid !== process.pid).sort((a, b) => String(a.proc).localeCompare(String(b.proc))); }

  programs() { return [...new Set(this.windows().map(w => w.proc).filter(Boolean))].sort(); }
}

module.exports = { WinBind, matches };
