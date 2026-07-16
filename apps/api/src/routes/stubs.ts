import { Router } from "express";

/** Reserved mounts — return 501 until feature docs are implemented. */
export const stubRouter = Router();

const notImplemented = (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
  res.status(501).json({ error: "Not implemented yet", phase: "post-scaffold" });
};

stubRouter.all("/auth", notImplemented);
stubRouter.all("/auth/*", notImplemented);
stubRouter.all("/users", notImplemented);
stubRouter.all("/users/*", notImplemented);
stubRouter.all("/jobs", notImplemented);
stubRouter.all("/jobs/*", notImplemented);
stubRouter.all("/proposals", notImplemented);
stubRouter.all("/proposals/*", notImplemented);
stubRouter.all("/contracts", notImplemented);
stubRouter.all("/contracts/*", notImplemented);
stubRouter.all("/milestones", notImplemented);
stubRouter.all("/milestones/*", notImplemented);
stubRouter.all("/payments", notImplemented);
stubRouter.all("/payments/*", notImplemented);
