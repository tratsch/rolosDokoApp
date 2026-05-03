/**
 * Bot simulation: 4 bots play N games directly via GameEngine (no Socket.io, no delays).
 * Run with: npx tsx src/simulate.ts
 */
import { createInitialGameState, getValidAnnouncements } from '@dokoapp/shared';
import type { Player, GameState, ReservationType } from '@dokoapp/shared';
import { GameEngine } from './GameEngine';
import { AIPlayer } from './AIPlayer';

// ============================================================
// Types for statistics
// ============================================================

interface GameResult {
  winner: 're' | 'contra';
  rePoints: number;
  contraPoints: number;
  gamePoints: number;
  reTeamIds: string[];
  scoreChange: Record<string, number>;
  tricksPerPlayer: Record<string, number>;
  trickPointsPerPlayer: Record<string, number>;
  reAnnounced: boolean;
  contraAnnounced: boolean;
  reservation: string | null;
}

interface CardStat {
  played: number;
  wonTrick: number;
  totalPointsWon: number;
}

// ============================================================
// Simulation driver
// ============================================================

function runGame(
  roomId: string,
  players: Player[],
  bots: Map<string, AIPlayer>,
  dealerPos: number,
  roundNumber: number,
  scores: Record<string, number>
): GameResult | null {
  const sortedPlayers = [...players].sort((a, b) => a.position - b.position);
  const initialState = createInitialGameState(roomId, sortedPlayers, dealerPos, roundNumber, scores);

  let state = initialState;
  const engine = new GameEngine(initialState, (s) => { state = s; });

  let safetyCounter = 0;
  const MAX_STEPS = 2000;

  while (state.phase !== 'scoring' && safetyCounter < MAX_STEPS) {
    safetyCounter++;

    // --- Reservation phase ---
    if (state.phase === 'reservations') {
      const resPhase = state.reservationPhase;
      if (!resPhase) break;
      const currentPlayer = state.players[resPhase.currentPlayerIndex];
      if (!currentPlayer || currentPlayer.reservationDeclared) break;
      const bot = bots.get(currentPlayer.id);
      if (!bot) break;
      const options = engine.getReservationOptionsForPlayer(currentPlayer.id);
      const choice = bot.chooseReservation(state, options);
      engine.handleReservation(currentPlayer.id, choice);
      continue;
    }

    // --- Armut offering ---
    if (state.armutExchange?.phase === 'offering') {
      const ex = state.armutExchange;
      const offerPlayer = state.players[ex.currentOfferId];
      if (!offerPlayer) break;
      const botHand = offerPlayer.cards.length;
      engine.handleAcceptArmut(offerPlayer.id, botHand <= 8);
      continue;
    }

    // --- Armut returning ---
    if (state.armutExchange?.phase === 'returning') {
      const ex = state.armutExchange;
      const accepter = state.players.find(p => p.id === ex.acceptedById);
      if (!accepter) break;
      const bot = bots.get(accepter.id);
      if (!bot) break;
      const count = ex.offeredCardIds?.length ?? 3;
      const cardIds = bot.chooseArmutCards(state, count);
      engine.handleReturnArmutCards(accepter.id, cardIds);
      continue;
    }

    // --- Trick end ---
    if (state.phase === 'trick-end') {
      engine.acknowledgeTrick();
      continue;
    }

    // --- Playing ---
    if (state.phase === 'playing') {
      const currentPlayer = state.players[state.currentPlayerIndex];
      if (!currentPlayer) break;
      const bot = bots.get(currentPlayer.id);
      if (!bot) break;

      // Optionally make announcement
      const annOptions = getValidAnnouncements(currentPlayer, state);
      const ann = bot.chooseAnnouncement(state, annOptions);
      if (ann) {
        engine.handleAnnouncement(currentPlayer.id, ann);
      }

      const cardId = bot.chooseCard(state);
      const result = engine.handlePlayCard(currentPlayer.id, cardId);
      if (result.error) {
        // Fallback: play first valid card
        const valids = engine.getValidCardsForPlayer(currentPlayer.id);
        if (valids.length > 0) engine.handlePlayCard(currentPlayer.id, valids[0]);
        else break;
      }
      continue;
    }

    // Stuck in unknown phase
    break;
  }

  if (state.phase !== 'scoring' || !state.lastRoundScore) return null;

  const rs = state.lastRoundScore;
  return {
    winner: rs.winner,
    rePoints: rs.rePoints,
    contraPoints: rs.contraPoints,
    gamePoints: rs.gamePoints ?? 0,
    reTeamIds: rs.reTeam,
    scoreChange: rs.scoreChange,
    tricksPerPlayer: Object.fromEntries(state.players.map(p => [p.id, p.tricksWon])),
    trickPointsPerPlayer: Object.fromEntries(state.players.map(p => [p.id, p.trickPoints])),
    reAnnounced: state.announcements.some(a => a.type === 're'),
    contraAnnounced: state.announcements.some(a => a.type === 'contra'),
    reservation: state.activeReservation ?? null,
  };
}

// ============================================================
// Main
// ============================================================

const NUM_GAMES = 100;
const ROOM_ID = 'sim';

const botIds = ['bot-1', 'bot-2', 'bot-3', 'bot-4'];
const bots = new Map<string, AIPlayer>(botIds.map(id => [id, new AIPlayer(id)]));

const scores: Record<string, number> = Object.fromEntries(botIds.map(id => [id, 0]));

const results: GameResult[] = [];
let reWins = 0;
let contraWins = 0;
let nullResults = 0;
const penaltySum: Record<string, number> = Object.fromEntries(botIds.map(id => [id, 0]));
const reTeamCount: Record<string, number> = Object.fromEntries(botIds.map(id => [id, 0]));
const reWinCount: Record<string, number> = Object.fromEntries(botIds.map(id => [id, 0]));
const rePointsSum = { total: 0, count: 0 };
const contraPointsSum = { total: 0, count: 0 };
const announcedReWins = { re: 0, reTotal: 0, contra: 0, contraTotal: 0 };
const reservationStats: Record<string, { played: number; reWon: number }> = {};

for (let g = 0; g < NUM_GAMES; g++) {
  const dealerPos = g % 4;
  const players: Player[] = botIds.map((id, i) => ({
    id,
    name: `Bot ${i + 1}`,
    position: i as 0 | 1 | 2 | 3,
    isBot: true,
    isConnected: true,
    cards: [],
    cardCount: 0,
    reservationDeclared: false,
    points: scores[id] ?? 0,
    tricksWon: 0,
    trickPoints: 0,
  }));

  const result = runGame(ROOM_ID, players, bots, dealerPos, g + 1, scores);

  if (!result) {
    nullResults++;
    continue;
  }

  results.push(result);

  if (result.winner === 're') reWins++;
  else contraWins++;

  rePointsSum.total += result.rePoints;
  rePointsSum.count++;
  contraPointsSum.total += result.contraPoints;
  contraPointsSum.count++;

  // Track per-bot re membership and wins
  botIds.forEach(id => {
    const isRe = result.reTeamIds.includes(id);
    if (isRe) {
      reTeamCount[id]++;
      if (result.winner === 're') reWinCount[id]++;
    }
  });

  // Penalty accumulation
  botIds.forEach(id => {
    penaltySum[id] = (penaltySum[id] ?? 0) + (result.scoreChange[id] ?? 0);
    scores[id] = (scores[id] ?? 0) + (result.scoreChange[id] ?? 0);
  });

  // Announcement tracking
  if (result.reAnnounced) {
    announcedReWins.reTotal++;
    if (result.winner === 're') announcedReWins.re++;
  }
  if (result.contraAnnounced) {
    announcedReWins.contraTotal++;
    if (result.winner === 'contra') announcedReWins.contra++;
  }

  // Reservation tracking
  const res = result.reservation ?? 'normal';
  if (!reservationStats[res]) reservationStats[res] = { played: 0, reWon: 0 };
  reservationStats[res].played++;
  if (result.winner === 're') reservationStats[res].reWon++;
}

// ============================================================
// Output analysis
// ============================================================

console.log('\n═══════════════════════════════════════════════════════');
console.log('  DOPPELKOPF BOT SIMULATION — ' + NUM_GAMES + ' Spiele');
console.log('═══════════════════════════════════════════════════════\n');

const total = reWins + contraWins;
console.log(`Gespielte Runden:   ${total}  (${nullResults} Fehler/Abbrüche)`);
console.log(`Re-Team gewinnt:    ${reWins} / ${total}  (${((reWins/total)*100).toFixed(1)}%)`);
console.log(`Contra-Team gewinnt:${contraWins} / ${total}  (${((contraWins/total)*100).toFixed(1)}%)`);
console.log(`Ø Re-Punkte:        ${(rePointsSum.total/rePointsSum.count).toFixed(1)}`);
console.log(`Ø Contra-Punkte:    ${(contraPointsSum.total/contraPointsSum.count).toFixed(1)}`);

console.log('\n─── Ansagen ──────────────────────────────────────────');
if (announcedReWins.reTotal > 0) {
  console.log(`Re angesagt:   ${announcedReWins.reTotal}x → ${announcedReWins.re}x gewonnen (${((announcedReWins.re/announcedReWins.reTotal)*100).toFixed(1)}%)`);
} else {
  console.log('Re angesagt:   0x');
}
if (announcedReWins.contraTotal > 0) {
  console.log(`Contra angesagt: ${announcedReWins.contraTotal}x → ${announcedReWins.contra}x gewonnen (${((announcedReWins.contra/announcedReWins.contraTotal)*100).toFixed(1)}%)`);
} else {
  console.log('Contra angesagt: 0x');
}

console.log('\n─── Gesamtpunkte (Strafpunkte) ───────────────────────');
const sortedBots = botIds.slice().sort((a, b) => penaltySum[a] - penaltySum[b]);
sortedBots.forEach(id => {
  const reWinRate = reTeamCount[id] > 0 ? ((reWinCount[id] / reTeamCount[id]) * 100).toFixed(1) : 'n/a';
  console.log(`  Bot ${id.split('-')[1]}: ${penaltySum[id]} Pkt  (Re-Team ${reTeamCount[id]}x, davon ${reWinCount[id]}x gewonnen = ${reWinRate}%)`);
});

console.log('\n─── Spieltypen ───────────────────────────────────────');
Object.entries(reservationStats)
  .sort((a, b) => b[1].played - a[1].played)
  .forEach(([res, stat]) => {
    const reWinPct = ((stat.reWon / stat.played) * 100).toFixed(1);
    console.log(`  ${res.padEnd(20)} ${stat.played}x → Re gewinnt ${reWinPct}%`);
  });

console.log('\n─── Stichpunkt-Verteilung ────────────────────────────');
const trickPtBuckets: Record<string, number> = { '<100': 0, '100–109': 0, '110–119': 0, '120–129': 0, '≥130': 0 };
results.forEach(r => {
  const rePts = r.rePoints;
  if (rePts < 100) trickPtBuckets['<100']++;
  else if (rePts < 110) trickPtBuckets['100–109']++;
  else if (rePts < 120) trickPtBuckets['110–119']++;
  else if (rePts < 130) trickPtBuckets['120–129']++;
  else trickPtBuckets['≥130']++;
});
Object.entries(trickPtBuckets).forEach(([bucket, count]) => {
  const pct = ((count / total) * 100).toFixed(1);
  console.log(`  Re-Punkte ${bucket.padEnd(10)}: ${count}x (${pct}%)`);
});

console.log('\n═══════════════════════════════════════════════════════\n');
