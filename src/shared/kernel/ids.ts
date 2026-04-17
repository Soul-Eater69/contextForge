import { createHash, randomUUID } from "node:crypto";

export const createId = (prefix: string): string =>
  `${prefix}_${randomUUID().replaceAll("-", "")}`;

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

