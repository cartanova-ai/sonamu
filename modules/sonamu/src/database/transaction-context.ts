import type { PuriTransactionWrapper } from "./puri-wrapper";
import type { DBPreset } from "./db";

export class TransactionContext {
  private transactions: Map<DBPreset, PuriTransactionWrapper> = new Map();

  getTransaction(preset: DBPreset): PuriTransactionWrapper | undefined {
    return this.transactions.get(preset);
  }

  setTransaction(preset: DBPreset, trx: PuriTransactionWrapper): void {
    this.transactions.set(preset, trx);
  }

  deleteTransaction(preset: DBPreset): void {
    this.transactions.delete(preset);
  }
}
