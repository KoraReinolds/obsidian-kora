/**
 * Test helpers
 * Description: Read markdown fixtures from local file system.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export function readFixture(name: string): string {
  const filePath = join(__dirname, 'fixtures', name);
  return readFileSync(filePath, 'utf8');
}


