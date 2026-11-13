/* ======================================================================
 * home-twin-alarm-card / home-twin-alarm-popup – Alarmanlage fürs Flur-Tablet
 * Version 1.2.0 (2026-11-07) – Entität home_security_system, Reiter Automatik (BLE/Schloss/nur wenn zu), Schließen erlaubt je Modus
 * Version 1.1.0 (2026-10-30) – Bausteine für raum-panel (Brücke rp-extcard, teil:)
 *
 * Backend: Integration alarm_system → alarm_control_panel.home_security_system
 *   (WebSocket alarm_system/config|arm|disarm|verify|save|history|test_channel).
 *
 * custom:home-twin-alarm-card  = Kachel: Zustand groß und farbig, Countdown bei Ausgangsverzögerung.
 *   Tippen → Popup (Browser Mod, sonst eigenes Fenster). Bei Eingangsverzögerung / Auslösung
 *   Vollbild rot mit Countdown und PIN-Tastatur (über document.body, damit kein Rahmen-Transform stört).
 * custom:home-twin-alarm-popup = Inhalt des Popups: PIN-Tastatur, Moduswahl, offene Fenster/Türen
 *   vor dem Scharfschalten („Trotzdem scharf“ / „Abbrechen“), Verlauf, Verwaltung
 *   (Modi + Verzögerungen, Sensoren je Modus, Personen + PINs, Benachrichtigungskanäle).
 *
 * Optik wie raum-panel v2 (Glasplatte, Tasten .hk, LCD). Name HOME-TWIN-* → raum-panel.js schaltet die
 * Charlie-Schrift automatisch ein.
 *
 * Optionen Kachel:
 *   entity: alarm_control_panel.home_security_system
 *   titel: Alarmanlage           ("" = ohne Überschrift)
 *   hintergrund: true            (false = ohne eigene Glasplatte, z. B. im raum-panel-Rahmen)
 *   vollbild: true               (rotes Vollbild bei Eingangsverzögerung/Auslösung)
 *   ton: true                    (Piepen in der Eingangsverzögerung, Sirenenton bei Auslösung – nur dieses Gerät)
 *   popup: browser_mod | eigen   (eigen = eigenes Fenster ohne Browser Mod)
 *   quelle: Flur-Tablet          (steht im Verlauf; Standard = Browser-Mod-ID)
 *   teil: <baustein>             (nur ein Baustein, randlos und füllend – setzt raum-panel bei layout: custom)
 *     Bausteine: titel, display (Symbol + Zustand + Info im LCD), symbol, zustand, info, offen (offene bzw. übersprungene Melder)
 *     Vollbild/Ton laufen trotzdem nur einmal je Seite; Antippen jedes Bausteins öffnet die Bedienung.
 * Optionen Popup: entity, ton, quelle, schliessen (nach Scharf/Unscharf Browser-Mod-Popup schließen)
 * ====================================================================== */
(() => {
const VERSION = '1.2.1';
const ENT = 'alarm_control_panel.home_security_system';

const C = { ok: '#3ddc84', warn: '#ff9f2e', bad: '#ff4d4d', info: '#4da3ff', home: '#b48cff', away: '#ff7a45', vac: '#4da3ff', off: '#5c6068' };
const MODES = ['armed_away', 'armed_home', 'armed_vacation'];
const MODE = {
  armed_away: ['Abwesend', C.away, 'mdi:shield-lock', 'Alle Melder'],
  armed_home: ['Zuhause / Nacht', C.home, 'mdi:shield-home', 'Außenhaut'],
  armed_vacation: ['Urlaub', C.vac, 'mdi:shield-airplane', 'Alle Melder'],
};
const ST = {
  disarmed: ['Unscharf', C.ok, 'mdi:shield-off-outline'],
  arming: ['Wird scharf', C.warn, 'mdi:shield-sync'],
  pending: ['Eingangsverzögerung', C.bad, 'mdi:shield-alert'],
  triggered: ['ALARM', C.bad, 'mdi:alarm-light'],
  armed_away: ['Scharf · Abwesend', C.away, 'mdi:shield-lock'],
  armed_home: ['Scharf · Zuhause/Nacht', C.home, 'mdi:shield-home'],
  armed_vacation: ['Scharf · Urlaub', C.vac, 'mdi:shield-airplane'],
  unavailable: ['Nicht erreichbar', C.off, 'mdi:shield-off'],
};
const EV = {
  armed: ['Scharf', C.away], arming: ['Ausgangsverzögerung', C.warn], disarmed: ['Unscharf', C.ok],
  pending: ['Eingangsverzögerung', C.bad], triggered: ['AUSLÖSUNG', C.bad], bypass: ['Trotzdem scharf', C.warn],
  wrong_pin: ['Falsche PIN', C.warn], locked: ['Eingabe gesperrt', C.bad], rearmed: ['Wieder scharf', C.away],
  reset: ['Alarm beendet', C.ok], restart: ['Neustart', C.info], settings: ['Einstellungen', C.info],
  channel_error: ['Kanal-Fehler', C.warn], resumed: ['Wieder überwacht', C.info],
  auto_blocked: ['Automatik blockiert', C.bad], auto_skip: ['Automatik übersprungen', C.warn],
};
const CH = {
  tablet: ['Tablets (Vollbild)', 'mdi:tablet'], push: ['Push aufs Handy', 'mdi:cellphone-message'], siren: ['Sirenen', 'mdi:bullhorn'],
  email: ['E-Mail', 'mdi:email-outline'], sms: ['SMS', 'mdi:message-text-outline'], phone: ['Telefonanruf', 'mdi:phone-ring'],
  imessage: ['iMessage', 'mdi:message-processing-outline'], rest: ['REST-API', 'mdi:api'],
};
const CH_EV = [['pending', 'Eingang'], ['triggered', 'Alarm'], ['armed', 'Scharf'], ['disarmed', 'Unscharf'], ['wrong_pin', 'Falsche PIN']];
const KIND_IC = { door: 'mdi:door', window: 'mdi:window-closed-variant', opening: 'mdi:door', garage_door: 'mdi:garage', motion: 'mdi:motion-sensor',
  occupancy: 'mdi:motion-sensor', presence: 'mdi:account-search', smoke: 'mdi:smoke-detector', gas: 'mdi:gas-cylinder', carbon_monoxide: 'mdi:molecule-co',
  moisture: 'mdi:water-alert', tamper: 'mdi:shield-alert-outline', vibration: 'mdi:vibrate', sound: 'mdi:microphone', contact: 'mdi:door' };

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const left = iso => iso ? Math.max(0, (new Date(iso) - Date.now()) / 1000) : null;
const cd = s => s == null ? '' : s < 100 ? String(Math.ceil(s)) : `${Math.floor(Math.ceil(s) / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`;
const hm = iso => { const d = new Date(iso); return d.toTimeString().slice(0, 5); };
const dts = iso => {
  const d = new Date(iso), n = new Date(), same = d.toDateString() === n.toDateString();
  const y = new Date(n - 864e5).toDateString() === d.toDateString();
  return (same ? 'heute' : y ? 'gestern' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`) + ' ' + d.toTimeString().slice(0, 8);
};
const secTxt = s => s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min` : `${s} s`;
const bmId = () => { try { return localStorage.getItem('browser_mod-browser-id'); } catch (e) { return null; } };
const quelle = c => c.quelle || bmId() || 'Tablet';
const stOf = (hass, eid) => hass && hass.states[eid || ENT];
const errTxt = e => (e && (e.message || e.error)) || String(e);

// ---------------------------------------------------------------- Ton (ein Gerät spielt nur einmal, egal wie viele Karten)
const SND = {
  ctx: null, mode: null, t: 0,
  set(mode) {
    if (mode === this.mode) return;
    this.mode = mode; clearInterval(this.t); this.t = 0;
    if (!mode) return;
    try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume && this.ctx.resume(); } catch (e) { return; }
    const beep = (f, d, v = .25) => {
      try {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
        o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
        o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + d);
      } catch (e) { /* ohne Ton */ }
    };
    if (mode === 'pending') { beep(1760, .12); this.t = setInterval(() => beep(1760, .12), 1000); }
    else { let hi = false; const s = () => { hi = !hi; beep(hi ? 960 : 640, .42, .35); }; s(); this.t = setInterval(s, 450); }
  },
};
const sndSync = (st, on) => SND.set(on && st && (st.state === 'pending' || st.state === 'triggered') ? st.state : null);

// ---------------------------------------------------------------- Gemeinsames CSS (aus raum-panel v2 übernommen)
const BASE_CSS = `
:host{display:block;color:#e2e4e8;font-family:Rajdhani,'Segoe UI',sans-serif;-webkit-tap-highlight-color:transparent;user-select:none}
*{box-sizing:border-box}
.plate{position:relative;border-radius:20px;overflow:hidden;background:linear-gradient(180deg,rgba(50,52,58,.78),rgba(24,25,29,.88));
  border:1px solid rgba(255,255,255,.07);box-shadow:0 0 0 1px #000,inset 0 1px 0 rgba(255,255,255,.14),inset 0 -1px 0 rgba(0,0,0,.6),0 20px 36px rgba(0,0,0,.55)}
.lcd{border-radius:11px;padding:9px 12px;background:linear-gradient(180deg,rgba(17,14,10,var(--lcda,1)),rgba(6,5,4,var(--lcda,1)));box-shadow:inset 0 4px 10px rgba(0,0,0,var(--lcda,1)),0 1px 0 rgba(255,255,255,calc(.08 * var(--lcda,1)));font-family:'Share Tech Mono',monospace;position:relative;overflow:hidden}
.lcd::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px),linear-gradient(160deg,rgba(255,255,255,.08),rgba(255,255,255,0) 40%);pointer-events:none}
.hk{height:40px;border-radius:9px;display:flex;align-items:center;justify-content:center;gap:7px;font-size:13.5px;letter-spacing:1.8px;font-weight:700;text-transform:uppercase;color:#9a9ea6;
  background:linear-gradient(180deg,#34363b,#222327);box-shadow:0 4px 0 #0b0b0c,0 6px 10px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.1);cursor:pointer;padding:0 12px;white-space:nowrap}
.hk i{width:14px;height:4px;border-radius:2px;background:#3a3c41;box-shadow:inset 0 1px 2px #000;flex:none}
.hk.on{transform:translateY(3px);color:#f0f1f3;box-shadow:0 1px 0 #0b0b0c,0 3px 6px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.1)}
.hk.on i{background:var(--c);box-shadow:0 0 10px var(--c)}
.hk:active{transform:translateY(4px)}
.hk.dis{opacity:.4;pointer-events:none}
.hk.sm{height:28px;font-size:11px;letter-spacing:1.3px;border-radius:7px;padding:0 9px;gap:6px;box-shadow:0 3px 0 #0b0b0c,0 5px 8px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.1)}
.hk.sm.on{transform:translateY(2px);box-shadow:0 1px 0 #0b0b0c,0 3px 5px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.1)}
.hk.sm i{width:10px;height:3px}
.hk ha-icon{--mdc-icon-size:18px}
.seg{display:flex;gap:5px;padding:3px;border-radius:10px;background:rgba(0,0,0,.35);box-shadow:inset 0 2px 5px rgba(0,0,0,.6)}
.seg .hk{flex:1;height:32px;font-size:11.5px;letter-spacing:1.4px}
.lbl{font-size:10.5px;letter-spacing:1.8px;color:#9a9fa8;font-weight:700;text-transform:uppercase}
.msg{min-height:20px;font-size:13px;letter-spacing:.5px;color:#9a9ea6}
.msg.bad{color:${C.bad}}.msg.ok{color:${C.ok}}
`;

// ---------------------------------------------------------------- Kachel
class AlarmTile extends HTMLElement {
  // Bausteine für raum-panel („✥ Anordnen“, layout: custom unter type: card) – siehe RPExtCard in raum-panel.js
  static get rpTeile() {
    return { titel: { h: 18 }, display: { h: 96 }, symbol: { h: 70 }, zustand: { h: 40 }, info: { h: 22 }, offen: { h: 66 } };
  }
  static get rpDesign() { return { breite: 360, hoehe: 200 }; }
  static get rpStart() {
    return { grid: { columns: 12, row_height: 20, gap: 6, width: 360 },
      elements: { titel: { col: 1, row: 1, w: 12, h: 1 }, display: { col: 1, row: 2, w: 12, h: 4 }, offen: { col: 1, row: 6, w: 12, h: 3 } } };
  }
  setConfig(c) {
    this._c = { entity: ENT, titel: 'Alarmanlage', hintergrund: true, vollbild: true, ton: true, popup: 'browser_mod', ...(c || {}) };
    this._c.teil = c && c.teil ? String(c.teil) : null;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.addEventListener('click', () => this._open());
    }
    this._key = null;
  }
  static getStubConfig() { return { entity: ENT }; }
  getCardSize() { return 3; }
  getGridOptions() { return { columns: 6, rows: 3, min_rows: 2 }; }
  connectedCallback() { this._tick = setInterval(() => this._cd(), 250); }
  disconnectedCallback() { clearInterval(this._tick); this._fs(false); }
  set hass(h) {
    this._hass = h;
    const st = stOf(h, this._c.entity);
    if (this._c.ton) sndSync(st, true);
    const key = st ? st.state + '|' + st.last_updated : 'x';
    if (this._fsEl) this._fsEl.firstChild.hass = h;
    // bei jedem Update: übernimmt das Vollbild, falls die bisherige Instanz (z. B. ein Baustein) entfernt wurde
    this._fs(this._c.vollbild && st && (st.state === 'pending' || st.state === 'triggered'));
    if (key === this._key) return;
    this._key = key; this._render(st);
  }
  // Liste offener Melder (unscharf: für Abwesend; scharf: übersprungene)
  _offen(st, a) {
    const s = st ? st.state : '', armed = s && s !== 'disarmed';
    const ids = armed ? (a.bypassed || []) : ((a.open_sensors || {}).armed_away || []);
    const nm = e => { const x = this._hass && this._hass.states[e]; return (x && x.attributes.friendly_name) || e; };
    const off = e => { const x = this._hass && this._hass.states[e]; return !x || x.state === 'unavailable' || x.state === 'unknown'; };
    if (!ids.length) return `<div class="ol none">${armed ? 'nichts übersprungen' : 'alles zu'}</div>`;
    return `<div class="ol"><div class="olh">${armed ? 'Übersprungen' : 'Offen'} · ${ids.length}</div>${ids.map(e => `<div class="oli"><ha-icon icon="${off(e) ? 'mdi:lan-disconnect' : /window|fenster/i.test(e) ? 'mdi:window-open-variant' : /pzm|motion|presence/i.test(e) ? 'mdi:motion-sensor' : 'mdi:door-open'}"></ha-icon><span>${esc(nm(e))}</span>${off(e) ? '<em>n. e.</em>' : ''}</div>`).join('')}</div>`;
  }
  _render(st) {
    const s = st ? st.state : 'unavailable', a = (st && st.attributes) || {}, [name, col, ic] = ST[s] || ST.unavailable;
    let sub = '';
    if (s === 'disarmed') {
      const n = ((a.open_sensors || {}).armed_away || []).length;
      sub = n ? `<span style="color:${C.warn}">${n} offen</span>` : 'alles zu';
      if (a.changed_by && st.last_changed) sub += ` · ${esc(a.changed_by)} ${hm(st.last_changed)}`;
    } else if (s === 'arming') sub = `scharf in <b id="cd"></b> s · ${esc((MODE[a.mode] || [''])[0])}`;
    else if (s === 'pending') sub = `${esc(a.triggered_by_name || '')} · Alarm in <b id="cd"></b> s`;
    else if (s === 'triggered') sub = esc(a.triggered_by_name || 'manuell');
    else if (MODES.includes(s)) sub = `scharf seit ${hm(st.last_changed)}${a.changed_by ? ' · ' + esc(a.changed_by) : ''}${(a.bypassed || []).length ? ` · <span style="color:${C.warn}">${a.bypassed.length} übersprungen</span>` : ''}`;
    const big = MODES.includes(s) ? MODE[s][0] : name;
    const t = this._c.titel, T = this._c.teil, blink = s === 'arming' || s === 'pending' || s === 'triggered';
    const P = {
      titel: `<div class="t"><span class="lbl">${esc(t || 'Alarmanlage')}</span><span class="led ${blink ? 'blink' : ''}"></span></div>`,
      symbol: `<ha-icon class="ic ${s === 'triggered' ? 'blink' : ''}" icon="${ic}"></ha-icon>`,
      zustand: `<div class="st">${esc(big)}</div>`,
      info: `<div class="sub">${sub}</div>`,
    };
    P.display = `<div class="lcd">${P.symbol}<div class="tx">${P.zustand}${P.info}</div></div>`;
    P.offen = this._offen(st, a);
    const inner = T ? (P[T] || '') : `${t ? P.titel : ''}${P.display}`;
    this.shadowRoot.innerHTML = `<style>${BASE_CSS}
      :host{height:100%}
      .ol{display:flex;flex-direction:column;gap:3px;min-height:0;overflow:hidden;font-size:13px;color:#c9ccd2}
      .ol.none{color:#9a9fa8;font-size:13px;letter-spacing:.5px}
      .olh{font-size:10.5px;letter-spacing:1.6px;color:${C.warn};font-weight:700;text-transform:uppercase}
      .oli{display:flex;align-items:center;gap:7px;white-space:nowrap}.oli span{overflow:hidden;text-overflow:ellipsis}
      .oli ha-icon{--mdc-icon-size:16px;color:${C.warn};flex:none}.oli em{font-style:normal;color:#9a9fa8;font-size:11px}
      /* Baustein allein (teil:, raum-panel „frei anordnen“): keine Platte, füllt die Zelle, Größen nach Zelle */
      .w.teil{min-height:0;padding:0;gap:0;background:none;border:0;box-shadow:none;container-type:size;justify-content:center}
      .w.teil>.lcd{height:100%;padding:min(8cqh,12px) min(5cqw,18px);gap:min(5cqw,16px)}
      .w.teil.t-display .ic{--mdc-icon-size:min(62cqh,16cqw)}
      .w.teil.t-display .st{font-size:min(30cqh,9cqw)}.w.teil.t-display .sub{font-size:min(15cqh,4.4cqw)}
      .w.teil.t-symbol{align-items:center}.w.teil.t-symbol .ic{--mdc-icon-size:min(92cqh,92cqw)}
      .w.teil.t-zustand .st{font-size:min(80cqh,11cqw)}
      .w.teil.t-info .sub{font-size:min(70cqh,5cqw)}
      .w.teil.t-titel .lbl{font-size:min(70cqh,10.5px)}
      .w.teil.t-offen{justify-content:flex-start}
      .w{height:100%;min-height:120px;display:flex;flex-direction:column;gap:10px;padding:16px;cursor:pointer;container-type:inline-size}
      .w.nobg{background:none;border:0;box-shadow:none;padding:6px}
      .t{display:flex;align-items:center;gap:8px}.t .lbl{flex:1}
      .lcd{flex:1;display:flex;align-items:center;gap:16px;padding:12px 18px;min-height:0}
      .ic{--mdc-icon-size:clamp(34px,13cqw,58px);color:${col};filter:drop-shadow(0 0 10px ${col}88);flex:none}
      .tx{display:flex;flex-direction:column;gap:4px;min-width:0}
      .st{font-size:clamp(18px,8.5cqw,34px);line-height:1.05;color:${col};text-shadow:0 0 12px ${col}66;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sub{font-size:15px;color:#a7abb3;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sub b{color:${col};font-weight:400}
      .led{width:10px;height:10px;border-radius:50%;background:${col};box-shadow:0 0 10px ${col}}
      .blink{animation:bl 1s steps(1) infinite}@keyframes bl{50%{opacity:.25}}
    </style>
    <div class="w ${T ? 'teil t-' + T : this._c.hintergrund ? 'plate' : 'nobg'}">${inner}</div>`;
    this._cd();
    this._fs(this._c.vollbild && (s === 'pending' || s === 'triggered'));
  }
  _cd() {
    const st = stOf(this._hass, this._c && this._c.entity), el = this.shadowRoot && this.shadowRoot.getElementById('cd');
    if (el && st) el.textContent = cd(left(st.attributes.delay_end));
  }
  // Vollbild rot – nur eine Karte je Seite zeigt es
  _fs(on) {
    if (on && !this.isConnected) on = false;          // abgehängte Instanz (bekommt evtl. weiter hass) zeigt nie Vollbild
    if (on && !this._fsEl && !window.__htAlarmFs) {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;';
      const p = document.createElement('home-twin-alarm-popup');
      p.setConfig({ entity: this._c.entity, quelle: this._c.quelle, vollbild: true });
      p.hass = this._hass;
      d.appendChild(p); document.body.appendChild(d);
      this._fsEl = d; window.__htAlarmFs = this;
    } else if (!on && this._fsEl) {
      this._fsEl.remove(); this._fsEl = null;
      if (window.__htAlarmFs === this) window.__htAlarmFs = null;
    }
  }
  _open() {
    const content = { type: 'custom:home-twin-alarm-popup', entity: this._c.entity, quelle: quelle(this._c), schliessen: true };
    const bm = window.browser_mod;
    if (this._c.popup !== 'eigen' && bm && typeof bm.service === 'function') {
      try { bm.service('popup', { title: this._c.titel || 'Alarmanlage', content, size: 'wide', tag: 'alarm-bedienung' }); return; } catch (e) { /* eigenes Fenster */ }
    }
    if (this._own) return;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:2147482000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:2vh 2vw';
    const p = document.createElement('home-twin-alarm-popup');
    p.setConfig({ ...content, schliessen: false, eigen: true });
    p.hass = this._hass; p.style.cssText = 'width:min(1100px,96vw);max-height:96vh';
    p.addEventListener('ht-close', () => { d.remove(); this._own = null; clearInterval(this._ownT); });
    d.addEventListener('click', ev => { if (ev.target === d) p.dispatchEvent(new Event('ht-close')); });
    d.appendChild(p); document.body.appendChild(d); this._own = d;
    this._ownT = setInterval(() => { if (this._hass) p.hass = this._hass; }, 500);
  }
}

// ---------------------------------------------------------------- Popup
const KB_ROWS = [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'], ['#sh', 'y', 'x', 'c', 'v', 'b', 'n', 'm', '-', '#bs'], ['.', ':', '/', '_', '@', '?', '=', '&', '+', '#', '%']];
const ADM_TABS = [['modi', 'Modi & Zeiten'], ['sens', 'Sensoren'], ['auto', 'Automatik'], ['pers', 'Personen'], ['chan', 'Benachrichtigung']];

class AlarmPopup extends HTMLElement {
  setConfig(c) {
    this._c = { entity: ENT, ton: false, ...(c || {}) };
    this._v = 'main'; this._pin = ''; this._msg = ['', '']; this._open = null; this._adm = null; this._pk = null; this._kb = null; this._busy = false;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.addEventListener('click', ev => this._click(ev));
    }
    this._key = null;
  }
  static getStubConfig() { return { entity: ENT }; }
  getCardSize() { return 8; }
  connectedCallback() {
    this._tick = setInterval(() => this._cd(), 250);
    this._kd = ev => this._key2(ev); window.addEventListener('keydown', this._kd);
  }
  disconnectedCallback() { clearInterval(this._tick); window.removeEventListener('keydown', this._kd); if (this._c.ton) SND.set(null); }
  set hass(h) {
    this._hass = h;
    const st = stOf(h, this._c.entity);
    if (this._c.ton) sndSync(st, true);
    const key = st ? st.state + '|' + st.last_updated : 'x';
    if (key === this._key) return;
    const was = this._key && this._key.split('|')[0];
    this._key = key;
    if (st && was && was !== st.state && (st.state === 'pending' || st.state === 'triggered')) { this._v = 'main'; this._open = null; }
    if (this._v === 'admin') return;           // Verwaltung nicht unter dem Finger neu aufbauen
    this._render();
  }
  get _st() { return stOf(this._hass, this._c.entity); }
  _ws(msg) { return this._hass.callWS(/\/(config|history)$/.test(msg.type) ? msg : { source: quelle(this._c), ...msg }); }
  _say(t, k = '') { this._msg = [t, k]; const m = this.shadowRoot.getElementById('msg'); if (m) { m.className = 'msg ' + k; m.textContent = t; } }

  // -------------------------------------------------------------- Darstellung
  _render() {
    const st = this._st, s = st ? st.state : 'unavailable', alarm = s === 'pending' || s === 'triggered';
    let body;
    if (this._kb) body = this._kbHtml();
    else if (this._pk) body = this._pkHtml();
    else if (alarm) body = this._alarmHtml(st);
    else if (this._v === 'hist') body = this._histHtml();
    else if (this._v === 'admin') body = this._admHtml();
    else body = this._mainHtml(st);
    const vb = this._c.vollbild;
    this.shadowRoot.innerHTML = `<style>${BASE_CSS}${POP_CSS}</style>
      <div class="pw ${vb ? 'vb' : 'plate'} ${alarm && !this._kb && !this._pk ? 'red' : ''}">${body}</div>`;
    this._cd();
  }
  _tabs() {
    const t = (v, l) => `<div class="hk sm ${this._v === v ? 'on' : ''}" data-a="view:${v}" style="--c:${C.info}"><i></i>${l}</div>`;
    return `<div class="tabs">${t('main', 'Bedienung')}${t('hist', 'Verlauf')}${t('admin', 'Verwaltung')}
      ${this._c.eigen ? '<div class="hk sm" data-a="close">✕</div>' : ''}</div>`;
  }
  _head(st) {
    const s = st ? st.state : 'unavailable', a = (st && st.attributes) || {}, [name, col, ic] = ST[s] || ST.unavailable;
    let sub = '';
    if (s === 'arming') sub = `${esc((MODE[a.mode] || [''])[0])} in <b id="cd"></b> s`;
    else if (MODES.includes(s)) sub = `seit ${hm(st.last_changed)}${a.changed_by ? ' · ' + esc(a.changed_by) : ''}`;
    else if (s === 'disarmed') sub = a.changed_by ? `${esc(a.changed_by)} · ${hm(st.last_changed)}` : 'bereit';
    return `<div class="head lcd" style="--sc:${col}"><ha-icon icon="${ic}"></ha-icon>
      <div class="htx"><div class="hst">${esc(name)}</div><div class="hsub">${sub}</div></div></div>`;
  }
  _padHtml(okLabel, okCol) {
    const a = (this._st && this._st.attributes) || {}, lock = left(a.locked_until);
    const k = d => `<div class="hk pk" data-a="pin:${d}">${d}</div>`;
    return `<div class="pad">
      <div class="lcd pinv">${lock ? `<span class="lk">gesperrt <b id="lk">${Math.ceil(lock)}</b> s</span>`
        : this._pin ? '●'.repeat(this._pin.length) : '<span class="ph">PIN</span>'}</div>
      <div class="pkg">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k).join('')}
        <div class="hk pk" data-a="pin:#bs">⌫</div>${k('0')}
        <div class="hk pk on ${okLabel ? '' : 'dis'}" data-a="pin:#ok" style="--c:${okCol || C.ok}"><i></i>${okLabel || 'OK'}</div></div></div>`;
  }
  _mainHtml(st) {
    const s = st ? st.state : 'unavailable', a = (st && st.attributes) || {}, en = a.modes_enabled || MODES, armed = s !== 'disarmed';
    const openN = m => ((a.open_sensors || {})[m] || []).length;
    const mk = m => {
      const [l, col, ic, d] = MODE[m], on = a.mode === m && armed, n = openN(m);
      return `<div class="hk mode ${on ? 'on' : ''} ${en.includes(m) ? '' : 'dis'}" data-a="arm:${m}" style="--c:${col}">
        <ha-icon icon="${ic}" style="color:${on ? col : '#9a9ea6'}"></ha-icon><span class="ml">${l}<small>${d}${!armed && n ? ` · <em>${n} offen</em>` : ''}</small></span><i></i></div>`;
    };
    const conf = this._open ? this._confHtml() : '';
    return `${this._tabs()}${this._head(st)}
      <div class="main">
        <div class="col"><div class="lbl">Modus wählen${a.code_arm_required ? ' · erst PIN' : ''}</div>${MODES.map(mk).join('')}
          ${armed ? `<div class="hint">Zum Ausschalten PIN eingeben und <b>Unscharf</b> drücken.</div>` : ''}</div>
        <div class="col">${this._padHtml(armed ? 'Unscharf' : '', C.ok)}</div>
      </div>
      <div id="msg" class="msg ${this._msg[1]}">${esc(this._msg[0])}</div>${conf}`;
  }
  _confHtml() {
    const o = this._open, [l, col] = MODE[o.mode];
    const row = x => `<div class="orow"><ha-icon icon="${x.state === 'offline' ? 'mdi:lan-disconnect' : x.state === 'tilted' ? 'mdi:window-open-variant' : /window|fenster/i.test(x.entity_id + x.name) ? 'mdi:window-open' : /pzm|motion|presence/i.test(x.entity_id) ? 'mdi:motion-sensor' : 'mdi:door-open'}"></ha-icon>
      <span>${esc(x.name)}</span><b>${x.state === 'offline' ? 'nicht erreichbar' : x.state === 'tilted' ? 'gekippt' : /pzm|motion|presence/i.test(x.entity_id) ? 'Bewegung' : 'offen'}</b></div>`;
    if (o.blocked) return `<div class="ov"><div class="ovw plate">
      <div class="ovh"><ha-icon icon="mdi:window-open-variant" style="color:${C.bad}"></ha-icon>Erst schließen – ${esc(l)} geht nur, wenn alles zu ist</div>
      <div class="olist">${o.list.map(row).join('')}</div>
      <div class="hint">Einstellung „Nur scharf, wenn Türen/Fenster zu“ (Verwaltung → Automatik).</div>
      <div class="ovb"><div class="hk on" data-a="cancel" style="--c:${C.info}"><i></i>OK</div></div>
    </div></div>`;
    const w = ((this._st && this._st.attributes.watch) || {})[o.mode];
    return `<div class="ov"><div class="ovw plate">
      <div class="ovh"><ha-icon icon="mdi:alert-outline" style="color:${C.warn}"></ha-icon>Noch offen – ${esc(l)} trotzdem scharf schalten?</div>
      <div class="olist">${o.list.map(row).join('')}</div>
      <div class="hint">${w && !w.allow_close ? 'Übersprungene Melder: auch Zugehen löst Alarm aus.' : 'Übersprungene Melder dürfen zugehen und werden dann wieder überwacht.'}</div>
      <div class="ovb"><div class="hk" data-a="cancel">Abbrechen</div><div class="hk on" data-a="force" style="--c:${col}"><i></i>Trotzdem scharf</div></div>
    </div></div>`;
  }
  _alarmHtml(st) {
    const a = st.attributes, trg = st.state === 'triggered';
    return `<div class="al">
      <div class="alt"><ha-icon icon="${trg ? 'mdi:alarm-light' : 'mdi:shield-alert'}"></ha-icon>${trg ? 'ALARM' : 'EINGANGSVERZÖGERUNG'}</div>
      <div class="als">${esc(a.triggered_by_name || (trg ? 'manuell ausgelöst' : ''))}</div>
      ${trg ? `<div class="alc small">Alarm läuft · ${a.trigger_end ? `noch <b id="cd2"></b> s` : ''}</div>` : `<div class="alc"><b id="cd"></b></div><div class="als">Sekunden bis Alarm</div>`}
      <div class="alp">${this._padHtml('Unscharf', C.ok)}</div>
      <div id="msg" class="msg ${this._msg[1]}">${esc(this._msg[0])}</div>
    </div>`;
  }
  _histHtml() {
    const h = this._hist;
    if (!h) { this._loadHist(); }
    const row = e => {
      const [l, col] = EV[e.ev] || [e.ev, C.off];
      const bits = [e.mode && (MODE[e.mode] || [e.mode])[0], e.user, e.sensor_name, e.src && e.src !== e.user ? e.src : '', e.info].filter(Boolean).map(esc).join(' · ');
      return `<div class="hrow"><span class="ht">${dts(e.t)}</span><span class="he" style="color:${col}"><i style="background:${col}"></i>${l}</span><span class="hb">${bits}</span></div>`;
    };
    return `${this._tabs()}<div class="hist">${h ? h.length ? h.map(row).join('') : '<div class="hint">Noch keine Einträge.</div>' : '<div class="hint">lädt …</div>'}</div>`;
  }
  async _loadHist() {
    try { this._hist = await this._ws({ type: 'alarm_system/history', limit: 200 }); } catch (e) { this._hist = []; }
    if (this._v === 'hist') this._render();
  }
  _cd() {
    const st = this._st; if (!st) return;
    const r = this.shadowRoot;
    const e1 = r.getElementById('cd'); if (e1) e1.textContent = cd(left(st.attributes.delay_end));
    const e2 = r.getElementById('cd2'); if (e2) e2.textContent = cd(left(st.attributes.trigger_end));
    const e3 = r.getElementById('lk'); if (e3) { const l = left(st.attributes.locked_until); if (!l) this._render(); else e3.textContent = Math.ceil(l); }
  }

  // -------------------------------------------------------------- Bedienung
  _click(ev) {
    const el = ev.target.closest('[data-a]'); if (!el) return;
    const [a, ...r] = el.dataset.a.split(':'), v = r.join(':');
    const f = this['_a_' + a]; if (f) f.call(this, v, el);
  }
  _key2(ev) {
    if (this._kb) { this._kbKey(ev); return; }
    if (/^[0-9]$/.test(ev.key)) this._a_pin(ev.key);
    else if (ev.key === 'Backspace') this._a_pin('#bs');
    else if (ev.key === 'Enter') this._a_pin('#ok');
  }
  _a_view(v) {
    this._msg = ['', ''];
    if (v === 'admin' && !this._adm) {
      if (!this._pin) { this._v = 'main'; this._render(); this._say('Für die Verwaltung erst eine Verwaltungs-PIN eintippen, dann „Verwaltung“.'); return; }
      this._admOpen(); return;
    }
    if (v === 'hist') this._hist = null;
    this._v = v; this._render();
  }
  _a_close() { this.dispatchEvent(new Event('ht-close')); }
  _a_pin(d) {
    if (this._pk || this._kb) return;
    if (this._np) { this._npKey(d); return; }
    if (d === '#bs') this._pin = this._pin.slice(0, -1);
    else if (d === '#ok') { this._disarm(); return; }
    else if (this._pin.length < 8) this._pin += d;
    const v = this.shadowRoot.querySelector('.pinv');
    if (v) v.innerHTML = this._pin ? '●'.repeat(this._pin.length) : '<span class="ph">PIN</span>';
    else this._render();
  }
  async _disarm() {
    const s = this._st && this._st.state;
    if (!s || s === 'disarmed' || this._busy) return;
    if (!this._pin) { this._say('PIN eingeben', 'bad'); return; }
    this._busy = true;
    try {
      const r = await this._ws({ type: 'alarm_system/disarm', code: this._pin });
      this._pin = ''; this._msg = [`Unscharf – ${r.user}`, 'ok']; this._render(); this._done();
    } catch (e) { this._pin = ''; this._msg = [errTxt(e), 'bad']; this._render(); }
    this._busy = false;
  }
  _a_arm(m) { this._arm(m, false); }
  async _arm(m, force) {
    if (this._busy) return;
    const a = this._st.attributes;
    if (a.code_arm_required && !this._pin) { this._say('Erst PIN eingeben, dann Modus wählen', 'bad'); return; }
    this._busy = true;
    try {
      const r = await this._ws({ type: 'alarm_system/arm', mode: m, force, ...(this._pin ? { code: this._pin } : {}) });
      if (!r.ok) { this._open = { mode: m, list: r.open, blocked: !!r.blocked }; this._render(); }
      else { this._pin = ''; this._open = null; this._msg = [`${MODE[m][0]}: ${r.state === 'arming' ? 'Ausgangsverzögerung läuft' : 'scharf'}`, 'ok']; this._render(); this._done(); }
    } catch (e) { this._pin = ''; this._open = null; this._msg = [errTxt(e), 'bad']; this._render(); }
    this._busy = false;
  }
  _a_force() { const m = this._open && this._open.mode; this._open = null; if (m) this._arm(m, true); }
  _a_cancel() { this._open = null; this._msg = ['Abgebrochen – nicht scharf geschaltet', '']; this._render(); }
  _done() {
    if (!this._c.schliessen) return;
    setTimeout(() => { try { window.browser_mod && window.browser_mod.service('close_popup', {}); } catch (e) { /* offen lassen */ } }, 1600);
  }

  // -------------------------------------------------------------- Verwaltung
  async _admOpen() {
    try {
      await this._ws({ type: 'alarm_system/verify', code: this._pin });
      const cfg = await this._ws({ type: 'alarm_system/config' });
      this._adm = { code: this._pin, tab: 'modi', cfg, s: JSON.parse(JSON.stringify(cfg.settings)), u: JSON.parse(JSON.stringify(cfg.users)), dirty: false, filt: 'zug' };
      this._pin = ''; this._v = 'admin'; this._msg = ['', '']; this._render();
    } catch (e) { this._pin = ''; this._v = 'main'; this._msg = [errTxt(e), 'bad']; this._render(); }
  }
  _admHtml() {
    const A = this._adm;
    const tab = (k, l) => `<div class="hk sm ${A.tab === k ? 'on' : ''}" data-a="atab:${k}" style="--c:${C.info}"><i></i>${l}</div>`;
    const inner = { modi: () => this._admModi(), sens: () => this._admSens(), auto: () => this._admAuto(), pers: () => this._admPers(), chan: () => this._admChan() }[A.tab]();
    return `${this._tabs()}<div class="atabs">${ADM_TABS.map(t => tab(...t)).join('')}<span class="sp"></span>
      <div class="hk sm" data-a="adone">Schließen</div><div class="hk sm ${A.dirty ? 'on' : 'dis'}" data-a="asave" style="--c:${C.ok}"><i></i>Speichern</div></div>
      <div class="abody">${inner}</div><div id="msg" class="msg ${this._msg[1]}">${esc(this._msg[0])}</div>`;
  }
  _step(path, v, unit = 's') { return `<div class="stp"><div class="hk sm" data-a="num:${path}:-">−</div><div class="lcd sv">${unit === 's' ? secTxt(v) : v}</div><div class="hk sm" data-a="num:${path}:+">+</div></div>`; }
  _tog(path, on, l, col = C.ok) { return `<div class="hk sm ${on ? 'on' : ''}" data-a="tog:${path}" style="--c:${col}"><i></i>${l}</div>`; }
  _admModi() {
    const S = this._adm.s;
    const row = m => {
      const x = S.modes[m], [l, col] = MODE[m];
      return `<div class="mrow"><div class="mn" style="color:${col}">${l}</div>${this._tog(`modes.${m}.enabled`, x.enabled, x.enabled ? 'aktiv' : 'aus', col)}
        <div class="mc"><span class="lbl">Ausgang</span>${this._step(`modes.${m}.exit_delay`, x.exit_delay)}</div>
        <div class="mc"><span class="lbl">Eingang</span>${this._step(`modes.${m}.entry_delay`, x.entry_delay)}</div>
        <div class="mc"><span class="lbl">Alarmdauer</span>${this._step(`modes.${m}.trigger_time`, x.trigger_time)}</div></div>`;
    };
    const wrow = m => {
      const w = S.watch[m], [l, col] = MODE[m];
      return `<div class="grow"><span class="gl" style="min-width:150px;color:${col}">${l}</span>
        ${this._tog(`watch.${m}.allow_close`, w.allow_close, w.allow_close ? 'Schließen erlaubt' : 'Schließen löst aus', w.allow_close ? C.ok : C.bad)}
        ${w.allow_close ? `<span class="gl">danach wieder überwacht nach</span>${this._step(`watch.${m}.settle`, w.settle)}` : ''}</div>`;
    };
    return `<div class="lbl">Modi · Ausgangsverzögerung (Zeit zum Gehen) · Eingangsverzögerung (Zeit zum Entschärfen, nur „verzögerte“ Melder) · Alarmdauer</div>
      ${MODES.map(row).join('')}
      <div class="lbl" style="margin-top:12px">Überwachung · ein beim Scharfschalten offenes Fenster / offene Tür (übersprungen) darf zugehen, z. B. durch Wind – ohne Alarm</div>
      ${MODES.map(wrow).join('')}
      <div class="lbl" style="margin-top:12px">Allgemein</div>
      <div class="grow">${this._tog('code_arm_required', S.code_arm_required, 'PIN zum Scharfschalten')}
        ${this._tog('disarm_after_trigger', S.disarm_after_trigger, 'Nach Alarm unscharf (sonst wieder scharf)')}</div>
      <div class="grow"><span class="gl">Dienst-Aufruf (z. B. „Ich gehe“) bei offenen Meldern:</span>
        <div class="seg">${[['bypass', 'überspringen'], ['block', 'abbrechen']].map(([k, l]) => `<div class="hk ${S.service_open === k ? 'on' : ''}" data-a="set:service_open:${k}" style="--c:${C.info}"><i></i>${l}</div>`).join('')}</div></div>
      <div class="grow"><span class="gl">Falsche PIN: nach</span>${this._step('max_wrong', S.max_wrong, '')}<span class="gl">Versuchen sperren für</span>${this._step('lock_s', S.lock_s)}</div>`;
  }
  _admSens() {
    const A = this._adm, S = A.s.sensors;
    const list = A.cfg.candidates.filter(c => A.filt === 'alle' || (A.filt === 'zug' ? S[c.entity_id] : S[c.entity_id] && S[c.entity_id].modes.includes(A.filt)));
    const row = c => {
      const x = S[c.entity_id] || { modes: [], delayed: false, always: false }, p = `sens.${c.entity_id}`;
      const st = this._hass.states[c.entity_id], sv = st ? st.state : '?';
      return `<div class="srow"><ha-icon icon="${KIND_IC[c.class] || 'mdi:door'}"></ha-icon>
        <div class="sn"><b>${esc(c.name)}</b><small>${c.members ? esc(c.kind) + ' · ' + esc(c.members.map(m => (this._hass.states[m] && this._hass.states[m].attributes.friendly_name) || m).slice(0, 4).join(', ')) + (c.members.length > 4 ? ' …' : '') : `${esc(c.area || '–')} · ${esc(c.kind)} · ${esc(sv)}`}</small></div>
        ${MODES.map(m => `<div class="hk sm ${x.modes.includes(m) ? 'on' : ''}" data-a="smode:${c.entity_id}:${m}" style="--c:${MODE[m][1]}"><i></i>${MODE[m][0].split(' ')[0]}</div>`).join('')}
        ${this._tog(`${p}.delayed`, x.delayed, 'verzögert', C.warn)}${this._tog(`${p}.always`, x.always, '24 h', C.bad)}</div>`;
    };
    return `<div class="grow"><span class="lbl" style="flex:1">Gruppen je Modus: Melder bei „Abwesend“ / „Zuhause“ / „Urlaub“ anhaken (auch ganze HA-Gruppen) · „verzögert“ = Eingangsverzögerung · „24 h“ = löst immer aus</span>
      <div class="seg">${[['zug', 'Zugeordnet'], ['armed_away', 'Abwesend'], ['armed_home', 'Zuhause'], ['armed_vacation', 'Urlaub'], ['alle', 'Alle']].map(([k, l]) => `<div class="hk ${A.filt === k ? 'on' : ''}" data-a="filt:${k}" style="--c:${C.info}"><i></i>${l}</div>`).join('')}</div></div>
      <div class="slist">${list.map(row).join('') || '<div class="hint">Keine Melder zugeordnet – „Alle“ zeigt die verfügbaren.</div>'}</div>`;
  }
  _admAuto() {
    const A = this._adm, au = A.s.auto, H = this._hass, a = (this._st && this._st.attributes) || {};
    const nm = e => (H.states[e] && H.states[e].attributes.friendly_name) || e;
    const list = ids => ids.length ? esc(ids.map(nm).join(', ')) : 'keine gewählt';
    const seg = (path, cur, col = C.info) => `<div class="seg">${MODES.map(m => `<div class="hk ${cur === m ? 'on' : ''}" data-a="aset:${path}:${m}" style="--c:${MODE[m][1]}"><i></i>${MODE[m][0].split(' ')[0]}</div>`).join('')}</div>`;
    const dm = (k, cur) => MODES.map(m => `<div class="hk sm ${cur.includes(m) ? 'on' : ''}" data-a="admode:${k}:${m}" style="--c:${MODE[m][1]}"><i></i>${MODE[m][0].split(' ')[0]}</div>`).join('');
    const p = au.presence, l = au.lock, c = au.closed;
    const pres = a.present === true ? `<b style="color:${C.ok}">da: ${esc((a.present_names || []).join(', '))}</b>` : a.present === false ? `<b style="color:${C.away}">alle weg</b>` : '<b>unbekannt</b>';
    const notClosed = (a.not_closed || []);
    const box = (ic, title, on, path, body) => `<div class="crow ${on ? '' : 'off'}"><div class="ch"><ha-icon icon="${ic}"></ha-icon><b>${title}</b>
      ${this._tog(path, on, on ? 'an' : 'aus')}<span class="sp"></span></div>${on ? body : ''}</div>`;
    return `<div class="lbl">Automatik · schaltet ohne PIN – nur einschalten, was zuverlässig funktioniert</div><div class="clist">
      ${box('mdi:account-arrow-right', 'Anwesenheit (BLE)', p.enabled, 'auto.presence.enabled', `
        <div class="cf"><span class="lbl">Wer</span><div class="hk sm tx" data-a="apick:presence">${list(p.entities)}</div><span class="gl">jetzt: ${pres}</span></div>
        <div class="cf">${this._tog('auto.presence.arm', p.arm, 'Alle weg → scharf', C.away)}${p.arm ? `${seg('auto.presence.mode', p.mode)}<span class="gl">nach</span>${this._step('auto.presence.away_delay', p.away_delay)}` : ''}</div>
        <div class="cf">${this._tog('auto.presence.disarm', p.disarm, 'Jemand da → unscharf', C.ok)}${p.disarm ? `<span class="gl">bei</span>${dm('presence', p.disarm_modes)}` : ''}</div>`)}
      ${box('mdi:lock-clock', 'Türschloss', l.enabled, 'auto.lock.enabled', `
        <div class="cf"><span class="lbl">Schloss</span><div class="hk sm tx" data-a="apick:lock">${list(l.entities)}</div></div>
        <div class="cf">${this._tog('auto.lock.arm', l.arm, 'Abgeschlossen → scharf', C.away)}${l.arm ? `${seg('auto.lock.mode', l.mode)}${this._tog('auto.lock.require_away', l.require_away, 'nur wenn niemand da', C.warn)}` : ''}</div>
        <div class="cf">${this._tog('auto.lock.disarm', l.disarm, 'Aufgeschlossen → unscharf', C.ok)}${l.disarm ? `<span class="gl">bei</span>${dm('lock', l.disarm_modes)}` : ''}</div>`)}
      ${box('mdi:window-closed-variant', 'Nur scharf, wenn Türen/Fenster zu', c.enabled, 'auto.closed.enabled', `
        <div class="cf"><span class="lbl">Gruppe</span><div class="hk sm tx" data-a="apick:closed">${list(c.entities)}</div>
          <span class="gl">${notClosed.length ? `<b style="color:${C.bad}">offen: ${esc(notClosed.map(nm).join(', '))}</b>` : `<b style="color:${C.ok}">alles zu</b>`}</span></div>
        <div class="cf">${this._tog('auto.closed.manual', c.manual, 'auch beim Scharfschalten von Hand (kein „Trotzdem scharf“)', C.warn)}<span class="gl">Automatik prüft immer</span></div>`)}
      </div><div class="hint">Schalter dazu in HA: switch.home_security_system_cfg_auto_presence / _auto_lock / _require_closed · Status: binary_sensor.home_security_system_presence / _openings</div>`;
  }
  _a_aset(v) { const i = v.lastIndexOf(':'); this._setPath(v.slice(0, i), () => v.slice(i + 1)); this._dirty(); }
  _a_admode(v) {
    const [k, m] = v.split(':'), x = this._adm.s.auto[k];
    x.disarm_modes = x.disarm_modes.includes(m) ? x.disarm_modes.filter(y => y !== m) : [...x.disarm_modes, m]; this._dirty();
  }
  _a_apick(k) {
    const A = this._adm, x = A.s.auto[k], H = this._hass, S = Object.values(H.states);
    let opts;
    if (k === 'presence') {
      opts = S.filter(s => /^(person|device_tracker|input_boolean)\./.test(s.entity_id) || (s.entity_id.startsWith('binary_sensor.') && ['presence', 'occupancy'].includes(s.attributes.device_class)))
        .map(s => ({ v: s.entity_id, l: s.attributes.friendly_name || s.entity_id, sub: `${s.entity_id} · ${s.state}`, o: /_ble_/.test(s.entity_id) ? 0 : s.entity_id.startsWith('person.') ? 1 : 2 }))
        .sort((a, b) => a.o - b.o || a.l.localeCompare(b.l));
    } else if (k === 'lock') {
      opts = S.filter(s => s.entity_id.startsWith('lock.')).map(s => ({ v: s.entity_id, l: s.attributes.friendly_name || s.entity_id, sub: `${s.entity_id} · ${s.state}`, o: /bediensperre/.test(s.entity_id) ? 1 : 0 }))
        .sort((a, b) => a.o - b.o || a.l.localeCompare(b.l));
    } else {
      opts = A.cfg.candidates.filter(c => ['door', 'window', 'opening', 'garage_door', 'group', 'contact'].includes(c.class))
        .map(c => ({ v: c.entity_id, l: c.name, sub: `${c.area ? c.area + ' · ' : ''}${c.kind} · ${c.entity_id}` }));
    }
    const t = { presence: 'Personen / BLE-Tracker (jemand davon da = anwesend)', lock: 'Türschlösser', closed: 'Türen / Fenster / Gruppen, die zu sein müssen' }[k];
    this._pick(t, opts, x.entities, true, sel => { x.entities = sel; this._dirty(); });
  }
  _admPers() {
    const U = this._adm.u;
    const row = (u, i) => `<div class="prow">
      <div class="pn" data-a="pname:${i}"><b>${esc(u.name)}</b><small>${esc(u.person || 'ohne Person')}</small></div>
      <div class="hk sm" data-a="pperson:${i}">Person</div>
      ${this._tog(`users.${i}.enabled`, u.enabled, 'aktiv')}${this._tog(`users.${i}.admin`, u.admin, 'Verwaltung', C.info)}
      <span class="pp ${u.new_pin ? 'neu' : u.has_pin && !u.clear_pin ? '' : 'kein'}">${u.new_pin ? 'neue PIN' : u.has_pin && !u.clear_pin ? 'PIN gesetzt' : 'keine PIN'}</span>
      <div class="hk sm" data-a="ppin:${i}">PIN ändern</div><div class="hk sm" data-a="pdel:${i}">✕</div></div>`;
    return `<div class="lbl">Personen · jede PIN ist eindeutig, damit der Verlauf zeigt, wer geschaltet hat</div>
      <div class="plist">${U.map(row).join('')}</div><div class="grow"><div class="hk sm" data-a="padd">+ Person</div></div>
      ${this._np ? this._npHtml() : ''}`;
  }
  _admChan() {
    const S = this._adm.s, have = new Set(S.channels.map(c => c.type));
    const row = (c, i) => {
      const [tl, ic] = CH[c.type] || [c.type, 'mdi:bell'], p = `channels.${i}`;
      let f = '';
      if (c.type === 'tablet') f = `<div class="cf"><span class="lbl">Geräte</span><div class="hk sm" data-a="cpick:${i}:browsers">${c.browsers.length ? esc(c.browsers.map(b => b.split('@')[0]).join(', ')) : 'alle Tablets'}</div>${this._tog(`${p}.sound`, c.sound, 'Ton')}</div>`;
      else if (c.type === 'siren') f = `<div class="cf"><span class="lbl">Sirenen</span><div class="hk sm" data-a="cpick:${i}:entities">${c.entities.length ? esc(c.entities.join(', ')) : 'keine gewählt'}</div></div>`;
      else if (c.type === 'rest') f = `<div class="cf"><span class="lbl">URL</span><div class="hk sm tx" data-a="ctext:${i}:url">${esc(c.url || 'eintragen …')}</div>
        <div class="seg">${['GET', 'POST', 'PUT'].map(m => `<div class="hk ${c.method === m ? 'on' : ''}" data-a="cset:${i}:method:${m}" style="--c:${C.info}"><i></i>${m}</div>`).join('')}</div></div>`;
      else f = `<div class="cf"><span class="lbl">Dienst</span><div class="hk sm tx" data-a="cpick:${i}:service">${esc(c.service || 'wählen …')}</div>
        ${'nummer' in c ? `<span class="lbl">${c.type === 'sms' || c.type === 'phone' ? 'Nummer' : 'Ziel'}</span><div class="hk sm tx" data-a="ctext:${i}:nummer">${esc(c.nummer || 'eintragen …')}</div>` : ''}</div>`;
      return `<div class="crow ${c.enabled ? '' : 'off'}"><div class="ch"><ha-icon icon="${ic}"></ha-icon><b>${esc(c.name || tl)}</b>
          ${this._tog(`${p}.enabled`, c.enabled, c.enabled ? 'an' : 'aus')}<span class="sp"></span>
          ${CH_EV.map(([e, l]) => `<div class="hk sm ${c.events.includes(e) ? 'on' : ''}" data-a="cev:${i}:${e}" style="--c:${C.warn}"><i></i>${l}</div>`).join('')}
          <div class="hk sm" data-a="ctest:${i}">Test</div></div>${f}</div>`;
    };
    const missing = Object.keys(CH).filter(t => !have.has(t));
    return `<div class="lbl">Kanäle · Platzhalter in Texten: {sensor} {zeit} {modus} {person} · Daten-Vorlagen siehe Anleitung</div>
      <div class="clist">${S.channels.map(row).join('')}</div>
      ${missing.length ? `<div class="grow">${missing.map(t => `<div class="hk sm" data-a="cadd:${t}">+ ${CH[t][0]}</div>`).join('')}</div>` : ''}`;
  }
  _setPath(path, fn) {
    const S = this._adm, parts = path.split('.');
    let root = parts[0] === 'users' ? S.u : S.s, i = parts[0] === 'users' ? 1 : 0;
    if (parts[0] === 'sens') {
      const eid = parts.slice(1, -1).join('.'), k = parts[parts.length - 1];
      const x = S.s.sensors[eid] || (S.s.sensors[eid] = { modes: [], delayed: false, always: false });
      x[k] = fn(x[k]); return;
    }
    for (; i < parts.length - 1; i++) root = root[parts[i]];
    root[parts[parts.length - 1]] = fn(root[parts[parts.length - 1]]);
  }
  _dirty() { this._adm.dirty = true; this._msg = ['', '']; this._render(); }
  _a_atab(t) { this._adm.tab = t; this._np = null; this._render(); }
  _a_filt(f) { this._adm.filt = f; this._render(); }
  _a_tog(p) { this._setPath(p, v => !v); this._dirty(); }
  _a_set(v) { const [k, val] = v.split(':'); this._adm.s[k] = val; this._dirty(); }
  _a_num(v) {
    const [p, d] = v.split(':'), k = p.split('.').pop();
    const lim = { exit_delay: [0, 600, 5], entry_delay: [0, 600, 5], trigger_time: [10, 3600, 30], max_wrong: [2, 20, 1], lock_s: [10, 3600, 30],
      settle: [0, 600, 5], away_delay: [0, 3600, 30] }[k];
    this._setPath(p, x => Math.max(lim[0], Math.min(lim[1], (+x || 0) + (d === '+' ? lim[2] : -lim[2])))); this._dirty();
  }
  _a_smode(v) {
    const i = v.lastIndexOf(':'), eid = v.slice(0, i), m = v.slice(i + 1);
    this._setPath(`sens.${eid}.modes`, ms => (ms || []).includes(m) ? ms.filter(x => x !== m) : [...(ms || []), m]);
    const x = this._adm.s.sensors[eid]; if (!x.modes.length && !x.always) delete this._adm.s.sensors[eid];
    this._dirty();
  }
  _a_adone() {
    if (this._adm.dirty && !this._adm.warn) { this._adm.warn = true; this._say('Nicht gespeichert – nochmal „Schließen“ verwirft die Änderungen', 'bad'); return; }
    this._adm = null; this._np = null; this._v = 'main'; this._msg = ['', '']; this._render();
  }
  async _a_asave() {
    const A = this._adm; if (!A.dirty) return;
    // Sensoren ohne Modus und ohne 24 h entfernen
    for (const [k, x] of Object.entries(A.s.sensors)) if (!x.modes.length && !x.always) delete A.s.sensors[k];
    try {
      const r = await this._ws({ type: 'alarm_system/save', code: A.code, settings: A.s, users: A.u });
      A.cfg = { ...A.cfg, ...r }; A.s = JSON.parse(JSON.stringify(r.settings)); A.u = JSON.parse(JSON.stringify(r.users)); A.dirty = false; A.warn = false;
      this._msg = ['Gespeichert', 'ok'];
    } catch (e) { this._msg = [errTxt(e), 'bad']; }
    this._render();
  }
  // Personen
  _a_padd() { this._adm.u.push({ id: '', name: 'Neue Person', person: '', admin: false, enabled: true, has_pin: false }); this._dirty(); }
  _a_pdel(i) { this._adm.u.splice(+i, 1); this._dirty(); }
  _a_pname(i) { const u = this._adm.u[+i]; this._kbOpen('Name', u.name, 40, v => { u.name = v || u.name; this._dirty(); }); }
  _a_pperson(i) {
    const u = this._adm.u[+i], opts = Object.values(this._hass.states).filter(s => s.entity_id.startsWith('person.')).map(s => ({ v: s.entity_id, l: s.attributes.friendly_name || s.entity_id }));
    this._pick('Person zuordnen', [{ v: '', l: 'keine' }, ...opts], [u.person], false, sel => { u.person = sel[0] || ''; this._dirty(); });
  }
  _a_ppin(i) { this._np = { i: +i, step: 1, a: '', b: '' }; this._render(); }
  _npHtml() {
    const n = this._np, u = this._adm.u[n.i], cur = n.step === 1 ? n.a : n.b;
    const k = d => `<div class="hk pk" data-a="pin:${d}">${d}</div>`;
    return `<div class="ov"><div class="ovw plate npw"><div class="ovh">Neue PIN für ${esc(u.name)} – ${n.step === 1 ? '4–8 Ziffern' : 'nochmal zur Bestätigung'}</div>
      <div class="lcd pinv">${cur ? '●'.repeat(cur.length) : '<span class="ph">PIN</span>'}</div>
      <div class="pkg">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k).join('')}<div class="hk pk" data-a="pin:#bs">⌫</div>${k('0')}<div class="hk pk on" data-a="pin:#ok" style="--c:${C.ok}"><i></i>OK</div></div>
      <div class="ovb"><div class="hk" data-a="npx">Abbrechen</div>${u.has_pin ? '<div class="hk" data-a="npclr">PIN löschen</div>' : ''}</div></div></div>`;
  }
  _npKey(d) {
    const n = this._np, k = n.step === 1 ? 'a' : 'b';
    if (d === '#bs') n[k] = n[k].slice(0, -1);
    else if (d === '#ok') {
      if (n.step === 1) { if (n.a.length < 4) { this._say('Mindestens 4 Ziffern', 'bad'); return; } n.step = 2; }
      else if (n.a !== n.b) { n.step = 1; n.a = n.b = ''; this._msg = ['Die PINs stimmen nicht überein', 'bad']; }
      else { const u = this._adm.u[n.i]; u.new_pin = n.a; delete u.clear_pin; this._np = null; this._dirty(); return; }
    } else if (n[k].length < 8) n[k] += d;
    this._render();
  }
  _a_npx() { this._np = null; this._render(); }
  _a_npclr() { const u = this._adm.u[this._np.i]; u.clear_pin = true; delete u.new_pin; this._np = null; this._dirty(); }
  // Kanäle
  _a_cadd(t) { const d = this._adm.cfg.channel_defaults[t]; this._adm.s.channels.push({ id: '', type: t, enabled: false, ...JSON.parse(JSON.stringify(d)) }); this._dirty(); }
  _a_cev(v) { const [i, e] = v.split(':'), c = this._adm.s.channels[+i]; c.events = c.events.includes(e) ? c.events.filter(x => x !== e) : [...c.events, e]; this._dirty(); }
  _a_cset(v) { const [i, k, val] = v.split(':'); this._adm.s.channels[+i][k] = val; this._dirty(); }
  _a_ctext(v) { const [i, k] = v.split(':'), c = this._adm.s.channels[+i]; this._kbOpen(k === 'url' ? 'URL' : 'Nummer / Ziel', c[k] || '', 200, x => { c[k] = x.trim(); this._dirty(); }); }
  _a_cpick(v) {
    const [i, k] = v.split(':'), c = this._adm.s.channels[+i], H = this._hass;
    if (k === 'browsers') {
      const ge = H.states['input_select.klingel_gerate'], opts = ((ge && ge.attributes.options) || []).filter(o => o && o !== '–').map(o => ({ v: o.split('@')[0], l: o.split('@')[0], sub: o.includes('@') ? 'Raum ' + o.split('@')[1] : '' }));
      this._pick('Tablets (keins gewählt = alle)', opts, c.browsers, true, sel => { c.browsers = sel; this._dirty(); });
    } else if (k === 'entities') {
      const opts = Object.values(H.states).filter(s => /^(siren|switch|light|media_player)\./.test(s.entity_id)).map(s => ({ v: s.entity_id, l: s.attributes.friendly_name || s.entity_id, sub: s.entity_id }))
        .sort((a, b) => (a.v.startsWith('siren.') ? 0 : 1) - (b.v.startsWith('siren.') ? 0 : 1) || a.l.localeCompare(b.l));
      this._pick('Sirenen / Schalter', opts, c.entities, true, sel => { c.entities = sel; this._dirty(); });
    } else {
      const doms = c.type === 'phone' ? ['notify', 'script', 'shell_command', 'rest_command'] : c.type === 'email' ? ['notify'] : ['notify', 'script', 'rest_command'];
      const opts = [];
      for (const d of doms) for (const s of Object.keys(H.services[d] || {})) if (!['send_message', 'persistent_notification', 'reload', 'turn_on', 'turn_off', 'toggle'].includes(s)) opts.push({ v: `${d}.${s}`, l: `${d}.${s}` });
      this._pick('Dienst wählen', [{ v: '', l: 'keiner' }, ...opts], [c.service], false, sel => { c.service = sel[0] || ''; this._dirty(); });
    }
  }
  async _a_ctest(i) {
    const c = this._adm.s.channels[+i];
    this._say(`Test „${c.name}“ läuft …`);
    try { await this._ws({ type: 'alarm_system/test_channel', code: this._adm.code, channel: c }); this._say(`Test „${c.name}“ gesendet`, 'ok'); }
    catch (e) { this._say(errTxt(e), 'bad'); }
  }

  // -------------------------------------------------------------- Auswahlfenster
  _pick(title, opts, sel, multi, cb) { this._pk = { title, opts, sel: [...sel.filter(x => x != null)], multi, cb }; this._render(); }
  _pkHtml() {
    const P = this._pk;
    return `<div class="pk1"><div class="ovh">${esc(P.title)}</div><div class="pkl">${P.opts.map((o, i) => `<div class="pko ${P.sel.includes(o.v) ? 'on' : ''}" data-a="pko:${i}">
      <span class="ck"></span><b>${esc(o.l)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>`).join('') || '<div class="hint">Nichts gefunden.</div>'}</div>
      <div class="ovb"><div class="hk" data-a="pkx">Abbrechen</div><div class="hk on" data-a="pkok" style="--c:${C.ok}"><i></i>Übernehmen</div></div></div>`;
  }
  _a_pko(i) {
    const P = this._pk, v = P.opts[+i].v;
    if (P.multi) P.sel = P.sel.includes(v) ? P.sel.filter(x => x !== v) : [...P.sel, v];
    else { P.sel = [v]; this._a_pkok(); return; }
    this._render();
  }
  _a_pkx() { this._pk = null; this._render(); }
  _a_pkok() { const P = this._pk; this._pk = null; P.cb(P.sel); }

  // -------------------------------------------------------------- Bildschirmtastatur (Muster aus raum-panel)
  _kbOpen(title, value, max, cb) { this._kb = { title, v: value || '', max, cb, sh: false }; this._render(); }
  _kbHtml() {
    const k = this._kb, cap = c => k.sh ? c.toUpperCase() : c;
    const key = c => c === '#sh' ? `<div class="hk w2 ${k.sh ? 'on' : ''}" data-a="kb:#sh" style="--c:${C.info}">⇧</div>`
      : c === '#bs' ? '<div class="hk w2" data-a="kb:#bs">⌫</div>' : `<div class="hk" data-a="kb:${esc(c)}">${esc(cap(c))}</div>`;
    return `<div class="pk1"><div class="ovh">${esc(k.title)}</div><div class="kbv">${esc(k.v)}<i></i><small>${k.v.length}/${k.max}</small></div>
      <div class="kbd">${KB_ROWS.map(r => `<div class="kbr">${r.map(key).join('')}</div>`).join('')}
      <div class="kbr"><div class="hk w2" data-a="kb:#esc">Abbrechen</div><div class="hk sp" data-a="kb:#sp">Leerzeichen</div><div class="hk w2 on" data-a="kb:#ok" style="--c:${C.ok}"><i></i>OK</div></div></div></div>`;
  }
  _a_kb(c) {
    const k = this._kb; if (!k) return;
    if (c === '#ok' || c === '#esc') { this._kb = null; if (c === '#ok') k.cb(k.v); else this._render(); return; }
    if (c === '#sh') k.sh = !k.sh;
    else if (c === '#bs') k.v = k.v.slice(0, -1);
    else if (k.v.length < k.max) { k.v += c === '#sp' ? ' ' : k.sh ? c.toUpperCase() : c; k.sh = false; }
    this._render();
  }
  _kbKey(ev) {
    if (ev.key === 'Enter') this._a_kb('#ok'); else if (ev.key === 'Escape') this._a_kb('#esc'); else if (ev.key === 'Backspace') this._a_kb('#bs');
    else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey) { const k = this._kb; if (k.v.length < k.max) k.v += ev.key; this._render(); }
    else return;
    ev.preventDefault();
  }
}

const POP_CSS = `
.pw{position:relative;padding:18px;display:flex;flex-direction:column;gap:12px;min-height:560px}
.pw.vb{position:fixed;inset:0;border-radius:0;justify-content:center;align-items:center;background:#120607}
.pw.red{background:radial-gradient(ellipse at center,#7a0d0d 0%,#3a0505 60%,#1a0202 100%);animation:rp 1.2s ease-in-out infinite}
@keyframes rp{50%{background-color:#5a0808;box-shadow:inset 0 0 160px rgba(255,40,40,.55)}}
.tabs,.atabs{display:flex;gap:8px;align-items:center}.atabs .sp,.ch .sp{flex:1}
.head{display:flex;align-items:center;gap:18px;padding:14px 20px}
.head ha-icon{--mdc-icon-size:58px;color:var(--sc);filter:drop-shadow(0 0 10px var(--sc))}
.hst{font-size:34px;color:var(--sc);text-shadow:0 0 14px var(--sc);letter-spacing:1px;line-height:1.05}
.hsub{font-size:16px;color:#a7abb3}.hsub b{color:var(--sc);font-weight:400}
.main{display:grid;grid-template-columns:1fr 330px;gap:22px;align-items:start}
.col{display:flex;flex-direction:column;gap:12px}
.mode{height:66px;justify-content:flex-start;padding:0 16px;gap:14px;text-transform:none;letter-spacing:.6px;font-size:19px}
.mode ha-icon{--mdc-icon-size:30px}.mode i{margin-left:auto;width:18px;height:6px}
.ml{display:flex;flex-direction:column;align-items:flex-start;line-height:1.1}.ml small{font-size:12px;color:#9a9fa8;letter-spacing:.6px;font-weight:600}
.ml em{font-style:normal;color:${C.warn}}
.hint{font-size:13px;color:#9a9fa8;letter-spacing:.4px;line-height:1.4}.hint b{color:#c9ccd2}
.pad{display:flex;flex-direction:column;gap:12px}
.pinv{height:56px;display:flex;align-items:center;justify-content:center;font-size:30px;letter-spacing:10px;color:#f0f1f3}
.pinv .ph{font-size:16px;letter-spacing:4px;color:#8c919a}.pinv .lk{font-size:16px;letter-spacing:2px;color:${C.bad}}
.pkg{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.pk{height:62px;font-size:26px;letter-spacing:0;color:#e2e4e8}
.pk.on{font-size:13px;letter-spacing:1.6px}
.ov{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:5;border-radius:inherit}
.ovw{width:min(620px,92%);padding:20px;display:flex;flex-direction:column;gap:14px;max-height:92%}
.npw{width:min(380px,92%)}
.ovh{display:flex;align-items:center;gap:10px;font-size:19px;letter-spacing:.5px;color:#f0f1f3}
.olist{display:flex;flex-direction:column;gap:6px;overflow:auto}
.orow{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:9px;background:rgba(0,0,0,.3);font-size:16px}
.orow ha-icon{color:${C.warn}}.orow span{flex:1}.orow b{color:${C.warn};font-weight:600;font-size:13px;letter-spacing:1px;text-transform:uppercase}
.ovb{display:flex;gap:12px;justify-content:flex-end}.ovb .hk{min-width:150px}
.al{display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;padding:10px}
.alt{display:flex;align-items:center;gap:16px;font-size:44px;letter-spacing:4px;color:#fff;text-shadow:0 0 22px #ff3030}
.alt ha-icon{--mdc-icon-size:56px;color:#fff;animation:bl 1s steps(1) infinite}@keyframes bl{50%{opacity:.3}}
.als{font-size:20px;color:#ffd0d0;letter-spacing:1px}
.alc{font-size:150px;line-height:1;color:#fff;text-shadow:0 0 40px #ff2020;font-family:'Share Tech Mono',monospace}
.alc.small{font-size:24px;color:#ffd0d0}.alc.small b{font-weight:400;color:#fff}
.alp{width:340px;margin-top:8px}
.al .msg{color:#ffd0d0}
.hist{display:flex;flex-direction:column;gap:4px;overflow:auto;max-height:520px}
.hrow{display:grid;grid-template-columns:150px 190px 1fr;gap:12px;align-items:center;padding:7px 10px;border-radius:8px;background:rgba(0,0,0,.22);font-size:14.5px}
.ht{color:#9a9fa8;font-family:'Share Tech Mono',monospace}.he{display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:.8px}
.he i{width:8px;height:8px;border-radius:50%;box-shadow:0 0 8px currentColor}.hb{color:#c9ccd2}
.abody{display:flex;flex-direction:column;gap:8px;overflow:auto;max-height:470px;padding-right:4px}
.mrow{display:grid;grid-template-columns:150px 80px repeat(3,1fr);gap:12px;align-items:center;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.22)}
.mn{font-size:17px;letter-spacing:.5px}.mc{display:flex;flex-direction:column;gap:4px}
.stp{display:flex;gap:6px;align-items:center}.stp .hk{width:34px;padding:0;font-size:16px}.sv{flex:1;height:28px;padding:0 8px;display:flex;align-items:center;justify-content:center;font-size:15px;color:#f0f1f3;min-width:72px}
.grow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:4px 0}.gl{font-size:14px;color:#a7abb3}
.slist,.plist,.clist{display:flex;flex-direction:column;gap:5px}
.srow{display:grid;grid-template-columns:26px 1fr repeat(5,auto);gap:8px;align-items:center;padding:6px 10px;border-radius:9px;background:rgba(0,0,0,.22)}
.srow ha-icon{--mdc-icon-size:20px;color:#9a9ea6}
.sn,.pn{display:flex;flex-direction:column;min-width:0}.sn b,.pn b{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sn small,.pn small{font-size:12px;color:#9a9fa8}
.prow{display:grid;grid-template-columns:1fr auto auto auto 110px auto auto;gap:8px;align-items:center;padding:8px 10px;border-radius:9px;background:rgba(0,0,0,.22)}
.pn{cursor:pointer}.pp{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${C.ok}}.pp.kein{color:${C.warn}}.pp.neu{color:${C.info}}
.crow{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:10px;background:rgba(0,0,0,.22)}.crow.off{opacity:.7}
.ch{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ch b{font-size:16px;margin-right:6px}
.cf{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-left:32px}
.cf .tx{text-transform:none;letter-spacing:.3px;max-width:420px;overflow:hidden;text-overflow:ellipsis}
.cf .seg .hk{height:26px;flex:none;padding:0 10px}
.pk1{display:flex;flex-direction:column;gap:12px}
.pkl{display:flex;flex-direction:column;gap:5px;overflow:auto;max-height:440px}
.pko{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:9px;background:rgba(0,0,0,.25);cursor:pointer;font-size:15px}
.pko small{margin-left:auto;color:#9a9fa8;font-size:12px}
.ck{width:18px;height:18px;border-radius:5px;background:#111214;box-shadow:inset 0 2px 4px #000}
.pko.on .ck{background:${C.ok};box-shadow:0 0 8px ${C.ok}}
.kbv{height:48px;border-radius:9px;padding:0 14px;display:flex;align-items:center;font:600 21px Rajdhani,'Segoe UI',sans-serif;color:#f0f1f3;background:linear-gradient(180deg,#111214,#1a1b1e);box-shadow:inset 0 2px 5px #000;white-space:pre;overflow:hidden}
.kbv i{width:2px;height:24px;margin-left:2px;background:${C.info};animation:bl 1s steps(1) infinite}.kbv small{margin-left:auto;font-size:11px;color:#979ca5}
.kbd{display:flex;flex-direction:column;gap:7px}.kbr{display:flex;gap:7px}
.kbr .hk{flex:1;height:44px;padding:0;font-size:18px;letter-spacing:0;text-transform:none;color:#d7d9de}
.kbr .hk.sp{flex:5}.kbr .hk.w2{flex:1.6;font-size:11px;letter-spacing:1.2px;text-transform:uppercase}
@media (max-width:760px){.main{grid-template-columns:1fr}.hrow{grid-template-columns:1fr}.mrow{grid-template-columns:1fr 1fr}.srow{grid-template-columns:26px 1fr;}.prow{grid-template-columns:1fr 1fr}}
`;

if (!customElements.get('home-twin-alarm-card')) customElements.define('home-twin-alarm-card', AlarmTile);
if (!customElements.get('home-twin-alarm-popup')) customElements.define('home-twin-alarm-popup', AlarmPopup);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'home-twin-alarm-card', name: 'Alarmanlage (Kachel)', description: 'Zustand der Alarmanlage, Tippen öffnet die Bedienung' },
  { type: 'home-twin-alarm-popup', name: 'Alarmanlage (Bedienung)', description: 'PIN, Modi, Verlauf, Verwaltung' });
console.info(`%c home-twin-alarm-card ${VERSION} `, 'background:#ff7a45;color:#000');
})();
