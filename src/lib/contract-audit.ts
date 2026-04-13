import { parseEntrypointsFromMichelson } from './michelson-parser.js';

export type AuditSeverity = 'info' | 'warning' | 'error';

export interface AuditFinding {
  id: string;
  severity: AuditSeverity;
  title: string;
  description: string;
  recommendation?: string;
}

export interface ContractAuditReport {
  passed: boolean;
  score: number;
  entrypoints: string[];
  findings: AuditFinding[];
}

function addFinding(
  list: AuditFinding[],
  finding: AuditFinding,
): void {
  list.push(finding);
}

function calculateScore(findings: AuditFinding[]): number {
  let score = 100;
  for (const finding of findings) {
    if (finding.severity === 'error') {
      score -= 25;
    } else if (finding.severity === 'warning') {
      score -= 10;
    } else {
      score -= 2;
    }
  }
  return Math.max(0, score);
}

export function auditMichelsonContract(code: string): ContractAuditReport {
  const source = code.trim();
  const findings: AuditFinding[] = [];
  const entrypoints = parseEntrypointsFromMichelson(source).map((entry) => entry.name);

  if (source.length === 0) {
    addFinding(findings, {
      id: 'source_empty',
      severity: 'error',
      title: 'Contract source is empty',
      description: 'No Michelson code was provided for audit.',
      recommendation: 'Provide compiled Michelson source before running audit.',
    });
  }

  if (!/\bparameter\b/i.test(source) || !/\bstorage\b/i.test(source) || !/\bcode\b/i.test(source)) {
    addFinding(findings, {
      id: 'shape_missing',
      severity: 'error',
      title: 'Missing Michelson sections',
      description: 'Audit could not confirm parameter/storage/code sections.',
      recommendation: 'Ensure the uploaded file is a complete Michelson contract.',
    });
  }

  if (entrypoints.length === 0) {
    addFinding(findings, {
      id: 'entrypoints_missing',
      severity: 'warning',
      title: 'No named entrypoints detected',
      description: 'The contract appears to use default-only parameters or unannotated branches.',
      recommendation: 'Annotate entrypoints with `%name` to improve tooling and UX.',
    });
  }

  const hasMint = entrypoints.some((entry) => entry.includes('mint'));
  const hasBurn = entrypoints.some((entry) => entry.includes('burn'));
  const hasTransfer = entrypoints.some((entry) => entry.includes('transfer'));
  const hasPause = entrypoints.some((entry) => entry.includes('pause'));
  const hasSetAdmin = entrypoints.some((entry) => entry.includes('set_admin'));
  const hasConfirmAdmin = entrypoints.some((entry) => entry.includes('confirm_admin'));

  if ((hasMint || hasBurn) && !(hasSetAdmin || hasConfirmAdmin)) {
    addFinding(findings, {
      id: 'admin_controls_missing',
      severity: 'warning',
      title: 'Privileged token actions lack visible admin controls',
      description:
        'Mint/burn entrypoints exist but set_admin/confirm_admin were not detected.',
      recommendation:
        'Add explicit admin transfer controls and ensure privileged paths enforce sender checks.',
    });
  }

  if ((hasMint || hasBurn || hasTransfer) && !hasPause) {
    addFinding(findings, {
      id: 'pause_missing',
      severity: 'info',
      title: 'Pause entrypoint not detected',
      description:
        'No pause mechanism was found. Emergency response options may be limited.',
      recommendation: 'Consider adding pause/unpause controls for incident response.',
    });
  }

  if (!/\bFAILWITH\b/i.test(source)) {
    addFinding(findings, {
      id: 'failwith_missing',
      severity: 'info',
      title: 'No FAILWITH checks detected',
      description:
        'The contract may have limited explicit guardrails or revert messages.',
      recommendation:
        'Add assertion/fail paths for access control, balance checks, and invariant enforcement.',
    });
  }

  if (source.length > 250_000) {
    addFinding(findings, {
      id: 'code_size_large',
      severity: 'warning',
      title: 'Large Michelson contract size',
      description:
        'The contract is unusually large and may face operational or gas complexity risks.',
      recommendation:
        'Review code size, split modules when possible, and benchmark critical entrypoints.',
    });
  }

  const score = calculateScore(findings);
  const passed = !findings.some((finding) => finding.severity === 'error');

  return {
    passed,
    score,
    entrypoints,
    findings,
  };
}
