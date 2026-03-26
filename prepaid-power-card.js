class PrepaidPowerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._ro = null;
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  connectedCallback() {
    // ResizeObserver: add/remove a data-wide attribute so CSS can react
    this._ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width ?? this.offsetWidth;
      const root = this.shadowRoot?.querySelector('.root');
      if (!root) return;
      root.dataset.wide  = w >= 600 ? 'true' : 'false';
      root.dataset.xwide = w >= 900 ? 'true' : 'false';
    });
    this._ro.observe(this);
  }

  disconnectedCallback() {
    this._ro?.disconnect();
  }

  getCardSize() { return 4; }

  _val(id, dec = 1) {
    const s = this._hass?.states[id];
    if (!s) return '—';
    const n = parseFloat(s.state);
    return isNaN(n) ? s.state : n.toFixed(dec);
  }
  _unit(id) { return this._hass?.states[id]?.attributes?.unit_of_measurement || ''; }

  _step(entity, dir) {
    const s = this._hass?.states[entity];
    if (!s) return;
    const cur  = parseFloat(s.state) || 0;
    const min  = parseFloat(s.attributes.min  ?? -Infinity);
    const max  = parseFloat(s.attributes.max  ?? Infinity);
    const step = parseFloat(s.attributes.step ?? 1);
    const next = Math.min(max, Math.max(min, Math.round((cur + dir * step) * 10000) / 10000));
    this._hass.callService('input_number', 'set_value', { entity_id: entity, value: next });
  }

  _arcPath(cx, cy, r, startDeg, endDeg) {
    const rad = d => (d - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(rad(startDeg));
    const y1 = cy + r * Math.sin(rad(startDeg));
    const x2 = cx + r * Math.cos(rad(endDeg));
    const y2 = cy + r * Math.sin(rad(endDeg));
    const large = (endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }

  _gauge(pct, color) {
    const clamped = Math.min(1, Math.max(0, pct));
    const sweep   = clamped * 260;
    const track   = this._arcPath(50, 55, 38, -130, 130);
    const fill    = sweep > 1 ? this._arcPath(50, 55, 38, -130, -130 + sweep) : null;
    return `<svg width="90" height="85" viewBox="0 0 100 90">
      <path d="${track}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="7" stroke-linecap="round"/>
      ${fill ? `<path d="${fill}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"
        style="filter:drop-shadow(0 0 6px ${color}80)"/>` : ''}
    </svg>`;
  }

  _render() {
    if (!this._hass) return;

    const E = {
      livePower:     'sensor.prepaid_grid_power',
      solarUsage:    'sensor.solar_usage_power',
      usedTotal:     'sensor.prepaid_used_total',
      usedToday:     'sensor.prepaid_grid_energy_daily',
      costPerMonth:  'sensor.estimated_grid_cost_per_month',
      usagePerMonth: 'sensor.estimated_grid_usage_per_month',
      costToday:     'sensor.prepaid_cost_today',
      costMonth:     'sensor.prepaid_cost_month',
      solarRevToday: 'sensor.solar_revenue_today',
      solarRevMonth: 'sensor.solar_revenue_month',
      remaining:     'sensor.prepaid_remaining',
      costPerKwh:    'input_number.prepaid_cost_per_kwh',
      topupKwh:      'input_number.prepaid_topup_kwh',
      applyTopup:    'input_button.prepaid_apply_topup',
      manualBalance: 'input_number.prepaid_balance_kwh',
      depleted:      'binary_sensor.prepaid_depleted',
    };

    const depleted    = this._hass.states[E.depleted]?.state === 'on';
    const remaining   = parseFloat(this._val(E.remaining, 1));
    const manBal      = parseFloat(this._val(E.manualBalance, 1));
    const refBal      = isNaN(manBal) || manBal <= 0 ? 500 : manBal;
    const pct         = isNaN(remaining) ? 0 : Math.max(0, Math.min(1, remaining / refBal));
    const gaugeCol    = depleted ? '#ff1744' : pct < 0.15 ? '#ff6b35' : '#00e676';
    const statusClass = depleted ? 'depleted' : pct < 0.15 ? 'warn' : 'ok';
    const statusText  = depleted ? '⚠ DEPLETED' : pct < 0.15 ? 'LOW BALANCE' : 'ACTIVE';

    const livePow  = parseFloat(this._val(E.livePower, 0));
    const solarPow = parseFloat(this._val(E.solarUsage, 0));
    const maxPow   = 5000;
    const powPct   = Math.min(1, Math.max(0, (isNaN(livePow)  ? 0 : livePow)  / maxPow));
    const solPct   = Math.min(1, Math.max(0, (isNaN(solarPow) ? 0 : solarPow) / maxPow));

    // Preserve existing wide state across re-renders
    const prevWide  = this.shadowRoot.querySelector('.root')?.dataset?.wide  ?? 'false';
    const prevXwide = this.shadowRoot.querySelector('.root')?.dataset?.xwide ?? 'false';

    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=DM+Sans:wght@300;400;500&display=swap');
        :host { display: block; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ─── TOKENS ─── */
        .root {
          --bg:     #0a0f1e;
          --surf:   #111827;
          --surf2:  #1a2235;
          --accent: #00e5ff;
          --orange: #ff6b35;
          --solar:  #ffd600;
          --green:  #00e676;
          --red:    #ff1744;
          --muted:  rgba(255,255,255,0.38);
          --gap:    12px;
          --radius: 14px;
          background: var(--bg);
          color: #fff;
          font-family: 'DM Sans', sans-serif;
          padding: 18px;
          border-radius: 20px;
        }

        /* ─── HEADER ─── */
        .header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
        .title {
          font-family:'Orbitron',monospace; font-weight:900; font-size:.95rem;
          letter-spacing:.12em; text-transform:uppercase; color:var(--accent);
          text-shadow:0 0 24px rgba(0,229,255,.5);
        }
        .badge { padding:3px 10px; border-radius:20px; font-size:.65rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; }
        .badge.ok       { background:rgba(0,230,118,.12); color:var(--green);  border:1px solid rgba(0,230,118,.3); }
        .badge.warn     { background:rgba(255,107,53,.12); color:var(--orange); border:1px solid rgba(255,107,53,.3); }
        .badge.depleted { background:rgba(255,23,68,.12);  color:var(--red);    border:1px solid rgba(255,23,68,.3); animation:blink 1.4s infinite; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.45} }

        /* ─── LAYOUT: narrow default (single column) ─── */
        .body { display:flex; flex-direction:column; gap:var(--gap); }

        /* Column A = live power + gauge + solar panel stacked */
        .col-a { display:flex; flex-direction:column; gap:var(--gap); }
        /* Column B = stats + controls stacked */
        .col-b { display:flex; flex-direction:column; gap:var(--gap); }

        /* ─── LAYOUT: wide (≥600px) — side-by-side columns ─── */
        .root[data-wide="true"] .body {
          flex-direction: row;
          align-items: stretch;
        }
        .root[data-wide="true"] .col-a { flex: 1.1; min-width: 0; }
        .root[data-wide="true"] .col-b { flex: 1;   min-width: 0; }

        /* ─── LAYOUT: extra-wide (≥900px) — stats become 4-col row ─── */
        .root[data-xwide="true"] .stats { grid-template-columns: repeat(5, 1fr); }
        .root[data-xwide="true"] .solar-panel { grid-template-columns: repeat(2, 1fr); }

        /* ─── HERO ─── */
        .hero {
          background:linear-gradient(135deg,var(--surf) 0%,var(--surf2) 100%);
          border:1px solid rgba(0,229,255,.13); border-radius:var(--radius);
          padding:16px 18px; display:flex; gap:12px; align-items:flex-start;
        }
        .power-col { flex:1; min-width:0; }
        .power-col + .power-col { border-left:1px solid rgba(255,255,255,.07); padding-left:12px; }
        .p-label { font-size:.6rem; color:var(--muted); letter-spacing:.13em; text-transform:uppercase; margin-bottom:4px; }
        .p-val { font-family:'Orbitron',monospace; font-size:2rem; font-weight:900; line-height:1; }
        .p-val.grid  { color:var(--accent); text-shadow:0 0 28px rgba(0,229,255,.4); }
        .p-val.solar { color:var(--solar);  text-shadow:0 0 28px rgba(255,214,0,.4); }
        .p-unit { font-size:.8rem; color:var(--muted); font-weight:300; margin-left:2px; }
        .bar-wrap { background:rgba(255,255,255,.06); border-radius:4px; height:5px; margin-top:8px; overflow:hidden; }
        .bar-fill { height:100%; border-radius:4px; transition:width .8s ease; }
        .bar-fill.grid  { background:linear-gradient(90deg,var(--accent),var(--solar)); box-shadow:0 0 8px rgba(0,229,255,.4); }
        .bar-fill.solar { background:linear-gradient(90deg,var(--solar),var(--orange)); box-shadow:0 0 8px rgba(255,214,0,.4); }

        /* ─── GAUGE ─── */
        .gauge-row {
          display:flex; align-items:center; gap:14px;
          background:var(--surf); border:1px solid rgba(255,255,255,.07);
          border-radius:var(--radius); padding:14px 16px;
        }
        .gauge-info { flex:1; min-width:0; }
        .g-val { font-family:'Orbitron',monospace; font-size:1.6rem; font-weight:700; line-height:1; }
        .g-label { font-size:.6rem; color:var(--muted); text-transform:uppercase; letter-spacing:.12em; margin-top:4px; }
        .g-sub { font-size:.72rem; color:rgba(255,255,255,.5); margin-top:5px; }
        .g-sub strong { color:rgba(255,255,255,.75); }

        /* ─── STATS ─── */
        .stats { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .stat {
          background:var(--surf); border:1px solid rgba(255,255,255,.07);
          border-radius:var(--radius); padding:12px 14px; position:relative; overflow:hidden;
        }
        .stat::before { content:''; position:absolute; top:0;left:0;right:0; height:2px; border-radius:2px 2px 0 0; }
        .stat.c-grid::before  { background:linear-gradient(90deg,var(--accent),transparent); }
        .stat.c-cost::before  { background:linear-gradient(90deg,var(--orange),transparent); }
        .stat-label { font-size:.6rem; color:var(--muted); text-transform:uppercase; letter-spacing:.1em; margin-bottom:4px; }
        .stat-val   { font-family:'Orbitron',monospace; font-size:1rem; font-weight:700; }
        .stat-unit  { font-size:.58rem; color:var(--muted); margin-left:2px; }

        /* ─── SOLAR PANEL ─── */
        .solar-panel {
          background:linear-gradient(135deg,rgba(255,214,0,.07),rgba(255,107,53,.05));
          border:1px solid rgba(255,214,0,.15); border-radius:var(--radius);
          padding:14px 16px; display:grid; grid-template-columns:1fr 1fr; gap:12px;
        }
        .sol-icon  { font-size:1.3rem; margin-bottom:3px; }
        .sol-label { font-size:.6rem; color:rgba(255,214,0,.6); text-transform:uppercase; letter-spacing:.1em; margin-bottom:3px; }
        .sol-val   { font-family:'Orbitron',monospace; font-size:1rem; font-weight:700; color:var(--solar); }

        /* ─── DIVIDER ─── */
        .divider { height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,.1),transparent); }

        /* ─── CONTROLS ─── */
        .ctrl-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .ctrl-title { font-size:.63rem; color:var(--muted); text-transform:uppercase; letter-spacing:.13em; }
        .rate-pill {
          display:inline-flex; align-items:center; gap:4px;
          background:rgba(255,107,53,.1); border:1px solid rgba(255,107,53,.25);
          border-radius:20px; padding:3px 9px; font-size:.65rem; color:var(--orange);
        }
        .ctrl-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
        .ctrl-label { font-size:.68rem; color:rgba(255,255,255,.55); width:100px; flex-shrink:0; }
        .ctrl-val {
          font-family:'Orbitron',monospace; font-size:.76rem; color:#fff;
          background:var(--surf2); border:1px solid rgba(255,255,255,.1);
          border-radius:8px; padding:5px 9px; flex:1; text-align:right; min-width:0;
        }
        .btn-grp { display:flex; gap:4px; }
        .btn {
          background:none; border:1px solid rgba(255,255,255,.14); border-radius:6px;
          color:rgba(255,255,255,.62); width:27px; height:27px; font-size:.95rem;
          cursor:pointer; display:flex; align-items:center; justify-content:center;
          transition:all .15s; line-height:1; flex-shrink:0;
        }
        .btn:hover  { border-color:var(--accent); color:var(--accent); background:rgba(0,229,255,.06); }
        .btn:active { transform:scale(.9); }
        .apply-btn {
          width:100%; margin-top:8px; padding:10px;
          background:linear-gradient(135deg,rgba(0,229,255,.13),rgba(0,229,255,.07));
          border:1px solid rgba(0,229,255,.28); border-radius:10px;
          color:var(--accent); font-family:'Orbitron',monospace;
          font-size:.68rem; font-weight:700; letter-spacing:.13em; text-transform:uppercase;
          cursor:pointer; transition:all .2s;
        }
        .apply-btn:hover   { background:linear-gradient(135deg,rgba(0,229,255,.22),rgba(0,229,255,.12)); box-shadow:0 0 18px rgba(0,229,255,.18); }
        .apply-btn:active  { transform:scale(.98); }
        .apply-btn.success { border-color:var(--green); color:var(--green); background:rgba(0,230,118,.1); }
      </style>

      <div class="root" data-wide="${prevWide}" data-xwide="${prevXwide}">

        <!-- HEADER -->
        <div class="header">
          <div class="title">⚡ Prepaid Power</div>
          <div class="badge ${statusClass}">${statusText}</div>
        </div>

        <!-- RESPONSIVE BODY -->
        <div class="body">

          <!-- COL A: live power + gauge + solar revenue -->
          <div class="col-a">

            <div class="hero">
              <div class="power-col">
                <div class="p-label">⚡ Live Grid Power</div>
                <div class="p-val grid">${isNaN(livePow) ? '—' : livePow.toFixed(0)}<span class="p-unit">W</span></div>
                <div class="bar-wrap"><div class="bar-fill grid" style="width:${(powPct*100).toFixed(1)}%"></div></div>
              </div>
              <div class="power-col">
                <div class="p-label">☀ Solar Usage</div>
                <div class="p-val solar">${isNaN(solarPow) ? '—' : solarPow.toFixed(0)}<span class="p-unit">W</span></div>
                <div class="bar-wrap"><div class="bar-fill solar" style="width:${(solPct*100).toFixed(1)}%"></div></div>
              </div>
            </div>

            <div class="gauge-row">
              ${this._gauge(pct, gaugeCol)}
              <div class="gauge-info">
                <div class="g-val" style="color:${gaugeCol}">${isNaN(remaining) ? '—' : remaining.toFixed(1)} <span style="font-size:.8rem;font-weight:400">${this._unit(E.remaining)}</span></div>
                <div class="g-label">Remaining Balance</div>
                <div class="g-sub">${(pct*100).toFixed(0)}% of ${refBal} ${this._unit(E.manualBalance) || 'kWh'}</div>
                <div class="g-sub">Used Total: <strong>${this._val(E.usedTotal,1)} ${this._unit(E.usedTotal)}</strong></div>
              </div>
            </div>

            <div class="solar-panel">
              <div>
                <div class="sol-icon">☀️</div>
                <div class="sol-label">Solar Revenue Today</div>
                <div class="sol-val">${this._val(E.solarRevToday,2)} ${this._unit(E.solarRevToday)}</div>
              </div>
              <div>
                <div class="sol-icon">📆</div>
                <div class="sol-label">Solar Revenue Month</div>
                <div class="sol-val">${this._val(E.solarRevMonth,2)} ${this._unit(E.solarRevMonth)}</div>
              </div>
            </div>

          </div><!-- /col-a -->

          <!-- COL B: stats + divider + controls -->
          <div class="col-b">

            <div class="stats">
              <div class="stat c-grid">
                <div class="stat-label">Used Today</div>
                <div class="stat-val">${this._val(E.usedToday,2)}<span class="stat-unit">${this._unit(E.usedToday)}</span></div>
              </div>
              <div class="stat c-grid">
                <div class="stat-label">Est. Monthly Use</div>
                <div class="stat-val">${this._val(E.usagePerMonth,1)}<span class="stat-unit">${this._unit(E.usagePerMonth)}</span></div>
              </div>
              <div class="stat c-cost">
                <div class="stat-label">Cost Today</div>
                <div class="stat-val">${this._val(E.costToday,2)}<span class="stat-unit">${this._unit(E.costToday)}</span></div>
              </div>
              <div class="stat c-cost">
                <div class="stat-label">Cost This Month</div>
                <div class="stat-val">${this._val(E.costMonth,2)}<span class="stat-unit">${this._unit(E.costMonth)}</span></div>
              </div>
              <div class="stat c-cost">
                <div class="stat-label">Est. Monthly Cost</div>
                <div class="stat-val">${this._val(E.costPerMonth,2)}<span class="stat-unit">${this._unit(E.costPerMonth)}</span></div>
              </div>
            </div>

            <div class="divider"></div>

            <div>
              <div class="ctrl-header">
                <div class="ctrl-title">Controls</div>
                <div class="rate-pill">⚡ ${this._val(E.costPerKwh,3)} ${this._unit(E.costPerKwh)}/kWh</div>
              </div>

              <div class="ctrl-row">
                <div class="ctrl-label">Cost / kWh</div>
                <div class="ctrl-val">${this._val(E.costPerKwh,3)}</div>
                <div class="btn-grp">
                  <button class="btn" id="cpk-dn">−</button>
                  <button class="btn" id="cpk-up">+</button>
                </div>
              </div>
              <div class="ctrl-row">
                <div class="ctrl-label">Manual Balance</div>
                <div class="ctrl-val">${this._val(E.manualBalance,1)} ${this._unit(E.manualBalance)}</div>
                <div class="btn-grp">
                  <button class="btn" id="mb-dn">−</button>
                  <button class="btn" id="mb-up">+</button>
                </div>
              </div>
              <div class="ctrl-row">
                <div class="ctrl-label">Top Up Amount</div>
                <div class="ctrl-val">${this._val(E.topupKwh,1)} ${this._unit(E.topupKwh)}</div>
                <div class="btn-grp">
                  <button class="btn" id="tu-dn">−</button>
                  <button class="btn" id="tu-up">+</button>
                </div>
              </div>

              <button class="apply-btn" id="apply-btn">▶ Apply Top-Up</button>
            </div>

          </div><!-- /col-b -->

        </div><!-- /body -->
      </div><!-- /root -->
    `;

    // Restore observer-driven width classes immediately after re-render
    const root = this.shadowRoot.querySelector('.root');
    const w    = this.offsetWidth;
    if (w > 0) {
      root.dataset.wide  = w >= 600 ? 'true' : 'false';
      root.dataset.xwide = w >= 900 ? 'true' : 'false';
    }

    // Wire buttons
    const q = id => this.shadowRoot.getElementById(id);
    q('cpk-up').onclick = () => this._step(E.costPerKwh,    1);
    q('cpk-dn').onclick = () => this._step(E.costPerKwh,   -1);
    q('mb-up') .onclick = () => this._step(E.manualBalance,  1);
    q('mb-dn') .onclick = () => this._step(E.manualBalance, -1);
    q('tu-up') .onclick = () => this._step(E.topupKwh,       1);
    q('tu-dn') .onclick = () => this._step(E.topupKwh,      -1);

    q('apply-btn').onclick = () => {
      this._hass.callService('input_button', 'press', { entity_id: E.applyTopup });
      const btn = q('apply-btn');
      btn.textContent = '✓ Applied!';
      btn.classList.add('success');
      setTimeout(() => { btn.textContent = '▶ Apply Top-Up'; btn.classList.remove('success'); }, 2000);
    };
  }
}

customElements.define('prepaid-power-card', PrepaidPowerCard);
