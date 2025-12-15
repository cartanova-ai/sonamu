#!/usr/bin/env node
import('../build/src/bin/run.js').catch((e) => {
  console.error('Hot runner has no run.js in build/src/bin directory. It seems that you have not built the project yet. Please run: pnpm build');
  console.error(e);
  process.exit(1);
});