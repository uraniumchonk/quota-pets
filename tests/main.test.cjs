// Integration tests for main.cjs: bundle install, the menu checkbox (persist + config
// event), restart persistence, and bundle-upgrade carryOver of showQuotaEmptyPose.
// Runs the real main.cjs in a vm sandbox with a stubbed electron module.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'app');
const BUNDLED = path.join(APP, 'pets');
const STR = require(path.join(APP, 'i18n.json'));

function makeElectronStub(userData) {
  const sent = [];
  const handlers = {};
  const trayHandlers = {};
  let menuTemplate = null;
  const win = {
    isDestroyed: () => false,
    webContents: { send: (ch, v) => sent.push([ch, v]), openDevTools() {} },
    setAlwaysOnTop() {}, setVisibleOnAllWorkspaces() {}, loadFile() {},
    once() {}, setIgnoreMouseEvents() {}, setBounds() {},
    getSize: () => [600, 300], getPosition: () => [0, 0],
    showInactive() {}, focus() {},
  };
  const display = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
  const electron = {
    app: {
      requestSingleInstanceLock: () => true,
      whenReady: () => Promise.resolve(),
      getPath: () => userData,
      getLocale: () => 'en-US',
      getLoginItemSettings: () => ({ openAtLogin: false }),
      setLoginItemSettings() {},
      quit() {},
      on() {},
    },
    BrowserWindow: function () { return win; },
    ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; }, on: (ch, fn) => { handlers[ch] = fn; } },
    screen: {
      getAllDisplays: () => [display], getPrimaryDisplay: () => display,
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => display,
      on() {},
    },
    Menu: { buildFromTemplate: t => { menuTemplate = t; return { __template: t, popup() {} }; } },
    Tray: function () {
      return { setToolTip() {}, on: (ev, cb) => { trayHandlers[ev] = cb; }, popUpContextMenu() {} };
    },
    shell: { openPath() {} },
    nativeImage: {
      createFromPath: () => ({ isEmpty: () => true, resize: () => ({}) }),
      createEmpty: () => ({}),
    },
    globalShortcut: { unregisterAll() {}, register: () => true },
  };
  return { electron, sent, handlers, trayHandlers, getMenuTemplate: () => menuTemplate };
}

// Boot the real main.cjs against a throwaway userData dir.
async function bootMain(userData) {
  const stub = makeElectronStub(userData);
  const realFs = require('fs');
  const fsStub = Object.create(realFs);
  fsStub.watch = () => { throw new Error('watch disabled in tests'); };
  const sandbox = {
    console,
    process,
    Buffer,
    Date,
    setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    __dirname: APP,
    require: name => {
      if (name === 'electron') return stub.electron;
      if (name === 'fs') return fsStub;
      if (name.endsWith('winbind.cjs')) return {
        WinBind: class {
          constructor() {} start() {} stop() {}
          shouldShow() { return null; } windows() { return []; } programs() { return []; }
          isOpen() { return true; }
        },
      };
      if (name.startsWith('./')) return require(path.join(APP, name));
      return require(name);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'main.cjs'), 'utf8'), sandbox, { filename: 'main.cjs' });
  await new Promise(r => setImmediate(r));   // let app.whenReady() fire
  return stub;
}

const readCfg = userData => JSON.parse(fs.readFileSync(path.join(userData, 'pets', 'config.json'), 'utf8'));

function menuItem(stub, key) {
  const t = stub.getMenuTemplate();
  assert.ok(t, 'menu template was built');
  const item = t.find(i => i.label === STR.en[key]);
  assert.ok(item, `menu item "${STR.en[key]}" exists`);
  return item;
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qp-test-'));
}

test('fresh install: bundle v10 with showQuotaEmptyPose on', async () => {
  const dir = tmpDir();
  await bootMain(dir);
  const cfg = readCfg(dir);
  assert.equal(cfg.bundleVersion, 10);
  assert.equal(cfg.showQuotaEmptyPose, true);
});

test('menu checkbox: toggling off persists false and sends a config event', async () => {
  const dir = tmpDir();
  const stub = await bootMain(dir);
  stub.trayHandlers.click();
  let item = menuItem(stub, 'menu.quotaEmptyPose');
  assert.equal(item.type, 'checkbox');
  assert.equal(item.checked, true);

  item.click({ checked: false });
  assert.equal(readCfg(dir).showQuotaEmptyPose, false);
  const last = stub.sent.filter(([ch]) => ch === 'config').pop();
  assert.ok(last, 'a config event was sent');
  assert.equal(last[1].showQuotaEmptyPose, false);

  // re-open the menu: the checkbox now reads false from the saved config
  stub.trayHandlers.click();
  item = menuItem(stub, 'menu.quotaEmptyPose');
  assert.equal(item.checked, false);
  item.click({ checked: true });
  assert.equal(readCfg(dir).showQuotaEmptyPose, true);
});

test('restart: a saved false survives a relaunch', async () => {
  const dir = tmpDir();
  const stub = await bootMain(dir);
  stub.trayHandlers.click();
  menuItem(stub, 'menu.quotaEmptyPose').click({ checked: false });

  const stub2 = await bootMain(dir);
  const cfg2 = stub2.handlers.init();
  assert.equal(cfg2.cfg.showQuotaEmptyPose, false);
  stub2.trayHandlers.click();
  assert.equal(menuItem(stub2, 'menu.quotaEmptyPose').checked, false);
});

test('bundle upgrade carryOver: keeps a saved false and other tuning', async () => {
  const dir = tmpDir();
  const pets = path.join(dir, 'pets');
  fs.cpSync(BUNDLED, pets, { recursive: true });
  // Simulate an old user copy: bundle v9, crying face off, row moved.
  const old = JSON.parse(fs.readFileSync(path.join(pets, 'config.json'), 'utf8'));
  old.bundleVersion = 9;
  old.showQuotaEmptyPose = false;
  old.rail.x = 42;
  fs.writeFileSync(path.join(pets, 'config.json'), JSON.stringify(old, null, 2) + '\n');

  await bootMain(dir);
  const cfg = readCfg(dir);
  assert.equal(cfg.bundleVersion, 10);
  assert.equal(cfg.showQuotaEmptyPose, false, 'user setting carried over');
  assert.equal(cfg.rail.x, 42, 'other tuning carried over');
});
