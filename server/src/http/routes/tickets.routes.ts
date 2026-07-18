import { Router } from "express";
import { listTickets } from "../../chain/tickets.js";
import { asyncHandler } from "../errors.js";
import { requireChain } from "../middleware.js";

export const ticketsRoutes = Router();

ticketsRoutes.get(
  "/:wallet",
  requireChain,
  asyncHandler(async (req, res) => {
    res.json({ tickets: await listTickets(req.params.wallet) });
  })
);
