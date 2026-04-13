import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SmartPyCompilationResult {
  scenario: string;
  michelson: string;
  initialStorage: string;
}

async function ensureSmartPyCliAvailable(): Promise<void> {
  try {
    await execFileAsync('smartpy', ['--help']);
  } catch {
    throw new Error(
      'SmartPy CLI not found on server PATH. Install with `pip install smartpy-tezos`.',
    );
  }
}

async function findScenarioDir(
  buildDir: string,
  preferredScenario?: string,
): Promise<string> {
  const entries = await fs.readdir(buildDir, { withFileTypes: true });
  const scenarioDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (scenarioDirs.length === 0) {
    throw new Error('SmartPy compile produced no scenario outputs.');
  }

  if (preferredScenario) {
    const exact = scenarioDirs.find((name) => name === preferredScenario);
    if (exact) {
      return exact;
    }
  }

  const contractScenario = scenarioDirs.find((name) => {
    const lower = name.toLowerCase();
    return lower.includes('test') || lower.includes('default');
  });
  return contractScenario ?? scenarioDirs[0]!;
}

export async function compileSmartPySource(
  source: string,
  scenario?: string,
): Promise<SmartPyCompilationResult> {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error('SmartPy source is empty.');
  }

  await ensureSmartPyCliAvailable();

  const workingDir = await fs.mkdtemp(join(tmpdir(), 'kiln-smartpy-'));
  const sourceFile = join(workingDir, 'contract.py');
  const outputDir = join(workingDir, 'build');

  try {
    await fs.writeFile(sourceFile, source, 'utf8');

    try {
      await execFileAsync('smartpy', ['compile', sourceFile, outputDir, '--purge'], {
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      const compileError = error as {
        stderr?: string;
        stdout?: string;
        message?: string;
      };
      const stderr = compileError.stderr?.trim();
      const stdout = compileError.stdout?.trim();
      const details = stderr || stdout || compileError.message || 'Unknown compile failure';
      throw new Error(`SmartPy compile failed: ${details}`);
    }

    const scenarioDir = await findScenarioDir(outputDir, scenario);
    const scenarioPath = join(outputDir, scenarioDir);

    const contractPath = join(scenarioPath, 'step_001_cont_0_contract.tz');
    const storagePath = join(scenarioPath, 'step_001_cont_0_storage.tz');

    const [michelson, initialStorage] = await Promise.all([
      fs.readFile(contractPath, 'utf8'),
      fs.readFile(storagePath, 'utf8'),
    ]);

    return {
      scenario: scenarioDir,
      michelson,
      initialStorage: initialStorage.trim(),
    };
  } finally {
    await fs.rm(workingDir, { recursive: true, force: true });
  }
}
