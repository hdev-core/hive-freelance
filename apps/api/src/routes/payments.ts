import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/errors.js";
import { param } from "../lib/params.js";
import {
  requireAuth,
  requireClient,
  requireFreelancer,
} from "../middleware/auth.js";
import {
  confirmFund,
  confirmRatify,
  confirmRefund,
  confirmRelease,
  executeCustodialSign,
  ratifyPayload,
  refundPayload,
  releasePayload,
} from "../services/payments.js";

export const paymentsRouter = Router();

const txBody = z.object({ hive_tx_id: z.string().min(1) });

paymentsRouter.patch(
  "/:id/confirm",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const body = txBody.parse(req.body);
    const payment = await confirmFund(
      param(req, "id"),
      req.user!.id,
      body.hive_tx_id,
    );
    res.json(payment);
  }),
);

paymentsRouter.post(
  "/:id/ratify",
  requireAuth,
  requireFreelancer,
  asyncHandler(async (req, res) => {
    const result = await ratifyPayload(param(req, "id"), req.user!.id);
    res.json(result);
  }),
);

paymentsRouter.patch(
  "/:id/ratify/confirm",
  requireAuth,
  requireFreelancer,
  asyncHandler(async (req, res) => {
    const body = txBody.parse(req.body);
    const payment = await confirmRatify(
      param(req, "id"),
      req.user!.id,
      body.hive_tx_id,
    );
    res.json(payment);
  }),
);

paymentsRouter.post(
  "/:id/release",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const result = await releasePayload(param(req, "id"), req.user!.id);
    res.json(result);
  }),
);

paymentsRouter.patch(
  "/:id/release/confirm",
  requireAuth,
  requireClient,
  asyncHandler(async (req, res) => {
    const body = txBody.parse(req.body);
    const payment = await confirmRelease(
      param(req, "id"),
      req.user!.id,
      body.hive_tx_id,
    );
    res.json(payment);
  }),
);

paymentsRouter.post(
  "/:id/refund",
  requireAuth,
  requireFreelancer,
  asyncHandler(async (req, res) => {
    const result = await refundPayload(param(req, "id"), req.user!.id);
    res.json(result);
  }),
);

paymentsRouter.patch(
  "/:id/refund/confirm",
  requireAuth,
  requireFreelancer,
  asyncHandler(async (req, res) => {
    const body = txBody.parse(req.body);
    const payment = await confirmRefund(
      param(req, "id"),
      req.user!.id,
      body.hive_tx_id,
    );
    res.json(payment);
  }),
);

paymentsRouter.post(
  "/:id/custodial-sign",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        op: z.enum([
          "escrow_transfer",
          "escrow_approve",
          "escrow_release",
        ]),
        payload: z.record(z.string(), z.unknown()),
      })
      .parse(req.body);
    const result = await executeCustodialSign(req.user!.id, body.op, [
      { [body.op]: body.payload },
    ]);
    res.json(result);
  }),
);
