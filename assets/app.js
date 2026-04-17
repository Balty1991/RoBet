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

const percent = (value, digits = 1) => value == null || Number.isNaN(Number(value))
  ? "—"
  : `${Number(value).toFixed(digits)}%`;

const number = (value, digits = 2) => value == null || Number.isNaN(Number(value))
  ? "—"
  : Number(value).toFixed(digits);

const decimal = (value, digits = 2) => value == null || Number.isNaN(Number(value))
  ? "—"
  : Number(value).toFixed(digits);

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

function setStatus(message) {
  els.statusMessage.textContent = message;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getLeagueLabel(item) {
  const league = item?.prediction?.event?.league || item?.event_detail?.league;
  if (!league) return "";
  return [league.country, league.name].filter(Boolean).join(" • ");
}

function getKickoff(item) {
  return item?.prediction?.event?.event_date || item?.event_detail?.event_date || null;
}

function getConfidence(item) {
  const raw = toNumeric(item?.prediction?.confidence);
  if (raw == null) return 0;
  return raw <= 1 ? raw * 100 : raw;
}

function getHomeWin(item) {
  return Number(item?.prediction?.prob_home_win ?? 0);
}

function getOver25(item) {
  return Number(item?.prediction?.prob_over_25 ?? 0);
}

function getPredictedProbability(prediction) {
  const raw = String(prediction?.predicted_result || "").trim().toLowerCase();

  if (["1", "home", "home_win", "gazde", "h"].includes(raw)) return toNumeric(prediction?.prob_home_win);
  if (["x", "draw", "egal", "d"].includes(raw)) return toNumeric(prediction?.prob_draw);
  if (["2", "away", "away_win", "oaspeți", "oaspeti", "a"].includes(raw)) return toNumeric(prediction?.prob_away_win);

  const max1x2 = Math.max(
    toNumeric(prediction?.prob_home_win) ?? -Infinity,
    toNumeric(prediction?.prob_draw) ?? -Infinity,
    toNumeric(prediction?.prob_away_win) ?? -Infinity,
  );

  return Number.isFinite(max1x2) && max1x2 > -Infinity ? max1x2 : toNumeric(prediction?.favorite_prob);
}

function row(label, value, valueClass = "") {
  return `<div class="stat-row"><span>${escapeHtml(label)}</span><strong class="${escapeHtml(valueClass)}">${escapeHtml(value ?? "—")}</strong></div>`;
}

function miniCard(label, value, isTop = false) {
  return `
    <div class="mini-card ${isTop ? "top-choice" : ""}">
      <div class="mini-label">${escapeHtml(label)}</div>
      <div class="mini-value">${escapeHtml(percent(value))}</div>
    </div>
  `;
}

function recommendationTags(prediction) {
  const mapping = [
    [prediction.favorite_recommend, "Favorite"],
    [prediction.over_15_recommend, "Over 1.5"],
    [prediction.over_25_recommend, "Over 2.5"],
    [prediction.over_35_recommend, "Over 3.5"],
    [prediction.btts_recommend, "BTTS"],
    [prediction.winner_recommend, "Winner"],
  ];

  return mapping
    .filter(([active]) => Boolean(active))
    .map(([, label]) => `<span class="rec-tag">${escapeHtml(label)}</span>`)
    .join("") || `<span class="tag warn">Nicio recomandare automată</span>`;
}

function formRows(title, form) {
  if (!form) {
    return `
      <article class="form-block">
        <div class="form-title">${escapeHtml(title)}</div>
        <div class="form-row"><span>Date</span><strong>—</strong></div>
      </article>
    `;
  }

  return `
    <article class="form-block">
      <div class="form-title">${escapeHtml(title)}</div>
      ${row("Formă", form.form_string || "—")}
      ${row("Meciuri", form.matches_played)}
      ${row("W-D-L", `${form.wins ?? 0}-${form.draws ?? 0}-${form.losses ?? 0}`)}
      ${row("Puncte ultimele N", form.points_last_n)}
      ${row("Goluri marcate", form.goals_scored_last_n)}
      ${row("Goluri primite", form.goals_conceded_last_n)}
      ${row("xG mediu", number(form.avg_xg))}
      ${row("xG cedat", number(form.avg_xg_conceded))}
      ${row("Șuturi", number(form.avg_shots))}
      ${row("Pe poartă", number(form.avg_shots_on_target))}
      ${row("Pass accuracy", percent(form.avg_pass_accuracy))}
      ${row("Goal conversion", percent(form.goal_conversion_rate))}
    </article>
  `;
}

function managerRows(title, manager) {
  if (!manager) {
    return `
      <article class="manager-block">
        <div class="manager-title">${escapeHtml(title)}</div>
        <div class="manager-row"><span>Date</span><strong>—</strong></div>
      </article>
    `;
  }

  return `
    <article class="manager-block">
      <div class="manager-title">${escapeHtml(title)}</div>
      ${row("Manager", manager.name || "—")}
      ${row("Profil", manager.profile || "—")}
      ${row("Stil", manager.team_style || "—")}
      ${row("Formație", manager.preferred_formation || "—")}
      ${row("Meciuri", manager.matches_total)}
      ${row("Win %", percent(manager.win_pct))}
      ${row("xG for", number(manager.avg_xg_for))}
      ${row("xG against", number(manager.avg_xg_against))}
      ${row("BTTS %", percent(manager.btts_pct))}
      ${row("Over 2.5 %", percent(manager.over_25_pct))}
      ${row("Clean sheet %", percent(manager.clean_sheet_pct))}
      ${row("Fail to score %", percent(manager.fail_to_score_pct))}
    </article>
  `;
}

function computeMeta(items) {
  const summary = state.feed?.summary || {};
  const confidenceValues = items.map(getConfidence).filter((value) => Number.isFinite(value));
  const avgConfidence = confidenceValues.length
    ? confidenceValues.reduce((acc, value) => acc + value, 0) / confidenceValues.length
    : 0;

  return [
    { label: "Meciuri în feed", value: items.length },
    { label: "Ligi", value: new Set(items.map(getLeagueLabel).filter(Boolean)).size },
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
  const leagues = [...new Set(items.map(getLeagueLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ro"));

  els.leagueFilter.innerHTML = `<option value="">Toate ligile</option>${leagues
    .map((league) => `<option value="${escapeHtml(league)}">${escapeHtml(league)}</option>`)
    .join("")}`;
}

function renderMatches(items) {
  if (!items.length) {
    els.matchesGrid.innerHTML = `<div class="empty-state">Nu există meciuri după filtrele curente.</div>`;
    return;
  }

  els.matchesGrid.innerHTML = items.map((item, index) => {
    const prediction = item.prediction || {};
    const event = item.event_detail || prediction.event || {};
    const h2h = event.head_to_head;
    const homeManager = item.managers?.home || null;
    const awayManager = item.managers?.away || null;
    const confidencePct = getConfidence(item);
    const predictedProbability = getPredictedProbability(prediction);
    const prob1X = sumProbabilities(prediction.prob_home_win, prediction.prob_draw);
    const probX2 = sumProbabilities(prediction.prob_away_win, prediction.prob_draw);
    const prob12 = sumProbabilities(prediction.prob_home_win, prediction.prob_away_win);
    const under15 = underFromOver(prediction.prob_over_15);
    const under25 = underFromOver(prediction.prob_over_25);
    const under35 = underFromOver(prediction.prob_over_35);
    const bttsNo = underFromOver(prediction.prob_btts_yes);
    const resultTagClass = confidencePct >= 70 ? "" : confidencePct >= 55 ? "warn" : "danger";
    const tabBase = `match-${item.event_id || prediction.id || index}`;

    const top1X2 = Math.max(...[prediction.prob_home_win, prediction.prob_draw, prediction.prob_away_win].map((value) => toNumeric(value) ?? -Infinity));
    const topDouble = Math.max(...[prob1X, probX2, prob12].map((value) => toNumeric(value) ?? -Infinity));
    const overMax = Math.max(...[prediction.prob_over_15, prediction.prob_over_25, prediction.prob_over_35].map((value) => toNumeric(value) ?? -Infinity));
    const underMax = Math.max(...[under35, under25, under15].map((value) => toNumeric(value) ?? -Infinity));
    const bttsMax = Math.max(...[prediction.prob_btts_yes, bttsNo].map((value) => toNumeric(value) ?? -Infinity));

    const marketOptions = [
      { label: "1", value: toNumeric(prediction.prob_home_win) },
      { label: "X", value: toNumeric(prediction.prob_draw) },
      { label: "2", value: toNumeric(prediction.prob_away_win) },
      { label: "1X", value: toNumeric(prob1X) },
      { label: "X2", value: toNumeric(probX2) },
      { label: "12", value: toNumeric(prob12) },
      { label: "Over 1.5", value: toNumeric(prediction.prob_over_15) },
      { label: "Over 2.5", value: toNumeric(prediction.prob_over_25) },
      { label: "Over 3.5", value: toNumeric(prediction.prob_over_35) },
      { label: "Under 3.5", value: toNumeric(under35) },
      { label: "Under 2.5", value: toNumeric(under25) },
      { label: "Under 1.5", value: toNumeric(under15) },
      { label: "BTTS yes", value: toNumeric(prediction.prob_btts_yes) },
      { label: "BTTS no", value: toNumeric(bttsNo) },
    ].filter((itemOption) => itemOption.value != null);

    const bestMarket = marketOptions.sort((a, b) => b.value - a.value)[0] || null;

    return `
      <article class="match-card">
        <div class="card-top">
          <div>
            <span class="league-badge">${escapeHtml(getLeagueLabel(item) || "Ligă")}</span>
          </div>
          <div class="kickoff">
            <div>${escapeHtml(formatDate(getKickoff(item)))}</div>
            <div>Status: ${escapeHtml(event.status || prediction.event?.status || "notstarted")}</div>
          </div>
        </div>

        <div>
          <div class="teams">${escapeHtml(prediction.event?.home_team || event.home_team || "Gazde")} vs ${escapeHtml(prediction.event?.away_team || event.away_team || "Oaspeți")}</div>
          <div class="scoreline">Scor probabil: ${escapeHtml(prediction.most_likely_score || "—")} • Rezultat prezis: ${escapeHtml(prediction.predicted_result || "—")}</div>
        </div>

        <div class="tags-row">
          <span class="tag ${resultTagClass}">Confidence model ${escapeHtml(number(confidencePct, 1))}%</span>
          <span class="tag">Prob. rezultat ${escapeHtml(percent(predictedProbability))}</span>
          <span class="tag">Favorite: ${escapeHtml(prediction.favorite || "—")}</span>
          <span class="tag">Model ${escapeHtml(prediction.model_version || "—")}</span>
        </div>

        <div class="top-pick">
          <span class="top-pick-label">Pronostic recomandat</span>
          <strong class="top-pick-value">${escapeHtml(bestMarket ? `${bestMarket.label} • ${number(bestMarket.value, 1)}%` : "—")}</strong>
        </div>

        <div class="mini-grid">
          ${miniCard("1", prediction.prob_home_win, toNumeric(prediction.prob_home_win) === top1X2)}
          ${miniCard("X", prediction.prob_draw, toNumeric(prediction.prob_draw) === top1X2)}
          ${miniCard("2", prediction.prob_away_win, toNumeric(prediction.prob_away_win) === top1X2)}
          ${miniCard("1X", prob1X, toNumeric(prob1X) === topDouble)}
          ${miniCard("X2", probX2, toNumeric(probX2) === topDouble)}
          ${miniCard("12", prob12, toNumeric(prob12) === topDouble)}
        </div>

        <div class="tabbed-block">
          <div class="card-tabs" role="tablist" aria-label="Detalii meci">
            <button class="card-tab is-active" type="button" data-tab-target="${tabBase}-pred">Predicții</button>
            <button class="card-tab" type="button" data-tab-target="${tabBase}-event">Cote & meci</button>
          </div>

          <div class="tab-panel is-active" data-tab-panel="${tabBase}-pred">
            <article class="stat-block">
              <div class="stat-title">Predicții model</div>
              <div class="subgroup-label">xG echipe</div>
              ${row("xG gazde", number(prediction.expected_home_goals))}
              ${row("xG oaspeți", number(prediction.expected_away_goals))}

              <div class="subgroup-label">Over</div>
              ${row("Over 1.5", percent(prediction.prob_over_15), toNumeric(prediction.prob_over_15) === overMax ? "prob-top" : "")}
              ${row("Over 2.5", percent(prediction.prob_over_25), toNumeric(prediction.prob_over_25) === overMax ? "prob-top" : "")}
              ${row("Over 3.5", percent(prediction.prob_over_35), toNumeric(prediction.prob_over_35) === overMax ? "prob-top" : "")}

              <div class="subgroup-label">Under</div>
              ${row("Under 3.5", percent(under35), toNumeric(under35) === underMax ? "prob-top" : "")}
              ${row("Under 2.5", percent(under25), toNumeric(under25) === underMax ? "prob-top" : "")}
              ${row("Under 1.5", percent(under15), toNumeric(under15) === underMax ? "prob-top" : "")}

              <div class="subgroup-label">BTTS</div>
              ${row("BTTS yes", percent(prediction.prob_btts_yes), toNumeric(prediction.prob_btts_yes) === bttsMax ? "prob-top" : "")}
              ${row("BTTS no", percent(bttsNo), toNumeric(bttsNo) === bttsMax ? "prob-top" : "")}
            </article>
          </div>

          <div class="tab-panel" data-tab-panel="${tabBase}-event">
            <article class="stat-block">
              <div class="stat-title">Statistici meci / cote din event</div>
              ${row("xG actual gazde", number(event.actual_home_xg))}
              ${row("xG actual oaspeți", number(event.actual_away_xg))}
              ${row("xG live gazde", number(event.home_xg_live))}
              ${row("xG live oaspeți", number(event.away_xg_live))}
              ${row("Odd home", decimal(event.odds_home))}
              ${row("Odd draw", decimal(event.odds_draw))}
              ${row("Odd away", decimal(event.odds_away))}
              ${row("Odd over 2.5", decimal(event.odds_over_25))}
              ${row("Odd under 2.5", decimal(event.odds_under_25))}
              ${row("Odd BTTS yes", decimal(event.odds_btts_yes))}
            </article>
          </div>
        </div>

        <div class="rec-row">
          ${recommendationTags(prediction)}
        </div>

        <details>
          <summary>Formă, H2H și manageri</summary>
          <div class="details-content">
            <div class="form-grid">
              ${formRows(`Formă gazde • ${event.home_team || prediction.event?.home_team || ""}`, event.home_form)}
              ${formRows(`Formă oaspeți • ${event.away_team || prediction.event?.away_team || ""}`, event.away_form)}
            </div>

            <article class="stat-block">
              <div class="stat-title">Head-to-head</div>
              ${row("Meciuri totale", h2h?.total_matches)}
              ${row("Victorii gazde", h2h?.home_wins)}
              ${row("Egaluri", h2h?.draws)}
              ${row("Victorii oaspeți", h2h?.away_wins)}
              ${row("Goluri gazde", h2h?.home_goals)}
              ${row("Goluri oaspeți", h2h?.away_goals)}
              ${row("Goluri totale medie", number(h2h?.avg_total_goals))}
              ${row("Home win rate", percent(h2h?.home_win_rate))}
              ${row("Away win rate", percent(h2h?.away_win_rate))}
            </article>

            <div class="manager-grid">
              ${managerRows(`Manager gazde • ${event.home_team || prediction.event?.home_team || ""}`, homeManager)}
              ${managerRows(`Manager oaspeți • ${event.away_team || prediction.event?.away_team || ""}`, awayManager)}
            </div>
          </div>
        </details>
      </article>
    `;
  }).join("");
}

function applyFilters() {
  const items = [...(state.feed?.items ?? [])];
  const query = state.search.trim().toLowerCase();

  const filtered = items.filter((item) => {
    const haystack = [
      item?.prediction?.event?.home_team,
      item?.prediction?.event?.away_team,
      item?.event_detail?.home_team,
      item?.event_detail?.away_team,
      getLeagueLabel(item),
    ].filter(Boolean).join(" ").toLowerCase();

    const leagueOk = !state.league || getLeagueLabel(item) === state.league;
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
        return getHomeWin(b) - getHomeWin(a);
      case "over25Desc":
        return getOver25(b) - getOver25(a);
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
  const button = event.target.closest(".card-tab");
  if (!button) return;

  const wrapper = button.closest(".tabbed-block");
  if (!wrapper) return;

  const target = button.dataset.tabTarget;

  wrapper.querySelectorAll(".card-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab === button);
  });

  wrapper.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.tabPanel === target);
  });
});

loadFeed();