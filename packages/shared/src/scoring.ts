import {
  GameState, RoundScore, ExtraPoint, Team, AnnouncementType, Trick, Player
} from './types';
import { isKaroAs, isHerzZehn, isKreuzBauer } from './cards';

// ============================================================
// Calculate round score
// ============================================================

export function calculateRoundScore(state: GameState): RoundScore {
  const { players, completedTricks, announcements, cardDeck } = state;
  const isSolo = !!state.soloPlayerId;
  const soloPlayerId = state.soloPlayerId;

  // Determine teams
  const reTeam = players.filter(p => p.team === 're').map(p => p.id);
  const contraTeam = players.filter(p => p.team === 'contra').map(p => p.id);

  // Count trick points per team
  let rePoints = 0;
  let contraPoints = 0;

  for (const trick of completedTricks) {
    const winnerId = trick.winnerId!;
    const winnerTeam = players.find(p => p.id === winnerId)?.team;
    if (winnerTeam === 're') {
      rePoints += trick.points;
    } else {
      contraPoints += trick.points;
    }
  }

  // Determine winner
  let winner: Team;
  if (rePoints === 120 && contraPoints === 120) {
    winner = 'contra'; // Tie goes to contra
  } else {
    winner = rePoints > contraPoints ? 're' : 'contra';
  }

  const details: string[] = [];
  const extraPoints: ExtraPoint[] = [];

  // ============================================================
  // Base game score
  // ============================================================
  let baseScore = 1; // Base game point

  // Stufen for announced and achieved
  const reAnnouncements = announcements.filter(a => a.team === 're');
  const contraAnnouncements = announcements.filter(a => a.team === 'contra');

  const reAnnounced = reAnnouncements.some(a => a.type === 're');
  const contraAnnounced = contraAnnouncements.some(a => a.type === 'contra');

  // Keine 90/60/30/Schwarz bonus points
  function getAnnouncementBonus(team: Team, teamPoints: number): number {
    let bonus = 0;
    const teamAnn = announcements.filter(a => a.team === team);

    const announced90 = teamAnn.some(a => a.type === 'keine90');
    const announced60 = teamAnn.some(a => a.type === 'keine60');
    const announced30 = teamAnn.some(a => a.type === 'keine30');
    const announcedSchwarz = teamAnn.some(a => a.type === 'schwarz');

    const opponentPoints = team === 're' ? contraPoints : rePoints;

    if (announced90) {
      bonus += 1;
      if (opponentPoints < 90) {
        details.push(`${team === 're' ? 'Re' : 'Contra'} gewinnt gegen 90`);
      }
    }
    if (announced60) {
      bonus += 1;
      if (opponentPoints < 60) {
        details.push(`${team === 're' ? 'Re' : 'Contra'} gewinnt gegen 60`);
      }
    }
    if (announced30) {
      bonus += 1;
      if (opponentPoints < 30) {
        details.push(`${team === 're' ? 'Re' : 'Contra'} gewinnt gegen 30`);
      }
    }
    if (announcedSchwarz) {
      bonus += 1;
      if (opponentPoints === 0) {
        details.push(`${team === 're' ? 'Re' : 'Contra'} Schwarz!`);
      }
    }

    return bonus;
  }

  // Stufen: +1 for each 30-point threshold the opponent didn't reach
  function getThresholdBonus(winnerTeam: Team): number {
    const opponentPoints = winnerTeam === 're' ? contraPoints : rePoints;
    let bonus = 0;

    // Opponent didn't get 90: +1
    if (opponentPoints < 90) { bonus++; details.push('Keine 90 geschafft'); }
    // Opponent didn't get 60: +1
    if (opponentPoints < 60) { bonus++; details.push('Keine 60 geschafft'); }
    // Opponent didn't get 30: +1
    if (opponentPoints < 30) { bonus++; details.push('Keine 30 geschafft'); }
    // Opponent got 0: +1
    if (opponentPoints === 0) { bonus++; details.push('Schwarz gespielt'); }

    return bonus;
  }

  let gamePoints = baseScore;

  if (winner === 're') {
    gamePoints += getThresholdBonus('re');
    gamePoints += getAnnouncementBonus('re', rePoints);
    if (reAnnounced) details.push('Re angesagt: ×2');
    if (contraAnnounced) details.push('Contra angesagt: ×2');
  } else {
    gamePoints += getThresholdBonus('contra');
    gamePoints += getAnnouncementBonus('contra', contraPoints);
    // Gegen die Alten
    if (!soloPlayerId) {
      extraPoints.push({
        type: 'gegen-die-alten',
        team: 'contra',
        description: 'Gegen die Alten',
      });
      details.push('Gegen die Alten: +1');
    }
    if (reAnnounced) details.push('Re angesagt aber verloren: ×2');
    if (contraAnnounced) details.push('Contra angesagt aber verloren: ×2');
  }

  // Multiplier from Re/Contra
  let multiplier = 1;
  if (reAnnounced) multiplier *= 2;
  if (contraAnnounced) multiplier *= 2;

  gamePoints *= multiplier;

  // Solo: winner wins double, loser loses double
  if (isSolo) {
    gamePoints *= 2;
  }

  // ============================================================
  // Extra points (Sonderpunkte)
  // ============================================================

  for (const trick of completedTricks) {
    const trickCards = trick.cards.map(tc => ({
      card: cardDeck.find(c => c.id === tc.cardId)!,
      playerId: tc.playerId,
    })).filter(tc => tc.card);

    const winnerId = trick.winnerId!;
    const winnerTeam = players.find(p => p.id === winnerId)?.team ?? 'contra';
    const isLastTrick = completedTricks.indexOf(trick) === completedTricks.length - 1;

    // Sonntag: all Herz (non-trump)
    if (trick.isSonntag) {
      extraPoints.push({
        type: 'sonntag',
        team: winnerTeam,
        playerId: winnerId,
        description: 'Sonntag',
      });
    }

    // Doppelkopf
    if (trick.isDoublekopf) {
      extraPoints.push({
        type: 'doppelkopf',
        team: winnerTeam,
        playerId: winnerId,
        description: 'Doppelkopf',
      });
    }

    // Fuchs gefangen (Karo-As caught by opponent)
    for (const tc of trickCards) {
      if (isKaroAs(tc.card)) {
        const cardOwnerTeam = players.find(p => p.id === tc.playerId)?.team;
        if (cardOwnerTeam && cardOwnerTeam !== winnerTeam) {
          // Opponent caught the fox
          if (isLastTrick) {
            extraPoints.push({
              type: 'fuchs-letzter-stich',
              team: winnerTeam,
              playerId: winnerId,
              description: 'Fuchs im letzten Stich gefangen (+2)',
            });
          } else {
            extraPoints.push({
              type: 'fuchs-gefangen',
              team: winnerTeam,
              playerId: winnerId,
              description: 'Fuchs gefangen',
            });
          }
        }
      }
    }

    // Herz-10 (Dulle) gefangen by opponent
    const herzZehnCards = trickCards.filter(tc => isHerzZehn(tc.card));
    if (herzZehnCards.length >= 2) {
      const firstDulle = herzZehnCards[0];
      const secondDulle = herzZehnCards[1];
      const firstTeam = players.find(p => p.id === firstDulle.playerId)?.team;
      const secondTeam = players.find(p => p.id === secondDulle.playerId)?.team;
      if (firstTeam !== secondTeam) {
        extraPoints.push({
          type: 'herz10-gefangen',
          team: winnerTeam,
          playerId: winnerId,
          description: 'Dulle gefangen',
        });
      }
    }

    // Charly: last trick won with Kreuz-Bauer
    if (isLastTrick) {
      const winningCard = cardDeck.find(c => c.id === trick.cards.find(tc => tc.playerId === winnerId)?.cardId);
      if (winningCard && isKreuzBauer(winningCard)) {
        extraPoints.push({
          type: 'charly',
          team: winnerTeam,
          playerId: winnerId,
          description: 'Charly',
        });
      }

      // Charly gefangen: two Kreuz-Buben in last trick, second beats first
      const kreuzBauerCards = trickCards.filter(tc => isKreuzBauer(tc.card));
      if (kreuzBauerCards.length >= 2) {
        const lastKB = kreuzBauerCards[kreuzBauerCards.length - 1];
        const lastKBTeam = players.find(p => p.id === lastKB.playerId)?.team;
        const firstKBTeam = players.find(p => p.id === kreuzBauerCards[0].playerId)?.team;
        if (lastKBTeam !== firstKBTeam && winnerId === lastKB.playerId) {
          extraPoints.push({
            type: 'charly-gefangen',
            team: winnerTeam,
            playerId: winnerId,
            description: 'Charly gefangen (+2)',
          });
        }
      }
    }
  }

  // ============================================================
  // Calculate score changes per player
  // Only losers receive penalty points (positive). Lower total = better rank.
  // ============================================================
  const scoreChange: Record<string, number> = {};
  for (const p of players) scoreChange[p.id] = 0;

  function getExtraPointValue(ep: ExtraPoint): number {
    if (ep.type === 'fuchs-letzter-stich') return 2;
    if (ep.type === 'charly-gefangen') return 2;
    return 1;
  }

  const extraPointsForRe = extraPoints.filter(ep => ep.team === 're')
    .reduce((sum, ep) => sum + getExtraPointValue(ep), 0);
  const extraPointsForContra = extraPoints.filter(ep => ep.team === 'contra')
    .reduce((sum, ep) => sum + getExtraPointValue(ep), 0);

  if (winner === 're') {
    // Re wins → Contra players receive penalty points
    const penalty = Math.max(1, gamePoints + extraPointsForRe - extraPointsForContra);
    for (const p of players) {
      if (p.team === 'contra') {
        scoreChange[p.id] = penalty;
      }
      // Re players (winners) stay at 0
    }
  } else {
    // Contra wins → Re players receive penalty points
    const penalty = Math.max(1, gamePoints + extraPointsForContra - extraPointsForRe);
    for (const p of players) {
      if (p.team === 're') {
        // Solo player loses against 3 → 3× penalty
        scoreChange[p.id] = (soloPlayerId && p.id === soloPlayerId) ? penalty * 3 : penalty;
      }
      // Contra players (winners) stay at 0
    }
  }

  details.push(`Re: ${rePoints} Punkte, Contra: ${contraPoints} Punkte`);
  details.push(`Gewinner: ${winner === 're' ? 'Re' : 'Contra'}-Partei`);

  return {
    roundNumber: state.roundNumber,
    reTeam,
    contraTeam,
    rePoints,
    contraPoints,
    winner,
    scoreChange,
    extraPoints,
    announcements,
    details,
  };
}
