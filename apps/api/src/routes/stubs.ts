import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const stubsRouter = Router();

stubsRouter.post("/disputes/:id/resolve", requireAuth, (_req, res) => {
  res.status(501).json({ error: "Disputes not implemented in MVP slice" });
});

stubsRouter.post("/contracts/:id/reviews", requireAuth, (_req, res) => {
  res.status(501).json({ error: "Reviews not implemented in MVP slice" });
});
