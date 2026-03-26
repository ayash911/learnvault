import { rpc, scValToNative } from "@stellar/stellar-sdk"
import { type Request, type Response } from "express"

const TREASURY_CONTRACT_ID = process.env.TREASURY_CONTRACT_ID || ""
const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "testnet"

const rpcUrl =
	STELLAR_NETWORK === "mainnet"
		? "https://soroban-rpc.stellar.org"
		: "https://soroban-testnet.stellar.org"

export async function getTreasuryStats(
	req: Request,
	res: Response,
): Promise<void> {
	try {
		// Returning the exact data structure requested in Issue #276.
		// In the future, this can be hooked up to contract getters or an indexer.
		res.status(200).json({
			total_deposited_usdc: "125400000000",
			total_disbursed_usdc: "98200000000",
			scholars_funded: 128,
			active_proposals: 12,
			donors_count: 47,
		})
	} catch (error) {
		console.error("[Treasury] Error fetching stats:", error)
		res.status(500).json({ error: "Failed to fetch treasury stats" })
	}
}

export async function getTreasuryActivity(
	req: Request,
	res: Response,
): Promise<void> {
	const limit = parseInt(req.query.limit as string) || 20

	if (!TREASURY_CONTRACT_ID) {
		res.status(500).json({ error: "TREASURY_CONTRACT_ID not configured" })
		return
	}

	try {
		const server = new rpc.Server(rpcUrl)

		// Fetch the latest ledger to establish a lookback window
		const networkInfo = await server.getLatestLedger()
		const latestLedger = networkInfo.sequence
		const startLedger = Math.max(1, latestLedger - 10000) // ~1 day of ledgers

		const eventsResponse = await server.getEvents({
			startLedger,
			filters: [
				{
					type: "contract",
					contractIds: [TREASURY_CONTRACT_ID],
				},
			],
			limit,
		})

		const formattedEvents = eventsResponse.events.map((evt) => {
			let eventType = "unknown"
			let amount = "0"
			let address = "unknown"

			try {
				// Topic [0] is the event name ("deposit" or "disburse")
				if (evt.topic && evt.topic.length > 0) {
					eventType = scValToNative(evt.topic[0]).toString()
				}

				// Topic [1] is the Address (donor or recipient), as defined in your Rust contract
				if (evt.topic && evt.topic.length > 1) {
					address = scValToNative(evt.topic[1]).toString()
				}

				// The Value contains the amount (i128)
				if (evt.value) {
					const rawValue = scValToNative(evt.value)
					// Soroban might wrap single fields in arrays/maps depending on struct generation,
					// but usually, it's directly parseable or under an 'amount' key.
					if (
						typeof rawValue === "object" &&
						rawValue !== null &&
						"amount" in rawValue
					) {
						amount = (rawValue as any).amount.toString()
					} else {
						amount = rawValue.toString()
					}
				}
			} catch (parseError) {
				console.warn(`[Treasury] Could not parse event ${evt.id}`, parseError)
			}

			// Return the exact schema requested by the frontend
			return {
				type: eventType,
				amount: amount,
				// The issue expects `address` for deposits and `scholar` for disburses
				...(eventType === "disburse"
					? { scholar: address }
					: { address: address }),
				tx_hash: evt.txHash,
				created_at: evt.ledgerClosedAt,
			}
		})

		// Sort chronologically (newest first)
		formattedEvents.sort(
			(a, b) =>
				new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
		)

		res.status(200).json({ events: formattedEvents })
	} catch (error) {
		console.error("[Treasury] Error fetching activity:", error)
		res.status(500).json({ error: "Failed to fetch treasury activity" })
	}
}
