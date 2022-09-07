import path from "path";
import glob from "glob";

export function globAsync(pathPattern: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    glob(path.resolve(pathPattern), (err, files) => {
      if (err) {
        reject(err);
      } else {
        resolve(files);
      }
    });
  });
}
export async function importMultiple(
  filePaths: string[]
): Promise<{ filePath: string; imported: any }[]> {
  return Promise.all(
    filePaths.map(async (filePath) => {
      const importPath = "./" + path.relative(__dirname, filePath);
      const imported = await import(importPath);
      return {
        filePath,
        imported,
      };
    })
  );
}
