#!/usr/bin/env node
// ab-migration: If you started on Alterbrain 0.1, records that you are doing an MBA and switches on the MBA and Netherlands packs you already use.
//
// Releases before 0.2.0 were built for MBA students and had no "learner" setting. Everyone who installed them is
// treated as doing an MBA (the pilot group), and the packs they were already using become explicit in
// config/brain.json: "mba", and "country-nl" when they job-hunt in the Netherlands. A 0.2 install is never touched:
// its brain.json has no "school" key.
import { join } from 'node:path';
import { runMigration, readJsonFile, writeJsonAtomic, unreadableSettings } from '../../lib/migrate.mjs';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

await runMigration(async ({ root, report }) => {
  const file = join(root, 'config', 'brain.json');
  const brain = readJsonFile(file);
  if (!brain.exists) return;
  if (!isObject(brain.value)) throw unreadableSettings(file);
  const old = brain.value;

  // Only an old install: it has a school block and no learner kind yet.
  const kind = isObject(old.learner) && typeof old.learner.kind === 'string' ? old.learner.kind.trim() : '';
  if (!Object.hasOwn(old, 'school') || kind !== '') return;

  const learner = { ...(isObject(old.learner) ? old.learner : {}), kind: 'mba' };
  if (typeof learner.detail !== 'string') learner.detail = '';

  const packs = Array.isArray(old.packs) ? [...old.packs] : ['core'];
  const added = [];
  if (!packs.includes('mba')) {
    packs.push('mba');
    added.push('the MBA pack');
  }
  const country = String(isObject(old.jobs) ? old.jobs.country ?? '' : '').trim().toUpperCase();
  if (country === 'NL' && !packs.includes('country-nl')) {
    packs.push('country-nl');
    added.push('the Netherlands job-search pack');
  }

  // Keep the key order: learner goes right after plan_tier (at the end when there is none), packs stays where it is.
  const next = {};
  for (const [key, value] of Object.entries(old)) {
    if (key === 'learner') {
      next.learner = learner;
    } else if (key === 'packs') {
      next.packs = packs;
    } else {
      next[key] = value;
    }
    if (key === 'plan_tier' && !Object.hasOwn(old, 'learner')) next.learner = learner;
  }
  if (!Object.hasOwn(next, 'learner')) next.learner = learner;
  if (!Object.hasOwn(next, 'packs')) next.packs = packs;

  writeJsonAtomic(file, next);
  report('Recorded that you are doing an MBA, so your set-up stays as it is. You can change this with /reconfigure.');
  if (added.length) report(`Switched on: ${added.join(' and ')}.`);
});
