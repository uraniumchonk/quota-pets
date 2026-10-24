// Quota pets: a transparent always-on-top strip of characters that show agentstat quota.
// Main process owns the window, the pets folder (config + art), polling and the menus.
const { app, BrowserWindow, ipcMain, screen, Menu, Tray, shell, nativeImage, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');
const { WinBind } = require('./winbind.cjs');

const BUNDLED = path.join(__dirname, 'pets');
let PETS;                       // user copy, editable: %APPDATA%/quota-pets/pets
let win, tray, cfg;
let editing = false;
let data = { quota: null, agents: null, quotaAt: 0, agentsAt: 0, error: null };
let timers = [];
let suppressWatchUntil = 0;
let binder, shown = true, hideTimer = null;

if (!app.requestSingleInstanceLock()) app.quit();

// ---------- pets folder ----------
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else if (!fs.existsSync(d)) fs.copyFileSync(s, d);
  }
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// A newer bundle (config.json bundleVersion) replaces the user's copy; the old copy is kept as pets.bak-<time>.
function installPets() {
  const bundled = readJson(path.join(BUNDLED, 'config.json')).bundleVersion || 1;
  let mine = 0;
  try { mine = readJson(path.join(PETS, 'config.json')).bundleVersion || 1; } catch {}
  let bak = null;
  if (mine && mine < bundled) {
    bak = PETS + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.renameSync(PETS, bak);
  }
  copyDir(BUNDLED, PETS);
  if (bak) try { carryOver(bak); } catch (e) { console.error('carry over', e.message); }
}

// Keep the user's tuning across a bundle upgrade: placement, size, binding, and each
// character's offset / scale / text boxes (a pose's box only when its image file is unchanged).
function carryOver(bak) {
  const oldTop = readJson(path.join(bak, 'config.json'));
  const top = readJson(path.join(PETS, 'config.json'));
  for (const k of ['anchor', 'x', 'y', 'display', 'shiftY', 'gap', 'scale', 'zoom', 'locked']) if (oldTop.rail && k in oldTop.rail) top.rail[k] = oldTop.rail[k];
  for (const k of ['bind', 'display', 'server']) {
    if (k === 'bind' && (oldTop.bundleVersion || 1) < 5) continue;   // v4 shipped an example binding
    if (k in oldTop) top[k] = oldTop[k];
  }
  if (top.bind && (oldTop.bundleVersion || 1) < 6) top.bind.hideDelaySec = 0.2;   // v5 waited 1.5 s
  fs.writeFileSync(path.join(PETS, 'config.json'), JSON.stringify(top, null, 2) + '\n');
  for (const id of top.characters || []) {
    const f = path.join(PETS, 'characters', id, 'character.json'), of = path.join(bak, 'characters', id, 'character.json');
    if (!fs.existsSync(of)) continue;
    const ch = readJson(f), old = readJson(of);
    if (old.offset) ch.offset = old.offset;
    if (old.scale) ch.scale = old.scale;
    const oldNormal = old.poses && old.poses.normal && old.poses.normal.img;
    if (old.textBox && oldNormal && ch.poses.normal && ch.poses.normal.img === oldNormal) ch.textBox = old.textBox;
    for (const [name, p] of Object.entries(ch.poses || {})) {
      const op = old.poses && old.poses[name];
      if (op && op.textBox && op.img === p.img) p.textBox = op.textBox;
    }
    fs.writeFileSync(f, JSON.stringify(ch, null, 2) + '\n');
  }
}

// Alpha mask of an image at 1/8 size, so clicks on transparent pixels fall through.
const MASK_STEP = 8;
function alphaMask(url) {
  const img = nativeImage.createFromPath(fileURLToPath(url.split('?')[0]));
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  const w = Math.max(1, Math.round(width / MASK_STEP)), h = Math.max(1, Math.round(height / MASK_STEP));
  const bmp = img.resize({ width: w, height: h, quality: 'good' }).toBitmap();   // BGRA
  const a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = bmp[i * 4 + 3];
  return { w, h, alpha: Buffer.from(a).toString('base64') };
}

function loadConfig() {
  const c = readJson(path.join(PETS, 'config.json'));
  c.chars = [];
  for (const id of c.characters || []) {
    const dir = path.join(PETS, 'characters', id);
    try {
      const ch = readJson(path.join(dir, 'character.json'));
      ch.id = id;
      ch.base = pathToFileURL(dir).href + '/';
      c.chars.push(ch);
    } catch (e) { console.error('character', id, e.message); }
  }
  c.version = Date.now();     // cache-buster so replaced images reload
  return c;
}

function saveConfig(next) {
  suppressWatchUntil = Date.now() + 1500;
  const { chars, version, ...top } = next;
  fs.writeFileSync(path.join(PETS, 'config.json'), JSON.stringify(top, null, 2) + '\n');
  for (const ch of chars) {
    const { id, base, ...rest } = ch;
    fs.writeFileSync(path.join(PETS, 'characters', id, 'character.json'), JSON.stringify(rest, null, 2) + '\n');
  }
  cfg = loadConfig();
}

function watchPets() {
  let t;
  try {
    fs.watch(PETS, { recursive: true }, () => {
      if (Date.now() < suppressWatchUntil) return;
      clearTimeout(t);
      t = setTimeout(reload, 300);
    });
  } catch (e) { console.error('watch', e.message); }
}

function reload() {
  try { cfg = loadConfig(); } catch (e) { console.error('config', e.message); return; }
  send('config', cfg);
  restartPolling();
}

// ---------- demo data (server: "demo"): cycles through calm / busy / empty / idle every 15 s ----------
function demoData() {
  const now = Date.now(), t = Math.floor(now / 15000) % 4;
  const used = [[20, 35, 10, 5, 25, 15], [60, 80, 40, 30, 78, 60], [97, 99, 70, 50, 93, 100], [30, 45, 12, 8, 20, 40]][t];
  const state = [['working', 'idle', 'working', 'working'], ['working', 'working', 'idle', 'working'],
                 ['working', 'working', 'working', 'idle'], ['idle', 'sleeping', 'sleeping', 'idle']][t];
  const age = s => (s === 'working' ? 5 : 4000);
  const win = (id, u, h) => ({ id, used_pct: u, resets_at: now / 1000 + h * 3600 });
  return {
    quotaAt: now, agentsAt: now, error: null,
    quota: {
      claude: { ok: true, windows: [win('5h', used[0], 2.5), win('7d', used[1], 60)] },
      claude2: { ok: true, windows: [win('5h', used[2], 4), win('7d', used[3], 100)] },
      codex: { ok: true, windows: [win('7d', used[4], 90)] },
      grok: { ok: true, windows: [win('7d', used[5], 50)] },
    },
    agents: [['cli:claude', 0], ['cli:codex', 1], ['cli:grok', 2], ['meowchat:coder', 3]].map(([id, i]) =>
      ({ id, state: state[i], last_activity_age_sec: age(state[i]), doing: state[i] === 'working' ? 'demo task' : '' })),
  };
}
const isDemo = () => !cfg.server || cfg.server === 'demo';

// ---------- agentstat ----------
async function getJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function pollQuota() {
  if (isDemo()) { Object.assign(data, demoData()); send('data', data); return; }
  try { const j = await getJson(cfg.server + '/api/quota'); data.quota = j.quota; data.quotaAt = Date.now(); data.error = null; }
  catch (e) { data.error = String(e.message || e); }
  send('data', data);
}
async function pollAgents() {
  if (isDemo()) return;
  try { const j = await getJson(cfg.server + '/api/agents'); data.agents = j.agents; data.agentsAt = Date.now(); }
  catch (e) { data.error = String(e.message || e); }
  send('data', data);
}
function restartPolling() {
  timers.forEach(clearInterval);
  pollQuota(); pollAgents();
  timers = [setInterval(pollQuota, (isDemo() ? 5 : cfg.pollQuotaSec || 60) * 1000), setInterval(pollAgents, (cfg.pollAgentsSec || 20) * 1000)];
}

// ---------- window placement ----------
function send(ch, v) { if (win && !win.isDestroyed()) win.webContents.send(ch, v); }

function anchorPos(anchor, w, disp) {
  const b = disp.bounds;
  if (anchor === 'top-left') return { x: b.x, y: b.y };
  return { x: Math.round(b.x + (b.width - w) / 2), y: b.y };
}
function place(size) {
  const r = cfg.rail;
  const [w, h] = size || win.getSize();
  let x, y;
  if (r.anchor === 'free') { x = r.x; y = r.y; }
  else {
    const disp = screen.getAllDisplays().find(d => d.id === r.display) || screen.getPrimaryDisplay();
    const a = anchorPos(r.anchor, w, disp);
    x = a.x + r.x; y = a.y + r.y;
  }
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
}

let drag = null;
function dragTick() {
  if (!drag) return;
  const p = screen.getCursorScreenPoint();
  const [w, h] = win.getSize();
  win.setBounds({ x: p.x - drag.dx, y: p.y - drag.dy, width: w, height: h });
}
function dragEnd() {
  if (!drag) return;
  clearInterval(drag.timer); drag = null;
  const [x, y] = win.getPosition(), [w] = win.getSize();
  const disp = screen.getDisplayNearestPoint({ x: x + w / 2, y });
  const SNAP = 48;
  const r = cfg.rail;
  r.display = disp.id;
  let snapped = false;
  for (const anchor of ['top-center', 'top-left']) {
    const a = anchorPos(anchor, w, disp);
    if (Math.abs(x - a.x) < SNAP && Math.abs(y - a.y) < SNAP) { r.anchor = anchor; r.x = 0; r.y = 0; snapped = true; break; }
  }
  if (!snapped) {
    r.anchor = 'free';
    r.x = x; r.y = Math.max(disp.bounds.y, y);   // top edge stays on screen; use offsets to push heads out
  }
  place();
  saveConfig(cfg);
  send('config', cfg);
}

// ---------- window binding: show only while a chosen window is in front / open ----------
function applyVisibility() {
  if (!win || win.isDestroyed()) return;
  const want = editing ? true : binder.shouldShow(cfg.bind);
  if (want === null) return;
  if (want) {
    clearTimeout(hideTimer); hideTimer = null;
    if (!shown) { shown = true; win.showInactive(); win.setAlwaysOnTop(true, 'screen-saver'); }
  } else if (shown && !hideTimer) {
    hideTimer = setTimeout(() => { hideTimer = null; shown = false; win.hide(); }, ((cfg.bind && cfg.bind.hideDelaySec) ?? 0.2) * 1000);
  }
}

function saveBind(change) {
  cfg.bind = Object.assign({ enabled: false, mode: 'foreground', match: [], hideDelaySec: 0.2 }, cfg.bind);
  change(cfg.bind);
  saveConfig(cfg);
  send('config', cfg);
  applyVisibility();
}

function ruleLabel(r) {
  if (r.hwnd) return `${r.process || '視窗'}「${String(r.title || '').slice(0, 30)}」`;
  return [r.process && `${r.process}（全部視窗）`, r.title && `標題含「${r.title}」`].filter(Boolean).join(' ');
}

// Bind or unbind one window (by handle). Used by the hotkey and the menu.
function toggleWindow(w) {
  if (!w) return;
  let bound = false;
  saveBind(x => {
    const i = x.match.findIndex(r => r.hwnd && Number(r.hwnd) === Number(w.hwnd));
    if (i >= 0) x.match.splice(i, 1);
    else { x.match.push({ hwnd: w.hwnd, process: w.proc, title: w.title }); x.enabled = true; bound = true; }
  });
  send('toast', `${bound ? '已綁定' : '已解除'}：${w.proc || ''} ${String(w.title || '').slice(0, 24)}`);
}

function bindMenu() {
  const b = Object.assign({ enabled: false, mode: 'foreground', match: [] }, cfg.bind);
  const hot = b.hotkey || 'Ctrl+Alt+B';
  const items = [
    { label: '只在綁定的視窗出現', type: 'checkbox', checked: !!b.enabled, click: m => saveBind(x => { x.enabled = m.checked; }) },
    { label: '切到綁定的視窗時出現', type: 'radio', checked: b.mode !== 'open', click: () => saveBind(x => { x.mode = 'foreground'; }) },
    { label: '綁定的視窗有開著就出現', type: 'radio', checked: b.mode === 'open', click: () => saveBind(x => { x.mode = 'open'; }) },
    { label: `快捷鍵 ${hot}：綁定／解除目前的視窗`, enabled: false },
    { type: 'separator' },
  ];
  if (b.match.length) {
    b.match.forEach((r, i) => items.push({
      label: `移除：${ruleLabel(r)}${binder.isOpen(r) ? '' : '（已關閉）'}`,
      click: () => saveBind(x => { x.match.splice(i, 1); }),
    }));
    if (b.match.some(r => !binder.isOpen(r)) && process.platform === 'win32')
      items.push({ label: '清掉已關閉的視窗', click: () => saveBind(x => { x.match = x.match.filter(r => !r.hwnd || binder.isOpen(r)); }) });
  } else items.push({ label: '（還沒有綁定）', enabled: false });

  const wins = binder.windows(), progs = binder.programs();
  const none = [{ label: process.platform === 'win32' ? '（讀取中，稍後再開一次）' : '（只支援 Windows）', enabled: false }];
  items.push({ type: 'separator' },
    { label: '綁定單一視窗', submenu: wins.length ? wins.map(w => ({
        label: `${w.proc} — ${String(w.title).slice(0, 50)}`, type: 'checkbox',
        checked: b.match.some(r => r.hwnd && Number(r.hwnd) === Number(w.hwnd)),
        click: () => toggleWindow(w) })) : none },
    { label: '綁定整個程式（它的所有視窗）', submenu: progs.length ? progs.map(p => ({
        label: p, type: 'checkbox',
        checked: b.match.some(r => !r.hwnd && r.process && r.process.toLowerCase() === p.toLowerCase()),
        click: m => saveBind(x => {
          x.match = x.match.filter(r => r.hwnd || !r.process || r.process.toLowerCase() !== p.toLowerCase());
          if (m.checked) { x.match.push({ process: p }); x.enabled = true; }
        }) })) : none });
  return items;
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  if (process.platform !== 'win32') return;
  const key = (cfg.bind && cfg.bind.hotkey) || 'Ctrl+Alt+B';
  try {
    if (!globalShortcut.register(key.replace(/Ctrl/i, 'CommandOrControl'), () => toggleWindow(binder.lastOther)))
      console.error('hotkey taken', key);
  } catch (e) { console.error('hotkey', e.message); }
}

// ---------- menus ----------
function menu() {
  return Menu.buildFromTemplate([
    { label: editing ? '結束調整（不存）' : '調整位置…', click: () => setEditing(!editing) },
    { label: '鎖定位置', type: 'checkbox', checked: !!cfg.rail.locked, click: (m) => { cfg.rail.locked = m.checked; saveConfig(cfg); send('config', cfg); } },
    { label: '大小', submenu: [50, 60, 70, 80, 90, 100, 120, 150].map(p => ({ label: p + '%', type: 'radio',
        checked: Math.round((cfg.rail.zoom || 1) * 100) === p, click: () => send('zoom', p / 100) })) },
    { label: '綁定視窗', submenu: bindMenu() },
    { type: 'separator' },
    { label: '立即刷新額度', click: async () => {
        if (!isDemo()) try { await fetch(cfg.server + '/api/refresh', { method: 'POST' }); } catch {}
        setTimeout(pollQuota, 1500); pollAgents(); } },
    { label: '重新載入角色', click: reload },
    { label: '開啟角色資料夾', click: () => shell.openPath(PETS) },
    { type: 'separator' },
    { label: '開機自動啟動', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked }) },
    { label: '開發者工具', click: () => win.webContents.openDevTools({ mode: 'detach' }) },
    { label: '結束', click: () => app.quit() },
  ]);
}
function setEditing(on) {
  editing = on;
  win.setIgnoreMouseEvents(false);
  if (on) win.focus();
  send('editing', on);
  if (binder) applyVisibility();
}

// ---------- boot ----------
app.whenReady().then(() => {
  PETS = path.join(app.getPath('userData'), 'pets');
  installPets();
  cfg = loadConfig();

  win = new BrowserWindow({
    width: 600, height: 300, transparent: true, frame: false, resizable: false, hasShadow: false,
    skipTaskbar: true, alwaysOnTop: true, maximizable: false, fullscreenable: false, show: false,
    backgroundColor: '#00000000', title: '額度小人',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { win.showInactive(); });
  win.setIgnoreMouseEvents(true, { forward: true });

  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('額度小人');
  tray.on('click', () => tray.popUpContextMenu(menu()));
  tray.on('right-click', () => tray.popUpContextMenu(menu()));

  ipcMain.handle('init', () => ({ cfg, data, editing }));
  ipcMain.handle('mask', (_e, url) => { try { return alphaMask(url); } catch { return null; } });
  ipcMain.on('size', (_e, w, h) => place([Math.ceil(w), Math.ceil(h)]));
  ipcMain.on('hit', (_e, over) => { if (!editing) win.setIgnoreMouseEvents(!over, { forward: true }); });
  ipcMain.on('menu', () => menu().popup({ window: win }));
  ipcMain.on('drag-start', (_e, cx, cy) => {
    if (cfg.rail.locked || editing) return;
    const [x, y] = win.getPosition();
    const p = screen.getCursorScreenPoint();
    drag = { dx: p.x - x, dy: p.y - y, timer: setInterval(dragTick, 16) };
  });
  ipcMain.on('drag-end', dragEnd);
  ipcMain.on('save', (_e, next, { lock } = {}) => {
    if (lock) next.rail.locked = true;
    saveConfig(next);
    if (lock) setEditing(false);
    send('config', cfg);
  });
  ipcMain.on('edit', (_e, on) => { if (!on) cfg = loadConfig(); setEditing(on); send('config', cfg); });

  binder = new WinBind(app.getPath('userData'), applyVisibility);
  binder.start();
  registerHotkey();
  app.on('before-quit', () => { binder.stop(); globalShortcut.unregisterAll(); });
  screen.on('display-metrics-changed', () => place());
  watchPets();
  restartPolling();
});

app.on('window-all-closed', () => app.quit());
