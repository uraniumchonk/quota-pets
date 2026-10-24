// Boot, repaint loop, click / drag / right-click, speech bubbles.
window.QP = window.QP || {};

const PANEL_H = 150, PANEL_MIN_W = 520;

class App {
  constructor() {
    this.view = new QP.View(document.getElementById('rail'));
    this.editor = new QP.Editor(this);
    this.forcePose = {};      // index -> pose name (adjust-mode preview, click reactions)
    this.data = {};
  }

  async boot() {
    const { cfg, data, editing } = await host.init();
    this.setConfig(cfg); this.data = data || {};
    host.on('config', c => this.setConfig(c));
    host.on('data', d => { this.data = d; this.tick(); });
    host.on('toast', text => { const i = this.cfg.chars.length ? 0 : -1; if (i >= 0) this.view.say(i, text, 3); });
    host.on('editing', on => (on ? this.editor.start() : this.editor.stop(), this.relayout()));
    if (editing) this.editor.start();
    this.bindPointer();
    this.bindWheel();
    host.on('zoom', z => this.setZoom(z));
    setInterval(() => this.tick(), 1000);
    this.scheduleChatter();
    this.tick();
  }

  setConfig(cfg) {
    this.cfg = cfg;
    QP.strings = cfg.strings || QP.strings;
    QP.lang = cfg.langResolved || QP.lang;
    document.documentElement.lang = QP.lang;
    this.view.build(cfg);
    this.relayout();
    if (QP.editing) this.editor.render();
  }

  relayout() {
    this.view.placeAll();
    this.tick();
    const lay = this.view.lay;
    const w = Math.max(lay.width, QP.editing ? PANEL_MIN_W : 0);
    const h = lay.height + (QP.editing ? PANEL_H : 0);
    document.getElementById('panel').style.top = lay.height + 'px';
    host.size(w, h);
  }

  poseOf(i) {
    if (this.forcePose[i]) return this.forcePose[i];
    return QP.pickPose(this.cfg.chars[i], this.ctxOf(i));
  }

  ctxOf(i) {
    const ctx = QP.buildContext(this.cfg.chars[i], this.data, this.cfg, Date.now());
    ctx.clickedAgo = this.clickedAt && this.clickedAt[i] ? (Date.now() - this.clickedAt[i]) / 1000 : null;
    return ctx;
  }

  tick() {
    if (!this.cfg) return;
    this.cfg.chars.forEach((ch, i) => {
      const ctx = this.ctxOf(i);
      const name = this.forcePose[i] || QP.pickPose(ch, ctx);
      this.view.paint(i, QP.resolvePose(ch, name), ctx);
      this.view.els[i].lastPose = name;
    });
  }

  say(i) {
    const ch = this.cfg.chars[i];
    const L = ch.lines || {};
    const pick = v => { v = QP.loc(v); return Array.isArray(v) && v.length ? v : null; };
    const lines = pick(L[this.view.els[i].lastPose]) || pick(L.normal) || [];
    if (lines.length) this.view.say(i, lines[Math.floor(Math.random() * lines.length)], (this.cfg.bubble || {}).showSec);
  }

  react(i) {
    const c = this.cfg.chars[i].click || {};
    (this.clickedAt = this.clickedAt || {})[i] = Date.now();
    this.tick();
    if (c.say !== false) this.say(i);
    if (c.pose) {
      this.forcePose[i] = c.pose; this.tick();
      setTimeout(() => { if (this.forcePose[i] === c.pose) { delete this.forcePose[i]; this.tick(); } }, c.ms || 1500);
    }
  }

  scheduleChatter() {
    const b = this.cfg.bubble || {};
    const [a, z] = b.autoSec || [45, 110];
    setTimeout(() => {
      if (b.enabled !== false && !QP.editing && this.cfg.chars.length) this.say(Math.floor(Math.random() * this.cfg.chars.length));
      this.scheduleChatter();
    }, (a + Math.random() * (z - a)) * 1000);
  }

  save(lock) { host.save(this.cfg, { lock }); if (lock) this.editor.stop(); }
  cancelEdit() { this.editor.stop(); host.edit(false); }

  // What is under a point: sign text, ledge, or an opaque pixel of a character image.
  // Overlapping frames are checked top to bottom, so a transparent corner passes to the one below.
  hitAt(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest('#panel')) return { part: 'panel' };
      const tb = el.closest('.tb');
      if (tb && !tb.hidden && tb.innerHTML) return { i: +tb.dataset.i, part: 'text' };
      if (el.classList.contains('ledge') && !el.hidden) return { i: this.editor.sel.i, part: 'ledge' };
      const f = el.closest('.frame');
      if (f && this.opaqueAt(f, x, y)) return { i: +f.dataset.i, part: 'img' };
    }
    return null;
  }

  opaqueAt(frame, x, y) {
    const e = this.view.els[+frame.dataset.i], layer = frame.classList.contains('front') ? 'front' : 'back';
    const url = e.urls && e.urls[layer];
    if (!url) return false;
    const m = QP.masks[url];
    if (m === undefined) { QP.masks[url] = null; host.mask(url).then(v => { QP.masks[url] = v ? decodeMask(v) : false; }); return true; }
    if (!m) return true;                 // no mask available: whole box counts
    const r = frame.getBoundingClientRect();
    const mx = Math.floor((x - r.left) / r.width * m.w), my = Math.floor((y - r.top) / r.height * m.h);
    if (mx < 0 || my < 0 || mx >= m.w || my >= m.h) return false;
    return m.a[my * m.w + mx] > 40;
  }

  // Ctrl + mouse wheel over a character: zoom the whole strip, saved shortly after
  bindWheel() {
    document.addEventListener('wheel', e => {
      if (!e.ctrlKey || !this.hitAt(e.clientX, e.clientY)) return;
      e.preventDefault();
      this.setZoom(QP.zoom(this.cfg) + (e.deltaY < 0 ? 0.05 : -0.05));
    }, { passive: false });
  }

  setZoom(z) {
    this.cfg.rail.zoom = Math.round(Math.min(3, Math.max(0.3, z)) * 100) / 100;
    this.relayout();
    if (QP.editing) this.editor.render();
    else { clearTimeout(this.zoomSave); this.zoomSave = setTimeout(() => host.save(this.cfg, {}), 500); }
    this.view.say(0, QP.t('zoom', { n: Math.round(this.cfg.rail.zoom * 100) }), 1.5);
  }

  bindPointer() {
    let over = false, down = null;
    document.addEventListener('mousemove', e => {
      const hit = !!this.hitAt(e.clientX, e.clientY);
      if (hit !== over) { over = hit; host.hit(hit); }
    });
    document.addEventListener('mouseleave', () => { over = false; host.hit(false); });
    document.addEventListener('contextmenu', e => { e.preventDefault(); host.menu(); });

    document.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const h = this.hitAt(e.clientX, e.clientY);
      if (h && h.part === 'panel') return;
      if (!h && !QP.editing) return;
      const i = h ? h.i : this.editor.sel.i;
      const part = h ? h.part : 'all';
      down = { x: e.screenX, y: e.screenY, i, part, moved: false, dragging: false };
      if (QP.editing) this.editor.select(i, part);
      e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
    });
    document.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.screenX - down.x, dy = e.screenY - down.y;
      if (!down.moved && Math.hypot(dx, dy) < 4) return;
      down.moved = true;
      if (QP.editing) { this.editor.dragBy(dx, dy); down.x = e.screenX; down.y = e.screenY; }
      else if (!down.dragging && !this.cfg.rail.locked) { down.dragging = true; document.body.classList.add('dragging'); host.dragStart(); }
    });
    document.addEventListener('pointerup', () => {
      if (!down) return;
      if (down.dragging) { host.dragEnd(); document.body.classList.remove('dragging'); }
      else if (!down.moved && !QP.editing && down.i != null) this.react(down.i);
      down = null;
    });
  }
}

QP.masks = {};
function decodeMask(v) {
  const bin = atob(v.alpha), a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return { w: v.w, h: v.h, a };
}

QP.zoom = cfg => (cfg.rail && cfg.rail.zoom) || 1;

window.addEventListener('DOMContentLoaded', () => { QP.app = new App(); QP.app.boot(); });
