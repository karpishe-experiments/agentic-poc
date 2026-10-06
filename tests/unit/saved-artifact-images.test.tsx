// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SavedArtifactImages } from "@/components/experiments/saved-artifact-images";

const id = (last: string) => `00000000-0000-4000-8000-0000000000${last}`;
afterEach(cleanup);

describe("saved reference images", () => {
  it.each([[0, "Cover image"], [2, "Page 2 image"]])("opens the saved J13 output for index %s", (pageIndex, label) => {
    render(<SavedArtifactImages taskId="J13" simulated content={{ pageIndex, assetId: id("05") }} />);
    expect(screen.getByRole("img", { name: label }).getAttribute("src")).toBe(`http://localhost:3000/api/assets/${id("05")}`);
    expect(screen.getByRole("link").getAttribute("href")).toBe(`/api/assets/${id("05")}`);
  });
  it("keeps current and historical J13 assets independently inspectable", () => {
    render(<><SavedArtifactImages taskId="J13" simulated content={{ pageIndex: 1, assetId: id("05") }} />
      <SavedArtifactImages taskId="J13" simulated content={{ pageIndex: 1, assetId: id("06") }} /></>);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([`/api/assets/${id("05")}`, `/api/assets/${id("06")}`]);
  });
  it.each([{ pageIndex: -1, assetId: id("05") }, { pageIndex: 1, assetId: "https://example.com/page.png" }])("rejects malformed J13 output identity", (content) => {
    render(<SavedArtifactImages taskId="J13" simulated content={content} />);
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("shows both style samples from their explicit builds", () => {
    render(<SavedArtifactImages taskId="J08" simulated content={{ samples: [
      { sampleKey: "sample_1", build: { assetId: id("01") } },
      { sampleKey: "sample_2", build: { assetId: id("02") } },
    ] }} />);
    const images = screen.getAllByRole("img");
    expect(images.map((image) => image.getAttribute("alt"))).toEqual(["Style sample 1", "Style sample 2"]);
    expect(screen.getAllByText(/Simulated fixture/)).toHaveLength(2);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([`/api/assets/${id("01")}`, `/api/assets/${id("02")}`]);
  });

  it.each([["J09", "Mira"], ["J10", "The forest"]])("shows the %s sheet", (taskId, title) => {
    render(<SavedArtifactImages taskId={taskId} simulated={false} content={{ title, build: { assetId: id("03") } }} />);
    expect(screen.getByRole("img", { name: `${title} image` }).getAttribute("src")).toBe(`http://localhost:3000/api/assets/${id("03")}`);
  });

  it("rejects drafts, nested identities, malformed IDs, and URLs", () => {
    const { rerender } = render(<SavedArtifactImages taskId="J09" simulated content={{ title: "Draft", assetId: id("03"), imageUrl: "https://example.com/image.png" }} />);
    expect(screen.queryByRole("img")).toBeNull();
    rerender(<SavedArtifactImages taskId="J08" simulated content={{ samples: [{ sampleKey: "sample_1", build: { assetId: "https://example.com/image.png" } }, { sampleKey: "sample_2", nested: { assetId: id("04") } }] }} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows a load error and uses natural image dimensions", async () => {
    const { rerender } = render(<SavedArtifactImages taskId="J09" simulated content={{ title: "Mira", build: { assetId: id("03") } }} />);
    const image = screen.getByRole("img", { name: "Mira image" });
    Object.defineProperties(image, { naturalWidth: { configurable: true, value: 1200 }, naturalHeight: { configurable: true, value: 800 } });
    fireEvent.load(image);
    await waitFor(() => expect(image.getAttribute("width")).toBe("1200"));
    expect(image.getAttribute("height")).toBe("800");
    expect(image.className).toContain("h-auto");
    rerender(<SavedArtifactImages taskId="J10" simulated content={{ title: "Forest", build: { assetId: id("04") } }} />);
    fireEvent.error(screen.getByRole("img", { name: "Forest image" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("missing or corrupt"));
    expect(screen.queryByRole("img")).toBeNull();
  });
});
