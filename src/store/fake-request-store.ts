import {
  assertRecordable,
  toRequestDetail,
  type RequestDetail,
  type RequestRecordInput,
  type RequestStore,
  type RequestSummary,
} from "./request-store.js";

export class FakeRequestStore implements RequestStore {
  private readonly records = new Map<string, RequestDetail>();

  record(input: RequestRecordInput): void {
    if (this.records.has(input.requestId)) {
      throw new Error(`Request already recorded: ${input.requestId}`);
    }
    assertRecordable(input);
    // JSON round trip mirrors SQLite serialization (undefined fields are dropped).
    this.records.set(input.requestId, JSON.parse(JSON.stringify(toRequestDetail(input))) as RequestDetail);
  }

  get(requestId: string): RequestDetail | undefined {
    const detail = this.records.get(requestId);
    return detail ? structuredClone(detail) : undefined;
  }

  listSince(sinceIso: string): RequestSummary[] {
    return [...this.records.values()]
      .filter((detail) => detail.createdAt >= sinceIso)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
      .map((detail) => ({
        createdAt: detail.createdAt,
        route: detail.route,
        status: detail.status,
        latencyMs: detail.latencyMs,
        promptTokens: detail.metrics?.promptTokens ?? null,
        modelUsed: detail.metrics?.modelUsed ?? null,
      }));
  }

  /** Test helper: ids recorded so far, in insertion order. */
  ids(): string[] {
    return [...this.records.keys()];
  }

  close(): void {
    this.records.clear();
  }
}
