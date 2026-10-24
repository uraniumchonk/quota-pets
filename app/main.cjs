// Quota pets: a transparent always-on-top strip of characters that show agentstat quota.
// Main process owns the window, the pets folder (config + art), polling and the menus.
const { app, BrowserWindow, ipcMain, screen, Menu, Tray, shell, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const BUNDLED = path.join(__dirname, 'pets');
let PETS;                       // user copy, editable: %APPDATA%/quota-pets/pets
let win, tray, cfg;
let editing = false;
let data = { quota: null, agents: null, quotaAt: 0, agentsAt: 0, error: null };
let timers = [];
let suppressWatchUntil = 0;

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
  try { const j = await getJson(cfg.server + '/api/quota'); data.quota = j.quota; data.quotaAt = Date.now(); data.error = null; }
  catch (e) { data.error = String(e.message || e); }
  send('data', data);
}
async function pollAgents() {
  try { const j = await getJson(cfg.server + '/api/agents'); data.agents = j.agents; data.agentsAt = Date.now(); }
  catch (e) { data.error = String(e.message || e); }
  send('data', data);
}
function restartPolling() {
  timers.forEach(clearInterval);
  pollQuota(); pollAgents();
  timers = [setInterval(pollQuota, (cfg.pollQuotaSec || 60) * 1000), setInterval(pollAgents, (cfg.pollAgentsSec || 20) * 1000)];
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

// ---------- menus ----------
function menu() {
  return Menu.buildFromTemplate([
    { label: editing ? '結束調整（不存）' : '調整位置…', click: () => setEditing(!editing) },
    { label: '鎖定位置', type: 'checkbox', checked: !!cfg.rail.locked, click: (m) => { cfg.rail.locked = m.checked; saveConfig(cfg); send('config', cfg); } },
    { type: 'separator' },
    { label: '立即刷新額度', click: async () => {
        try { await fetch(cfg.server + '/api/refresh', { method: 'POST' }); } catch {}
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
}

// ---------- boot ----------
app.whenReady().then(() => {
  PETS = path.join(app.getPath('userData'), 'pets');
  copyDir(BUNDLED, PETS);
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

  screen.on('display-metrics-changed', () => place());
  watchPets();
  restartPolling();
});

app.on('window-all-closed', () => app.quit());
