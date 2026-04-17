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

async function loadFeed() {
  setStatus("Se descarcă feed-ul local generat de workflow...");
  try {
    const response = await fetch(`./data/feed.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Nu s-a putut citi data/feed.json (${response.status}).`);
    }

    state.feed = await response.json();
    hydrateLeagueOptions();
    applyFilters();

    const generatedAt = state.feed?.generated_at
      ? formatDate(state.feed.generated_at)
      : "necunoscut";

    setStatus(`Feed încărcat. Ultima actualizare: ${generatedAt}.`);
  } catch (error) {
    console.error(error);
    state.feed = null;
    els.metaGrid.innerHTML = "";
    els.matchesGrid.innerHTML = `<div class="empty-state">${error.message}</div>`;
    setStatus("Eroare la încărcarea feed-ului. Verifică dacă workflow-ul a generat fișierul JSON.");
  }
}

function hydrateLeagueOptions() {
  const items = state.feed?.items ?? [];
  const leagues = [...new Set(items.map((item) => getLeagueLabel(item)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ro"));

  els.leagueFilter.innerHTML = `<option value="">Toate ligile</option>${leagues
    .map((league) => `<option value="${escapeHtml(league)}">${escapeHtml(league)}</option>`)
    .join("")}`;
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
  return Number(item?.prediction?.confidence ?? 0);
}

function getHomeWin(item) {
  return Number(item?.prediction?.prob_home_win ?? 0);
}

function getOver25(item) {
  return Number(item?.prediction?.prob_over_25 ?? 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function computeMeta(items) {
  const summary = state.feed?.summary || {};
  const avgConfidence = items.length
    ? items.reduce((acc, item) => acc + getConfidence(item), 0) / items.length
    : 0;

  return [
    { label: "Meciuri în feed", value: items.length },
    { label: "Ligi", value: new Set(items.map(getLeagueLabel).filter(Boolean)).size },
    { label: "Confidence medie", value: `${number(avgConfidence * 100, 1)}%` },
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

function applyFilters() {
  const items = [...(state.feed?.items ?? [])];
  const query = state.search.trim().toLowerCase();

  let filtered = items.filter((item) => {
    const haystack = [
      item?.prediction?.event?.home_team,
      item?.prediction?.event?.away_team,
      item?.event_detail?.home_team,
      item?.event_detail?.away_team,
      getLeagueLabel(item),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

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
      case "dateAsc":
      default:
        return new Date(getKickoff(a) || 0) - new Date(getKickoff(b) || 0);
    }
  });

  state.filteredItems = filtered;
  renderMeta(filtered);
  renderMatches(filtered);
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
      ${row("Defensive efficiency", percent(form.defensive_efficiency))}
      ${row("Duel win rate", percent(form.duel_win_rate))}
      ${row("Aerial win rate", percent(form.aerial_win_rate))}
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
      ${row("Formație preferată", manager.preferred_formation || "—")}
      ${row("Meciuri", manager.matches_total)}
      ${row("Win %", percent(manager.win_pct))}
      ${row("Goluri marcate", number(manager.avg_goals_scored))}
      ${row("Goluri primite", number(manager.avg_goals_conceded))}
      ${row("xG for", number(manager.avg_xg_for))}
      ${row("xG against", number(manager.avg_xg_against))}
      ${row("BTTS %", percent(manager.btts_pct))}
      ${row("Over 2.5 %", percent(manager.over_25_pct))}
      ${row("Clean sheet %", percent(manager.clean_sheet_pct))}
      ${row("Fail to score %", percent(manager.fail_to_score_pct))}
    </article>
  `;
}

function row(label, value) {
  return `<div class="stat-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "—")}</strong></div>`;
}

function recommendationTags(prediction) {
  const mapping = [
    [prediction.favorite_recommend, "Favorite"],
    [prediction.over_15_recommend, "Over 1.5"],
    [prediction.over_25_recommend, "Over 2.5"],
    [prediction.over_35_recommend, "Over 3.5"],
    [prediction.btts_recommend, "BTTS"],
    [prediction.winner_recommend, "Winner (no draw)"],
  ];

  return mapping
    .filter(([active]) => Boolean(active))
    .map(([, label]) => `<span class="rec-tag">${escapeHtml(label)}</span>`)
    .join("") || `<span class="tag warn">Fără recommendation flag</span>`;
}

function renderMatches(items) {
  if (!items.length) {
    els.matchesGrid.innerHTML = `<div class="empty-state">Nu există meciuri după filtrele curente.</div>`;
    return;
  }

  els.matchesGrid.innerHTML = items.map((item) => {
    const prediction = item.prediction || {};
    const event = item.event_detail || prediction.event || {};
    const h2h = event.head_to_head;
    const homeManager = item.managers?.home || null;
    const awayManager = item.managers?.away || null;
    const confidencePct = getConfidence(item) * 100;

    const resultTagClass = confidencePct >= 70 ? "" : confidencePct >= 55 ? "warn" : "danger";

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
          <span class="tag ${resultTagClass}">Confidence ${escapeHtml(number(confidencePct, 1))}%</span>
          <span class="tag">Favorite: ${escapeHtml(prediction.favorite || "—")}</span>
          <span class="tag">Prob. favorite: ${escapeHtml(percent(prediction.favorite_prob))}</span>
          <span class="tag">Model ${escapeHtml(prediction.model_version || "—")}</span>
        </div>

        <div class="mini-grid">
          <div class="mini-card">
            <div class="mini-label">Home win</div>
            <div class="mini-value">${escapeHtml(percent(prediction.prob_home_win))}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Draw</div>
            <div class="mini-value">${escapeHtml(percent(prediction.prob_draw))}</div>
          </div>
          <div class="mini-card">
            <div class="mini-label">Away win</div>
            <div class="mini-value">${escapeHtml(percent(prediction.prob_away_win))}</div>
          </div>
        </div>

        <div class="stats-grid">
          <article class="stat-block">
            <div class="stat-title">Expected goals din prediction</div>
            ${row("xG gazde", number(prediction.expected_home_goals))}
            ${row("xG oaspeți", number(prediction.expected_away_goals))}
            ${row("Over 1.5", percent(prediction.prob_over_15))}
            ${row("Over 2.5", percent(prediction.prob_over_25))}
            ${row("Over 3.5", percent(prediction.prob_over_35))}
            ${row("BTTS yes", percent(prediction.prob_btts_yes))}
          </article>

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

els.refreshButton.addEventListener("click", () => {
  loadFeed();
});

loadFeed();
