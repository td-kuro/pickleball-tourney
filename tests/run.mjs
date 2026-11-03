// Runs the compiled tests (see tsconfig.test.json). The package is an ES
// module package, so the CommonJS build output gets its own package.json
// marking it as CommonJS before Node's test runner loads it.
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const buildDir = '.test-build';
writeFileSync(join(buildDir, 'package.json'), '{ "type": "commonjs" }\n');
const testDir = join(buildDir, 'tests');
const files = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js'))
  .map((name) => join(testDir, name));
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
