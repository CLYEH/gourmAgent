/**
 * In-memory API key store.
 *
 * Keys are hashed with SHA-256 at rest; the plaintext key is returned only
 * once (at issuance) and retrievable once via retrieveForSession().  In
 * production this store should be backed by a persistent database.
 */

import { createHash, randomBytes } from "crypto";

interface KeyRecord {
  userId: string;
  createdAt: Date;
  expiresAt: Date | null;
  stripeSessionId: string;
}

class KeyStore {
  private keys = new Map<string, KeyRecord>(); // sha256(key) → record
  private pending = new Map<string, string>(); // stripeSessionId → plaintext key

  /**
   * Issue a new API key.  Returns the plaintext key — the only time it is
   * available in plain text.  The key is also stored under its session ID so
   * the client can retrieve it once via retrieveForSession().
   */
  issue(userId: string, stripeSessionId: string): string {
    const key = `ga_${randomBytes(24).toString("hex")}`;
    const hash = createHash("sha256").update(key).digest("hex");
    this.keys.set(hash, {
      userId,
      createdAt: new Date(),
      expiresAt: null,
      stripeSessionId,
    });
    this.pending.set(stripeSessionId, key);
    return key;
  }

  /** Returns true if the plaintext key is valid and not expired. */
  validate(key: string): boolean {
    const hash = createHash("sha256").update(key).digest("hex");
    const record = this.keys.get(hash);
    if (!record) return false;
    if (record.expiresAt && record.expiresAt < new Date()) return false;
    return true;
  }

  /**
   * One-time retrieval of the plaintext key associated with a Stripe session.
   * Returns null if already retrieved or session unknown.
   */
  retrieveForSession(stripeSessionId: string): string | null {
    const key = this.pending.get(stripeSessionId) ?? null;
    if (key) this.pending.delete(stripeSessionId);
    return key;
  }
}

// Singleton — shared across all imports in the same process.
export const keyStore = new KeyStore();
