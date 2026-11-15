// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

// Reading a document always ends: a request the server never answers (a file
// over the body limit, a lost connection) ends in an error the person can read,
// with the file input usable again, never in "Reading the document..." for good.

const { readDocument } = vi.hoisted(() => ({ readDocument: vi.fn() }));
vi.mock("@/app/p/[project]/qualify/new/prefill-actions", () => ({
  readDocument,
}));

import { useDocumentPrefill } from "@/app/p/[project]/qualify/new/useDocumentPrefill";

const file = (bytes: number) =>
  new File([new Uint8Array(bytes)], "card.pdf", { type: "application/pdf" });

beforeEach(() => vi.clearAllMocks());

describe("a document upload that is not answered", () => {
  it("a reader call that fails ends in an error, not in reading", async () => {
    readDocument.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useDocumentPrefill("mcas", undefined));
    await act(async () => {
      await result.current.pickDocument(file(10)).catch(() => undefined);
    });
    expect(result.current.upload.kind).toBe("error");
  });

  it("the error says the document could not be sent", async () => {
    readDocument.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useDocumentPrefill("mcas", undefined));
    await act(async () => {
      await result.current.pickDocument(file(10)).catch(() => undefined);
    });
    const upload = result.current.upload as { kind: string; error?: string };
    expect(upload.error ?? "").toMatch(/could not be sent|10 MB/i);
  });

  it("a file over the size limit is refused before it is sent", async () => {
    readDocument.mockResolvedValue({ ok: false, error: "too large" });
    const { result } = renderHook(() => useDocumentPrefill("mcas", undefined));
    await act(async () => {
      await result.current
        .pickDocument(file(12 * 1024 * 1024))
        .catch(() => undefined);
    });
    expect(readDocument, "the oversized file was sent to the server").not.toHaveBeenCalled();
    const upload = result.current.upload as { kind: string; error?: string };
    expect(upload.kind).toBe("error");
    expect(upload.error ?? "").toMatch(/10 MB/);
  });
});
