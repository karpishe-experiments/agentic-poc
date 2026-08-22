import { getDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { toErrorEnvelope } from "@/lib/http/errors";
export const runtime = "nodejs";
type RouteProperties = { params: Promise<{ bookletId: string; batchId: string }> };
export async function GET(_request: Request, { params }: RouteProperties) { try { const { bookletId, batchId } = await params; const repositories = createRepositories(getDatabase()); const [batch, items] = await Promise.all([repositories.execution.getBatch(batchId), repositories.execution.getItems(batchId)]); if (!batch || batch.bookletId !== bookletId) return Response.json({ error: { code: "execution_batch_not_found", message: "This Agent run was not found." } }, { status: 404 }); return Response.json({ data: { batch, items } }); } catch (error) { const response = toErrorEnvelope(error); return Response.json(response.body, { status: response.status }); } }
