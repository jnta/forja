interface DiffOp {
  readonly prefix: " " | "-" | "+";
  readonly line: string;
}

function lcsTable(a: readonly string[], b: readonly string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

function diffLines(a: readonly string[], b: readonly string[]): DiffOp[] {
  const table = lcsTable(a, b);
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ prefix: " ", line: a[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ prefix: "-", line: a[i] });
      i += 1;
    } else {
      ops.push({ prefix: "+", line: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    ops.push({ prefix: "-", line: a[i] });
    i += 1;
  }
  while (j < b.length) {
    ops.push({ prefix: "+", line: b[j] });
    j += 1;
  }
  return ops;
}

/** Readable, line-oriented unified diff. */
export function unifiedDiff(
  path: string,
  before: string,
  after: string,
): string {
  if (before === after) return "";
  const ops = diffLines(before.split("\n"), after.split("\n"));
  const lines = [`--- a/${path}`, `+++ b/${path}`];
  for (const op of ops) lines.push(`${op.prefix}${op.line}`);
  return `${lines.join("\n")}\n`;
}
