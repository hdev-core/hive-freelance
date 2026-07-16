import type { Request } from "express";
import { AppError } from "./errors.js";

/** Express 5 types params as string | string[]; coerce to a single string. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) throw new AppError(400, `Missing path param :${name}`);
  return raw;
}
