import pino from "pino";
import { isProd } from "../config/env";

// Structured logging. In dev we pretty-print; in prod we emit JSON lines that
// log aggregators (Datadog, Loki, CloudWatch...) can parse.
export const logger = pino({
  level: isProd ? "info" : "debug",
  transport: isProd
    ? undefined
    : { target: "pino-pretty", options: { colorize: true } },
});
