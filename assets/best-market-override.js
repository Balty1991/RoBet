function getBestMarket(prediction, event, derived) {
  const options = [
    { label: "1", prob: toNumeric(prediction.prob_home_win), odds: toNumeric(event.odds_home) },
    { label: "X", prob: toNumeric(prediction.prob_draw), odds: toNumeric(event.odds_draw) },
    { label: "2", prob: toNumeric(prediction.prob_away_win), odds: toNumeric(event.odds_away) },
    { label: "1X", prob: toNumeric(derived.prob1X), odds: null },
    { label: "X2", prob: toNumeric(derived.probX2), odds: null },
    { label: "12", prob: toNumeric(derived.prob12), odds: null },
    { label: "Over 1.5", prob: toNumeric(prediction.prob_over_15), odds: toNumeric(event.odds_over_15) },
    { label: "Over 2.5", prob: toNumeric(prediction.prob_over_25), odds: toNumeric(event.odds_over_25) },
    { label: "Over 3.5", prob: toNumeric(prediction.prob_over_35), odds: toNumeric(event.odds_over_35) },
    { label: "Under 3.5", prob: toNumeric(derived.under35), odds: toNumeric(event.odds_under_35) },
    { label: "Under 2.5", prob: toNumeric(derived.under25), odds: toNumeric(event.odds_under_25) },
    { label: "Under 1.5", prob: toNumeric(derived.under15), odds: toNumeric(event.odds_under_15) },
    { label: "BTTS yes", prob: toNumeric(prediction.prob_btts_yes), odds: toNumeric(event.odds_btts_yes) },
    { label: "BTTS no", prob: toNumeric(derived.bttsNo), odds: toNumeric(event.odds_btts_no) },
  ]
    .filter((option) => option.prob != null)
    .map((option) => ({
      ...option,
      evPct: option.odds != null ? ((option.prob / 100) * option.odds - 1) * 100 : null,
    }));

  const pricedOptions = options
    .filter((option) => option.odds != null && option.evPct != null)
    .map((option) => {
      const clippedEv = Math.max(-15, Math.min(20, option.evPct));
      let hybridScore = option.prob * 0.72 + clippedEv * 1.35;
      if (option.evPct < 0) hybridScore -= 10;
      return { ...option, hybridScore };
    });

  if (pricedOptions.length) {
    pricedOptions.sort((a, b) => b.hybridScore - a.hybridScore);
    return pricedOptions[0];
  }

  options.sort((a, b) => b.prob - a.prob);
  return options[0] || null;
}
