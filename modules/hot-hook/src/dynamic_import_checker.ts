import { readFile } from 'node:fs/promises'
import { parseImports } from 'parse-imports'

/**
 * This class is responsible for checking if a given specifier
 * is imported dynamically from a given parent file.
 * Otherwise we will throw an error since we cannot make the file reloadable
 *
 * We are caching the results to avoid reading the same file multiple times
 */
export class DynamicImportChecker {
  private cache: Map<string, Map<string, boolean>> = new Map()

  async ensureFileIsImportedDynamicallyFromParent(parentPath: string, specifier: string) {
    const cacheKey = parentPath
    if (this.cache.has(cacheKey) && this.cache.get(cacheKey)!.has(specifier)) {
      return this.cache.get(cacheKey)!.get(specifier)!
    }

    const parentCode = await readFile(parentPath, 'utf-8')
    const imports = [...(await parseImports(parentCode))]

    const isFileDynamicallyImportedFromParent = imports.some((importStatement) => {
      //console.log(`\n[DynamicImportChecker] Checking import statement:`);
      //console.log(`  - isDynamicImport: ${importStatement.isDynamicImport}`);
      //console.log(`  - isConstant: ${importStatement.moduleSpecifier.isConstant}`);
      //console.log(`  - moduleSpecifier.value: ${importStatement.moduleSpecifier.value}`);
      //console.log(`  - target specifier: ${specifier}`);
      
      // 동적 임포트가 아니면 false
      if (!importStatement.isDynamicImport) {
        //console.log(`  → Result: NOT a dynamic import\n`);
        return false;
      }
      
      // 변수 기반 동적 임포트 (isConstant: false)면 무조건 true
      if (!importStatement.moduleSpecifier.isConstant) {
        //console.log(`  → Result: Variable-based dynamic import - ACCEPTED\n`);
        return true;
      }
      
      // 상수 기반 동적 임포트면 specifier와 정확히 매칭되어야 함
      const matches = importStatement.moduleSpecifier.value === specifier;
      //console.log(`  → Result: Constant dynamic import - ${matches ? 'MATCHED' : 'NOT MATCHED'}\n`);
      return matches;
    })

    const currentCache = this.cache.get(cacheKey) ?? new Map()
    this.cache.set(cacheKey, currentCache.set(specifier, isFileDynamicallyImportedFromParent))

    return isFileDynamicallyImportedFromParent
  }

  invalidateCache(key: string) {
    this.cache.delete(key)
  }
}
