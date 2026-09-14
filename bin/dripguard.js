#!/usr/bin/env node

import { createCli } from '../dist/cli/index.js';

const cli = createCli();
cli.parseAsync(process.argv).catch((err) => {
  console.error('Fatal CLI execution error:', err);
  process.exit(4);
});
