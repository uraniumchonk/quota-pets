// Builds the rail (characters side by side, leaning on one ledge) and repaints it.
// Layers per character, bottom to top: back frame (pose.img), ledge, front frame
// (pose.front + sign text). Frames are drawn in image pixels and scaled by
// rail.scale * character.scale, so textBox numbers stay valid when the size changes.
window.QP = window.QP || {};

const BUBBLE_SPACE = 64;
const SEV_COLOR = { normal: 'var(--ok)', warning: 'var(--warn)', critical: 'var(--crit)' };

// Ledge numbers are stored in image pixels (like textBox) and scaled with the rail.
QP.ledgePx = function (r) {
  const L = r.ledge || {}, k = r.scale || 1;
  return { show: !!L.show, img: L.img, color: L.color, edge: L.edge, y: (L.y || 0) * k, height: (L.height || 0) * k, overhang: (L.overhang || 0) * k };
};

QP.layout = function (cfg) {
  const r = cfg.rail;
  const L = QP.ledgePx(r);
  const pad = Math.max(0, L.show ? L.overhang : 0) + 4;
  let x = pad, bottom = 0;
  const slots = cfg.chars.map(ch => {
    const s = r.scale * (ch.scale || 1);
    const w = ch.size.w * s, h = ch.size.h * s;
    const slot = { x, w, h, s, left: x + (ch.offset.x || 0), top: (ch.offset.y || 0) + (r.shiftY || 0) };
    bottom = Math.max(bottom, slot.top + h);
    x += w + (r.gap || 0);
    return slot;
  });
  const contentW = x - (r.gap || 0) + pad;
  if (L.show) bottom = Math.max(bottom, L.y + (r.shiftY || 0) + L.height);
  return { slots, pad, width: Math.ceil(contentW), height: Math.ceil(Math.max(bottom, 1) + BUBBLE_SPACE), bubbleTop: Math.ceil(bottom) + 4 };
};

QP.View = class {
  constructor(root) { this.root = root; this.els = []; }

  build(cfg) {
    this.cfg = cfg;
    this.lay = QP.layout(cfg);
    const r = cfg.rail;
    this.root.innerHTML = '';
    this.root.style.width = this.lay.width + 'px';
    this.root.style.height = this.lay.height + 'px';

    this.ledge = document.createElement('div');
    this.ledge.className = 'ledge hit';
    this.ledge.dataset.part = 'ledge';
    this.root.appendChild(this.ledge);
    this.placeLedge();

    this.els = cfg.chars.map((ch, i) => {
      const back = frame('back'), front = frame('front');
      back.dataset.i = front.dataset.i = i;
      const tb = document.createElement('div');
      tb.className = 'tb'; tb.dataset.i = i; tb.dataset.part = 'text';
      const inner = document.createElement('div'); inner.className = 'tb-in';
      tb.appendChild(inner); front.appendChild(tb);
      const bubble = document.createElement('div'); bubble.className = 'bubble';
      this.root.append(back, front, bubble);
      return { back, front, tb, inner, bubble, media: {}, html: '' };
    });
    this.placeAll();
  }

  placeLedge() {
    const r = this.cfg.rail, L = QP.ledgePx(r);
    const s = this.ledge.style;
    this.ledge.hidden = !L.show;
    s.left = (this.lay.pad - L.overhang) + 'px';
    s.width = (this.lay.width - 2 * this.lay.pad + 2 * L.overhang) + 'px';
    s.top = (L.y + (r.shiftY || 0)) + 'px';
    s.height = L.height + 'px';
    s.background = L.img ? `url("${L.img}") center/100% 100%` : L.color;
    s.borderColor = L.img ? 'transparent' : L.edge;
  }

  placeAll() {
    this.lay = QP.layout(this.cfg);
    this.root.style.width = this.lay.width + 'px';
    this.root.style.height = this.lay.height + 'px';
    this.placeLedge();
    this.cfg.chars.forEach((ch, i) => {
      const sl = this.lay.slots[i], e = this.els[i];
      for (const f of [e.back, e.front]) {
        f.style.width = ch.size.w + 'px'; f.style.height = ch.size.h + 'px';
        f.style.transform = `translate(${sl.left}px, ${sl.top}px) scale(${sl.s})`;
      }
      e.bubble.style.left = (sl.x + sl.w / 2) + 'px';
      e.bubble.style.top = this.lay.bubbleTop + 'px';
    });
  }

  // pose: from QP.resolvePose; ctx: from QP.buildContext
  paint(i, pose, ctx) {
    const ch = this.cfg.chars[i], e = this.els[i];
    setMedia(e, 'back', ch.base, pose.img, this.cfg.version);
    setMedia(e, 'front', ch.base, pose.front, this.cfg.version);
    e.back.dataset.anim = e.front.dataset.anim = pose.anim;

    const t = pose.textBox, st = e.tb.style;
    st.left = t.x + 'px'; st.top = t.y + 'px'; st.width = t.w + 'px'; st.height = t.h + 'px';
    st.transform = `rotate(${t.rotate || 0}deg)`;
    st.color = t.color || '';
    st.fontSize = (t.fontSize || 20) + 'px';
    if (t.font) st.fontFamily = t.font;

    const html = pose.text ? `<div class="tb-msg">${esc(pose.text)}</div>` : pose.showQuota ? signHtml(ch, ctx, this.cfg.display) : '';
    e.tb.hidden = !html && !QP.editing;
    if (html !== e.html) { e.inner.innerHTML = html; e.html = html; fit(e); }
    else if (e.fitFor !== `${t.w}x${t.h}x${t.fontSize}`) fit(e);
    e.fitFor = `${t.w}x${t.h}x${t.fontSize}`;
  }

  say(i, text, sec) {
    const b = this.els[i].bubble;
    b.textContent = text; b.classList.add('show');
    clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), (sec || 5) * 1000);
  }
};

function frame(kind) {
  const f = document.createElement('div');
  f.className = 'frame hit ' + kind;
  f.dataset.part = 'img';
  return f;
}

function setMedia(e, layer, base, file, ver) {
  const host = e[layer];
  if (e.media[layer] === file) return;
  e.media[layer] = file;
  host.querySelectorAll('.media').forEach(n => n.remove());
  if (e.urls) e.urls[layer] = null;
  if (!file) return;
  const url = base + file + '?v=' + ver;
  (e.urls = e.urls || {})[layer] = url;
  const el = /\.(webm|mp4)$/i.test(file) ? Object.assign(document.createElement('video'), { autoplay: true, loop: true, muted: true, playsInline: true }) : document.createElement('img');
  el.className = 'media'; el.src = url; el.draggable = false;
  host.prepend(el);
}

// display "used" (default): number and bar show the used share; "left": the remaining share
function signHtml(ch, ctx, display) {
  if (!ctx.rows.length) {
    const st = QP.STATE_LABEL[ctx.agentState] || ctx.agentState;
    return `<div class="tb-msg"><b>${esc(st)}</b>${ctx.agentDoing ? `<small>${esc(ctx.agentDoing.slice(0, 22))}</small>` : ''}</div>`;
  }
  const showLeft = display === 'left';
  const rows = ctx.rows.map(r => {
    const v = r.used == null ? null : showLeft ? r.left : Math.min(100, Math.round(r.used));
    return `<div class="row"><b>${esc(r.label)}</b><span class="bar"><i style="width:${v ?? 0}%;background:${SEV_COLOR[r.severity]}"></i></span><em>${v == null ? '—' : v + '%'}</em></div>`;
  }).join('');
  let foot = '';
  if (ch.footer === 'reset' && ctx.worstRow && ctx.worstRow.resetsAt) {
    foot = `<div class="foot">${esc(ctx.worstRow.label)} ${QP.fmtLeft(ctx.worstRow.resetsAt - ctx.now)}後重置</div>`;
  }
  if (ctx.source === 'offline') foot = '<div class="foot">離線，顯示上次的數字</div>';
  return rows + foot;
}

// Shrink the sign text until it fits its box.
function fit(e) {
  const box = e.tb, inner = e.inner;
  inner.style.transform = '';
  const h = box.clientHeight, w = box.clientWidth;
  const k = Math.min(1, h / Math.max(1, inner.scrollHeight), w / Math.max(1, inner.scrollWidth));
  if (k < 1) inner.style.transform = `scale(${k})`;
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
