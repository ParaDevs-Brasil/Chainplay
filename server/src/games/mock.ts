import type { GameMatch } from "./matches.js";

// Dataset simulado da Copa 2026 (104 jogos) usado quando a API TxLINE não está
// disponível — mesmo formato do dado real, então o front não sabe a diferença.

const TEAMS = [
  "Brasil", "Argentina", "França", "Inglaterra", "Espanha", "Alemanha",
  "Portugal", "Holanda", "Bélgica", "Croácia", "Uruguai", "Colômbia",
  "México", "Estados Unidos", "Canadá", "Japão", "Coreia do Sul", "Austrália",
  "Marrocos", "Senegal", "Nigéria", "Egito", "Gana", "Camarões",
  "Suíça", "Dinamarca", "Polônia", "Sérvia", "Áustria", "Ucrânia",
  "Equador", "Paraguai", "Chile", "Peru", "Venezuela", "Costa Rica",
  "Panamá", "Jamaica", "Arábia Saudita", "Irã", "Catar", "Uzbequistão",
  "Jordânia", "Argélia", "Tunísia", "Costa do Marfim", "Noruega", "Escócia",
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(rand: () => number, lambda: number): number {
  let l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > l);
  return k - 1;
}

const STAGES: Array<[string, number]> = [
  ["Fase de Grupos", 72],
  ["16 avos de final", 16],
  ["Oitavas de final", 8],
  ["Quartas de final", 4],
  ["Semifinal", 2],
  ["Disputa de 3º lugar", 1],
  ["Final", 1],
];

export function generateMockMatches(): GameMatch[] {
  const rand = mulberry32(2026);
  const matches: GameMatch[] = [];
  const kickoff = Date.UTC(2026, 5, 11, 18, 0, 0); // 11 jun 2026
  let matchIndex = 0;

  for (const [stage, count] of STAGES) {
    for (let i = 0; i < count; i++) {
      const t1 = TEAMS[Math.floor(rand() * TEAMS.length)];
      let t2 = TEAMS[Math.floor(rand() * TEAMS.length)];
      while (t2 === t1) t2 = TEAMS[Math.floor(rand() * TEAMS.length)];

      const pos1 = Math.round(35 + rand() * 30);
      matches.push({
        fixtureId: 26000000 + matchIndex,
        competition: "FIFA World Cup 2026",
        stage,
        matchNumber: matchIndex + 1,
        startTime: kickoff + matchIndex * 8 * 60 * 60 * 1000,
        home: t1,
        away: t2,
        stats: {
          goals: [poisson(rand, 1.5), poisson(rand, 1.2)],
          corners: [poisson(rand, 5.2), poisson(rand, 4.6)],
          yellowCards: [poisson(rand, 1.8), poisson(rand, 2.0)],
          redCards: [rand() < 0.06 ? 1 : 0, rand() < 0.06 ? 1 : 0],
          possession: [pos1, 100 - pos1],
        },
        finished: true,
      });
      matchIndex++;
    }
  }
  return matches;
}
