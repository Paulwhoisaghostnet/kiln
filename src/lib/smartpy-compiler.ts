import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
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

/** Netlify build drops a standalone CPython here so the Node function can run SmartPy. */
function resolveBundledPython(): string | undefined {
  const binDir = join(process.cwd(), 'vendor', 'kiln-python', 'bin');
  for (const name of ['python3.12', 'python3.13', 'python3.11', 'python3.10', 'python3']) {
    const candidate = join(binDir, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function resolvePythonExecutable(): string {
  const fromEnv = process.env.KILN_PYTHON?.trim() || process.env.PYTHON?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const bundled = resolveBundledPython();
  if (bundled) {
    return bundled;
  }
  return 'python3';
}

async function smartpyCliHelpWorks(): Promise<boolean> {
  try {
    await execFileAsync('smartpy', ['--help'], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

async function pythonImportsSmartPy(python: string): Promise<boolean> {
  try {
    await execFileAsync(python, ['-c', 'import smartpy as sp'], {
      maxBuffer: 1024 * 1024,
      env: process.env,
    });
    return true;
  } catch {
    return false;
  }
}

async function ensureSmartPyRuntimeAvailable(python: string): Promise<void> {
  const cli = await smartpyCliHelpWorks();
  const py = await pythonImportsSmartPy(python);
  if (!cli && !py) {
    throw new Error(
      'SmartPy compiler unavailable: install smartpy-tezos (`pip install smartpy-tezos`) so Python can `import smartpy`, or put the legacy `smartpy` CLI on PATH. For Netlify, deploy from Linux CI so the build can bundle `vendor/kiln-python` (see scripts/netlify-build.sh).',
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
    throw new Error(
      'SmartPy produced no scenario output directories. Add sp.test_scenario(...) tests (or use a contract file that already defines them); see https://smartpy.io/docs',
    );
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

function formatExecError(error: unknown, fallback: string): string {
  const compileError = error as {
    stderr?: string;
    stdout?: string;
    message?: string;
  };
  const stderr = compileError.stderr?.trim();
  const stdout = compileError.stdout?.trim();
  return stderr || stdout || compileError.message || fallback;
}

async function compileWithSmartPyCli(
  sourceFile: string,
  outputDir: string,
): Promise<void> {
  try {
    await execFileAsync('smartpy', ['compile', sourceFile, outputDir, '--purge'], {
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`SmartPy compile failed: ${formatExecError(error, 'Unknown compile failure')}`);
  }
}

async function compileWithPythonScenario(
  python: string,
  workingDir: string,
  sourceFile: string,
  outputDir: string,
): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  try {
    await execFileAsync(python, [sourceFile], {
      cwd: workingDir,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        SMARTPY_OUTPUT_DIR: outputDir,
      },
    });
  } catch (error) {
    throw new Error(
      `SmartPy (python) compile failed: ${formatExecError(error, 'Unknown compile failure')}`,
    );
  }
}

export async function compileSmartPySource(
  source: string,
  scenario?: string,
): Promise<SmartPyCompilationResult> {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error('SmartPy source is empty.');
  }

  const python = resolvePythonExecutable();
  await ensureSmartPyRuntimeAvailable(python);

  const workingDir = await fs.mkdtemp(join(tmpdir(), 'kiln-smartpy-'));
  const sourceFile = join(workingDir, 'contract.py');
  const outputDir = join(workingDir, 'build');

  try {
    await fs.writeFile(sourceFile, source, 'utf8');

    const useCli = await smartpyCliHelpWorks();
    if (useCli) {
      await compileWithSmartPyCli(sourceFile, outputDir);
    } else {
      await compileWithPythonScenario(python, workingDir, sourceFile, outputDir);
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
