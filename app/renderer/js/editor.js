// Adjust mode: pick a part (character image, sign text box, ledge, whole rail),
// nudge it 1px with the arrow keys (Shift = 10px) or drag it, then save or lock.
window.QP = window.QP || {};

QP.Editor = class {
  constructor(app) {
    this.app = app;
    this.sel = { i: 0, part: 'img' };
    this.panel = document.getElementById('panel');
    this.onKey = this.onKey.bind(this);
  }

  get cfg() { return this.app.cfg; }
  get ch() { return this.cfg.chars[this.sel.i]; }

  start() {
    QP.editing = true;
    document.body.classList.add('editing');
    document.addEventListener('keydown', this.onKey);
    this.app.forcePose = {};
    this.render();
  }

  stop() {
    QP.editing = false;
    document.body.classList.remove('editing');
    document.removeEventListener('keydown', this.onKey);
    this.app.forcePose = {};
    this.panel.innerHTML = '';
  }

  select(i, part) { this.sel = { i: +i, part }; this.render(); }

  // the object a move/resize writes into
  target() {
    const r = this.cfg.rail;
    switch (this.sel.part) {
      case 'img': return this.ch.offset;
      case 'text': {
        const pose = this.currentPose();
        const p = this.ch.poses[pose.key];
        return p && p.textBox ? p.textBox : this.ch.textBox;
      }
      case 'ledge': return r.ledge;
      default: return r;
    }
  }

  currentPose() { return QP.resolvePose(this.ch, this.app.poseOf(this.sel.i)); }

  move(dx, dy) {
    const t = this.target();
    switch (this.sel.part) {
      case 'img': t.x = round2(t.x + dx); t.y = round2(t.y + dy); break;
      case 'text': t.x = round2(t.x + dx); t.y = round2(t.y + dy); break;
      case 'ledge': t.y = round2(t.y + dy); t.overhang = round2((t.overhang || 0) + dx); break;
      case 'all': t.shiftY = (t.shiftY || 0) + dy; t.gap = (t.gap || 0) + dx; break;
    }
    this.changed();
  }

  resize(dw, dh) {
    const t = this.target();
    if (this.sel.part === 'text') { t.w = Math.max(10, t.w + dw); t.h = Math.max(10, t.h + dh); }
    else if (this.sel.part === 'ledge') { t.height = Math.max(2, t.height - dh); }
    else if (this.sel.part === 'img') { this.ch.scale = round2((this.ch.scale || 1) - dh * 0.01 + dw * 0.01); }
    else { this.cfg.rail.zoom = round2(Math.min(3, Math.max(0.3, QP.zoom(this.cfg) - dh * 0.01))); }
    this.changed();
  }

  font(d) { if (this.sel.part === 'text') { const t = this.target(); t.fontSize = Math.max(6, (t.fontSize || 20) + d); this.changed(); } }
  rotate(d) { if (this.sel.part === 'text') { const t = this.target(); t.rotate = round2((t.rotate || 0) + d); this.changed(); } }

  toggleOwnTextBox() {
    const pose = this.currentPose(), p = this.ch.poses[pose.key];
    if (!p) return;
    if (p.textBox) delete p.textBox; else p.textBox = Object.assign({}, this.ch.textBox);
    this.changed();
  }

  cyclePose(d) {
    const keys = Object.keys(this.ch.poses || {});
    const cur = keys.indexOf(this.currentPose().key);
    this.app.forcePose[this.sel.i] = keys[(cur + d + keys.length) % keys.length];
    this.changed();
  }

  changed() { this.app.relayout(); this.render(); }

  onKey(e) {
    const step = e.shiftKey ? 10 : 1;
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 's') { e.preventDefault(); this.app.save(false); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[k]) {
      e.preventDefault();
      const [x, y] = arrows[k];
      if (e.altKey) this.resize(x * step, y * step); else this.move(x * step, y * step);
      return;
    }
    if (k === 'Tab') { e.preventDefault(); this.nextPart(e.shiftKey ? -1 : 1); return; }
    if (k === '+' || k === '=') this.font(1);
    else if (k === '-' || k === '_') this.font(-1);
    else if (k === '[') this.rotate(-step * 0.5);
    else if (k === ']') this.rotate(step * 0.5);
    else if (k.toLowerCase() === 'p') this.cyclePose(e.shiftKey ? -1 : 1);
    else if (k === 'Enter') this.app.save(true);
    else if (k === 'Escape') this.app.cancelEdit();
  }

  nextPart(d) {
    const list = [];
    this.cfg.chars.forEach((_, i) => { list.push([i, 'img'], [i, 'text']); });
    list.push([0, 'ledge'], [0, 'all']);
    let at = list.findIndex(([i, p]) => (p === 'ledge' || p === 'all' ? p === this.sel.part : i === this.sel.i && p === this.sel.part));
    const [i, p] = list[(at + d + list.length) % list.length];
    this.select(i, p);
  }

  // mouse drag inside adjust mode; screen px are converted to the part's own units
  dragBy(dx, dy) {
    const z = QP.zoom(this.cfg), sl = this.app.view.lay.slots[this.sel.i];
    if (this.sel.part === 'text') this.move(dx / sl.s, dy / sl.s);
    else if (this.sel.part === 'ledge') this.move(dx / (this.cfg.rail.scale * z), dy / (this.cfg.rail.scale * z));
    else this.move(dx / z, dy / z);
  }

  render() {
    const names = { img: '角色圖片位置', text: '牌子文字框', ledge: '欄位', all: '整排' };
    const t = this.target(), part = this.sel.part, pose = this.currentPose();
    const v = n => (n == null ? '—' : Math.round(n * 100) / 100);
    let vals;
    if (part === 'img') vals = `x ${v(t.x)}　y ${v(t.y)}　大小 ${v(this.ch.scale || 1)}`;
    else if (part === 'text') vals = `x ${v(t.x)}　y ${v(t.y)}　寬 ${v(t.w)}　高 ${v(t.h)}　字 ${v(t.fontSize)}　轉 ${v(t.rotate || 0)}°`;
    else if (part === 'ledge') vals = `y ${v(t.y)}　厚 ${v(t.height)}　左右多出 ${v(t.overhang)}`;
    else vals = `整排上下 ${v(t.shiftY || 0)}　間距 ${v(t.gap)}　大小 ${Math.round(QP.zoom(this.cfg) * 100)}%`;
    const who = part === 'ledge' || part === 'all' ? '' : `${this.ch.name}・`;
    const keys = {
      img: '方向鍵 移動（Shift ×10）　Alt+↑↓ 大小',
      text: '方向鍵 移動　Alt+方向鍵 寬高　+ − 字級　[ ] 旋轉',
      ledge: '↑↓ 上下　←→ 左右多出　Alt+↑↓ 厚度',
      all: '↑↓ 整排上下（負數＝頭伸出螢幕外）　←→ 間距　Alt+↑↓ 等比大小（1%，Shift 10%）',
    }[part];
    this.panel.innerHTML = `
      <div class="p-head"><b>${who}${names[part]}</b><span>${vals}</span></div>
      <div class="p-keys">${keys}　Tab 換下一個　P 換姿勢</div>
      <div class="p-row">
        <span>姿勢：${pose.key}${part === 'text' ? (pose.ownTextBox ? '（此姿勢專用文字框）' : '（共用文字框）') : ''}</span>
        <button data-a="pose-1">◀</button><button data-a="pose1">▶</button>
        ${part === 'text' ? '<button data-a="own">切換專用／共用</button>' : ''}
      </div>
      <div class="p-row">
        <button data-a="save">存檔 Ctrl+S</button>
        <button data-a="lock" class="primary">鎖定 Enter</button>
        <button data-a="cancel">放棄 Esc</button>
      </div>`;
    this.panel.querySelectorAll('button').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'pose-1') this.cyclePose(-1);
      else if (a === 'pose1') this.cyclePose(1);
      else if (a === 'own') this.toggleOwnTextBox();
      else if (a === 'save') this.app.save(false);
      else if (a === 'lock') this.app.save(true);
      else if (a === 'cancel') this.app.cancelEdit();
    });
    document.querySelectorAll('.sel').forEach(n => n.classList.remove('sel'));
    const e = this.app.view.els[this.sel.i];
    if (part === 'img') { e.back.classList.add('sel'); e.front.classList.add('sel'); }
    else if (part === 'text') e.tb.classList.add('sel');
    else if (part === 'ledge') this.app.view.ledge.classList.add('sel');
    else document.getElementById('rail').classList.add('sel');
  }
};

function round2(n) { return Math.round(n * 100) / 100; }
