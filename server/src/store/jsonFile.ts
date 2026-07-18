import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../config.js";

/**
 * Persistência simples em arquivo JSON dentro de DATA_DIR, com cache em
 * memória. Suficiente pra devnet/hackathon (single-process); em produção o
 * contrato `load/save/update` migra direto pra um banco de verdade.
 */
export class JsonFileStore<T> {
  private cache: T | null = null;
  private readonly filePath: string;

  constructor(fileName: string, private readonly empty: () => T) {
    this.filePath = path.join(DATA_DIR, fileName);
  }

  load(): T {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch {
      this.cache = this.empty();
    }
    return this.cache!;
  }

  save(): void {
    if (!this.cache) return;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), {
      mode: 0o600,
    });
  }

  /** lê, aplica a mutação e persiste em uma chamada */
  update<R>(fn: (data: T) => R): R {
    const result = fn(this.load());
    this.save();
    return result;
  }
}
