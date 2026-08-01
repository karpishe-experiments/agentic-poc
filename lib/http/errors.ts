import { ZodError } from "zod";
import { BookletNotFoundError } from "@/lib/application/booklet-service";

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    recoverable: boolean;
    details?: unknown;
  };
};

export function toErrorEnvelope(error: unknown): { status: number; body: ErrorEnvelope } {
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

  return {
    status: 500,
    body: { error: { code: "internal_error", message: "Something went wrong. Your saved work is retained.", recoverable: true } },
  };
}
