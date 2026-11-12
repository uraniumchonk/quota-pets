// Tests for the renderer App (app.js): poseOf / tick pass cfg to QP.pickPose,
// and forcePose still previews the crying face while the switch is off.
// Runs the real quota.js + rules.js + app.js in a vm sandbox with stubbed View/Editor.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'app');

function bootApp() {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = console;
  sandbox.addEventListener = () => {};
  sandbox.document = {
    getElementById: () => ({}),
    documentElement: { lang: '' },
    addEventListener: () => {},
    elementsFromPoint: () => [],
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'renderer', 'js', 'quota.js'), 'utf8'), sandbox, { filename: 'quota.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'renderer', 'js', 'rules.js'), 'utf8'), sandbox, { filename: 'rules.js' });
  sandbox.QP.View = class {
    constructor() { this.els = []; this.lay = { width: 0, height: 0 }; }
    build(cfg) { this.els = (cfg.chars || []).map(() => ({ lastPose: null })); }
    placeAll() {}
    paint() {}
  };
  sandbox.QP.Editor = class { start() {} stop() {} render() {} };
  vm.runInContext(fs.readFileSync(path.join(APP, 'renderer', 'js', 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
  return { sandbox, App: vm.runInContext('App', sandbox) };
}

const IDS = ['claude', 'codex', 'grok', 'qwen'];
const CHARS = IDS.map(id => JSON.parse(
  fs.readFileSync(path.join(APP, 'pets', 'characters', id, 'character.json'), 'utf8')));

// Exhausted quota for every provider the characters read, all agents working.
function allCriticalData() {
  const now = Date.now();
  const quota = {};
  for (const ch of CHARS)
    for (const item of ch.quota || [])
      quota[item.provider] = { ok: true, windows: [{ id: item.window, used_pct: 99, resets_at: now / 1000 + 3600 }] };
  return {
    quotaAt: now, agentsAt: now, error: null, quota,
    agents: CHARS.filter(c => c.agent).map(c => ({ id: c.agent, state: 'working', last_activity_age_sec: 5, doing: 'task' })),
  };
}

function makeApp(cfgOver = {}) {
  const { sandbox, App } = bootApp();
  const app = new App();
  app.cfg = Object.assign({ chars: CHARS, rail: { zoom: 1 }, strings: {}, langResolved: 'en', bubble: {} }, cfgOver);
  app.data = allCriticalData();
  app.view.build(app.cfg);
  return app;
}

test('poseOf: switch off still lets forcePose preview the crying face', () => {
  const app = makeApp({ showQuotaEmptyPose: false });
  app.forcePose[0] = 'critical';
  assert.equal(app.poseOf(0), 'critical');
  delete app.forcePose[0];
  assert.equal(app.poseOf(0), 'working');
});

test('poseOf: switch on (and missing) shows the crying face automatically', () => {
  assert.equal(makeApp({ showQuotaEmptyPose: true }).poseOf(0), 'critical');
  assert.equal(makeApp({}).poseOf(0), 'critical');
});

test('tick: paints the working pose for all four characters when the switch is off', () => {
  const app = makeApp({ showQuotaEmptyPose: false });
  const painted = [];
  app.view.paint = (i, pose) => painted.push(pose.key);
  app.tick();
  assert.deepEqual(painted, CHARS.map(() => 'working'));
  assert.deepEqual(app.view.els.map(e => e.lastPose), CHARS.map(() => 'working'));
});

test('tick: paints the crying face for every character with a critical row when the switch is on', () => {
  const app = makeApp({ showQuotaEmptyPose: true });
  const painted = [];
  app.view.paint = (i, pose) => painted.push(pose.key);
  app.tick();
  const expected = CHARS.map(ch => (ch.quota || []).length ? 'critical' : 'working');
  assert.deepEqual(painted, expected);
  assert.ok(painted.includes('critical'));
});

test('tick: ctx numbers and severity are unchanged by the switch', () => {
  const off = makeApp({ showQuotaEmptyPose: false });
  const on = makeApp({ showQuotaEmptyPose: true });
  const data = allCriticalData();
  off.data = on.data = data;
  for (let i = 0; i < CHARS.length; i++) {
    const a = off.ctxOf(i), b = on.ctxOf(i);
    if ((CHARS[i].quota || []).length) assert.equal(a.severity, 'critical');
    assert.deepEqual(a.rows, b.rows);
    assert.equal(a.minLeft, b.minLeft);
    assert.equal(a.severity, b.severity);
  }
});
