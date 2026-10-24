// Turns the raw agentstat payload into one context object per character.
// The context is what rules (rules.js) and the sign text (view.js) read.
window.QP = window.QP || {};

QP.SEV_RANK = { normal: 0, warning: 1, critical: 2 };

QP.severityOf = function (used, given, th) {
  let s = 'normal';
  if (used != null && used >= th.critical) s = 'critical';
  else if (used != null && used >= th.warning) s = 'warning';
  if (given && QP.SEV_RANK[given] > QP.SEV_RANK[s]) s = given;
  return s;
};

QP.STATE_LABEL = { working: '工作中', idle: '閒置', sleeping: '睡著了', offline: '離線', unknown: '不明' };

QP.buildContext = function (ch, data, cfg, now) {
  const th = cfg.thresholds || { warning: 75, critical: 90 };
  const quota = data.quota || {};
  const rows = (ch.quota || []).map(item => {
    const q = quota[item.provider];
    const w = q && q.ok !== false ? (q.windows || []).find(x => x.id === item.window) : null;
    const used = w ? w.used_pct : null;
    const left = used == null ? null : Math.max(0, Math.round(100 - used));
    return {
      label: item.label || item.provider + ' ' + item.window,
      used, left,
      resetsAt: w && w.resets_at ? w.resets_at * 1000 : null,
      severity: w ? QP.severityOf(used, w.severity, th) : 'normal',
      missing: !w,
    };
  });
  let worst = 'normal', minLeft = null, worstRow = null;
  for (const r of rows) {
    if (QP.SEV_RANK[r.severity] > QP.SEV_RANK[worst]) worst = r.severity;
    if (r.left != null && (minLeft == null || r.left < minLeft)) { minLeft = r.left; worstRow = r; }
  }
  const agent = (data.agents || []).find(a => a.id === ch.agent) || null;
  const ageSinceFetch = data.agentsAt ? (now - data.agentsAt) / 1000 : 0;
  const stale = !data.quotaAt || (data.error && now - data.quotaAt > 3 * (cfg.pollQuotaSec || 60) * 1000);
  return {
    rows, worstRow,
    severity: worst,
    minLeft,
    source: stale ? 'offline' : 'ok',
    agentState: agent ? agent.state : 'unknown',
    agentDoing: agent ? agent.doing || '' : '',
    idleSec: agent && agent.last_activity_age_sec != null ? agent.last_activity_age_sec + ageSinceFetch : null,
    hour: new Date(now).getHours(),
    now,
  };
};

QP.fmtLeft = function (ms) {
  if (ms == null) return '';
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return m + ' 分';
  const h = Math.floor(m / 60);
  if (h < 48) return h + ' 小時 ' + (m % 60) + ' 分';
  return Math.floor(h / 24) + ' 天 ' + (h % 24) + ' 小時';
};
