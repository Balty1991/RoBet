function buildDerivedMarkets(prediction) {
  return {
    prob1X: sumProbabilities(prediction.prob_home_win, prediction.prob_draw),
    probX2: sumProbabilities(prediction.prob_away_win, prediction.prob_draw),
    prob12: sumProbabilities(prediction.prob_home_win, prediction.prob_away_win),
    under15: underFromOver(prediction.prob_over_15),
    under25: underFromOver(prediction.prob_over_25),
    under35: underFromOver(prediction.prob_over_35),
    bttsNo: underFromOver(prediction.prob_btts_yes),
  };
}

function enhanceRenderedCards(items) {
  const cards = document.querySelectorAll('.match-card');
  cards.forEach((card, index) => {
    const item = items[index];
    if (!item) return;

    const prediction = item.prediction || {};
    const event = item.event_detail || prediction.event || {};
    const derived = buildDerivedMarkets(prediction);
    const best = getBestMarket(prediction, event, derived);
    if (!best || !best.prob) return;

    const host = card.querySelector('.hero-row > div:first-child');
    if (!host || host.querySelector('.pick-prob-extra')) return;

    const fairOdds = 100 / best.prob;
    const bookProb = best.odds ? 100 / best.odds : null;
    const edgePp = bookProb != null ? best.prob - bookProb : null;

    const extra = document.createElement('div');
    extra.className = 'pick-prob pick-prob-extra';

    if (edgePp != null) {
      extra.innerHTML = `Fair <strong>${fairOdds.toFixed(2)}</strong> · Edge <strong>${edgePp >= 0 ? '+' : ''}${edgePp.toFixed(1)} pp</strong>`;
    } else {
      extra.innerHTML = `Fair <strong>${fairOdds.toFixed(2)}</strong>`;
    }

    host.appendChild(extra);
  });
}

const originalRenderMatchesValue = window.renderMatches;
if (typeof originalRenderMatchesValue === 'function') {
  window.renderMatches = function(items) {
    originalRenderMatchesValue(items);
    enhanceRenderedCards(items);
  };
}

setTimeout(() => {
  if (window.state?.filteredItems?.length) {
    enhanceRenderedCards(window.state.filteredItems);
  }
}, 0);
