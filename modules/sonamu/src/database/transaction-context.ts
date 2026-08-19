import { type DBPreset } from "./db";
import { type PuriTransactionWrapper } from "./puri-wrapper";

export class TransactionContext {
  constructor(
    private readonly parent?: TransactionContext,
    private local?: {
      preset: DBPreset;
      transaction: PuriTransactionWrapper;
    },
  ) {}

  getTransaction(preset: DBPreset): PuriTransactionWrapper | undefined {
    return this.local?.preset === preset
      ? this.local.transaction
      : this.parent?.getTransaction(preset);
  }

  getActiveTransaction(): PuriTransactionWrapper | undefined {
    return this.local?.transaction ?? this.parent?.getActiveTransaction();
  }

  clearLocal(): void {
    this.local = undefined;
  }
}
