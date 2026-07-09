import confetti from "canvas-confetti";

/* Celebrações de acerto: confete central + "fogos" discretos ao fundo,
   com intensidade escalada pela streak. canvas-confetti roda num canvas
   próprio em overlay (pointer-events: none), fora da árvore React, e
   remove as partículas sozinho ao fim da animação. */

const BRAND_COLORS = ["#00a24a", "#3ee8b5", "#ffcc00", "#f4f7fb"];
const GOLD_COLORS = ["#ffcc00", "#ffe066", "#fff3bf", "#f59f00"];

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* partículas temáticas de Copa (⚽ 🔥 🏆); rasterizar emoji é caro,
   então cada shape é criada uma única vez, sob demanda */
const EMOJI_SCALAR = 1.8;
const emojiShapes = new Map<string, confetti.Shape>();

function emojiShape(emoji: string, scalar = EMOJI_SCALAR): confetti.Shape {
  const key = `${emoji}@${scalar}`;
  let shape = emojiShapes.get(key);
  if (!shape) {
    shape = confetti.shapeFromText({ text: emoji, scalar });
    emojiShapes.set(key, shape);
  }
  return shape;
}

// rajada de emojis subindo do centro, junto com o confete
function emojiBurst(emojis: string[], count: number, spread: number) {
  confetti({
    particleCount: count,
    spread,
    startVelocity: 30,
    gravity: 0.8,
    decay: 0.94,
    scalar: EMOJI_SCALAR,
    flat: true,
    ticks: 160,
    origin: { x: 0.5, y: 0.45 },
    shapes: emojis.map(emojiShape),
    disableForReducedMotion: true,
  });
}

// explosão radial pequena e suave, estilo fogo de artifício ao fundo
function firework(colors: string[], scalar = 0.7) {
  confetti({
    particleCount: 20,
    spread: 360,
    startVelocity: 14,
    gravity: 0.5,
    decay: 0.92,
    scalar,
    ticks: 120,
    origin: {
      x: 0.15 + Math.random() * 0.7,
      y: 0.15 + Math.random() * 0.3,
    },
    colors,
    disableForReducedMotion: true,
  });
}

/** Dispara a celebração de um acerto; a intensidade cresce com a streak. */
export function celebrateCorrect(streak: number) {
  if (prefersReducedMotion()) return; // fica só o indicador de texto

  const tier =
    streak >= 15 ? 4 : streak >= 10 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1 : 0;
  const colors = streak >= 5 ? GOLD_COLORS : BRAND_COLORS;

  // rajada central: dois disparos com tamanhos de partícula diferentes
  const base = {
    spread: 70 + tier * 15,
    startVelocity: 38,
    gravity: 0.9,
    ticks: 180,
    origin: { x: 0.5, y: 0.45 },
    colors,
    disableForReducedMotion: true,
  };
  confetti({ ...base, particleCount: 30 + tier * 30, scalar: 1 + tier * 0.08 });
  confetti({ ...base, particleCount: 14 + tier * 12, scalar: 0.6 });

  // clima de Copa: bolas voando junto; 🔥 entra nas streaks quentes
  const emojis = tier >= 2 ? ["⚽", "🔥"] : ["⚽"];
  emojiBurst(emojis, 4 + tier * 3, 60 + tier * 15);

  // fogos ao fundo, escalonados no tempo para não virar um flash único
  const fireworks = [0, 2, 3, 4, 6][tier];
  for (let i = 0; i < fireworks; i++) {
    window.setTimeout(() => firework(colors, 0.6 + tier * 0.08), 160 + i * 240);
  }
}

/** Celebração máxima — usada ao zerar o jogo. */
export function celebrateWin() {
  if (prefersReducedMotion()) return;

  confetti({
    particleCount: 160,
    spread: 100,
    startVelocity: 45,
    gravity: 0.9,
    ticks: 220,
    origin: { x: 0.5, y: 0.4 },
    colors: GOLD_COLORS,
    disableForReducedMotion: true,
  });
  emojiBurst(["⚽", "🔥"], 10, 90);
  for (let i = 0; i < 6; i++) {
    window.setTimeout(() => firework(GOLD_COLORS, 0.9), 200 + i * 280);
  }

  // chuva de troféus caindo do topo, como no levantamento da taça
  for (let i = 0; i < 8; i++) {
    window.setTimeout(() => {
      confetti({
        particleCount: 1,
        angle: 270,
        spread: 40,
        startVelocity: 12,
        gravity: 0.7,
        decay: 0.96,
        scalar: 2.2,
        flat: true,
        ticks: 200,
        origin: { x: 0.1 + Math.random() * 0.8, y: -0.05 },
        shapes: [emojiShape("🏆", 2.2)],
        disableForReducedMotion: true,
      });
    }, i * 180);
  }
}
