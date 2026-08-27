import { dirname, relative } from "node:path";

/**
 * Represent a file node in the dependency tree.
 */
interface FileNode {
  /**
   * Absolute path to the file
   */
  path: string;

  /**
   * Whether the file is marked as reloadable or not
   */
  reloadable: boolean;

  /**
   * Set of files imported by this file
   */
  dependencies: Set<FileNode>;

  /**
   * Set of files importing this file
   */
  dependents: Set<FileNode>;

  /**
   * Set of files that are parents of this file
   */
  parents: Set<FileNode> | null;

  /**
   * Version of the file. Incremented when the file is invalidated
   */
  version: number;

  /**
   * Whether the file is not dynamically imported where it should be
   */
  isWronglyImported?: boolean;
}

interface ReloadabilityResult {
  reloadable: boolean;
  shouldBeReloadable: boolean;
}

function checkPathToRoot(
  currentNode: FileNode,
  visited: Set<string> = new Set(),
): ReloadabilityResult {
  if (currentNode.isWronglyImported) {
    return { reloadable: false, shouldBeReloadable: true };
  }

  if (currentNode.reloadable || visited.has(currentNode.path)) {
    return { reloadable: true, shouldBeReloadable: true };
  }

  visited.add(currentNode.path);

  if (!currentNode.parents || currentNode.parents.size === 0) {
    return { reloadable: false, shouldBeReloadable: false };
  }

  for (const parent of currentNode.parents) {
    const result = checkPathToRoot(parent, new Set(visited));
    if (!result.reloadable) return result;
  }

  return { reloadable: true, shouldBeReloadable: true };
}

function isNodeModule(path: string) {
  return path.includes("node_modules") || path.includes("/.yarn/__virtual__/");
}

export default class DependencyTree {
  #tree!: FileNode;
  #pathMap: Map<string, FileNode> = new Map();

  constructor(options: { root?: string }) {
    if (options.root) this.addRoot(options.root);
  }

  addRoot(path: string) {
    this.#tree = {
      version: 0,
      parents: null,
      reloadable: false,
      path,
      dependents: new Set(),
      dependencies: new Set(),
    };

    this.#pathMap.set(this.#tree.path, this.#tree);
  }

  /**
   * Check if a path is inside the dependency tree
   */
  isInside(path: string): boolean {
    return this.#pathMap.has(path);
  }

  /**
   * Get the version of a file
   */
  getVersion(path: string): number {
    const node = this.#pathMap.get(path);
    if (!node) throw new Error(`Node ${path} does not exist`);

    return node.version;
  }

  /**
   * Add a dependency to a file
   */
  addDependency(
    parentPath: string,
    dependency: { path: string; reloadable?: boolean; isWronglyImported?: boolean },
  ): void {
    const parentNode = this.#pathMap.get(parentPath);
    if (!parentNode) return;

    let childNode = this.#pathMap.get(dependency.path);
    if (!childNode) {
      childNode = {
        version: 0,
        path: dependency.path,
        parents: new Set(),
        dependents: new Set(),
        dependencies: new Set(),
        reloadable: dependency.reloadable || false,
        isWronglyImported: dependency.isWronglyImported || false,
      };
      this.#pathMap.set(dependency.path, childNode);
    } else {
      childNode.reloadable = dependency.reloadable || false;
      childNode.isWronglyImported = dependency.isWronglyImported || false;
    }

    childNode.parents?.add(parentNode);
    parentNode.dependencies.add(childNode);
    this.addDependent(dependency.path, parentPath);
  }

  /**
   * Add a dependent to a file
   */
  addDependent(dependentPath: string, parentPath: string): void {
    const dependentNode = this.#pathMap.get(dependentPath);
    if (!dependentNode) return;

    const parentNode = this.#pathMap.get(parentPath);
    if (!parentNode) return;

    dependentNode.dependents.add(parentNode);
  }

  /**
   * Invalidate a file and all its dependents
   */
  invalidateFileAndDependents(filePath: string): Set<string> {
    const invalidatedFiles = new Set<string>();
    const queue = [filePath];
    while (queue.length > 0) {
      const currentPath = queue.pop();
      // 린트 리팩토링: while 조건에서 length > 0 보장하므로 실제 발생 안 함
      if (!currentPath) break;
      if (!invalidatedFiles.has(currentPath)) {
        const node = this.#pathMap.get(currentPath);
        if (!node) continue;
        if (!this.isReloadable(currentPath).reloadable) continue;

        node.version++;
        invalidatedFiles.add(currentPath);
        queue.push(...Array.from(node.dependents).map((n) => n.path));
      }
    }

    return invalidatedFiles;
  }

  /**
   * Remove a file from the dependency tree
   */
  remove(path: string): void {
    const node = this.#pathMap.get(path);
    if (!node) return;

    if (node.parents) {
      for (const parent of node.parents) {
        parent.dependencies.delete(node);
      }
    }

    if (node.dependents) {
      for (const dependent of node.dependents) {
        dependent.parents?.delete(node);
      }
    }

    this.#pathMap.delete(path);
  }

  /**
   * Check if a file is reloadable.
   * Basically the algorithm is :
   * - For a given file, we will go up the whole dependency tree until we can reach the ROOT file
   *  = the entry point of the application/the executed script
   * - If we can reach the ROOT file without encountering any reloadable file, then it means we
   *  need to do a FULL RELOAD.
   * - If all paths to reach the ROOT file go through reloadable files, then it means we can do HMR !
   */
  isReloadable(path: string) {
    const node = this.#pathMap.get(path);
    if (!node) throw new Error(`Node ${path} does not exist`);

    return checkPathToRoot(node);
  }

  dump() {
    const rootDirname = dirname(this.#tree.path);
    return Array.from(this.#pathMap.values()).map((node) => ({
      version: node.version,
      boundary: node.reloadable,
      path: relative(rootDirname, node.path),
      nodePath: node.path,
      dependents: Array.from(node.dependents).map((n) => relative(rootDirname, n.path)),
      dependencies: Array.from(node.dependencies).map((n) => relative(rootDirname, n.path)),
      reloadable: isNodeModule(node.path) ? false : this.isReloadable(node.path).reloadable,
    }));
  }
}
