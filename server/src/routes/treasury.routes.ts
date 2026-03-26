import { Router } from "express"
import {
	getTreasuryStats,
	getTreasuryActivity,
} from "../controllers/treasury.controller"

export const treasuryRouter = Router()

treasuryRouter.get("/stats", getTreasuryStats)
treasuryRouter.get("/activity", getTreasuryActivity)
