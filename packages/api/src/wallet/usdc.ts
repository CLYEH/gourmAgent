/**
 * USDC payment session manager.
 *
 * Handles per-session deposit address derivation (deterministic child key
 * from the master WALLET_PRIVATE_KEY), Transfer event watching, and API key
 * issuance on payment confirmation.
 *
 * Each payment session gets a unique Ethereum address derived via:
 *   childKey = keccak256(masterPrivateKey ‖ uint32(sessionIndex))
 *
 * This is deterministic and reproducible — not BIP-32, but sufficient for
 * server-side deposit-address generation without exposing the master key.
 */

import { keccak256, toBytes, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createViemClient, watchUsdcTransfer } from "./evm.js";
import { keyStore } from "../keyStore.js";

/** USDC uses 6 decimal places.  0.10 USDC = 100_000 base units. */
export const USDC_PRICE_UNITS = 100_000n;
export const USDC_PRICE_DISPLAY = "0.10";

const SESSION_TTL_MS = 30 * 60 * 1_000; // 30 minutes

/** Returns the USDC contract address for Base mainnet (env-overridable). */
export function getUsdcContract(): Address {
  return (
    process.env.USDC_CONTRACT_ADDRESS ??
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  ) as Address;
}

interface PendingSession {
  userId: string;
  depositAddress: Address;
  expectedAmount: bigint;
  expiresAt: Date;
  stopWatcher: (() => void) | null;
}

class UsdcPaymentManager {
  /** Sessions indexed by depositAddress.toLowerCase(). */
  private sessions = new Map<string, PendingSession>();
  private sessionIndex = 0;

  /**
   * Derive a unique deposit address from the master private key and a counter.
   * childKey = keccak256(masterPrivateKeyBytes ‖ uint32BE(index))
   */
  deriveDepositAddress(masterKey: `0x${string}`, index: number): Address {
    const masterBytes = toBytes(masterKey);
    const indexBytes = new Uint8Array(4);
    new DataView(indexBytes.buffer).setUint32(0, index, false);
    const combined = new Uint8Array(masterBytes.length + indexBytes.length);
    combined.set(masterBytes);
    combined.set(indexBytes, masterBytes.length);
    const childKey = keccak256(combined);
    return privateKeyToAccount(childKey).address;
  }

  /**
   * Create a new payment session.
   *
   * Derives a unique deposit address, records the expected USDC amount, starts
   * a Transfer event watcher, and returns the details to show the client.
   */
  async createSession(
    userId: string,
  ): Promise<{ depositAddress: Address; amountUsdc: string; expiresAt: Date }> {
    const masterKey = process.env.WALLET_PRIVATE_KEY as
      | `0x${string}`
      | undefined;
    if (!masterKey) throw new Error("WALLET_PRIVATE_KEY is not configured");

    const index = this.sessionIndex++;
    const depositAddress = this.deriveDepositAddress(masterKey, index);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const usdcContract = getUsdcContract();

    // Snapshot the current block so we only scan future transfers.
    let fromBlock = 0n;
    try {
      const client = createViemClient();
      fromBlock = await client.getBlockNumber();
    } catch {
      // If the RPC is unreachable, fall back to scanning from block 0.
    }

    const session: PendingSession = {
      userId,
      depositAddress,
      expectedAmount: USDC_PRICE_UNITS,
      expiresAt,
      stopWatcher: null,
    };
    this.sessions.set(depositAddress.toLowerCase(), session);

    // Begin polling for Transfer events.
    const watcher = await watchUsdcTransfer(
      depositAddress,
      usdcContract,
      fromBlock,
      (_from, amount) => {
        this.handleTransfer(depositAddress, amount);
      },
    );
    session.stopWatcher = watcher.stop;

    // Auto-clean when the session TTL expires.
    setTimeout(() => {
      const s = this.sessions.get(depositAddress.toLowerCase());
      if (s) {
        s.stopWatcher?.();
        this.sessions.delete(depositAddress.toLowerCase());
      }
    }, SESSION_TTL_MS);

    return { depositAddress, amountUsdc: USDC_PRICE_DISPLAY, expiresAt };
  }

  /**
   * Called when a Transfer event is detected on-chain.
   *
   * If the amount meets the expected price and the session hasn't expired,
   * issues an API key and returns the cryptoSessionId (for key retrieval).
   * Returns null if the payment is invalid, insufficient, or the session
   * is unknown/expired.
   */
  handleTransfer(depositAddress: Address, amount: bigint): string | null {
    const key = depositAddress.toLowerCase();
    const session = this.sessions.get(key);
    if (!session) return null;

    if (new Date() > session.expiresAt) {
      session.stopWatcher?.();
      this.sessions.delete(key);
      return null;
    }

    if (amount < session.expectedAmount) return null; // underpayment

    // Payment confirmed — issue an API key retrievable via the deposit address.
    session.stopWatcher?.();
    this.sessions.delete(key);
    const cryptoSessionId = `crypto_${key}`;
    keyStore.issue(session.userId, cryptoSessionId);
    return cryptoSessionId;
  }

  /** Return the pending session for a deposit address, or undefined. */
  getSession(depositAddress: Address): Readonly<PendingSession> | undefined {
    return this.sessions.get(depositAddress.toLowerCase());
  }
}

// Singleton — shared across all imports in the same process.
export const usdcPaymentManager = new UsdcPaymentManager();
