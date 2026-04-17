function poissonPMF(lambda, k) {
  if (lambda == null || lambda < 0) return 0;
  let factorial = 1;
  for (let i = 2; i <= k; i += 1) factorial *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial;
}

function buildPoissonProbabilities(homeXg, awayXg, maxGoals = 7) {
  const homeDist = [];
  const awayDist = [];

  for (let i = 0; i <= maxGoals; i += 1) {
    homeDist.push(poissonPMF(homeXg, i));
    awayDist.push(poissonPMF(awayXg, i));
  }

  const probs = {
    home: 0,
    draw: 0,
    away: 0,
    over15: 0,
    over25: 0,
    over35: 0,
    bttsYes: 0,
  };

  for (let h = 0; h <= maxGoals; h += 1) {
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = homeDist[h] * awayDist[a];
      if (h > a) probs.home += p;
      else if (h === a) probs.draw += p;
      else probs.away += p;

      if (h + a >= 2) probs.over15 += p;
      if (h + a >= 3) probs.over25 += p;
      if (h + a >= 4) probs.over35 += p;
      if (h > 0 && a > 0) probs.bttsYes += p;
    }
  }

  return {
    prob_home_win: probs.home * 100,
    prob_draw: probs.draw * 100,
    prob_away_win: probs.away * 100,
    prob_over_15: probs.over15 * 100,
    prob_over_25: probs.over25 * 100,
    prob_over_35: probs.over35 * 100,
    prob_btts_yes: probs.bttsYes * 100,
  };
}

function clampProb(value) {
  return Math.max(1, Math.min(99, value));
}

function blendXg(prediction, event) {
  const hxg = toNumeric(prediction.expected_home_goals) ?? 0;
  const axg = toNumeric(prediction.expected_away_goals) ?? 0;
  const homeFormXg = toNumeric(event.home_form?.avg_xg) ?? hxg;
  const awayFormXg = toNumeric(event.away_form?.avg_xg) ?? axg;
  const homeOppConcede = toNumeric(event.away_form?.avg_xg_conceded) ?? axg;
  const awayOppConcede = toNumeric(event.home_form?.avg_xg_conceded) ?? hxg;

  return {
    home: hxg * 0.5 + homeFormXg * 0.25 + homeOppConcede * 0.25,
    away: axg * 0.5 + awayFormXg * 0.25 + awayOppConcede * 0.25,
  };
}

function consensus(modelProb, poissonProb) {
  const a = toNumeric(modelProb);
  const b = toNumeric(poissonProb);
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return (a + b) / 2;
}

function applyGoalOverlays(label, baseProb, event, homeManager, awayManager) {
  let prob = toNumeric(baseProb);
  if (prob == null) return null;

  const avgH2HGoals = toNumeric(event.head_to_head?.avg_total_goals);
  if (avgH2HGoals != null) {
    if (label.startsWith('Over')) {
      if (avgH2HGoals < 2.0) prob -= 6;
      else if (avgH2HGoals > 3.0) prob += 4;
    }
    if (label.startsWith('Under')) {
      if (avgH2HGoals < 2.0) prob += 4;
      else if (avgH2HGoals > 3.0) prob -= 4;
    }
  }

  const hmOver = toNumeric(homeManager?.over_25_pct);
  const amOver = toNumeric(awayManager?.over_25_pct);
  if (label === 'Over 2.5' && hmOver != null && amOver != null && hmOver > 60 && amOver > 60) prob += 4;
  if (label === 'Under 2.5' && hmOver != null && amOver != null && hmOver > 60 && amOver > 60) prob -= 4;

  return clampProb(prob);
}

function getAdvancedBestMarket(prediction, event, managers) {
  const adjustedXg = blendXg(prediction, event);
  const poisson = buildPoissonProbabilities(adjustedXg.home, adjustedXg.away);

  const model = {
    prob_home_win: toNumeric(prediction.prob_home_win),
    prob_draw: toNumeric(prediction.prob_draw),
    prob_away_win: toNumeric(prediction.prob_away_win),
    prob_over_15: toNumeric(prediction.prob_over_15),
    prob_over_25: toNumeric(prediction.prob_over_25),
    prob_over_35: toNumeric(prediction.prob_over_35),
    prob_btts_yes: toNumeric(prediction.prob_btts_yes),
  };

  const baseMarkets = [
    {
      label: '1',
      prob: consensus(model.prob_home_win, poisson.prob_home_win),
      odds: toNumeric(event.odds_home),
    },
    {
      label: 'X',
      prob: consensus(model.prob_draw, poisson.prob_draw),
      odds: toNumeric(event.odds_draw),
    },
    {
      label: '2',
      prob: consensus(model.prob_away_win, poisson.prob_away_win),
      odds: toNumeric(event.odds_away),
    },
    {
      label: 'Over 1.5',
      prob: applyGoalOverlays('Over 1.5', consensus(model.prob_over_15, poisson.prob_over_15), event, managers.home, managers.away),
      odds: toNumeric(event.odds_over_15),
    },
    {
      label: 'Over 2.5',
      prob: applyGoalOverlays('Over 2.5', consensus(model.prob_over_25, poisson.prob_over_25), event, managers.home, managers.away),
      odds: toNumeric(event.odds_over_25),
    },
    {
      label: 'Over 3.5',
      prob: applyGoalOverlays('Over 3.5', consensus(model.prob_over_35, poisson.prob_over_35), event, managers.home, managers.away),
      odds: toNumeric(event.odds_over_35),
    },
    {
      label: 'Under 3.5',
      prob: applyGoalOverlays('Under 3.5', 100 - consensus(model.prob_over_35, poisson.prob_over_35), event, managers.home, managers.away),
      odds: toNumeric(event.odds_under_35),
    },
    {
      label: 'Under 2.5',
      prob: applyGoalOverlays('Under 2.5', 100 - consensus(model.prob_over_25, poisson.prob_over_25), event, managers.home, managers.away),
      odds: toNumeric(event.odds_under_25),
    },
    {
      label: 'Under 1.5',
      prob: applyGoalOverlays('Under 1.5', 100 - consensus(model.prob_over_15, poisson.prob_over_15), event, managers.home, managers.away),
      odds: toNumeric(event.odds_under_15),
    },
    {
      label: 'BTTS yes',
      prob: consensus(model.prob_btts_yes, poisson.prob_btts_yes),
      odds: toNumeric(event.odds_btts_yes),
    },
    {
      label: 'BTTS no',
      prob: 100 - consensus(model.prob_btts_yes, poisson.prob_btts_yes),
      odds: toNumeric(event.odds_btts_no),
    },
  ]
    .filter((option) => option.prob != null)
    .map((option) => ({
      ...option,
      prob: clampProb(option.prob),
      evPct: option.odds != null ? ((option.prob / 100) * option.odds - 1) * 100 : null,
    }));

  const candidates = baseMarkets
    .filter((option) => option.odds != null && option.evPct != null)
    .map((option) => {
      const clippedEv = Math.max(-15, Math.min(25, option.evPct));
      const hybridScore = option.prob * 0.72 + clippedEv * 1.35 + (option.evPct > 0 ? 8 : -10);
      return { ...option, hybridScore };
    });

  if (candidates.length) {
    candidates.sort((a, b) => b.hybridScore - a.hybridScore);
    return candidates[0];
  }

  baseMarkets.sort((a, b) => b.prob - a.prob);
  return baseMarkets[0] || null;
}

function overrideCardRecommendation(items) {
  const cards = document.querySelectorAll('.match-card');
  cards.forEach((card, index) => {
    const item = items[index];
    if (!item) return;

    const prediction = item.prediction || {};
    const event = item.event_detail || prediction.event || {};
    const best = getAdvancedBestMarket(prediction, event, item.managers || {});
    if (!best) return;

    const pickValue = card.querySelector('.pick-value');
    const pickProb = card.querySelector('.pick-prob');
    const evPill = card.querySelector('.ev-pill-value');
    if (!pickValue || !pickProb || !evPill) return;

    pickValue.textContent = best.label;
    pickProb.innerHTML = `Prob. <strong>${best.prob.toFixed(1)}%</strong> · Cotă <strong>${best.odds != null ? best.odds.toFixed(2) : '—'}</strong>`;
    evPill.textContent = best.evPct != null ? `${best.evPct >= 0 ? '+' : ''}${best.evPct.toFixed(0)}%` : '—';
  });
}

const originalRenderMatchesAdvanced = window.renderMatches;
if (typeof originalRenderMatchesAdvanced === 'function') {
  window.renderMatches = function(items) {
    originalRenderMatchesAdvanced(items);
    overrideCardRecommendation(items);
  };
}

setTimeout(() => {
  if (window.state?.filteredItems?.length) {
    overrideCardRecommendation(window.state.filteredItems);
  }
}, 0);
