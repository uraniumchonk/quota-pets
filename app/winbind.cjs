// Window binding (Windows only): a long-lived PowerShell process hooks Windows events
// (foreground change, minimize) and prints one JSON line per event; every 2 s it also
// prints the list of visible top-level windows and the current foreground window.
// A binding rule names one window by handle (hwnd), or every window of a program (process),
// or windows whose title contains some text (title).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT = String.raw`
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text; using System.Diagnostics;
public static class QpWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  public delegate void WinEventProc(IntPtr hook, uint ev, IntPtr hwnd, int idObject, int idChild, uint thread, uint time);
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; public uint lPrivate; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr mod, WinEventProc cb, uint pid, uint tid, uint flags);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG m);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG m);
  [DllImport("user32.dll")] static extern UIntPtr SetTimer(IntPtr h, UIntPtr id, uint ms, IntPtr fn);

  static WinEventProc keep;   // keeps the callback alive for the hook

  static string Title(IntPtr h) { var t = new StringBuilder(512); GetWindowText(h, t, 512); return t.ToString(); }
  static string Proc(uint pid) { try { return Process.GetProcessById((int)pid).ProcessName; } catch { return ""; } }
  static string Esc(string s) {
    var b = new StringBuilder();
    foreach (char c in s) {
      if (c == '\\' || c == '"') b.Append('\\').Append(c);
      else if (c < 0x20) b.Append("\\u").Append(((int)c).ToString("x4"));
      else b.Append(c);
    }
    return b.ToString();
  }
  static string Win(IntPtr h) {
    uint pid; GetWindowThreadProcessId(h, out pid);
    return "{\"hwnd\":" + h.ToInt64() + ",\"pid\":" + pid + ",\"proc\":\"" + Esc(Proc(pid)) + "\",\"title\":\"" + Esc(Title(h)) + "\"}";
  }
  static void Emit(string s) { Console.Out.WriteLine(s); Console.Out.Flush(); }
  static void Fg(string why) { Emit("{\"ev\":\"" + why + "\",\"fg\":" + Win(GetForegroundWindow()) + "}"); }

  static void OpenList() {
    var sb = new StringBuilder("{\"open\":[");
    bool first = true;
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      if (GetWindow(h, 4) != IntPtr.Zero) return true;              // owned popup
      if ((GetWindowLong(h, -20) & 0x80) != 0) return true;         // tool window
      int cloaked = 0; DwmGetWindowAttribute(h, 14, out cloaked, 4);
      if (cloaked != 0) return true;                                 // hidden UWP / other desktop
      if (Title(h).Length == 0) return true;
      if (!first) sb.Append(',');
      sb.Append(Win(h)); first = false;
      return true;
    }, IntPtr.Zero);
    Emit(sb.Append("]}").ToString());
  }

  static void OnEvent(IntPtr hook, uint ev, IntPtr hwnd, int idObject, int idChild, uint thread, uint time) {
    if (idObject != 0) return;                                       // OBJID_WINDOW only
    if (ev == 0x16) { Emit("{\"ev\":\"minimize\",\"minimized\":" + hwnd.ToInt64() + "}"); return; }
    Fg(ev == 3 ? "foreground" : "restore");
  }

  public static void Run() {
    keep = OnEvent;
    SetWinEventHook(0x0003, 0x0003, IntPtr.Zero, keep, 0, 0, 0);   // EVENT_SYSTEM_FOREGROUND
    SetWinEventHook(0x0016, 0x0017, IntPtr.Zero, keep, 0, 0, 0);   // EVENT_SYSTEM_MINIMIZESTART / END
    Fg("start"); OpenList();
    SetTimer(IntPtr.Zero, UIntPtr.Zero, 2000, IntPtr.Zero);
    MSG m;
    while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) {
      if (m.message == 0x0113) { OpenList(); Fg("tick"); continue; } // WM_TIMER: resync in case an event was missed
      TranslateMessage(ref m); DispatchMessage(ref m);
    }
  }
}
"@
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[QpWin]::Run()
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
          // the window in front is being minimized: treat it as gone right away
          if (o.minimized && this.fg && Number(this.fg.hwnd) === Number(o.minimized)) this.fg = { hwnd: 0, pid: 0, proc: '', title: '' };
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
