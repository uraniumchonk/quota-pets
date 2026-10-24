// Browser preview without Electron: serve the app folder over http and open
// renderer/index.html (?edit=1 opens adjust mode, ?state=warning|critical|sleep picks sample data, ?lang=en).
if (!window.host) (function () {
  const q = new URLSearchParams(location.search);
  const handlers = {};
  const now = Date.now() / 1000;
  const state = q.get('state') || 'normal';
  const used = { normal: [18, 41, 28, 5, 16, 30], warning: [63, 82, 40, 20, 78, 50], critical: [96, 99, 70, 60, 93, 100], sleep: [18, 41, 28, 5, 16, 30] }[state];
  const win = (id, u, h) => ({ id, used_pct: u, resets_at: now + h * 3600 });
  const data = {
    quotaAt: Date.now(), agentsAt: Date.now(),
    quota: {
      claude: { ok: true, windows: [win('5h', used[0], 2.2), win('7d', used[1], 70)] },
      claude2: { ok: true, windows: [win('5h', used[2], 3.5), win('7d', used[3], 90)] },
      codex: { ok: true, windows: [win('7d', used[4], 120)] },
      grok: { ok: true, windows: [win('7d', used[5], 60)] },
    },
    agents: [
      { id: 'cli:claude', state: 'working', last_activity_age_sec: 5 },
      { id: 'cli:codex', state: state === 'sleep' ? 'sleeping' : 'idle', last_activity_age_sec: 4000 },
      { id: 'cli:grok', state: 'sleeping', last_activity_age_sec: state === 'sleep' ? 9000 : 600 },
      { id: 'meowchat:coder', state: 'working', doing: 'Organize gallery-dl downloads', last_activity_age_sec: 20 },
    ],
  };
  async function loadCfg() {
    const cfg = await (await fetch('../pets/config.json')).json();
    cfg.chars = [];
    for (const id of cfg.characters) {
      const ch = await (await fetch(`../pets/characters/${id}/character.json`)).json();
      ch.id = id; ch.base = new URL(`../pets/characters/${id}/`, location.href).href;
      cfg.chars.push(ch);
    }
    cfg.version = 1;
    cfg.langResolved = q.get('lang') || 'zh-TW';
    cfg.strings = (await (await fetch('../i18n.json')).json())[cfg.langResolved];
    return cfg;
  }
  window.host = {
    init: async () => ({ cfg: await loadCfg(), data, editing: q.has('edit') }),
    on: (ch, fn) => { handlers[ch] = fn; },
    size: (w, h) => { document.title = `size ${w}x${h}`; },
    mask: async () => null,
    hit: () => {}, menu: () => {}, dragStart: () => {}, dragEnd: () => {},
    save: (cfg) => console.log('save', JSON.stringify(cfg.rail)),
    edit: () => {},
  };
})();
