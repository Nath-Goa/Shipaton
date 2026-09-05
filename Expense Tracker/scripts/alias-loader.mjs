// Resolves the project's "@/..." path alias for plain `node` runs, so the
// predictor core can be evaluated offline (scripts/evaluate-predictor.ts)
// without a bundler or any extra dependency. Node strips the TypeScript
// types itself; only module resolution needs help.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = path.join(root, specifier.slice(2));
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (existsSync(candidate)) {
        // No explicit `format`: letting Node infer it from the .ts extension
        // is what keeps its built-in type stripping in play.
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
