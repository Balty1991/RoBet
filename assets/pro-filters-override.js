window.proFilters = {
  minProb: 60,
  minEdge: 3,
  next24h: false,
};

function ensureProFilterControls() {
  const controlsGrid = document.querySelector('.controls-grid');
  if (!controlsGrid || controlsGrid.querySelector('[data-pro-filter="minProb"]')) return;

  const minProb = document.createElement('label');
  minProb.innerHTML = `
    <span>Min. probabilitate</span>
    <select data-pro-filter="minProb">
      <option value="0">Toate</option>
      <option value="55">55%+</option>
      <option value="60" selected>60%+</option>
      <option value="65">65%+</option>
      <option value="70">70%+</option>
    </select>
  `;

  const minEdge = document.createElement('label');
  minEdge.innerHTML = `
    <span>Min. edge</span>
    <select data-pro-filter="minEdge">
      <option value="0">Toate</option>
      <option value="3" selected>+3 pp</option>
      <option value="5">+5 pp</option>
      <option value="10">+10 pp</option>
      <option value="15">+15 pp</option>
    </select>
  `;

  const next24h = document.createElement('label');
  next24h.innerHTML = `
    <span>Time to kickoff</span>
    <select data-pro-filter="next24h">
      <option value="0" selected>Toate</option>
      <option value="1">Următoarele 24h</option>
    </select>
  `;

  controlsGrid.appendChild(minProb);
  controlsGrid.appendChild(minEdge);
  controlsGrid.appendChild(next24h);

  controlsGrid.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.dataset.proFilter === 'minProb') window.proFilters.minProb = Number(target.value);
    if (target.dataset.proFilter === 'minEdge') window.proFilters.minEdge = Number(target.value);
    if (target.dataset.proFilter === 'next24h') window.proFilters.next24h = target.value === '1';
    if (window.state?.filteredItems?.length) applyProFilters(window.state.filteredItems);
  });
}

function computeSmartScore(best) {
  if (!best) return 0;
  const evFactor = Math.max(0, (best.evPct ?? 0) + 5);
  const probabilityFactor = best.prob ?? 0;
  return (probabilityFactor * evFactor) / 10;
}

function applyProFilters(items) {
  const cards = [...document.querySelectorAll('.match-card')];
  const now = Date.now();

  const evaluations = cards.map((card, index) => {
    const item = items[index];
    if (!item) return { card, visible: false, smartScore: 0 };

    const prediction = item.prediction || {};
    const event = item.event_detail || prediction.event || {};
    const best = getAdvancedBestMarket(prediction, event, item.managers || {});
    const fairOdds = best?.prob ? 100 / best.prob : null;
    const edgePp = best?.odds && fairOdds ? best.prob - (100 / best.odds) : null;
    const kickoff = getKickoff(item) ? new Date(getKickoff(item)).getTime() : null;
    const within24h = kickoff != null ? kickoff <= now + (24 * 60 * 60 * 1000) : false;

    const visible = Boolean(
      best &&
      best.prob >= window.proFilters.minProb &&
      (edgePp == null || edgePp >= window.proFilters.minEdge) &&
      (!window.proFilters.next24h || within24h)
    );

    const smartScore = computeSmartScore(best);

    const tagsRow = card.querySelector('.tags-row');
    if (tagsRow && !tagsRow.querySelector('.tag-smart')) {
      const smartTag = document.createElement('span');
      smartTag.className = 'tag tag-muted tag-smart';
      smartTag.textContent = `Smart ${smartScore.toFixed(0)}`;
      tagsRow.appendChild(smartTag);
    } else if (tagsRow) {
      const smartTag = tagsRow.querySelector('.tag-smart');
      smartTag.textContent = `Smart ${smartScore.toFixed(0)}`;
    }

    return { card, visible, smartScore };
  });

  evaluations.sort((a, b) => b.smartScore - a.smartScore).forEach(({ card, visible }) => {
    card.style.display = visible ? '' : 'none';
    card.parentNode?.appendChild(card);
  });
}

const originalRenderMatchesPro = window.renderMatches;
if (typeof originalRenderMatchesPro === 'function') {
  window.renderMatches = function(items) {
    originalRenderMatchesPro(items);
    ensureProFilterControls();
    applyProFilters(items);
  };
}

setTimeout(() => {
  ensureProFilterControls();
  if (window.state?.filteredItems?.length) applyProFilters(window.state.filteredItems);
}, 0);
