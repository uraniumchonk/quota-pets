// Tests for the quota-empty (crying face) pose switch: QP.pickPose(ch, ctx, cfg).
// Runs the real renderer files (quota.js + rules.js) in a vm sandbox.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'app');

function loadRenderer(files) {
  const sandbox = {};
  sandbox.window = sandbox;      // renderer scripts attach to window.*
  sandbox.console = console;
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(APP, 'renderer', 'js', f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

const QP = loadRenderer(['quota.js', 'rules.js']).QP;

const IDS = ['claude', 'codex', 'grok', 'qwen'];
const CHARS = IDS.map(id => JSON.parse(
  fs.readFileSync(path.join(APP, 'pets', 'characters', id, 'character.json'), 'utf8')));

// A context where the character's quota is exhausted (worst row critical).
function criticalCtx(over = {}) {
  const base = {
    rows: [], worstRow: null,
    severity: 'critical', minLeft: 1,
    source: 'ok',
    agentState: 'working', agentDoing: 'task',
    idleSec: 5,
    hour: 12, now: Date.now(),
  };
  return Object.assign(base, over);
}

const ON = { showQuotaEmptyPose: true };
const OFF = { showQuotaEmptyPose: false };

test('default (no cfg): critical shows the crying face — old behaviour', () => {
  for (const ch of CHARS) assert.equal(QP.pickPose(ch, criticalCtx()), 'critical');
});

test('showQuotaEmptyPose: true keeps the crying face', () => {
  for (const ch of CHARS) assert.equal(QP.pickPose(ch, criticalCtx(), ON), 'critical');
});

test('showQuotaEmptyPose: false skips the crying face, keeps working pose', () => {
  for (const ch of CHARS) assert.equal(QP.pickPose(ch, criticalCtx(), OFF), 'working');
});

test('showQuotaEmptyPose: false + long idle still shows the idle pose', () => {
  for (const ch of CHARS)
    assert.equal(QP.pickPose(ch, criticalCtx({ agentState: 'idle', idleSec: 2000 }), OFF), 'idle');
});

test('showQuotaEmptyPose: false + offline still shows the offline pose', () => {
  for (const ch of CHARS)
    assert.equal(QP.pickPose(ch, criticalCtx({ source: 'offline', agentState: 'unknown', idleSec: null }), OFF), 'offline');
});

test('showQuotaEmptyPose: false + unknown agent falls through to the warning pose', () => {
  for (const ch of CHARS)
    assert.equal(QP.pickPose(ch, criticalCtx({ agentState: 'unknown', idleSec: 100 }), OFF), 'warning');
});

test('re-enabling brings the crying face back', () => {
  const ch = CHARS[0];
  assert.equal(QP.pickPose(ch, criticalCtx(), OFF), 'working');
  assert.equal(QP.pickPose(ch, criticalCtx(), ON), 'critical');
  assert.equal(QP.pickPose(ch, criticalCtx(), { showQuotaEmptyPose: false }), 'working');
  assert.equal(QP.pickPose(ch, criticalCtx(), {}), 'critical');   // missing key = on
});

test('pickPose never mutates the context', () => {
  const ch = CHARS[0];
  for (const cfg of [undefined, ON, OFF]) {
    const ctx = criticalCtx();
    const before = JSON.stringify(ctx);
    QP.pickPose(ch, ctx, cfg);
    assert.equal(JSON.stringify(ctx), before);
  }
});

test('non-critical poses are untouched by the switch', () => {
  const ch = CHARS[0];
  const warn = criticalCtx({ severity: 'warning', minLeft: 20, agentState: 'unknown', idleSec: 100 });
  assert.equal(QP.pickPose(ch, warn), 'warning');
  assert.equal(QP.pickPose(ch, warn, OFF), 'warning');
  const calm = criticalCtx({ severity: 'normal', minLeft: 80 });
  assert.equal(QP.pickPose(ch, calm, OFF), 'working');
});

test('no matching rule: falls back to normal, switch off or on', () => {
  const ch = { rules: [{ if: { severity: 'critical' }, pose: 'critical' }, { pose: 'normal' }] };
  assert.equal(QP.pickPose(ch, criticalCtx()), 'critical');
  assert.equal(QP.pickPose(ch, criticalCtx(), OFF), 'normal');
  assert.equal(QP.pickPose(ch, criticalCtx({ severity: 'normal' }), OFF), 'normal');
});
