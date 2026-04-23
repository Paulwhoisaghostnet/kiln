import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Shield,
  TrendingUp,
  XCircle,
} from 'lucide-react';

export interface WorkflowFinding {
  id: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  recommendation?: string;
}

export interface WorkflowSummary {
  sourceType: 'michelson' | 'smartpy' | 'solidity';
  compile?: {
    performed: boolean;
    scenario?: string;
    warnings: string[];
  };
  validate: {
    passed: boolean;
    issues: string[];
    warnings: string[];
    estimate?: {
      gasLimit: number;
      storageLimit: number;
      suggestedFeeMutez: number;
      minimalFeeMutez: number;
    } | null;
  };
  audit: {
    passed: boolean;
    score: number;
    findings: WorkflowFinding[];
  };
  simulation?: {
    success: boolean;
    summary: { total: number; passed: number; failed: number };
    warnings: string[];
  };
  shadowbox?: {
    enabled: boolean;
    executed: boolean;
    passed: boolean;
    provider: 'disabled' | 'mock' | 'command';
    reason?: string;
    summary: { total: number; passed: number; failed: number };
    warnings: string[];
  };
  clearance: {
    approved: boolean;
    record?: { id: string; createdAt: string; expiresAt: string };
  };
}

const severityTone: Record<WorkflowFinding['severity'], string> = {
  info: 'border-info/40 bg-info/5 text-info',
  warning: 'border-warning/40 bg-warning/5 text-warning',
  error: 'border-error/40 bg-error/5 text-error',
};

function StatBlock({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'error' | 'neutral';
  icon: React.ReactNode;
  hint?: string;
}) {
  const toneClasses =
    tone === 'success'
      ? 'border-success/40 bg-success/5 text-success'
      : tone === 'warning'
        ? 'border-warning/40 bg-warning/5 text-warning'
        : tone === 'error'
          ? 'border-error/40 bg-error/5 text-error'
          : 'border-base-300 bg-base-200/40 text-base-content';
  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClasses}`} title={hint}>
      <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-wider opacity-80">
        {icon}
        {label}
      </div>
      <div className="text-lg font-bold font-mono mt-1">{value}</div>
    </div>
  );
}

export function WorkflowResultsPanel({
  summary,
}: {
  summary: WorkflowSummary | null;
}) {
  if (!summary) {
    return (
      <div className="rounded-2xl border border-dashed border-base-300 bg-base-200/30 p-8 text-center space-y-2">
        <Shield className="w-8 h-8 mx-auto text-base-content/40" />
        <div className="text-sm font-semibold">No validation run yet.</div>
        <p className="text-xs text-base-content/60 max-w-md mx-auto">
          Run the full workflow from the <span className="font-semibold">Build</span> tab (or
          the button above) to compile, shape-check, audit, and simulate your contract.
          Deployment is locked until a clearance id is issued.
        </p>
      </div>
    );
  }

  const errors = summary.audit.findings.filter((f) => f.severity === 'error');
  const warnings = summary.audit.findings.filter((f) => f.severity === 'warning');
  const infos = summary.audit.findings.filter((f) => f.severity === 'info');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatBlock
          label="Validation"
          value={summary.validate.passed ? 'Passed' : 'Failed'}
          tone={summary.validate.passed ? 'success' : 'error'}
          icon={summary.validate.passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          hint="Structural shape checks + pre-origination estimate."
        />
        <StatBlock
          label="Audit score"
          value={`${summary.audit.score} / 100`}
          tone={summary.audit.passed ? 'success' : summary.audit.score >= 60 ? 'warning' : 'error'}
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          hint="Static analysis weighted by finding severity."
        />
        {summary.simulation ? (
          <StatBlock
            label="Simulation"
            value={`${summary.simulation.summary.passed}/${summary.simulation.summary.total}`}
            tone={summary.simulation.success ? 'success' : 'error'}
            icon={<Shield className="w-3.5 h-3.5" />}
            hint="Puppet-wallet scenario coverage."
          />
        ) : null}
        {summary.shadowbox?.enabled ? (
          <StatBlock
            label="Shadowbox"
            value={
              summary.shadowbox.executed
                ? `${summary.shadowbox.summary.passed}/${summary.shadowbox.summary.total}`
                : 'Not run'
            }
            tone={
              summary.shadowbox.executed
                ? summary.shadowbox.passed
                  ? 'success'
                  : 'error'
                : 'warning'
            }
            icon={<FlaskConical className="w-3.5 h-3.5" />}
            hint={`Ephemeral runtime (${summary.shadowbox.provider})`}
          />
        ) : null}
        <StatBlock
          label="Clearance"
          value={summary.clearance.approved ? 'Granted' : 'Withheld'}
          tone={summary.clearance.approved ? 'success' : 'warning'}
          icon={summary.clearance.approved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          hint="Required to unlock the Deploy button."
        />
      </div>

      {summary.clearance.record?.id ? (
        <div className="rounded-xl border border-success/40 bg-success/5 px-3 py-2 font-mono text-xs flex items-center justify-between flex-wrap gap-2">
          <span>
            <span className="opacity-60">Clearance id · </span>
            {summary.clearance.record.id}
          </span>
          <span className="opacity-60">
            expires {new Date(summary.clearance.record.expiresAt).toLocaleString()}
          </span>
        </div>
      ) : null}

      {summary.shadowbox?.enabled && summary.shadowbox.warnings.length > 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 space-y-1">
          <div className="text-xs font-semibold text-warning flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Shadowbox warnings ({summary.shadowbox.warnings.length})
          </div>
          <ul className="text-xs list-disc ml-5 space-y-0.5">
            {summary.shadowbox.warnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.validate.estimate ? (
        <div className="rounded-xl border border-base-300 bg-base-200/30 p-3">
          <div className="text-[0.65rem] uppercase tracking-wider text-base-content/60 mb-2">
            Origination estimate
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
            <div>
              <span className="opacity-60">Gas</span>
              <div className="font-bold">{summary.validate.estimate.gasLimit.toLocaleString()}</div>
            </div>
            <div>
              <span className="opacity-60">Storage</span>
              <div className="font-bold">{summary.validate.estimate.storageLimit.toLocaleString()}</div>
            </div>
            <div>
              <span className="opacity-60">Suggested fee (μtez)</span>
              <div className="font-bold">{summary.validate.estimate.suggestedFeeMutez.toLocaleString()}</div>
            </div>
            <div>
              <span className="opacity-60">Minimal fee (μtez)</span>
              <div className="font-bold">{summary.validate.estimate.minimalFeeMutez.toLocaleString()}</div>
            </div>
          </div>
        </div>
      ) : null}

      {summary.validate.issues.length > 0 ? (
        <div className="rounded-xl border border-error/40 bg-error/5 p-3 space-y-1">
          <div className="text-xs font-semibold text-error flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            Validation issues ({summary.validate.issues.length})
          </div>
          <ul className="text-xs list-disc ml-5 space-y-0.5">
            {summary.validate.issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.audit.findings.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
            Audit findings · {errors.length} error · {warnings.length} warning · {infos.length} info
          </div>
          <ul className="space-y-2">
            {summary.audit.findings.slice(0, 12).map((finding) => (
              <li
                key={finding.id}
                className={`rounded-lg border px-3 py-2 text-xs ${severityTone[finding.severity]}`}
              >
                <div className="font-semibold flex items-center justify-between gap-2">
                  <span>{finding.title}</span>
                  <span className="text-[0.65rem] uppercase tracking-wider opacity-70">
                    {finding.severity}
                  </span>
                </div>
                <p className="mt-1 text-base-content/80">{finding.description}</p>
                {finding.recommendation ? (
                  <p className="mt-1 italic text-base-content/60">→ {finding.recommendation}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {summary.audit.findings.length > 12 ? (
            <p className="text-[0.65rem] text-base-content/50">
              {summary.audit.findings.length - 12} more findings truncated in this view.
            </p>
          ) : null}
        </div>
      ) : null}

      {summary.simulation && summary.simulation.warnings.length > 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs space-y-1">
          <div className="font-semibold text-warning flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Simulation warnings
          </div>
          <ul className="list-disc ml-5 space-y-0.5">
            {summary.simulation.warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
