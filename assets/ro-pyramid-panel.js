function roPoissonPmf(lambda, k) {
  let factorial = 1;
  for (let i = 2; i <= k; i += 1) factorial *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial;
}

function roFairOdds(probDecimal) {
  return probDecimal > 0 ? 1 / probDecimal : null;
}

function ensureROPyramidPanel() {
  if (document.getElementById('roPyramidPanel')) return;
  const statusPanel = document.querySelector('.status-panel');
  if (!statusPanel) return;

  const section = document.createElement('section');
  section.id = 'roPyramidPanel';
  section.className = 'panel';
  section.innerHTML = `
    <div class="meta-grid" style="margin-bottom:12px;">
      <article class="meta-item">
        <span class="meta-label">RO Pyramid</span>
        <strong class="meta-value">Panou vizual</strong>
      </article>
      <article class="meta-item">
        <span class="meta-label">Miză bază</span>
        <input id="rp-base-stake" type="number" min="10" step="10" value="100" style="margin-top:6px;" />
      </article>
      <article class="meta-item">
        <span class="meta-label">Zile max</span>
        <input id="rp-max-days" type="number" min="2" max="10" step="1" value="5" style="margin-top:6px;" />
      </article>
      <article class="meta-item">
        <span class="meta-label">Acțiune</span>
        <button id="rp-generate" class="primary-btn" type="button" style="margin-top:6px; width:100%;">Generează bilet</button>
      </article>
    </div>
    <div id="rp-note" class="status-message">Folosește feed-ul actual. Pentru piețele fără cotă directă, panoul folosește cotă implicită din probabilitate.</div>
    <div id="rp-output" style="margin-top:12px;"></div>
  `;

  statusPanel.after(section);
  section.querySelector('#rp-generate').addEventListener('click', generateROPyramidTicket);
}

function mapFeedItemToROPyramid(item) {
  const prediction = item.prediction || {};
  const event = item.event_detail || prediction.event || {};
  const home = prediction.event?.home_team || event.home_team || 'Gazde';
  const away = prediction.event?.away_team || event.away_team || 'Oaspeți';
  const league = prediction.event?.league?.name || event.league?.name || 'League';
  const kickoff = prediction.event?.event_date || event.event_date || null;
  const kickoffDate = kickoff ? new Date(kickoff) : new Date();
  const date = kickoffDate.toISOString().split('T')[0];
  const time = `${String(kickoffDate.getHours()).padStart(2, '0')}:${String(kickoffDate.getMinutes()).padStart(2, '0')}`;

  const xgHome = Number(prediction.expected_home_goals || 0);
  const xgAway = Number(prediction.expected_away_goals || 0);
  const probPlus05Home = 1 - Math.exp(-xgHome);
  let probUnder45Away = 0;
  for (let g = 0; g <= 4; g += 1) probUnder45Away += roPoissonPmf(xgAway, g);
  const prob1x = ((Number(prediction.prob_home_win || 0) + Number(prediction.prob_draw || 0)) / 100);
  const probOver05HT = 1 - Math.exp(-((xgHome + xgAway) * 0.45));
  const probBttsNo = 1 - ((Number(prediction.prob_btts_yes || 0)) / 100);

  return {
    id: item.event_id || prediction.id || Math.random().toString(36).slice(2),
    home,
    away,
    league,
    date,
    time,
    status: 'scheduled',
    oddsAvailable: true,
    prob_plus05_home: probPlus05Home,
    odds_plus05_home: event.odds_over_05_home || roFairOdds(probPlus05Home),
    prob_under45_away: probUnder45Away,
    odds_under45_away: event.odds_under_45_away || roFairOdds(probUnder45Away),
    prob_1x: prob1x,
    odds_1x: event.odds_1x || roFairOdds(prob1x),
    prob_over05_ht: probOver05HT,
    odds_over05_ht: event.odds_over_05_ht || roFairOdds(probOver05HT),
    prob_btts_no: probBttsNo,
    odds_btts_no: event.odds_btts_no || roFairOdds(probBttsNo),
    xg_home: xgHome,
    xg_away: xgAway,
  };
}

function generateROPyramidTicket() {
  const output = document.getElementById('rp-output');
  const baseStake = Number(document.getElementById('rp-base-stake')?.value || 100);
  const maxDays = Number(document.getElementById('rp-max-days')?.value || 5);
  const items = window.state?.feed?.items || [];

  if (!window.ROPyramidSystem) {
    output.innerHTML = '<div class="empty-state">RO Pyramid System nu este încărcat.</div>';
    return;
  }

  const mappedMatches = items.map(mapFeedItemToROPyramid);
  const system = new window.ROPyramidSystem({ baseStake, maxDays });
  const result = system.generateDailyTicket(mappedMatches);

  if (result.status !== 'GENERATED') {
    output.innerHTML = `<div class="empty-state">${result.message || 'Nu s-a putut genera biletul.'}</div>`;
    return;
  }

  const ticket = result.ticket;
  output.innerHTML = `
    <div class="meta-grid" style="margin-bottom:12px;">
      <article class="meta-item"><span class="meta-label">Tip bilet</span><strong class="meta-value">${ticket.type}</strong></article>
      <article class="meta-item"><span class="meta-label">Cotă totală</span><strong class="meta-value">${ticket.totalOdds}</strong></article>
      <article class="meta-item"><span class="meta-label">Prob. combinată</span><strong class="meta-value">${ticket.combinedProbability}%</strong></article>
      <article class="meta-item"><span class="meta-label">Miză</span><strong class="meta-value">${ticket.stakeInfo.stake} RON</strong></article>
    </div>
    <div class="stats-grid">
      <div class="stat-block">
        <div class="stat-block-title">Selecții</div>
        ${ticket.selections.map((sel, idx) => `
          <div class="stat-row"><span>${idx + 1}. ${sel.match} — ${sel.type}</span><strong>${(sel.probability * 100).toFixed(1)}%</strong></div>
        `).join('')}
      </div>
      <div class="stat-block">
        <div class="stat-block-title">Management miză</div>
        <div class="stat-row"><span>Tip</span><strong>${ticket.stakeInfo.type}</strong></div>
        <div class="stat-row"><span>Descriere</span><strong>${ticket.stakeInfo.description}</strong></div>
        <div class="stat-row"><span>EV estimat</span><strong class="hi">${ticket.expectedValue > 0 ? '+' : ''}${ticket.expectedValue}%</strong></div>
        <div class="stat-row"><span>Siguranță</span><strong>${ticket.safetyRating}</strong></div>
      </div>
    </div>
  `;
}

const originalLoadFeedPyramidPanel = window.loadFeed;
if (typeof originalLoadFeedPyramidPanel === 'function') {
  window.loadFeed = async function() {
    await originalLoadFeedPyramidPanel();
    ensureROPyramidPanel();
  };
}

setTimeout(() => ensureROPyramidPanel(), 0);
