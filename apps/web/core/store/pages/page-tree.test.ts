import { describe, expect, it } from "vitest";
import type { TPageTreeStructure } from "./project-page.store";
import { flattenVisibleTree } from "./page-tree";

// build a structure from a plain { parentId: childIds } map plus the root list
function structure(rootPageIds: string[], children: Record<string, string[]>): TPageTreeStructure {
  return {
    rootPageIds,
    childPageIdsByParentId: new Map(Object.entries(children)),
  };
}

describe("flattenVisibleTree", () => {
  it("returns an empty list for an empty tree", () => {
    expect(flattenVisibleTree(structure([], {}), {})).toEqual([]);
  });

  it("returns only roots when nothing is expanded", () => {
    const tree = structure(["a", "b"], { a: ["a1", "a2"], b: ["b1"] });
    const rows = flattenVisibleTree(tree, {});
    expect(rows).toEqual([
      { pageId: "a", depth: 0, hasChildren: true },
      { pageId: "b", depth: 0, hasChildren: true },
    ]);
  });

  it("reveals direct children in order when a node is expanded", () => {
    const tree = structure(["a", "b"], { a: ["a1", "a2"] });
    const rows = flattenVisibleTree(tree, { a: true });
    expect(rows.map((r) => r.pageId)).toEqual(["a", "a1", "a2", "b"]);
    expect(rows.find((r) => r.pageId === "a1")).toEqual({ pageId: "a1", depth: 1, hasChildren: false });
  });

  it("does not descend into an expanded node that has no children", () => {
    const tree = structure(["a"], { a: [] });
    const rows = flattenVisibleTree(tree, { a: true });
    expect(rows).toEqual([{ pageId: "a", depth: 0, hasChildren: false }]);
  });

  it("expands nested branches pre-order with correct depth", () => {
    const tree = structure(["a"], { a: ["a1"], a1: ["a1a", "a1b"], a1a: ["a1a1"] });
    const rows = flattenVisibleTree(tree, { a: true, a1: true, a1a: true });
    expect(rows).toEqual([
      { pageId: "a", depth: 0, hasChildren: true },
      { pageId: "a1", depth: 1, hasChildren: true },
      { pageId: "a1a", depth: 2, hasChildren: true },
      { pageId: "a1a1", depth: 3, hasChildren: false },
      { pageId: "a1b", depth: 2, hasChildren: false },
    ]);
  });

  it("hides a grandchild when the intermediate node is collapsed", () => {
    const tree = structure(["a"], { a: ["a1"], a1: ["a1a"] });
    // a expanded, a1 collapsed -> a1 shows but a1a is hidden
    const rows = flattenVisibleTree(tree, { a: true });
    expect(rows.map((r) => r.pageId)).toEqual(["a", "a1"]);
  });

  it("scales to the visible set, not the total tree size", () => {
    // one root with 5000 descendants in a single chain
    const children: Record<string, string[]> = {};
    let parent = "root";
    for (let i = 0; i < 5000; i++) {
      const child = `n${i}`;
      children[parent] = [child];
      parent = child;
    }
    const tree = structure(["root"], children);

    // collapsed: only the root is visible regardless of the 5000 descendants
    expect(flattenVisibleTree(tree, {}).length).toBe(1);

    // expanding only the root reveals exactly one more row
    expect(flattenVisibleTree(tree, { root: true }).length).toBe(2);

    // expanding the whole chain reveals every node without overflowing the stack
    const allExpanded: Record<string, boolean> = { root: true };
    for (let i = 0; i < 5000; i++) allExpanded[`n${i}`] = true;
    expect(flattenVisibleTree(tree, allExpanded).length).toBe(5001);
  });
});
