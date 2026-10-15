/**
 * Content cache boundary.
 *
 * Resolved packages are stored by integrity digest so locked and offline
 * resolution can reproduce content without touching the network.
 */
export interface ContentCachePort {
  has(integrity: string): Promise<boolean>;
  directoryFor(integrity: string): Promise<string>;
  /** Copy `sourceDirectory` into the cache and return the cached directory. */
  store(integrity: string, sourceDirectory: string): Promise<string>;
}
