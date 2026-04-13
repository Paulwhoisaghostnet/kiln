import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  createActivityLogger,
  readRecentActivityLog,
} from '../src/lib/activity-logger.js';

async function waitForLogLines(filePath: string, minLines: number): Promise<string[]> {
  const maxAttempts = 50;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const lines = await readRecentActivityLog(filePath, 500);
      if (lines.length >= minLines) {
        return lines;
      }
    } catch {
      // Retry until file exists and lines are flushed.
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for activity log flush.');
}

describe('activity logger', () => {
  it('persists log events and reads recent lines', async () => {
    const filePath = join(tmpdir(), `kiln-activity-${randomUUID()}.log`);
    const logger = createActivityLogger(filePath);

    logger.log({
      timestamp: new Date().toISOString(),
      event: 'workflow_run',
      approved: true,
    });
    logger.log({
      timestamp: new Date().toISOString(),
      event: 'audit_run',
      score: 91,
    });

    const lines = await waitForLogLines(filePath, 2);
    expect(lines).toHaveLength(2);
    const joined = lines.join('\n');
    expect(joined).toContain('"event":"workflow_run"');
    expect(joined).toContain('"event":"audit_run"');

    const tail = await readRecentActivityLog(filePath, 1);
    expect(tail).toHaveLength(1);
    expect(tail[0]).toContain('"event":"');

    await fs.rm(filePath, { force: true });
  });
});
