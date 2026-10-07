import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Test migration: leaves a marker file so the test can see it ran.
const root = process.env.CLAUDE_PROJECT_DIR;
mkdirSync(join(root, 'state'), { recursive: true });
writeFileSync(join(root, 'state', 'migration-001.txt'), `ran for ${process.env.ALTERBRAIN_UPDATE_TAG}\n`);
