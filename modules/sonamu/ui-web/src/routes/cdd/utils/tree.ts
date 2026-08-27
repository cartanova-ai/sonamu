import { type CddTreeNode } from "../types";

function fileTypeOrder(fileType?: string): number {
  return fileType === "contract" ? 0 : fileType === "rules" ? 1 : 2;
}

export function countFiles(nodes: CddTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "file") {
      count++;
    }
    if (node.children) {
      count += countFiles(node.children);
    }
  }
  return count;
}

export function filterTree(nodes: CddTreeNode[], query: string): CddTreeNode[] {
  if (!query) return nodes;
  const lower = query.toLowerCase();
  return nodes
    .map((node) => {
      if (node.type === "directory") {
        const filtered = filterTree(node.children ?? [], query);
        if (filtered.length > 0) {
          return { ...node, children: filtered };
        }
        if (node.name.toLowerCase().includes(lower)) {
          return node;
        }
        return null;
      }
      return node.name.toLowerCase().includes(lower) ? node : null;
    })
    .filter((n): n is CddTreeNode => n !== null);
}

export function sortTree(nodes: CddTreeNode[], isRoot = false): CddTreeNode[] {
  const sorted = [...nodes].toSorted((a, b) => {
    if (isRoot) {
      const aIsMain = a.name === "main.contract.md";
      const bIsMain = b.name === "main.contract.md";
      if (aIsMain && !bIsMain) return -1;
      if (!aIsMain && bIsMain) return 1;
    }
    if (a.type !== b.type) {
      return a.type === "file" ? -1 : 1;
    }
    if (a.type === "file" && b.type === "file") {
      const ftDiff = fileTypeOrder(a.fileType) - fileTypeOrder(b.fileType);
      if (ftDiff !== 0) return ftDiff;
    }
    return a.name.localeCompare(b.name);
  });
  return sorted.map((node) =>
    node.children ? { ...node, children: sortTree(node.children) } : node,
  );
}

export function findTreeNode(nodes: CddTreeNode[], path: string): CddTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findTreeNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}
