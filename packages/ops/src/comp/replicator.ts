/**
 * COMP:replicator — clone a template COMP from table data.
 *
 * Reads a table DAT (referenced by path) and clones a template COMP
 * (also referenced by path) once per data row. Each clone is named
 * `{prefix}{namecolValue}`, positioned vertically, and gets its parameters
 * set from the corresponding table columns (header → param key).
 *
 * Params
 * ------
 *  template  (string)  path to the template COMP to clone
 *  dat       (string)  path to the table DAT (dat:table or any op with
 *                      `tableGrid` / `tableHeaders` in node.state)
 *  namecol   (string)  column name whose value is used for clone naming
 *  prefix    (string)  prefix prepended to each clone name
 *
 * Cook
 * ----
 *  Resolves both op paths, reads the table's grid data, finds the
 *  `namecol` column index, then re-creates clones (deletes stale ones
 *  first).  Each clone is placed at `(0, -rowIndex * 1.5)` and has its
 *  parameters set from that row's values using the header as param key.
 *
 *  Output: passes through the first wired input (container behaviour).
 */

import type { OpSpec } from '@webtoe/core';
import { sanitizeName } from '@webtoe/core';

type CellValue = string | number;

export const replicatorOps: OpSpec[] = [
  {
    type: 'comp:replicator',
    family: 'COMP',
    label: 'replicator',
    inputs: { min: 0, max: 8 },
    isContainer: true,
    params: [
      { key: 'template', type: 'string', default: '', page: 'Replicator' },
      { key: 'dat', type: 'string', default: '', page: 'Replicator' },
      { key: 'namecol', type: 'string', default: 'name', page: 'Replicator' },
      { key: 'prefix', type: 'string', default: 'clone_', page: 'Replicator' },
    ],
    cook(ctx) {
      const templatePath = ctx.paramStr('template').trim();
      const datPath = ctx.paramStr('dat').trim();
      const nameCol = ctx.paramStr('namecol').trim() || 'name';
      const prefix = ctx.paramStr('prefix').trim();

      // Resolve template
      let templateNode = ctx.engine.graph.resolve(templatePath, ctx.node);
      if (!templateNode) {
        ctx.node.error = `template op not found: ${templatePath}`;
        return ctx.inputs[0] ?? null;
      }

      // Resolve table
      const tableNode = ctx.engine.graph.resolve(datPath, ctx.node);
      if (!tableNode) {
        ctx.node.error = `table op not found: ${datPath}`;
        return ctx.inputs[0] ?? null;
      }

      // Cook the table to ensure its data is up-to-date
      ctx.engine.cook(tableNode);

      // Read table data from node state (set by dat:table cook)
      const grid = tableNode.state.tableGrid as CellValue[][] | undefined;
      const headers = tableNode.state.tableHeaders as string[] | undefined;

      if (!grid || grid.length < 2) {
        // Fewer than 2 rows means no data rows (only header or empty)
        return ctx.inputs[0] ?? null;
      }

      if (!headers || headers.length === 0) {
        ctx.node.error = 'table has no header row';
        return ctx.inputs[0] ?? null;
      }

      // Find the name column index
      const nameColIdx = headers.indexOf(nameCol);
      if (nameColIdx < 0) {
        ctx.node.error =
          `namecol "${nameCol}" not found in table headers: [${headers.join(', ')}]`;
        return ctx.inputs[0] ?? null;
      }

      // Compute number of data rows (skip header row)
      const dataRowCount = grid.length - 1;

      // --- Clean up stale clones ---
      // Remove any child that starts with the prefix (from a prior cook)
      if (ctx.node.children) {
        const stale = [...ctx.node.children.entries()]
          .filter(([name]) => name.startsWith(prefix));
        for (const [, child] of stale) {
          ctx.engine.graph.delete(child);
        }
      }

      // --- Create clones ---
      for (let r = 0; r < dataRowCount; r++) {
        const dataRow = grid[r + 1]; // skip header row (index 0)
        if (!dataRow) continue;

        // Determine clone name
        const nameVal = dataRow[nameColIdx];
        const nameStr = String(nameVal ?? '').trim() || `${r}`;
        const cloneName = sanitizeName(`${prefix}${nameStr}`);

        // Create a clone of the template
        const clone = ctx.engine.graph.create(
          templateNode.type,
          ctx.node,
          cloneName,
        );

        // Copy template param defaults — the clone already has them from create()
        // Optionally wire clone's first input if template has one
        // (replicator leaves wiring to the user for now)

        // Position clone vertically
        clone.pos = { x: 0, y: -r * 1.5 };

        // Set per-clone params from table row data
        for (let c = 0; c < dataRow.length && c < headers.length; c++) {
          const key = headers[c];
          if (!key) continue;

          const val = dataRow[c];
          const pv = clone.params.get(key);
          if (pv) {
            pv.mode = 'const';

            if (typeof val === 'number') {
              // Store numeric value
              pv.value = val;
            } else if (typeof val === 'string') {
              // Try numeric, fall back to string
              const num = Number(val);
              if (Number.isFinite(num) && val !== '') {
                pv.value = num;
              } else {
                pv.value = val;
              }
            } else {
              pv.value = 0;
            }
          }
        }
      }

      // Output: pass through the first wired input (container behaviour)
      return ctx.inputs[0] ?? null;
    },
  },
];
