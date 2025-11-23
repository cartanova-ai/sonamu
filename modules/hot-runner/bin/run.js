#!/usr/bin/env node
import('../build/src/bin/run.js').catch(() => {
  console.error('Hot runner has not yet run.js in build/src/bin directory. It seems that you have not built the project yet. Please run: pnpm build');
  process.exit(1);
});