"use client";

import type { DiagramCommit } from "@/lib/collaboration/history";
import { formatBranchDate } from "@/components/collaboration/branch-utils";

export function CommitTree({
  commits,
  branches,
  selected,
  choose,
}: {
  commits: DiagramCommit[];
  branches: { id: string; name: string }[];
  selected?: string;
  choose: (id: string) => void;
}) {
  const lane = new Map(branches.map((b, i) => [b.id, i]));
  const points = new Map(
    commits.map((c, i) => [c.id, { x: 30 + (lane.get(c.branchId) ?? 0) * 220, y: 48 + i * 54 }]),
  );
  return (
    <div
      className="max-h-80 overflow-auto rounded-md border bg-muted/20"
      aria-label="Árbol de ramas y versiones"
    >
      <svg
        role="group"
        aria-label="Selecciona una versión del árbol"
        width={Math.max(600, branches.length * 220 + 240)}
        height={Math.max(100, commits.length * 54 + 40)}
      >
        {branches.map((branch, index) => (
          <text
            key={branch.id}
            x={18 + index * 220}
            y={19}
            fill="currentColor"
            fontSize={12}
            fontWeight={600}
          >
            {branch.name.slice(0, 28)}
          </text>
        ))}
        {commits.flatMap(c =>
          [...c.parents, ...(c.mergeParent ? [c.mergeParent] : [])].map(parent => {
            const a = points.get(parent),
              b = points.get(c.id);
            return a && b ? (
              <path
                key={`${c.id}-${parent}`}
                d={`M${a.x} ${a.y} C${a.x} ${b.y}, ${b.x} ${a.y}, ${b.x} ${b.y}`}
                stroke="currentColor"
                className="text-muted-foreground"
                strokeWidth={2}
                fill="none"
                strokeDasharray={parent === c.mergeParent ? "5 4" : undefined}
              />
            ) : null;
          }),
        )}
        {commits.map(c => {
          const p = points.get(c.id)!;
          return (
            <g
              key={c.id}
              role="button"
              tabIndex={0}
              aria-label={`Ver versión: ${c.message}, ${formatBranchDate(c.at)}, ${c.author.name}`}
              aria-pressed={selected === c.id}
              className="cursor-pointer text-foreground outline-none focus-visible:text-primary"
              onClick={() => choose(c.id)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  choose(c.id);
                }
              }}
            >
              <title>{`${branches.find(b => b.id === c.branchId)?.name ?? "Rama"}: ${c.message} · ${c.author.name} · ${formatBranchDate(c.at)}`}</title>
              <circle
                cx={p.x}
                cy={p.y}
                r={selected === c.id ? 9 : 6}
                fill="currentColor"
                className={selected === c.id ? "text-primary" : "text-muted-foreground"}
              />
              <text x={p.x + 15} y={p.y - 3} fill="currentColor" fontSize={12}>
                {c.message.slice(0, 34)}
              </text>
              <text x={p.x + 15} y={p.y + 14} fill="currentColor" fontSize={11}>
                {c.author.name} · {formatBranchDate(c.at)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
