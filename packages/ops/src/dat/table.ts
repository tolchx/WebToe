/**
 * DAT:table — real rows/cols/cell table operator.
 *
 * Params
 * ------
 *  rows   (int)     number of rows (incl. header row)
 *  cols   (int)     number of columns
 *  data   (string)  cell values as CSV — row 0 = column headers,
 *                   subsequent rows = data.  Missing cells → 0 / ''.
 *
 * Output
 * ------
 *  Returns kind: 'chop' with one channel per **column**, named by the
 *  header in row 0 (or `c0`, `c1`, … if no header row).  Each channel's
 *  Float32Array contains the column values for data rows (1 .. rows-1).
 *
 *  Expression access:   op('table1')['colName']  → last value of named column
 *                       op('table1')[0]           → last value of column index 0
 *
 *  Programmatic access (from another op's cook):
 *    const t = ctx.engine.graph.resolve('/path/to/table1', ctx.node);
 *    const grid = t?.state.tableGrid;   // (string|number)[][]  full grid
 *    const rows = t?.state.tableRows;   // number of data rows
 *    const cols = t?.state.tableCols;   // number of columns
 *
 * tdWriteDat pattern
 * ------------------
 *  import { tdWriteDat } from './table';
 *  tdWriteDat(tableNode, row, col, value);
 */

import type { OpSpec, ChannelSet, Channel, NodeInst } from '@webtoe/core';

export type CellValue = string | number;

/* ---------- public helpers ---------- */

/**
 * Write a cell value into a table node's data and re-parse it in place.
 * Follows TouchDesigner's tdWriteDat convention.
 */
export function tdWriteDat(
  node: NodeInst,
  row: number,
  col: number,
  value: CellValue,
): void {
  const grid = (node.state.tableGrid as CellValue[][] | undefined);
  if (!grid) return;
  if (row < 0 || row >= grid.length) return;
  if (col < 0 || col >= grid[0].length) return;
  grid[row][col] = value;

  // Rebuild the CSV text so next cook sees it
  node.text = grid.map((r) => r.join(',')).join('\n');
  const rp = node.params.get('rows');
  const cp = node.params.get('cols');
  const dp = node.params.get('data');
  if (dp) {
    dp.value = node.text;
    dp.mode = 'const';
  }
  if (rp) rp.value = grid.length;
  if (cp) cp.value = grid[0].length;

  // Flag re-cook on next frame
  node.cookedFrame = -1;
}

/* ---------- CSV parsing ---------- */

function parseCSV(csv: string, rowCount: number, colCount: number): CellValue[][] {
  const result: CellValue[][] = [];
  const raw = csv.trim();
  if (!raw) {
    for (let r = 0; r < rowCount; r++) {
      result.push(new Array(colCount).fill(0));
    }
    return result;
  }

  const lines = raw.split('\n');
  const maxRows = Math.max(lines.length, rowCount);

  for (let r = 0; r < maxRows; r++) {
    const row: CellValue[] = [];
    if (r < lines.length) {
      const vals = lines[r].split(',');
      const targetCols = Math.max(vals.length, colCount);
      for (let c = 0; c < targetCols; c++) {
        if (c < vals.length) {
          const rawVal = vals[c].trim();
          const num = Number(rawVal);
          row.push(Number.isFinite(num) && rawVal !== '' ? num : rawVal);
        } else {
          row.push(0);
        }
      }
    } else {
      for (let c = 0; c < colCount; c++) row.push(0);
    }
    result.push(row);
  }
  return result;
}

function asNumber(v: CellValue): number {
  return typeof v === 'number' ? v : Number(v) || 0;
}

/* ---------- op spec ---------- */

export const tableOps: OpSpec[] = [
  {
    type: 'dat:table',
    family: 'DAT',
    label: 'table',
    inputs: { min: 0, max: 1 },
    params: [
      { key: 'rows', type: 'int', default: 10, min: 1, max: 9999 },
      { key: 'cols', type: 'int', default: 5, min: 1, max: 999 },
      { key: 'data', type: 'string', default: '', page: 'Data' },
    ],
    cook(ctx) {
      const raw = ctx.paramStr('data');
      const rowCount = Math.max(1, Math.round(ctx.paramNum('rows')));
      const colCount = Math.max(1, Math.round(ctx.paramNum('cols')));

      // Parse CSV into a 2-D grid
      const grid = parseCSV(raw, rowCount, colCount);

      // Store full grid in node state for programmatic access
      const headers: string[] = [];
      const dataStart = grid.length > 1 ? 1 : 0;
      if (grid.length > 0) {
        for (let c = 0; c < grid[0].length; c++) {
          headers.push(String(grid[0][c]));
        }
      }

      ctx.node.state.tableGrid = grid;
      ctx.node.state.tableRows = grid.length;
      ctx.node.state.tableCols = grid[0]?.length ?? 0;
      ctx.node.state.tableHeaders = headers;

      // Build CSV text for the standard DAT text property
      ctx.node.text = grid.map((r) => r.join(',')).join('\n');

      // Build ChannelSet: one channel per column (column-major)
      // channel name  = header text (or 'cN' fallback)
      // channel data  = Float32Array of all data rows for that column
      const channels: Channel[] = [];
      const colCount_ = grid[0]?.length ?? colCount;

      for (let c = 0; c < colCount_; c++) {
        const name = c < headers.length && headers[c]
          ? headers[c]
          : `c${c}`;
        const data: number[] = [];
        for (let r = dataStart; r < grid.length; r++) {
          const cell = grid[r][c];
          data.push(asNumber(cell));
        }
        // Always produce at least one sample per channel
        if (data.length === 0) data.push(0);
        channels.push({
          name,
          data: Float32Array.from(data),
        });
      }

      // Return as CHOP so expression access via op('t')['colName'] works
      return {
        kind: 'chop',
        channels,
        rate: 60,
      } satisfies ChannelSet;
    },
  },
];
