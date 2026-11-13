import { DB, type PuriTransactionWrapper } from "sonamu";
import { z } from "zod";

import { type DocumentId } from "../definition/define-search";
import { SearchConfigurationError, SearchInvalidTransaction } from "../errors";
import { looksLikeTransaction } from "../postgres/rows";
import { type MarkChangedResult, type SearchSynchronization } from "../postgres/synchronization";
import { applySonamuDefaultLocale } from "./locale";

/** markChanged on the active Sonamu "w" transaction; never opens one. Nested @transactional is no rollback boundary. */
export interface SonamuSearchSynchronization {
  markChanged(logicalKey: string, ids: readonly DocumentId[]): Promise<MarkChangedResult>;
  markChangedIn(
    trx: PuriTransactionWrapper,
    logicalKey: string,
    ids: readonly DocumentId[],
  ): Promise<MarkChangedResult>;
}

const synchronizationSchema = z.looseObject({ markChanged: z.instanceof(Function) });
const transactionWrapperSchema = z.looseObject({ trx: z.instanceof(Function) });

function isTransactionWrapper(wrapper: PuriTransactionWrapper): boolean {
  return transactionWrapperSchema.safeParse(wrapper).success && looksLikeTransaction(wrapper.trx);
}

export function createSonamuSynchronization(
  synchronization: SearchSynchronization,
): SonamuSearchSynchronization {
  if (!synchronizationSchema.safeParse(synchronization).success) {
    throw new SearchConfigurationError(
      { key: "sonamu.invalidSynchronization" },
      { details: { reason: "invalid-synchronization" } },
    );
  }

  const markChangedIn = async (
    wrapper: PuriTransactionWrapper,
    logicalKey: string,
    ids: readonly DocumentId[],
  ): Promise<MarkChangedResult> => {
    applySonamuDefaultLocale();
    if (!isTransactionWrapper(wrapper)) {
      throw new SearchInvalidTransaction(
        { key: "sonamu.notTransactionWrapper" },
        { details: { reason: "not-a-transaction-wrapper" } },
      );
    }
    return synchronization.markChanged(wrapper.trx, logicalKey, ids);
  };

  return Object.freeze({
    async markChanged(logicalKey: string, ids: readonly DocumentId[]) {
      applySonamuDefaultLocale();
      const wrapper = DB.getTransactionContext().getTransaction("w");
      if (wrapper === undefined) {
        throw new SearchInvalidTransaction(
          { key: "sonamu.noActiveTransaction" },
          { details: { reason: "no-active-transaction" } },
        );
      }
      return markChangedIn(wrapper, logicalKey, ids);
    },
    markChangedIn,
  });
}
