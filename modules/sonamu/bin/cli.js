#!/usr/bin/env node
import('../dist/bin/cli-wrapper.js').catch(() => {
  console.error('Sonamu has not yet cli-wrapper.js in dist/bin directory. It seems that you have not built the project yet. Please run: pnpm build');
  process.exit(1);
});