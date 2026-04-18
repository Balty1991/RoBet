class ROPyramidSystem {
  constructor(config = {}) {
    this.config = {
      baseStake: config.baseStake || 100,
      currency: config.currency || 'RON',
      maxDays: config.maxDays || 5,
      targetOddsMin: config.targetOddsMin || 1.40,
      targetOddsMax: config.targetOddsMax || 1.70,
      profitLockAfterDay: config.profitLockAfterDay || 3,
      profitLockPercent: config.profitLockPercent || 0.30,
      stopLossPercent: config.stopLossPercent || 0.50,
      reinvestPercent: config.reinvestPercent || 0.50,
      minIndividualProb: config.minIndividualProb || 0.88,
      thresholds: {
        plus05Home: config.thresholds?.plus05Home || 0.94,
        under45Away: config.thresholds?.under45Away || 0.92,
        doubleChance1X: config.thresholds?.doubleChance1X || 0.90,
        over05HT: config.thresholds?.over05HT || 0.88,
        bttsNo: config.thresholds?.bttsNo || 0.87,
      },
    };

    this.state = {
      currentDay: 1,
      currentStreak: 0,
      bankroll: this.config.baseStake,
      initialBankroll: this.config.baseStake,
      totalProfit: 0,
      totalWithdrawn: 0,
      history: [],
      isActive: false,
      todayTicket: null,
    };
  }

  filterTodayMatches(allMatches) {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    return allMatches.filter((match) => {
      const matchDate = new Date(`${match.date}T${match.time}`);
      const hoursUntilKickoff = (matchDate - now) / (1000 * 60 * 60);
      return match.date === today && hoursUntilKickoff > 1 && match.status === 'scheduled' && match.oddsAvailable === true;
    }).sort((a, b) => this.calculateSafetyScore(b) - this.calculateSafetyScore(a));
  }

  calculateSafetyScore(match) {
    let score = 0;
    if ((match.prob_1x || 0) > 0.90) score += 30;
    if ((match.prob_plus05_home || 0) > 0.94) score += 25;
    if ((match.prob_under45_away || 0) > 0.92) score += 20;
    if ((match.prob_over05_ht || 0) > 0.88) score += 15;
    if (match.xg_home > 0 && match.xg_away > 0) score += 10;

    const topLeagues = ['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'];
    if (topLeagues.includes(match.league)) score += 5;
    return score;
  }

  generateSafePredictions(matches) {
    const predictions = [];
    const t = this.config.thresholds;

    for (const match of matches) {
      if (match.prob_plus05_home >= t.plus05Home && match.odds_plus05_home) {
        predictions.push({
          matchId: match.id,
          match: `${match.home} vs ${match.away}`,
          league: match.league,
          time: match.time,
          type: '+0.5 HOME',
          description: `${match.home} înscrie minim 1 gol`,
          probability: match.prob_plus05_home,
          odds: match.odds_plus05_home,
          confidence: this.getConfidenceLevel(match.prob_plus05_home),
          expectedValue: this.calculateEV(match.prob_plus05_home, match.odds_plus05_home),
        });
      }

      if (match.prob_under45_away >= t.under45Away && match.odds_under45_away) {
        predictions.push({
          matchId: match.id,
          match: `${match.home} vs ${match.away}`,
          league: match.league,
          time: match.time,
          type: 'UNDER 4.5 AWAY',
          description: `${match.away} sub 5 goluri`,
          probability: match.prob_under45_away,
          odds: match.odds_under45_away,
          confidence: this.getConfidenceLevel(match.prob_under45_away),
          expectedValue: this.calculateEV(match.prob_under45_away, match.odds_under45_away),
        });
      }

      if (match.prob_1x >= t.doubleChance1X && match.odds_1x) {
        predictions.push({
          matchId: match.id,
          match: `${match.home} vs ${match.away}`,
          league: match.league,
          time: match.time,
          type: '1X',
          description: `${match.home} sau egal`,
          probability: match.prob_1x,
          odds: match.odds_1x,
          confidence: this.getConfidenceLevel(match.prob_1x),
          expectedValue: this.calculateEV(match.prob_1x, match.odds_1x),
        });
      }

      if (match.prob_over05_ht >= t.over05HT && match.odds_over05_ht) {
        predictions.push({
          matchId: match.id,
          match: `${match.home} vs ${match.away}`,
          league: match.league,
          time: match.time,
          type: 'OVER 0.5 HT',
          description: 'Minim 1 gol în prima repriză',
          probability: match.prob_over05_ht,
          odds: match.odds_over05_ht,
          confidence: this.getConfidenceLevel(match.prob_over05_ht),
          expectedValue: this.calculateEV(match.prob_over05_ht, match.odds_over05_ht),
        });
      }

      if (match.prob_btts_no >= t.bttsNo && match.odds_btts_no) {
        predictions.push({
          matchId: match.id,
          match: `${match.home} vs ${match.away}`,
          league: match.league,
          time: match.time,
          type: 'BTTS NO',
          description: 'Nu înscriu ambele echipe',
          probability: match.prob_btts_no,
          odds: match.odds_btts_no,
          confidence: this.getConfidenceLevel(match.prob_btts_no),
          expectedValue: this.calculateEV(match.prob_btts_no, match.odds_btts_no),
        });
      }
    }

    return predictions.sort((a, b) => b.probability - a.probability);
  }

  getConfidenceLevel(prob) {
    if (prob >= 0.96) return 'EXTREM';
    if (prob >= 0.94) return 'FOARTE RIDICAT';
    if (prob >= 0.90) return 'RIDICAT';
    if (prob >= 0.85) return 'BUN';
    return 'MODERAT';
  }

  calculateEV(probability, odds) {
    return (probability * odds) - 1;
  }

  findBestTicket(predictions) {
    const { targetOddsMin, targetOddsMax } = this.config;
    for (let count = 1; count <= 3; count += 1) {
      const ticket = this.findCombination(predictions, count, targetOddsMin, targetOddsMax);
      if (ticket) return ticket;
    }

    const bestSingle = predictions[0];
    if (bestSingle && bestSingle.odds >= 1.20) {
      return this.createTicket([bestSingle], 'SINGLE_FORȚAT');
    }

    return null;
  }

  findCombination(predictions, count, minOdds, maxOdds) {
    const combinations = this.getCombinations(predictions, count);
    let bestTicket = null;
    let bestScore = -1;

    for (const combo of combinations) {
      if (this.hasCorrelation(combo)) continue;
      if (!this.hasValidTiming(combo)) continue;

      const totalOdds = combo.reduce((acc, p) => acc * p.odds, 1);
      const combinedProb = combo.reduce((acc, p) => acc * p.probability, 1);

      if (totalOdds >= minOdds && totalOdds <= maxOdds && combinedProb >= 0.80) {
        const score = (combinedProb * 100) - Math.abs(totalOdds - 1.55) * 10;
        if (score > bestScore) {
          bestScore = score;
          bestTicket = this.createTicket(combo, count === 1 ? 'SINGLE' : count === 2 ? 'DOUBLE' : 'TRIPLE');
        }
      }
    }

    return bestTicket;
  }

  getCombinations(array, n) {
    if (n === 1) return array.map((el) => [el]);
    const combinations = [];
    for (let i = 0; i <= array.length - n; i += 1) {
      const head = array[i];
      const tailCombinations = this.getCombinations(array.slice(i + 1), n - 1);
      for (const tail of tailCombinations) combinations.push([head, ...tail]);
    }
    return combinations;
  }

  hasCorrelation(selections) {
    const matchIds = selections.map((s) => s.matchId);
    if (new Set(matchIds).size !== matchIds.length) return true;

    if (selections.length >= 2) {
      const leagues = selections.map((s) => s.league);
      const uniqueLeagues = new Set(leagues);
      if (uniqueLeagues.size === 1 && selections.length >= 3) return true;
    }

    return false;
  }

  hasValidTiming(selections) {
    if (selections.length === 1) return true;
    const sorted = [...selections].sort((a, b) => a.time.localeCompare(b.time));
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const time1 = this.parseTime(sorted[i].time);
      const time2 = this.parseTime(sorted[i + 1].time);
      const diff = (time2 - time1) / (1000 * 60);
      if (diff < 30) return false;
    }
    return true;
  }

  parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return new Date(2000, 0, 1, hours, minutes);
  }

  createTicket(selections, type) {
    const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
    const combinedProb = selections.reduce((acc, s) => acc * s.probability, 1);

    return {
      type,
      selections,
      totalOdds: Math.round(totalOdds * 100) / 100,
      combinedProbability: Math.round(combinedProb * 1000) / 10,
      individualProbabilities: selections.map((s) => Math.round(s.probability * 1000) / 10),
      expectedValue: Math.round((combinedProb * totalOdds - 1) * 1000) / 10,
      safetyRating: this.getSafetyRating(combinedProb),
      estimatedDuration: this.estimateDuration(selections),
    };
  }

  getSafetyRating(prob) {
    if (prob >= 0.95) return '⭐⭐⭐⭐⭐ EXTREM';
    if (prob >= 0.90) return '⭐⭐⭐⭐⭐ FOARTE SIGUR';
    if (prob >= 0.85) return '⭐⭐⭐⭐ SIGUR';
    if (prob >= 0.80) return '⭐⭐⭐ BUN';
    return '⭐⭐ MODERAT';
  }

  estimateDuration(selections) {
    if (selections.length === 1) return '45-90 minute';
    const lastMatch = selections[selections.length - 1];
    return `până la ${lastMatch.time} (max 3 ore)`;
  }

  calculatePyramidStake() {
    const { baseStake, reinvestPercent, profitLockAfterDay, profitLockPercent } = this.config;
    const { currentDay, bankroll, initialBankroll, currentStreak } = this.state;

    if (currentDay === 1 || currentStreak === 0) {
      return {
        stake: baseStake,
        type: 'BASE',
        description: 'Miză inițială de bază',
        maxPotential: baseStake * this.config.targetOddsMax,
      };
    }

    const accumulated = bankroll;
    const pureProfit = accumulated - initialBankroll;

    if (currentDay === 2) {
      const stake = Math.round(accumulated * reinvestPercent);
      return {
        stake,
        type: 'AGRESIV',
        description: 'Ziua 2: Reinvestire 50% din acumulare',
        accumulated,
        potentialWin: Math.round(stake * 1.5),
        riskIfLoss: -stake,
      };
    }

    let availableForBet = accumulated * reinvestPercent;
    let lockedProfit = 0;
    if (currentDay >= profitLockAfterDay && pureProfit > 0) {
      lockedProfit = Math.round(pureProfit * profitLockPercent);
      availableForBet -= lockedProfit;
    }

    const maxStake = Math.round(accumulated * 0.6);
    const stake = Math.min(Math.round(availableForBet), maxStake);

    return {
      stake,
      type: 'CONSERVATOR',
      description: `Ziua ${currentDay}: Conservator cu ${profitLockPercent * 100}% profit blocat`,
      accumulated,
      lockedProfit,
      availableForBet: Math.round(availableForBet),
      potentialWin: Math.round(stake * 1.5),
      riskIfLoss: -stake,
      recommendation: currentDay >= this.config.maxDays ? 'RESET recomandat' : 'CONTINUĂ',
    };
  }

  generateDailyTicket(allMatches) {
    const todayMatches = this.filterTodayMatches(allMatches);
    if (todayMatches.length === 0) {
      return {
        status: 'NO_MATCHES',
        message: 'Nu există meciuri disponibile astăzi sau toate au început deja.',
        suggestion: 'Așteaptă ziua următoare sau extinde filtrul de ore.',
      };
    }

    const safePredictions = this.generateSafePredictions(todayMatches);
    if (safePredictions.length === 0) {
      return {
        status: 'NO_SAFE_PREDICTIONS',
        message: `Nu există predicții care să atingă pragurile minime (${this.config.minIndividualProb * 100}%).`,
        availablePredictions: todayMatches.length,
        suggestion: 'Scade pragul temporar sau așteaptă o zi cu meciuri mai predictibile.',
      };
    }

    const ticket = this.findBestTicket(safePredictions);
    if (!ticket) {
      return {
        status: 'NO_VALID_TICKET',
        message: `Nu s-a găsit combinație în intervalul ${this.config.targetOddsMin}-${this.config.targetOddsMax}.`,
        bestAvailable: safePredictions.slice(0, 3),
        suggestion: 'Extinde intervalul cote sau folosește single forțat.',
      };
    }

    const stakeInfo = this.calculatePyramidStake();
    this.state.todayTicket = {
      ...ticket,
      stakeInfo,
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
    };

    return {
      status: 'GENERATED',
      systemState: {
        day: this.state.currentDay,
        streak: this.state.currentStreak,
        bankroll: this.state.bankroll,
        totalProfit: this.state.totalProfit,
      },
      ticket: this.state.todayTicket,
      nextSteps: this.generateNextSteps(ticket, stakeInfo),
    };
  }

  generateNextSteps(ticket, stakeInfo) {
    const steps = [];
    if (stakeInfo.type === 'BASE') {
      steps.push('1. Plasează biletul cu miza de bază');
      steps.push('2. Dacă câștigi, mâna viitoare reinvestește 50% din total');
      steps.push('3. Dacă pierzi, revii la miza de bază ziua următoare');
    } else if (stakeInfo.type === 'AGRESIV') {
      steps.push('1. Plasează biletul cu miza agresivă (ziua 2)');
      steps.push('2. Risc crescut, dar potențial de construire rapidă');
      steps.push('3. La câștig, ziua 3 devine conservatoare cu lock profit');
    } else {
      steps.push('1. Plasează biletul cu miza conservatoare');
      if (stakeInfo.lockedProfit > 0) steps.push(`2. EXTRAGE imediat ${stakeInfo.lockedProfit} RON profit blocat`);
      steps.push(`3. Reinvestește doar ${stakeInfo.availableForBet} RON`);
      steps.push(`4. ${stakeInfo.recommendation}`);
    }
    steps.push(`5. Probabilitate combinată: ${ticket.combinedProbability}%`);
    steps.push(`6. EV estimat: ${ticket.expectedValue > 0 ? '+' : ''}${ticket.expectedValue}%`);
    return steps;
  }

  processResult(won, actualOdds = null) {
    const ticket = this.state.todayTicket;
    if (!ticket) return { error: 'Nu există bilet activ pentru azi' };

    const { stake } = ticket.stakeInfo;
    const odds = actualOdds || ticket.totalOdds;
    const result = {
      date: new Date().toISOString(),
      day: this.state.currentDay,
      ticket,
      won,
      stake,
      odds,
    };

    if (won) {
      const winAmount = stake * odds;
      const profit = winAmount - stake;
      this.state.bankroll = this.state.bankroll - stake + winAmount;
      this.state.totalProfit += profit;
      this.state.currentStreak += 1;

      if (this.state.currentDay >= this.config.maxDays) {
        result.action = 'RESET_FORȚAT';
        result.message = `Ziua ${this.state.currentDay} completată. Reset forțat pentru protecție.`;
        result.withdrawRecommendation = Math.round(this.state.bankroll * 0.6);
        this.resetPyramid();
      } else {
        result.action = 'CONTINUĂ';
        result.message = `Ziua ${this.state.currentDay} câștigată. Mâine: Ziua ${this.state.currentDay + 1}`;
        this.state.currentDay += 1;
      }
    } else {
      this.state.bankroll -= stake;
      result.action = 'RESET';
      result.message = `Pierdere la ziua ${this.state.currentDay}. Reset la miza de bază.`;
      result.loss = stake;
      this.resetPyramid();
    }

    this.state.history.push(result);
    this.state.todayTicket = null;
    return {
      ...result,
      newState: {
        bankroll: this.state.bankroll,
        totalProfit: this.state.totalProfit,
        nextDay: this.state.currentDay,
        streak: this.state.currentStreak,
      },
    };
  }

  resetPyramid() {
    this.state.currentDay = 1;
    this.state.currentStreak = 0;
  }

  forceReset() {
    this.resetPyramid();
    this.state.totalWithdrawn += this.state.bankroll - this.config.baseStake;
    this.state.bankroll = this.config.baseStake;
    return {
      message: 'Reset manual executat',
      withdrawn: this.state.totalWithdrawn,
      newBase: this.config.baseStake,
    };
  }

  getStatistics() {
    const history = this.state.history;
    const totalBets = history.length;
    const wins = history.filter((h) => h.won).length;
    const losses = totalBets - wins;
    const avgOdds = history.reduce((acc, h) => acc + h.odds, 0) / totalBets || 0;
    const avgProbability = history.reduce((acc, h) => acc + h.ticket.combinedProbability, 0) / totalBets || 0;

    let currentStreak = 0;
    let maxStreak = 0;
    for (const h of history) {
      if (h.won) {
        currentStreak += 1;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    return {
      totalBets,
      wins,
      losses,
      winRate: totalBets > 0 ? Math.round((wins / totalBets) * 1000) / 10 : 0,
      avgOdds: Math.round(avgOdds * 100) / 100,
      avgProbability: Math.round(avgProbability * 10) / 10,
      maxConsecutiveWins: maxStreak,
      currentStreak: this.state.currentStreak,
      totalProfit: Math.round(this.state.totalProfit * 100) / 100,
      bankroll: Math.round(this.state.bankroll * 100) / 100,
      roi: this.state.initialBankroll > 0
        ? Math.round(((this.state.bankroll - this.state.initialBankroll) / this.state.initialBankroll) * 1000) / 10
        : 0,
    };
  }

  getDailyReport() {
    const today = new Date().toISOString().split('T')[0];
    const todayHistory = this.state.history.filter((h) => h.date.startsWith(today));

    return {
      date: today,
      betsToday: todayHistory.length,
      results: todayHistory.map((h) => ({
        won: h.won,
        profit: h.won ? Math.round((h.stake * h.odds - h.stake) * 100) / 100 : -h.stake,
      })),
      dayNumber: this.state.currentDay,
      streak: this.state.currentStreak,
      recommendation: this.generateDailyRecommendation(),
    };
  }

  generateDailyRecommendation() {
    const stats = this.getStatistics();
    if (stats.currentStreak >= 4) return '🔴 OPREȘTE-TE! Ai 4+ zile consecutive. Extrage profitul și resetează.';
    if (stats.winRate < 60 && stats.totalBets > 10) return '🟡 Atenție: Win rate sub 60%. Verifică pragurile de probabilitate.';
    if (stats.roi > 50) return '🟢 Excelent! Consideră retragerea a 50% din profit.';
    return '🟢 Continuă conform planului piramidal.';
  }
}

window.ROPyramidSystem = ROPyramidSystem;
window.createDefaultROPyramidSystem = (config = {}) => new ROPyramidSystem(config);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ROPyramidSystem };
}
