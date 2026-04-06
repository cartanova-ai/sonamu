import { Disk } from "flydrive";

import { assertDefined } from "../utils/utils";
import type { DriverKey } from "./drivers";
import type { StorageConfig } from "./types";

/**
 * 여러 디스크를 관리하는 매니저
 */
export class StorageManager {
  private disks: Map<DriverKey, Disk> = new Map();

  constructor(private config: StorageConfig) {}

  /**
   * 디스크 인스턴스 반환 (lazy initialization)
   * @param diskName 디스크 이름 (없으면 default)
   */
  use(diskName: DriverKey): Disk {
    if (!this.disks.has(diskName)) {
      const factory = this.config.drivers[diskName];
      if (!factory) {
        const available = Object.keys(this.config.drivers).join(", ");
        throw new Error(`Unknown disk: "${diskName}". Available: ${available}`);
      }
      this.disks.set(diskName, new Disk(factory()));
    }

    return assertDefined(this.disks.get(diskName), `Disk ${diskName} not found`);
  }
}
