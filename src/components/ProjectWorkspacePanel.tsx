import { useMemo, useState } from 'react';
import { Boxes, FileCode2, FolderTree, GitBranch, ShieldAlert } from 'lucide-react';
import {
  createBrowserWorkspaceProject,
  type BrowserWorkspaceProject,
  type KilnProjectFile,
} from '../lib/kiln-project';
import type { KilnNetworkId } from '../lib/networks';

function fileBadge(kind: KilnProjectFile['kind']) {
  switch (kind) {
    case 'manifest':
      return 'badge-primary';
    case 'source':
      return 'badge-secondary';
    case 'storage':
      return 'badge-info';
    case 'scenario':
      return 'badge-success';
    default:
      return 'badge-outline';
  }
}

function fileIcon(kind: KilnProjectFile['kind']) {
  if (kind === 'manifest' || kind === 'scenario') {
    return <FolderTree className="w-4 h-4" />;
  }
  return <FileCode2 className="w-4 h-4" />;
}

export function ProjectWorkspacePanel({
  networkId,
  sourceType,
  source,
  initialStorage,
  entrypoints,
  contractAddress,
  clearanceId,
}: {
  networkId: KilnNetworkId;
  sourceType: 'michelson' | 'smartpy' | 'solidity';
  source: string;
  initialStorage?: string;
  entrypoints: string[];
  contractAddress?: string;
  clearanceId?: string | null;
}) {
  const project: BrowserWorkspaceProject = useMemo(
    () =>
      createBrowserWorkspaceProject({
        networkId,
        sourceType,
        source,
        initialStorage,
        entrypoints,
        contractAddress,
        clearanceId,
      }),
    [clearanceId, contractAddress, entrypoints, initialStorage, networkId, source, sourceType],
  );
  const [selectedPath, setSelectedPath] = useState(project.files[0]?.path ?? '');
  const selectedFile =
    project.files.find((file) => file.path === selectedPath) ?? project.files[0];

  return (
    <section className="bg-base-100 rounded-2xl border border-base-200 overflow-hidden">
      <div className="p-4 border-b border-base-300 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-bold flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-primary" />
          Project workspace
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="badge badge-outline font-mono">kiln.project.json</span>
          <span className="badge badge-success">browser-scoped</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
        <div className="border-b lg:border-b-0 lg:border-r border-base-300 p-3 space-y-2">
          {project.files.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => setSelectedPath(file.path)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                selectedFile?.path === file.path
                  ? 'border-primary bg-primary/5'
                  : 'border-base-300 hover:border-primary/40 hover:bg-base-200/40'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base-content/60">{fileIcon(file.kind)}</span>
                <span className="font-mono text-xs truncate">{file.path}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={`badge badge-xs ${fileBadge(file.kind)}`}>{file.kind}</span>
                <span className="text-[0.65rem] text-base-content/50">
                  {file.sizeBytes} bytes
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4 min-w-0">
          {selectedFile ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-xs truncate">{selectedFile.path}</div>
                <span className={`badge badge-xs ${fileBadge(selectedFile.kind)}`}>
                  {selectedFile.kind}
                </span>
              </div>
              <pre className="max-h-56 overflow-auto rounded-lg bg-base-300/60 p-3 text-xs font-mono whitespace-pre-wrap break-words">
                {selectedFile.preview || 'empty'}
              </pre>
            </div>
          ) : null}

          <div className="rounded-xl border border-base-300 p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="w-4 h-4 text-secondary" />
              Contract graph
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {project.graph.nodes.map((node) => (
                <div
                  key={node.id}
                  className="rounded-lg border border-base-300 bg-base-200/30 p-2"
                >
                  <div className="flex items-center gap-2">
                    <Boxes className="w-3.5 h-3.5 text-base-content/60" />
                    <span className="font-mono text-xs">{node.id}</span>
                  </div>
                  <div className="text-[0.65rem] text-base-content/60 mt-1">
                    {node.kind} · {node.label}
                  </div>
                </div>
              ))}
            </div>
            {project.graph.edges.length > 0 ? (
              <div className="space-y-1">
                {project.graph.edges.map((edge, index) => (
                  <div key={`${edge.from}-${edge.to}-${index}`} className="text-xs font-mono">
                    {edge.from} -&gt; {edge.to}{' '}
                    <span className="text-base-content/50">via</span>{' '}
                    {edge.label}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-base-content/60">No executable scenario edges yet.</div>
            )}
          </div>

          {project.blockers.length > 0 ? (
            <div className="alert alert-warning text-xs items-start">
              <ShieldAlert className="w-4 h-4 mt-0.5" />
              <div className="space-y-1">
                {project.blockers.map((blocker) => (
                  <div key={blocker}>{blocker}</div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
