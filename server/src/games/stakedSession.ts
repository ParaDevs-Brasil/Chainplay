import crypto from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { userAddress, type UserRecord } from "../auth/store.js";
import { HttpError } from "../http/errors.js";
import {
  HOUSE_LOSE,
  HOUSE_WIN,
  createHouseMarket,
  houseBetArrived,
  settleHouseMarket,
} from "../chain/house.js";
import { getChain } from "../chain/client.js";
import { JsonFileStore } from "../store/jsonFile.js";

/**
 * Motor genérico de sessão house-backed (Padrão B), reutilizado por todos os
 * jogos skill single-player que apostam SOL: Penalty, Live Challenge e Guess
 * the Team. O jogador assina UM place_bet (mercado house-backed criado por
 * sessão, que já minta a NFT do `gameId` do jogo), responde N desafios dentro
 * do timer e, se bater a meta de acertos, resgata o prêmio com odds fixas. A
 * margem da casa está embutida nas odds.
 *
 * Cada jogo entra com sua própria config (gameId → NFT, odds, nº de rodadas) e
 * um `ChallengeProvider` que produz/checa o desafio (evento arcade, rodada de
 * quiz, etc.). Assim a mecânica de aposta é a mesma, mas cada jogo tem sua
 * identidade on-chain e sua própria "cara".
 */

export type SessionStatus =
  | "awaiting_bet"
  | "playing"
  | "won"
  | "lost"
  | "expired"
  | "settled";

export interface SessionRecord {
  id: string;
  wallet: string;
  userId?: string;
  marketId: string;
  marketPdaB58: string;
  target: number;
  oddsBps: number;
  stakeLamports: number;
  netLamports: number;
  payoutLamports: number;
  closeTs: number;
  resolveAfterTs: number;
  status: SessionStatus;
  rounds: number; // desafios já respondidos
  hits: number;
  /** desafio em aberto (id no provider), aguardando resposta */
  currentEventId?: string;
  finalOutcome?: number;
  createdAt: number;
}

/** Resultado de um desafio conferido no server. */
export interface CheckResult {
  correct: boolean;
  /** dados públicos do resultado (reveal) — cada jogo tem o seu formato */
  view: Record<string, unknown>;
}

/** Fonte de desafios de um jogo: produz o próximo e confere a resposta. O
 *  segredo (resposta certa) nunca sai daqui — a checagem é 100% server-side. */
export interface ChallengeProvider {
  /** produz o próximo desafio; devolve o id (pra conferir depois) e a view
   *  pública que o client renderiza (sem a resposta). */
  serveNext(wallet: string): Promise<{ eventId: string; view: Record<string, unknown> }>;
  /** confere a resposta do desafio em aberto. */
  check(eventId: string, choice: number, name?: string): CheckResult;
  /** marca timeout/abandono do desafio como erro (não lança). */
  timeout(eventId: string): void;
}

export interface SessionConfig {
  /** rótulo para logs/erros */
  label: string;
  /** id do jogo no contrato (define a coleção NFT do ticket) */
  gameId: number;
  /** nº de desafios por sessão */
  rounds: number;
  /** metas de acerto válidas → odds em bps (10000 = 1x) */
  oddsByTarget: Record<number, number>;
  /** arquivo do store (isolado por jogo) */
  storeFile: string;
  /** janela (s) para o jogador assinar o place_bet */
  betWindowS?: number;
  /** stake mínimo em lamports */
  minStake?: number;
  provider: ChallengeProvider;
}

const DEFAULT_BET_WINDOW_S = 180;
const WO_AFTER_S = 30 * 60; // sessão abandonada no meio = derrota
const NEW_SESSION_WINDOW_MS = 5 * 60 * 1000;
const MAX_NEW_SESSIONS = 10;

/** Uma instância = um jogo apostável. Encapsula o store e a lógica; as rotas e
 *  o cron chamam os métodos daqui. */
export class StakedSessionGame {
  private readonly store: JsonFileStore<{ sessions: SessionRecord[] }>;
  private readonly betWindowS: number;
  private readonly minStake: number;

  constructor(private readonly cfg: SessionConfig) {
    this.store = new JsonFileStore(cfg.storeFile, () => ({ sessions: [] }));
    this.betWindowS = cfg.betWindowS ?? DEFAULT_BET_WINDOW_S;
    this.minStake = cfg.minStake ?? 1_000_000;
  }

  get config() {
    return { odds: this.cfg.oddsByTarget, rounds: this.cfg.rounds, enabled: Boolean(getChain()) };
  }

  view(s: SessionRecord) {
    return {
      id: s.id,
      wallet: s.wallet,
      marketId: s.marketId,
      marketPda: s.marketPdaB58,
      target: s.target,
      oddsBps: s.oddsBps,
      stakeLamports: s.stakeLamports,
      payoutLamports: s.payoutLamports,
      closeTs: s.closeTs,
      status: s.status,
      rounds: s.rounds,
      hits: s.hits,
      totalRounds: this.cfg.rounds,
    };
  }

  get(id: string): SessionRecord | undefined {
    return this.store.load().sessions.find((s) => s.id === id);
  }

  assertOwner(s: SessionRecord, user: UserRecord) {
    const owns = s.userId ? s.userId === user.id : s.wallet === userAddress(user);
    if (!owns) throw new HttpError(403, "essa sessão não pertence a esta conta");
  }

  listByWallet(wallet: string) {
    return this.store
      .load()
      .sessions.filter((s) => s.wallet === wallet)
      .map((s) => this.view(s));
  }

  async create(user: UserRecord, target: number, stakeLamports: number) {
    if (!getChain()) throw new HttpError(503, "on-chain desativado no server (authority ausente)");
    const wallet = userAddress(user);
    try {
      new PublicKey(wallet);
    } catch {
      throw new HttpError(400, "wallet inválida");
    }
    const oddsBps = this.cfg.oddsByTarget[target];
    if (!oddsBps) {
      throw new HttpError(
        400,
        `meta inválida: escolha entre ${Object.keys(this.cfg.oddsByTarget).join(", ")}`
      );
    }
    if (!Number.isInteger(stakeLamports) || stakeLamports < this.minStake) {
      throw new HttpError(400, `stake mínimo: ${this.minStake} lamports`);
    }

    const s = this.store.load();
    const nowS = Math.floor(Date.now() / 1000);
    if (
      s.sessions.some(
        (x) =>
          x.wallet === wallet &&
          (x.status === "playing" || (x.status === "awaiting_bet" && nowS <= x.closeTs))
      )
    ) {
      throw new HttpError(409, "você já tem uma sessão ativa — termine-a antes de abrir outra");
    }
    // anti-drain: criar+fundear custa SOL da authority
    if (s.sessions.filter((x) => Date.now() - x.createdAt < NEW_SESSION_WINDOW_MS).length >= MAX_NEW_SESSIONS) {
      throw new HttpError(429, "limite de novas sessões atingido — tente em alguns minutos");
    }

    const market = await createHouseMarket(oddsBps, stakeLamports, this.betWindowS, this.cfg.gameId);
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      wallet,
      userId: user.id,
      marketId: market.marketId,
      marketPdaB58: market.marketPdaB58,
      target,
      oddsBps,
      stakeLamports,
      netLamports: market.netLamports,
      payoutLamports: market.payoutLamports,
      closeTs: market.closeTs,
      resolveAfterTs: market.resolveAfterTs,
      status: "awaiting_bet",
      rounds: 0,
      hits: 0,
      createdAt: Date.now(),
    };
    this.store.update((d) => d.sessions.push(session));
    console.log(
      `[${this.cfg.label}] sessão criada: ${wallet.slice(0, 6)}… meta ${target}/${this.cfg.rounds} · stake ${stakeLamports}`
    );
    return this.view(session);
  }

  private finishIfDecided(s: SessionRecord) {
    const remaining = this.cfg.rounds - s.rounds;
    if (s.hits >= s.target) {
      s.status = "won";
      s.finalOutcome = HOUSE_WIN;
    } else if (s.hits + remaining < s.target) {
      s.status = "lost";
      s.finalOutcome = HOUSE_LOSE;
    } else if (s.rounds >= this.cfg.rounds) {
      s.status = "lost";
      s.finalOutcome = HOUSE_LOSE;
    }
  }

  private record(s: SessionRecord, correct: boolean) {
    s.currentEventId = undefined;
    s.rounds += 1;
    if (correct) s.hits += 1;
    this.finishIfDecided(s);
  }

  /** Serve o próximo desafio (verifica o place_bet na primeira vez). */
  async next(id: string, user: UserRecord) {
    const s = this.get(id);
    if (!s) throw new HttpError(404, "sessão não encontrada");
    this.assertOwner(s, user);
    if (s.status === "awaiting_bet") {
      if (!(await houseBetArrived(s.marketId, s.netLamports))) {
        throw new HttpError(400, "aposta ainda não confirmada on-chain — assine o place_bet primeiro");
      }
      s.status = "playing";
      this.store.save();
    }
    if (s.status !== "playing") throw new HttpError(409, `sessão encerrada (${s.status})`);

    // desafio abandonado (fechou a página no meio): conta como erro e segue
    if (s.currentEventId) {
      this.cfg.provider.timeout(s.currentEventId);
      this.record(s, false);
      this.store.save();
      if (s.status !== "playing") return { session: this.view(s), event: null };
    }

    const { eventId, view } = await this.cfg.provider.serveNext(s.wallet);
    s.currentEventId = eventId;
    this.store.save();
    return { session: this.view(s), event: view };
  }

  /** Confere a resposta do desafio em aberto (timeout conta como erro). */
  answer(id: string, choice: number, user: UserRecord, name?: string) {
    const s = this.get(id);
    if (!s) throw new HttpError(404, "sessão não encontrada");
    this.assertOwner(s, user);
    if (s.status !== "playing" || !s.currentEventId) {
      throw new HttpError(409, "nenhum desafio em aberto nessa sessão");
    }
    let result: CheckResult;
    try {
      result = this.cfg.provider.check(s.currentEventId, choice, name);
    } catch {
      result = { correct: false, view: { late: true } };
    }
    this.record(s, result.correct);
    this.store.save();
    return { ...result.view, correct: result.correct, session: this.view(s) };
  }

  /** Cron: liquida sessões terminadas e expira as que nunca apostaram. */
  async settle() {
    if (!getChain()) return;
    const now = Math.floor(Date.now() / 1000);
    for (const s of this.store.load().sessions) {
      const done = s.status === "won" || s.status === "lost";
      const betWindowDead = s.status === "awaiting_bet" && now > s.resolveAfterTs + 120;
      const abandoned =
        betWindowDead || (s.status === "playing" && now > s.resolveAfterTs + WO_AFTER_S);
      if (!done && !abandoned) continue;
      if (now < s.resolveAfterTs) continue;

      if (betWindowDead && (await houseBetArrived(s.marketId, s.netLamports).catch(() => false))) {
        s.status = "playing";
        this.store.save();
        continue;
      }

      try {
        const outcome = s.finalOutcome ?? HOUSE_LOSE;
        const free = await settleHouseMarket(s.marketId, outcome);
        s.status = s.status === "awaiting_bet" ? "expired" : "settled";
        this.store.save();
        console.log(
          `[${this.cfg.label}] sessão ${s.id.slice(0, 8)} liquidada (outcome ${outcome}, ${free} lamports reciclados)`
        );
      } catch (err) {
        console.warn(
          `[${this.cfg.label}] falha liquidando sessão ${s.id.slice(0, 8)}: ${(err as Error).message}`
        );
      }
    }
  }
}
