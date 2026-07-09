/* Barramento de eventos de som. O jogo emite eventos semânticos nos pontos
   certos; quando houver assets de áudio, basta registrar um listener que
   mapeia evento → sample (buzina de gol, torcida, clique…). Sem listener,
   playSfx é um no-op — nenhum áudio é hardcoded. */

export type SfxEvent =
  | "click"
  | "correct"
  | "wrong"
  | "push"
  | "record"
  | "celebration"
  | "win";

type SfxListener = (event: SfxEvent) => void;

const listeners = new Set<SfxListener>();

/** Registra um handler de áudio; retorna função para remover. */
export function onSfx(listener: SfxListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Emite um evento de som para os handlers registrados (se houver). */
export function playSfx(event: SfxEvent) {
  listeners.forEach((l) => l(event));
}
