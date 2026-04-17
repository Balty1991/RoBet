const state = {
  feed: null,
  filteredItems: [],
  search: "",
  league: "",
  sort: "dateAsc",
};

const els = {
  metaGrid: document.getElementById("metaGrid"),
  searchInput: document.getElementById("searchInput"),
  leagueFilter: document.getElementById("leagueFilter"),
  sortSelect: document.getElementById("sortSelect"),
  matchesGrid: document.getElementById("matchesGrid"),
  statusMessage: document.getElementById("statusMessage"),
  refreshButton: document.getElementById("refreshButton"),
};

const percent = (value, digits = 1) => value == null || Number.isNaN(Number(value)) ? "—" : `${Number(value).toFixed(digits)}%`;
const number = (value, digits = 2) => value == null || Number.isNaN(Number(value)) ? "—" : Number(value).toFixed(digits);
const decimal = (value, digits = 2) => value == null || Number.isNaN(Number(value)) ? "—" : Number(value).toFixed(digits);

const toNumeric = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const underFromOver = (value) => {
  const numeric = toNumeric(value);
  return numeric == null ? null : 100 - numeric;
};

const sumProbabilities = (...values) => {
  const parsed = values.map(toNumeric);
  return parsed.some((value) => value == null) ? null : parsed.reduce((acc, value) => acc + value, 0);
};

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ro-RO", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Bucharest",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message) {
  els.statusMessage.textContent = message;
}

function row(label, value, valueClass = "") {
  return `<div class="stat-row"><span>${escapeHtml(label)}</span><strong class="${escapeHtml(valueClass)}">${escapeHtml(value ?? "—")}</strong></div>`;
}

function getLeague(item) {
  return item?.prediction?.event?.league || item?.event_detail?.league || {};
}

function getKickoff(item) {
  return item?.prediction?.event?.event_date || item?.event_detail?.event_date || null;
}

function getConfidence(item) {
  const raw = toNumeric(item?.prediction?.confidence);
  if (raw == null) return 0;
  return raw <= 1 ? raw * 100 : raw;
}

function getPredictedProbability(prediction) {
  const raw = String(prediction?.predicted_result || "").trim().toLowerCase();
  if (["1", "home", "home_win", "gazde", "h"].includes(raw)) return toNumeric(prediction?.prob_home_win);
  if (["x", "draw", "egal", "d"].includes(raw)) return toNumeric(prediction?.prob_draw);
  if (["2", "away", "away_win", "oaspeți", "oaspeti", "a"].includes(raw)) return toNumeric(prediction?.prob_away_win);
  return Math.max(
    toNumeric(prediction?.prob_home_win) ?? -Infinity,
    toNumeric(prediction?.prob_draw) ?? -Infinity,
    toNumeric(prediction?.prob_away_win) ?? -Infinity,
  );
}

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
  ].filter((option) => option.prob != null);

  options.sort((a, b) => b.prob - a.prob);
  const best = options[0] || null;
  if (!best) return null;
  return {
    ...best,
    evPct: best.odds != null ? ((best.prob / 100) * best.odds - 1) * 100 : null,
  };
}

function getEvClasses(evPct) {
  if (evPct == null) {
    return {
      cardClass: "ev-mid",
      pillClass: "neutral",
      valueText: "—",
      fillColor: "linear-gradient(90deg, var(--yellow), var(--orange))",
    };
  }
  if (evPct >= 8) {
    return {
      cardClass: "ev-high",
      pillClass: "",
      valueText: `${evPct >= 0 ? "+" : ""}${number(evPct, 0)}%`,
      fillColor: "linear-gradient(90deg, var(--green), #00d4ff)",
    };
  }
  if (evPct >= 0) {
    return {
      cardClass: "ev-mid",
      pillClass: "neutral",
      valueText: `${evPct >= 0 ? "+" : ""}${number(evPct, 0)}%`,
      fillColor: "linear-gradient(90deg, var(--yellow), var(--orange))",
    };
  }
  return {
    cardClass: "ev-low",
    pillClass: "negative",
    valueText: `${number(evPct, 0)}%`,
    fillColor: "linear-gradient(90deg, var(--red), var(--orange))",
  };
}

function recommendationTags(prediction) {
  const tags = [];
  if (prediction.favorite_recommend) tags.push('<span class="tag tag-blue">Favorite ✓</span>');
  if (prediction.over_15_recommend) tags.push('<span class="tag tag-green">Over 1.5 ✓</span>');
  if (prediction.over_25_recommend) tags.push('<span class="tag tag-green">Over 2.5 ✓</span>');
  if (prediction.over_35_recommend) tags.push('<span class="tag tag-yellow">Over 3.5 ✓</span>');
  if (prediction.btts_recommend) tags.push('<span class="tag tag-green">BTTS ✓</span>');
  if (prediction.winner_recommend) tags.push('<span class="tag tag-yellow">Winner ✓</span>');
  tags.push(`<span class="tag tag-muted">Model ${escapeHtml(prediction.model_version || "—")}</span>`);
  return tags.join("");
}

function formBlock(title, form) {
  if (!form) {
    return `<div class="stat-block"><div class="stat-block-title">${escapeHtml(title)}</div>${row("Date", "—")}</div>`;
  }
  return `
    <div class="stat-block">
      <div class="stat-block-title">${escapeHtml(title)}</div>
      ${row("Formă", form.form_string || "—")}
      ${row("W-D-L", `${form.wins ?? 0}-${form.draws ?? 0}-${form.losses ?? 0}`)}
      ${row("xG mediu", number(form.avg_xg), "hi")}
      ${row("Goluri marcate", form.goals_scored_last_n)}
    </div>
  `;
}

function predictionBlock(prediction, derived) {
  const overMax = Math.max(...[prediction.prob_over_15, prediction.prob_over_25, prediction.prob_over_35].map((value) => toNumeric(value) ?? -Infinity));
  const underMax = Math.max(...[derived.under35, derived.under25, derived.under15].map((value) => toNumeric(value) ?? -Infinity));
  const bttsMax = Math.max(...[prediction.prob_btts_yes, derived.bttsNo].map((value) => toNumeric(value) ?? -Infinity));
  return `
    <div class="stat-block">
      <div class="stat-block-title">Predicții model</div>
      ${row("xG gazde", number(prediction.expected_home_goals))}
      ${row("xG oaspeți", number(prediction.expected_away_goals))}
      ${row("Over 1.5", percent(prediction.prob_over_15), toNumeric(prediction.prob_over_15) === overMax ? "hi" : "")}
      ${row("Over 2.5", percent(prediction.prob_over_25), toNumeric(prediction.prob_over_25) === overMax ? "hi" : "")}
      ${row("Over 3.5", percent(prediction.prob_over_35), toNumeric(prediction.prob_over_35) === overMax ? "hi" : "")}
      ${row("Under 3.5", percent(derived.under35), toNumeric(derived.under35) === underMax ? "hi" : "")}
      ${row("Under 2.5", percent(derived.under25), toNumeric(derived.under25) === underMax ? "hi" : "")}
      ${row("Under 1.5", percent(derived.under15), toNumeric(derived.under15) === underMax ? "hi" : "")}
      ${row("BTTS yes", percent(prediction.prob_btts_yes), toNumeric(prediction.prob_btts_yes) === bttsMax ? "hi" : "")}
      ${row("BTTS no", percent(derived.bttsNo), toNumeric(derived.bttsNo) === bttsMax ? "hi" : "")}
    </div>
  `;
}

function eventBlock(event) {
  return `
    <div class="stat-block">
      <div class="stat-block-title">Cote & meci</div>
      ${row("Odd home", decimal(event.odds_home))}
      ${row("Odd draw", decimal(event.odds_draw))}
      ${row("Odd away", decimal(event.odds_away))}
      ${row("Odd over 2.5", decimal(event.odds_over_25))}
      ${row("Odd under 2.5", decimal(event.odds_under_25))}
      ${row("Odd BTTS yes", decimal(event.odds_btts_yes))}
    </div>
  `;
}

function h2hBlock(h2h) {
  return `
    <div class="stat-block">
      <div class="stat-block-title">Head to Head</div>
      ${row("Meciuri", h2h?.total_matches)}
      ${row("Victorii gazde", h2h?.home_wins)}
      ${row("Egaluri", h2h?.draws)}
      ${row("Victorii oaspeți", h2h?.away_wins)}
      ${row("Goluri / meci", number(h2h?.avg_total_goals), "hi")}
    </div>
  `;
}

function managerBlock(event, homeManager, awayManager) {
  return `
    <div class="stat-block">
      <div class="stat-block-title">Manageri</div>
      ${row(event.home_team || "Gazde", homeManager?.name || "—")}
      ${row("Win % gazde", percent(homeManager?.win_pct), (homeManager?.win_pct ?? 0) > (awayManager?.win_pct ?? 0) ? "hi" : "")}
      ${row(event.away_team || "Oaspeți", awayManager?.name || "—")}
      ${row("Win % oaspeți", percent(awayManager?.win_pct), (awayManager?.win_pct ?? 0) > (homeManager?.win_pct ?? 0) ? "hi" : "")}
    </div>
  `;
}

function computeMeta(items) {
  const summary = state.feed?.summary || {};
  const confidenceValues = items.map(getConfidence).filter((value) => Number.isFinite(value));
  const avgConfidence = confidenceValues.length ? confidenceValues.reduce((acc, value) => acc + value, 0) / confidenceValues.length : 0;
  return [
    { label: "Meciuri în feed", value: items.length },
    { label: "Ligi", value: new Set(items.map((item) => getLeague(item).name).filter(Boolean)).size },
    { label: "Confidence model medie", value: `${number(avgConfidence, 1)}%` },
    { label: "Winner recommend", value: summary.winner_recommend ?? 0 },
    { label: "Over 2.5 recommend", value: summary.over_25_recommend ?? 0 },
    { label: "BTTS recommend", value: summary.btts_recommend ?? 0 },
  ];
}

function renderMeta(items) {
  els.metaGrid.innerHTML = computeMeta(items)
    .map((item) => `
      <article class="meta-item">
        <span class="meta-label">${escapeHtml(item.label)}</span>
        <strong class="meta-value">${escapeHtml(item.value)}</strong>
      </article>
    `)
    .join("");
}

function hydrateLeagueOptions() {
  const items = state.feed?.items ?? [];
  const leagues = [...new Set(items.map((item) => {
    const league = getLeague(item);
    return [league.country, league.name].filter(Boolean).join(" • ");
  }).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ro"));

  els.leagueFilter.innerHTML = `<option value="">Toate ligile</option>${leagues.map((league) => `<option value="${escapeHtml(league)}">${escapeHtml(league)}</option>`).join("")}`;
}

function renderMatches(items) {
  if (!items.length) {
    els.matchesGrid.innerHTML = `<div class="empty-state">Nu există meciuri după filtrele curente.</div>`;
    return;
  }

  els.matchesGrid.innerHTML = items.map((item, index) => {
    const prediction = item.prediction || {};
    const event = item.event_detail || prediction.event || {};
    const league = getLeague(item);
    const confidencePct = getConfidence(item);
    const prob1X = sumProbabilities(prediction.prob_home_win, prediction.prob_draw);
    const probX2 = sumProbabilities(prediction.prob_away_win, prediction.prob_draw);
    const prob12 = sumProbabilities(prediction.prob_home_win, prediction.prob_away_win);
    const derived = {
      prob1X,
      probX2,
      prob12,
      under15: underFromOver(prediction.prob_over_15),
      under25: underFromOver(prediction.prob_over_25),
      under35: underFromOver(prediction.prob_over_35),
      bttsNo: underFromOver(prediction.prob_btts_yes),
    };
    const bestMarket = getBestMarket(prediction, event, derived);
    const evVisual = getEvClasses(bestMarket?.evPct ?? null);
    const top1X2 = Math.max(...[prediction.prob_home_win, prediction.prob_draw, prediction.prob_away_win].map((value) => toNumeric(value) ?? -Infinity));
    const topDouble = Math.max(...[prob1X, probX2, prob12].map((value) => toNumeric(value) ?? -Infinity));
    const cardId = `match-${item.event_id || prediction.id || index}`;

    return `
      <article class="match-card ${evVisual.cardClass}" id="${cardId}">
        <div class="card-header">
          <div class="league-row">
            <div class="league-dot"></div>
            <span class="league-name">${escapeHtml(league.country || "")}${league.country && league.name ? " · " : ""}${escapeHtml(league.name || "Ligă")}</span>
          </div>
          <span class="kickoff-badge"><strong>${escapeHtml(formatDate(getKickoff(item)))}</strong></span>
        </div>

        <div class="teams-block">
          <span class="team-name">${escapeHtml(prediction.event?.home_team || event.home_team || "Gazde")}</span>
          <span class="vs-sep">vs</span>
          <span class="team-name away">${escapeHtml(prediction.event?.away_team || event.away_team || "Oaspeți")}</span>
        </div>

        <div class="hero-row">
          <div>
            <div class="pick-label">Pronostic recomandat</div>
            <div class="pick-value">${escapeHtml(bestMarket?.label || prediction.predicted_result || "—")}</div>
            <div class="pick-prob">Prob. <strong>${escapeHtml(percent(bestMarket?.prob ?? getPredictedProbability(prediction)))}</strong> · Cotă <strong>${escapeHtml(bestMarket?.odds != null ? decimal(bestMarket.odds) : "—")}</strong></div>
          </div>
          <div class="ev-pill ${evVisual.pillClass}">
            <div class="ev-pill-label">EV</div>
            <div class="ev-pill-value">${escapeHtml(evVisual.valueText)}</div>
          </div>
        </div>

        <div class="markets-strip">
          <div class="mkt ${toNumeric(prediction.prob_home_win) === top1X2 ? "top" : ""}"><span class="mkt-label">1</span><span class="mkt-val">${escapeHtml(percent(prediction.prob_home_win))}</span></div>
          <div class="mkt ${toNumeric(prediction.prob_draw) === top1X2 ? "top" : ""}"><span class="mkt-label">X</span><span class="mkt-val">${escapeHtml(percent(prediction.prob_draw))}</span></div>
          <div class="mkt ${toNumeric(prediction.prob_away_win) === top1X2 ? "top" : ""}"><span class="mkt-label">2</span><span class="mkt-val">${escapeHtml(percent(prediction.prob_away_win))}</span></div>
          <div class="mkt ${toNumeric(prob1X) === topDouble ? "top" : ""}"><span class="mkt-label">1X</span><span class="mkt-val">${escapeHtml(percent(prob1X))}</span></div>
          <div class="mkt ${toNumeric(probX2) === topDouble ? "top" : ""}"><span class="mkt-label">X2</span><span class="mkt-val">${escapeHtml(percent(probX2))}</span></div>
          <div class="mkt ${toNumeric(prob12) === topDouble ? "top" : ""}"><span class="mkt-label">12</span><span class="mkt-val">${escapeHtml(percent(prob12))}</span></div>
        </div>

        <div class="tags-row">${recommendationTags(prediction)}</div>

        <div class="conf-row">
          <div class="conf-header">
            <span class="conf-label">Confidence model</span>
            <span class="conf-pct" style="color:${confidencePct >= 70 ? 'var(--green)' : confidencePct >= 55 ? 'var(--yellow)' : 'var(--red)'}">${escapeHtml(percent(confidencePct))}</span>
          </div>
          <div class="conf-track">
            <div class="conf-fill" style="width:${Math.max(0, Math.min(confidencePct, 100))}%; background:${evVisual.fillColor}"></div>
          </div>
        </div>

        <div class="card-expand">
          <button class="expand-btn" type="button" data-expand-id="${cardId}">
            <span>Formă · H2H · Manageri · Predicții</span>
            <span class="expand-icon">▾</span>
          </button>
          <div class="expand-body">
            <div class="stats-grid">
              ${predictionBlock(prediction, derived)}
              ${eventBlock(event)}
              ${formBlock(`Formă ${event.home_team || prediction.event?.home_team || 'Gazde'}`, event.home_form)}
              ${formBlock(`Formă ${event.away_team || prediction.event?.away_team || 'Oaspeți'}`, event.away_form)}
              ${h2hBlock(event.head_to_head)}
              ${managerBlock(event, item.managers?.home || null, item.managers?.away || null)}
            </div>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function applyFilters() {
  const items = [...(state.feed?.items ?? [])];
  const query = state.search.trim().toLowerCase();

  const filtered = items.filter((item) => {
    const leagueText = [getLeague(item).country, getLeague(item).name].filter(Boolean).join(" ");
    const haystack = [
      item?.prediction?.event?.home_team,
      item?.prediction?.event?.away_team,
      item?.event_detail?.home_team,
      item?.event_detail?.away_team,
      leagueText,
    ].filter(Boolean).join(" ").toLowerCase();

    const leagueValue = [getLeague(item).country, getLeague(item).name].filter(Boolean).join(" • ");
    const leagueOk = !state.league || leagueValue === state.league;
    const searchOk = !query || haystack.includes(query);
    return leagueOk && searchOk;
  });

  filtered.sort((a, b) => {
    switch (state.sort) {
      case "dateDesc":
        return new Date(getKickoff(b) || 0) - new Date(getKickoff(a) || 0);
      case "confidenceDesc":
        return getConfidence(b) - getConfidence(a);
      case "homeWinDesc":
        return Number(b?.prediction?.prob_home_win ?? 0) - Number(a?.prediction?.prob_home_win ?? 0);
      case "over25Desc":
        return Number(b?.prediction?.prob_over_25 ?? 0) - Number(a?.prediction?.prob_over_25 ?? 0);
      default:
        return new Date(getKickoff(a) || 0) - new Date(getKickoff(b) || 0);
    }
  });

  state.filteredItems = filtered;
  renderMeta(filtered);
  renderMatches(filtered);
}

async function loadFeed() {
  setStatus("Se descarcă feed-ul local generat de workflow...");
  try {
    const response = await fetch(`./data/feed.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Nu s-a putut citi data/feed.json (${response.status}).`);

    state.feed = await response.json();
    hydrateLeagueOptions();
    applyFilters();

    const generatedAt = state.feed?.generated_at ? formatDate(state.feed.generated_at) : "necunoscut";
    setStatus(`Feed încărcat. Ultima actualizare: ${generatedAt}.`);
  } catch (error) {
    console.error(error);
    state.feed = null;
    els.metaGrid.innerHTML = "";
    els.matchesGrid.innerHTML = `<div class="empty-state">${error.message}</div>`;
    setStatus("Eroare la încărcarea feed-ului. Verifică dacă workflow-ul a generat fișierul JSON.");
  }
}

els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  applyFilters();
});

els.leagueFilter.addEventListener("change", (event) => {
  state.league = event.target.value;
  applyFilters();
});

els.sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  applyFilters();
});

els.refreshButton.addEventListener("click", loadFeed);

els.matchesGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".expand-btn");
  if (!button) return;
  const card = button.closest(".match-card");
  if (!card) return;
  card.classList.toggle("expanded");
});

loadFeed();
