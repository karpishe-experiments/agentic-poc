export class RecoverableApplicationError extends Error {
  public readonly code: string;
  public readonly status: number;

  public constructor(input: { code: string; message: string; status?: number }) {
    super(input.message);
    this.name = "RecoverableApplicationError";
    this.code = input.code;
    this.status = input.status ?? 409;
  }
}
