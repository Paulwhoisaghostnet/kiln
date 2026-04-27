import { type Page } from '@playwright/test';
import fs from 'node:fs';

export interface ConsoleIssue {
  type: string;
  text: string;
}

export function attachRuntimeCapture(page: Page, runArtifacts: string) {
  const consoleIssues: ConsoleIssue[] = [];
  const networkIssues: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleIssues.push({ type: message.type(), text: message.text() });
    }
  });

  page.on('pageerror', (error) => {
    consoleIssues.push({ type: 'pageerror', text: `${error.name}: ${error.message}` });
  });

  page.on('requestfailed', (request) => {
    networkIssues.push(
      `${request.method()} ${request.url()} => ${request.failure()?.errorText ?? 'failed'}`,
    );
  });

  return {
    consoleIssues,
    networkIssues,
    async snapshot(name: string) {
      const file = `${runArtifacts}/screenshot-${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      return file;
    },
    async flush(prefix = 'runtime') {
      if (!fs.existsSync(runArtifacts)) {
        fs.mkdirSync(runArtifacts, { recursive: true });
      }
      fs.writeFileSync(
        `${runArtifacts}/${prefix}-console.log`,
        JSON.stringify({ consoleIssues, networkIssues }, null, 2),
      );
    },
  };
}
