import type { PuriWrapper } from "./puri-wrapper";
import type { DBPreset } from "./db";

export class TransactionContext {
  private transactions: Map<DBPreset, PuriWrapper> = new Map();

  getTransaction(preset: DBPreset): PuriWrapper | undefined {
    return this.transactions.get(preset);
  }

  setTransaction(preset: DBPreset, trx: PuriWrapper): void {
    this.transactions.set(preset, trx);
  }

  deleteTransaction(preset: DBPreset): void {
    this.transactions.delete(preset);
  }
}
