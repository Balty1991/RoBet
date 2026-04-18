function buildScoreDistribution(homeXg, awayXg, maxGoals = 5) {
  const scores = [];
  for (let h = 0; h <= maxGoals; h += 1) {
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = poissonPMF(homeXg, h) * poissonPMF(awayXg, a);
      scores.push({ score: `${h}-${a}`, home: h, away: a, prob: p * 100 });
    }
  }
  scores.sort((a, b) => b.prob - a.prob);
  return scores;
}

function sumGoalRange(lambda, minGoals, maxGoals) {
  let total = 0;
  for (let g = minGoals; g <= maxGoals; g += 1) total += poissonPMF(lambda, g);
  return total * 100;
}

function appendPoissonDetails(items) {
  const cards = document.querySelectorAll('.match-card');
  cards.forEach((card, index) => {
    const item = items[index];
    if (!item) return;
    const grid = card.querySelector('.expand-body .stats-grid');
    if (!grid || grid.querySelector('.poisson-block')) return;

    const prediction = item.prediction || {};
    const event = item.event_detail || prediction.event || {};
    const adjusted = blendXg(prediction, event);
    const scores = buildScoreDistribution(adjusted.home, adjusted.away, 5);
    const top3 = scores.slice(0, 3);
    const homeRange = sumGoalRange(adjusted.home, 1, 3);
    const awayRange = sumGoalRange(adjusted.away, 1, 3);
    const bttsPoisson = buildPoissonProbabilities(adjusted.home, adjusted.away).prob_btts_yes;

    const top1 = top3[0];
    const topRest = top3.slice(1).map((entry) => `${entry.score} (${entry.prob.toFixed(1)}%)`).join(', ');

    const block = document.createElement('div');
    block.className = 'stat-block poisson-block';
    block.innerHTML = `
      <div class="stat-block-title">Distribuție Poisson</div>
      <div class="stat-row"><span>Scor cel mai probabil</span><strong>${top1 ? `${top1.score} (${top1.prob.toFixed(1)}%)` : '—'}</strong></div>
      <div class="stat-row"><span>Top 3 scoruri</span><strong>${topRest || '—'}</strong></div>
      <div class="stat-row"><span>Gazde 1-3 goluri</span><strong class="hi">${homeRange.toFixed(1)}%</strong></div>
      <div class="stat-row"><span>Oaspeți 1-3 goluri</span><strong class="hi">${awayRange.toFixed(1)}%</strong></div>
      <div class="stat-row"><span>Ambele înscriu 1+</span><strong>${bttsPoisson.toFixed(1)}%</strong></div>
    `;

    grid.appendChild(block);
  });
}

const originalRenderMatchesPoisson = window.renderMatches;
if (typeof originalRenderMatchesPoisson === 'function') {
  window.renderMatches = function(items) {
    originalRenderMatchesPoisson(items);
    appendPoissonDetails(items);
  };
}

setTimeout(() => {
  if (window.state?.filteredItems?.length) appendPoissonDetails(window.state.filteredItems);
}, 0);
