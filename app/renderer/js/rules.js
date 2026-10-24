// Picks a pose for a character. Rules run top to bottom; the first rule whose
// conditions all match wins. A rule without "if" always matches.
// Add a new condition by registering it here: QP.conditions.name = (value, ctx) => bool
window.QP = window.QP || {};

QP.conditions = {
  source: (v, c) => c.source === v,                                   // "ok" | "offline"
  agentState: (v, c) => [].concat(v).includes(c.agentState),          // working | idle | sleeping | offline
  idleSecAtLeast: (v, c) => c.agentState !== 'working' && (c.idleSec == null || c.idleSec >= v),
  severity: (v, c) => QP.SEV_RANK[c.severity] >= QP.SEV_RANK[v],      // at least this bad
  leftBelow: (v, c) => c.minLeft != null && c.minLeft < v,            // any row with less than v% left
  clickedWithinSec: (v, c) => c.clickedAgo != null && c.clickedAgo <= v,  // the character was clicked recently
  hours: ([a, b], c) => (a <= b ? c.hour >= a && c.hour < b : c.hour >= a || c.hour < b),
  not: (v, c) => !QP.matches(v, c),
  any: (list, c) => list.some(cond => QP.matches(cond, c)),
};

QP.matches = function (cond, ctx) {
  if (!cond) return true;
  for (const [k, v] of Object.entries(cond)) {
    const fn = QP.conditions[k];
    if (!fn) { console.warn('unknown condition', k); return false; }
    if (!fn(v, ctx)) return false;
  }
  return true;
};

QP.pickPose = function (ch, ctx) {
  for (const r of ch.rules || []) if (QP.matches(r.if, ctx)) return r.pose;
  return 'normal';
};

// The pose object with defaults filled in. Pose-level textBox overrides the character's.
QP.resolvePose = function (ch, name) {
  const poses = ch.poses || {};
  const key = poses[name] ? name : 'normal';
  const p = poses[key] || {};
  return {
    key,
    img: p.img || null,
    front: p.front || null,
    showQuota: p.showQuota !== false,
    text: p.text || null,
    textBox: Object.assign({}, ch.textBox, p.textBox || {}),
    ownTextBox: !!p.textBox,
  };
};
