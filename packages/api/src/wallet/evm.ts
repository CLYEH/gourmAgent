/**
 * EVM / viem helpers.
 *
 * Provides a configured viem public client for Base mainnet and a polling
 * watcher that detects ERC-20 Transfer events to a specific deposit address.
 */

import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { base } from "viem/chains";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

/** Create a viem public client pointing at the configured RPC endpoint. */
export function createViemClient() {
  const rpcUrl = process.env.RPC_URL ?? "https://mainnet.base.org";
  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}

export interface TransferWatcher {
  stop: () => void;
}

/**
 * Poll for USDC Transfer events directed at `depositAddress`.
 *
 * Starts scanning from `fromBlock + 1` and advances the cursor each poll.
 * Calls `onTransfer` for every matching log found.  Returns a `stop()`
 * handle so callers can halt polling when the session completes or expires.
 *
 * Network errors are swallowed and retried on the next poll cycle.
 */
export async function watchUsdcTransfer(
  depositAddress: Address,
  usdcContract: Address,
  fromBlock: bigint,
  onTransfer: (from: Address, amount: bigint) => void,
  pollIntervalMs = 5_000,
): Promise<TransferWatcher> {
  const client = createViemClient();
  let scannedUpTo = fromBlock;
  let stopped = false;

  async function poll(): Promise<void> {
    if (stopped) return;
    try {
      const latestBlock = await client.getBlockNumber();
      if (latestBlock > scannedUpTo) {
        const logs = await client.getLogs({
          address: usdcContract,
          event: TRANSFER_EVENT,
          args: { to: depositAddress },
          fromBlock: scannedUpTo + 1n,
          toBlock: latestBlock,
        });
        scannedUpTo = latestBlock;
        for (const log of logs) {
          if (log.args.from != null && log.args.value != null) {
            onTransfer(log.args.from, log.args.value);
          }
        }
      }
    } catch {
      // Network error — will retry on next poll cycle.
    }
    if (!stopped) {
      setTimeout(() => void poll(), pollIntervalMs);
    }
  }

  // Begin polling after the first interval.
  setTimeout(() => void poll(), pollIntervalMs);

  return { stop: () => { stopped = true; } };
}
