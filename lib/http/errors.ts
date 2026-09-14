import { ZodError } from "zod";
import { RecoverableApplicationError } from "@/lib/application/application-error";
import { BookletNotFoundError } from "@/lib/application/booklet-service";
import { AgentConfigurationUnavailableError } from "@/lib/application/agent-resolver";
import { MaintenanceModeError } from "@/lib/application/deployment-control";

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    recoverable: boolean;
    details?: unknown;
  };
};

export function toErrorEnvelope(error: unknown): { status: number; body: ErrorEnvelope } {
  if (error instanceof MaintenanceModeError) return { status: error.status, body: { error: { code: error.code, message: error.message, recoverable: true } } };
  if (error instanceof BookletNotFoundError) {
    return {
      status: 404,
      body: { error: { code: "booklet_not_found", message: "This booklet could not be found.", recoverable: true } },
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: "invalid_request",
          message: "Please correct the highlighted input and try again.",
          recoverable: true,
          details: error.issues.map(({ path, message }) => ({ path, message })),
        },
      },
    };
  }

  if (error instanceof AgentConfigurationUnavailableError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message, recoverable: true, details: { adminPath: "/admin/agents", target: error.target } } } };
  }

  if (error instanceof RecoverableApplicationError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, recoverable: true } },
    };
  }

  return {
    status: 500,
    body: { error: { code: "internal_error", message: "Something went wrong. Your saved work is retained.", recoverable: true } },
  };
}
