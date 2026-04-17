import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const BASE_URL = "https://sports.bzzoiro.com/api";
const TIMEZONE = "Europe/Bucharest";
const API_KEY = process.env.BSD_API_KEY;

if (!API_KEY) {
  throw new Error("Lipsește BSD_API_KEY din environment.");
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiGet(url, attempt = 1) {
  const finalUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;
  const response = await fetch(finalUrl, {
    headers: {
      Authorization: `Token ${API_KEY}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    if (attempt < 3 && response.status >= 500) {
      await sleep(800 * attempt);
      return apiGet(url, attempt + 1);
    }

    const body = await response.text();
    throw new Error(`BSD API error ${response.status} la ${finalUrl}: ${body.slice(0, 400)}`);
  }

  return response.json();
}

async function fetchPaginated(startPath) {
  const all = [];
  let nextUrl = `${BASE_URL}${startPath}`;

  while (nextUrl) {
    const page = await apiGet(nextUrl);
    const results = Array.isArray(page.results) ? page.results : [];
    all.push(...results);
    nextUrl = page.next;
  }

  return all;
}

async function runBatches(items, batchSize, worker) {
  const results = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const slice = items.slice(index, index + batchSize);
    const chunk = await Promise.all(slice.map((item) => worker(item)));
    results.push(...chunk);
  }

  return results;
}

async function fetchManagerByTeamId(teamId) {
  if (!teamId) return null;

  try {
    const data = await apiGet(`/managers/?team_id=${teamId}`);
    return Array.isArray(data.results) && data.results.length ? data.results[0] : null;
  } catch (error) {
    console.warn(`Manager fetch failed for team ${teamId}:`, error.message);
    return null;
  }
}

async function enrichPrediction(prediction) {
  const eventId = prediction?.event?.id;

  if (!eventId) {
    return {
      event_id: null,
      prediction,
      event_detail: null,
      managers: { home: null, away: null },
    };
  }

  let eventDetail = null;
  try {
    eventDetail = await apiGet(`/events/${eventId}/?tz=${encodeURIComponent(TIMEZONE)}`);
  } catch (error) {
    console.warn(`Event detail fetch failed for event ${eventId}:`, error.message);
  }

  const homeTeamId = eventDetail?.home_team_obj?.id || prediction?.event?.home_team_obj?.id || null;
  const awayTeamId = eventDetail?.away_team_obj?.id || prediction?.event?.away_team_obj?.id || null;

  const [homeManager, awayManager] = await Promise.all([
    fetchManagerByTeamId(homeTeamId),
    fetchManagerByTeamId(awayTeamId),
  ]);

  return {
    event_id: eventId,
    prediction,
    event_detail: eventDetail,
    managers: {
      home: homeManager,
      away: awayManager,
    },
  };
}

function createSummary(items) {
  const countRecommend = (key) => items.filter((item) => Boolean(item?.prediction?.[key])).length;
  const confidenceValues = items
    .map((item) => Number(item?.prediction?.confidence))
    .filter((value) => Number.isFinite(value));

  const averageConfidence = confidenceValues.length
    ? confidenceValues.reduce((acc, value) => acc + value, 0) / confidenceValues.length
    : 0;

  const leagues = new Set(
    items
      .map((item) => {
        const league = item?.prediction?.event?.league || item?.event_detail?.league;
        return [league?.country, league?.name].filter(Boolean).join(" • ");
      })
      .filter(Boolean),
  );

  return {
    total_matches: items.length,
    total_leagues: leagues.size,
    average_confidence: averageConfidence,
    favorite_recommend: countRecommend("favorite_recommend"),
    over_15_recommend: countRecommend("over_15_recommend"),
    over_25_recommend: countRecommend("over_25_recommend"),
    over_35_recommend: countRecommend("over_35_recommend"),
    btts_recommend: countRecommend("btts_recommend"),
    winner_recommend: countRecommend("winner_recommend"),
  };
}

function sortByKickoff(items) {
  return [...items].sort((a, b) => {
    const left = new Date(a?.prediction?.event?.event_date || a?.event_detail?.event_date || 0).getTime();
    const right = new Date(b?.prediction?.event?.event_date || b?.event_detail?.event_date || 0).getTime();
    return left - right;
  });
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const predictions = await fetchPaginated(`/predictions/?tz=${encodeURIComponent(TIMEZONE)}`);
  const enriched = await runBatches(predictions, 6, enrichPrediction);
  const sortedItems = sortByKickoff(enriched);

  const feed = {
    generated_at: new Date().toISOString(),
    timezone: TIMEZONE,
    source: {
      api_base: `${BASE_URL}/`,
      predictions_endpoint: "/predictions/",
      event_detail_endpoint: "/events/{id}/",
      managers_endpoint: "/managers/?team_id={id}",
    },
    summary: createSummary(sortedItems),
    items: sortedItems,
  };

  await fs.writeFile(path.join(DATA_DIR, "feed.json"), JSON.stringify(feed, null, 2), "utf8");
  console.log(`Feed generated with ${sortedItems.length} matches.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
