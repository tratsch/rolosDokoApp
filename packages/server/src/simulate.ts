/**
 * Bot simulation: 4 bots play N games directly via GameEngine (no Socket.io, no delays).
 * Run with: npx tsx src/simulate.ts
 */
import { createInitialGameState, getValidAnnouncements, isKaroAs, isKreuzDame } from '@dokoapp/shared';
import type { Player, GameState, ReservationType } from '@dokoapp/shared';
import { GameEngine } from './GameEngine';
import { AIPlayer } from './AIPlayer';

// ============================================================
// Simulation driver
// ============================================================

interface GameResult {
  winner: 're' | 'contra';
  rePoints: number;
  contraPoints: number;
  reTeamIds: string[];
  scoreChange: Record<string, number>;
  reAnnounced: boolean;
  contraAnnounced: boolean;
  reservation: string | null;
  trickWins: Record<string, number>;       // playerId → tricks won
  trickPts: Record<string, number>;        // playerId → points in won tricks
  leadTrumpRate: number;                   // fraction of leads that were trump
  avgTrickValue: number;                   // avg points per trick
  schweinActive: boolean;
}

function runGame(
  players: Player[],
  bots: Map<string, AIPlayer>,
  dealerPos: number,
  roundNumber: number,
  scores: Record<string, number>
): GameResult | null {
  const sorted = [...players].sort((a, b) => a.position - b.position);
  const initialState = createInitialGameState('sim', sorted, dealerPos, roundNumber, scores);
  let state = initialState;
  const engine = new GameEngine(initialState, (s) => { state = s; });

  let safety = 0;
  let trumpLeads = 0, totalLeads = 0;

  while (state.phase !== 'scoring' && safety++ < 2000) {
    if (state.phase === 'reservations') {
      const rp = state.reservationPhase;
      if (!rp) break;
      const cp = state.players[rp.currentPlayerIndex];
      if (!cp || cp.reservationDeclared) break;
      const opts = engine.getReservationOptionsForPlayer(cp.id);
      engine.handleReservation(cp.id, bots.get(cp.id)!.chooseReservation(state, opts));
      continue;
    }
    if (state.armutExchange?.phase === 'offering') {
      const ex = state.armutExchange;
      const op = state.players[ex.currentOfferId];
      if (!op) break;
      engine.handleAcceptArmut(op.id, op.cards.length <= 8);
      continue;
    }
    if (state.armutExchange?.phase === 'returning') {
      const ex = state.armutExchange;
      const acc = state.players.find(p => p.id === ex.acceptedById);
      if (!acc) break;
      const bot = bots.get(acc.id)!;
      engine.handleReturnArmutCards(acc.id, bot.chooseArmutCards(state, ex.offeredCardIds?.length ?? 3));
      continue;
    }
    if (state.phase === 'trick-end') {
      engine.acknowledgeTrick();
      continue;
    }
    if (state.phase === 'playing') {
      const cp = state.players[state.currentPlayerIndex];
      if (!cp) break;
      const bot = bots.get(cp.id)!;

      // Track lead trump rate
      if (!state.currentTrick || state.currentTrick.cards.length === 0) {
        totalLeads++;
      }

      const annOpts = getValidAnnouncements(cp, state);
      const ann = bot.chooseAnnouncement(state, annOpts);
      if (ann) engine.handleAnnouncement(cp.id, ann);

      const cardId = bot.chooseCard(state);

      // Track if lead was trump
      if (!state.currentTrick || state.currentTrick.cards.length === 0) {
        const card = state.cardDeck.find(c => c.id === cardId);
        if (card?.isTrump) trumpLeads++;
      }

      const res = engine.handlePlayCard(cp.id, cardId);
      if (res.error) {
        const valids = engine.getValidCardsForPlayer(cp.id);
        if (valids.length > 0) engine.handlePlayCard(cp.id, valids[0]);
        else break;
      }
      continue;
    }
    break;
  }

  if (state.phase !== 'scoring' || !state.lastRoundScore) return null;
  const rs = state.lastRoundScore;

  const allTrickPts = state.completedTricks.reduce((sum, t) => {
    return sum + t.cards.reduce((s, tc) => s + (state.cardDeck.find(c => c.id === tc.cardId)?.points ?? 0), 0);
  }, 0);

  return {
    winner: rs.winner,
    rePoints: rs.rePoints,
    contraPoints: rs.contraPoints,
    reTeamIds: rs.reTeam,
    scoreChange: rs.scoreChange,
    reAnnounced: state.announcements.some(a => a.type === 're'),
    contraAnnounced: state.announcements.some(a => a.type === 'contra'),
    reservation: state.activeReservation ?? null,
    trickWins: Object.fromEntries(state.players.map(p => [p.id, p.tricksWon])),
    trickPts: Object.fromEntries(state.players.map(p => [p.id, p.trickPoints])),
    leadTrumpRate: totalLeads > 0 ? trumpLeads / totalLeads : 0,
    avgTrickValue: state.completedTricks.length > 0 ? allTrickPts / state.completedTricks.length : 0,
    schweinActive: state.schweinActive ?? false,
  };
}

// ============================================================
// Main
// ============================================================

const NUM_GAMES = 500;
const botIds = ['bot-1', 'bot-2', 'bot-3', 'bot-4'];
const bots = new Map<string, AIPlayer>(botIds.map(id => [id, new AIPlayer(id)]));
const scores: Record<string, number> = Object.fromEntries(botIds.map(id => [id, 0]));

const results: GameResult[] = [];
let nullResults = 0;
let reWins = 0, contraWins = 0;
const penaltySum: Record<string, number> = Object.fromEntries(botIds.map(id => [id, 0]));
const reTeamCount: Record<string, number> = Object.fromEntries(botIds.map(id => [id, 0]));
const reWinCount: Record<string, number> = Object.fromEntries(botIds.map(id => [id, 0]));
const annStats = { re: 0, reWon: 0, contra: 0, contraWon: 0 };
const resStats: Record<string, { n: number; reWon: number }> = {};
let totalLeadTrump = 0, totalLeads = 0;
const schweinGames = { n: 0, reWon: 0 };
const trickPtBuckets: Record<string, number> = { '<100': 0, '100–109': 0, '110–119': 0, '120–129': 0, '≥130': 0 };

// Track margins (how decisive were wins)
const reWinMargins: number[] = [];
const contraWinMargins: number[] = [];

for (let g = 0; g < NUM_GAMES; g++) {
  const players: Player[] = botIds.map((id, i) => ({
    id, name: `Bot ${i + 1}`, position: i as 0|1|2|3,
    isBot: true, isConnected: true,
    cards: [], cardCount: 0, reservationDeclared: false,
    points: scores[id] ?? 0, tricksWon: 0, trickPoints: 0,
  }));

  const r = runGame(players, bots, g % 4, g + 1, scores);
  if (!r) { nullResults++; continue; }
  results.push(r);

  if (r.winner === 're') { reWins++; reWinMargins.push(r.rePoints - 120); }
  else { contraWins++; contraWinMargins.push(r.contraPoints - 120); }

  botIds.forEach(id => {
    if (r.reTeamIds.includes(id)) {
      reTeamCount[id]++;
      if (r.winner === 're') reWinCount[id]++;
    }
    penaltySum[id] += r.scoreChange[id] ?? 0;
    scores[id] += r.scoreChange[id] ?? 0;
  });

  if (r.reAnnounced) { annStats.re++; if (r.winner === 're') annStats.reWon++; }
  if (r.contraAnnounced) { annStats.contra++; if (r.winner === 'contra') annStats.contraWon++; }

  const res = r.reservation ?? 'normal';
  if (!resStats[res]) resStats[res] = { n: 0, reWon: 0 };
  resStats[res].n++;
  if (r.winner === 're') resStats[res].reWon++;

  totalLeadTrump += r.leadTrumpRate;
  totalLeads++;

  if (r.schweinActive) { schweinGames.n++; if (r.winner === 're') schweinGames.reWon++; }

  const rePts = r.rePoints;
  if (rePts < 100) trickPtBuckets['<100']++;
  else if (rePts < 110) trickPtBuckets['100–109']++;
  else if (rePts < 120) trickPtBuckets['110–119']++;
  else if (rePts < 130) trickPtBuckets['120–129']++;
  else trickPtBuckets['≥130']++;
}

const total = reWins + contraWins;
const avg = (arr: number[]) => arr.length ? (arr.reduce((a,b) => a+b,0)/arr.length).toFixed(1) : 'n/a';

console.log('\n═══════════════════════════════════════════════════════');
console.log(`  SIMULATION — ${NUM_GAMES} Spiele  (${nullResults} Fehler)`);
console.log('═══════════════════════════════════════════════════════\n');
console.log(`Re gewinnt:      ${reWins}/${total} = ${((reWins/total)*100).toFixed(1)}%  (Ø Marge: +${avg(reWinMargins)} Pkt über 120)`);
console.log(`Contra gewinnt:  ${contraWins}/${total} = ${((contraWins/total)*100).toFixed(1)}%  (Ø Marge: +${avg(contraWinMargins)} Pkt über 120)`);
console.log(`Ø Trump-Leads:   ${((totalLeadTrump/totalLeads)*100).toFixed(1)}% aller Stich-Eröffnungen`);

console.log('\n─── Ansagen ──────────────────────────────────────────');
console.log(`Re:      ${annStats.re}x (${((annStats.re/total)*100).toFixed(1)}% aller Spiele) → ${annStats.reWon}x gewonnen (${annStats.re ? ((annStats.reWon/annStats.re)*100).toFixed(1) : 0}%)`);
console.log(`Contra:  ${annStats.contra}x (${((annStats.contra/total)*100).toFixed(1)}% aller Spiele) → ${annStats.contraWon}x gewonnen (${annStats.contra ? ((annStats.contraWon/annStats.contra)*100).toFixed(1) : 0}%)`);

console.log('\n─── Spieltypen ───────────────────────────────────────');
Object.entries(resStats).sort((a,b) => b[1].n - a[1].n).forEach(([res, s]) => {
  console.log(`  ${res.padEnd(22)} ${s.n}x → Re: ${((s.reWon/s.n)*100).toFixed(1)}%  Contra: ${(((s.n-s.reWon)/s.n)*100).toFixed(1)}%`);
});
if (schweinGames.n > 0) {
  console.log(`  [davon Schwein aktiv:       ${schweinGames.n}x → Re: ${((schweinGames.reWon/schweinGames.n)*100).toFixed(1)}%]`);
}

console.log('\n─── Re-Punkte-Verteilung ─────────────────────────────');
Object.entries(trickPtBuckets).forEach(([b, n]) => {
  const bar = '█'.repeat(Math.round(n/total*40));
  console.log(`  ${b.padEnd(10)} ${String(n).padStart(3)}x  ${bar}`);
});

console.log('\n─── Strafpunkte gesamt ───────────────────────────────');
[...botIds].sort((a,b) => penaltySum[a]-penaltySum[b]).forEach(id => {
  const wr = reTeamCount[id] ? ((reWinCount[id]/reTeamCount[id])*100).toFixed(1) : 'n/a';
  console.log(`  ${id}: ${penaltySum[id]} Pkt  (Re-Rate: ${wr}%  Re-Spiele: ${reTeamCount[id]})`);
});
console.log('\n═══════════════════════════════════════════════════════\n');
