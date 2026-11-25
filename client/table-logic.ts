export type SortDirection = "none" | "asc" | "desc";

export type UnitGroup = "time" | "bitrate" | "bytes" | "percent" | "number";

export type ParsedSortableValue =
  | { kind: "empty" }
  | { kind: "numeric"; group: UnitGroup; value: number; raw: string }
  | { kind: "text"; text: string };

export interface TableData {
  headers: string[];
  rows: string[][];
}

const EMPTY_MARKERS = new Set([
  "",
  "-",
  "--",
  "—",
  "–",
  "n/a",
  "na",
  "none",
  "null",
  "无",
]);

// 同维度单位换算表（基准：time=ms，bitrate=Mbps，bytes=B，percent=%）
const UNIT_TABLE: Readonly<Record<string, { group: UnitGroup; factor: number }>> = {
  ns: { group: "time", factor: 1e-6 },
  us: { group: "time", factor: 1e-3 },
  "μs": { group: "time", factor: 1e-3 },
  ms: { group: "time", factor: 1 },
  s: { group: "time", factor: 1000 },
  sec: { group: "time", factor: 1000 },
  secs: { group: "time", factor: 1000 },
  min: { group: "time", factor: 60_000 },
  mins: { group: "time", factor: 60_000 },
  h: { group: "time", factor: 3_600_000 },
  hr: { group: "time", factor: 3_600_000 },
  hrs: { group: "time", factor: 3_600_000 },

  bps: { group: "bitrate", factor: 1e-6 },
  kbps: { group: "bitrate", factor: 1e-3 },
  mbps: { group: "bitrate", factor: 1 },
  gbps: { group: "bitrate", factor: 1000 },
  tbps: { group: "bitrate", factor: 1_000_000 },
  "b/s": { group: "bitrate", factor: 8e-6 },
  "kb/s": { group: "bitrate", factor: 8e-3 },
  "mb/s": { group: "bitrate", factor: 8 },
  "gb/s": { group: "bitrate", factor: 8000 },

  b: { group: "bytes", factor: 1 },
  kb: { group: "bytes", factor: 1000 },
  mb: { group: "bytes", factor: 1_000_000 },
  gb: { group: "bytes", factor: 1_000_000_000 },
  tb: { group: "bytes", factor: 1_000_000_000_000 },
  kib: { group: "bytes", factor: 1024 },
  mib: { group: "bytes", factor: 1024 ** 2 },
  gib: { group: "bytes", factor: 1024 ** 3 },
  tib: { group: "bytes", factor: 1024 ** 4 },

  "%": { group: "percent", factor: 1 },
};

const TEXT_COLLATOR = new Intl.Collator("zh-Hans-CN", {
  numeric: true,
  sensitivity: "base",
});

/** 三态排序流转：无排序 -> 升序 -> 降序 -> 恢复原序 */
export function nextSortDirection(current: SortDirection): SortDirection {
  if (current === "none") return "asc";
  if (current === "asc") return "desc";
  return "none";
}

/** 规范化单元格纯文本：去除零宽/不换行空格、折叠多余空白与硬换行 */
export function normalizeCellText(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
}

/**
 * 解析可排序值：
 * - 空值与占位符（— / - / N/A）标记为 empty，排序时始终沉底
 * - 识别单个数值、范围值（如 41.1 ~ 46.7 ms）及多值（如 86.95 / 79.65 Mbps）
 * - 同维度单位自动统一换算后再比较（如 37.2 ms vs 0.169 s）
 */
export function parseSortableValue(raw: string): ParsedSortableValue {
  const text = normalizeCellText(raw);
  if (EMPTY_MARKERS.has(text.toLowerCase())) {
    return { kind: "empty" };
  }

  // 避免把 IPv4 / IPv6 / 版本号误识别为单个纯数字
  if (
    /^\d{1,3}(?:\.\d{1,3}){2,}/.test(text) ||
    /^[0-9a-fA-F:]+::/.test(text) ||
    /^v?\d+\.\d+\.\d+/.test(text)
  ) {
    return { kind: "text", text };
  }

  const match = text.match(
    /^[¥$€£~≈<>≤≥+\s]*(-?\d[\d,]*(?:\.\d+)?)(?:\s*(?:~|-|–|—|\/)\s*-?\d[\d,]*(?:\.\d+)?)?\s*(gb\/s|mb\/s|kb\/s|b\/s|tbps|gbps|mbps|kbps|bps|tib|gib|mib|kib|tb|gb|mb|kb|b|ms|ns|us|μs|secs|sec|mins|min|hrs|hr|s|h|%)?(?=$|[\s(（,，;；|])/i,
  );

  if (match) {
    const numStr = match[1].replace(/,/g, "");
    const num = Number(numStr);
    const unitRaw = (match[2] ?? "").toLowerCase();

    if (Number.isFinite(num)) {
      if (unitRaw && UNIT_TABLE[unitRaw]) {
        const entry = UNIT_TABLE[unitRaw];
        return {
          kind: "numeric",
          group: entry.group,
          value: num * entry.factor,
          raw: text,
        };
      }

      const remainder = text.slice(match[0].length).trim();
      if (remainder === "" || /^[（(]/.test(remainder)) {
        return {
          kind: "numeric",
          group: "number",
          value: num,
          raw: text,
        };
      }
    }
  }

  return { kind: "text", text };
}

/** 比较两个单元格值，空值始终沉底 */
export function compareCellValues(
  aRaw: string,
  bRaw: string,
  direction: "asc" | "desc",
): number {
  const a = parseSortableValue(aRaw);
  const b = parseSortableValue(bRaw);

  if (a.kind === "empty" && b.kind === "empty") return 0;
  if (a.kind === "empty") return 1;
  if (b.kind === "empty") return -1;

  const factor = direction === "asc" ? 1 : -1;

  if (a.kind === "numeric" && b.kind === "numeric" && a.group === b.group) {
    if (a.value !== b.value) {
      return (a.value < b.value ? -1 : 1) * factor;
    }
    return TEXT_COLLATOR.compare(a.raw, b.raw) * factor;
  }

  const aText = a.kind === "numeric" ? a.raw : a.text;
  const bText = b.kind === "numeric" ? b.raw : b.text;
  return TEXT_COLLATOR.compare(aText, bText) * factor;
}

/**
 * 行列转置：将「少对象 × 多维度」的巨宽横表转为「维度作行 × 对象作列」的竖向对比表。
 * 例如 3 行 × 11 列 -> 10 行 × 4 列（原第 0 列变为新表头，原表头第 1..N 列变为新首列）。
 */
export function transposeTableData(data: TableData): TableData {
  const colCount = Math.max(
    data.headers.length,
    ...data.rows.map((row) => row.length),
    0,
  );
  if (colCount === 0) {
    return { headers: [], rows: [] };
  }

  const matrix: string[][] = [];
  if (data.headers.length > 0) {
    matrix.push(
      Array.from({ length: colCount }, (_, i) => normalizeCellText(data.headers[i] ?? "")),
    );
  }
  for (const row of data.rows) {
    matrix.push(Array.from({ length: colCount }, (_, i) => normalizeCellText(row[i] ?? "")));
  }

  if (matrix.length === 0) {
    return { headers: [], rows: [] };
  }

  const transposed: string[][] = Array.from({ length: colCount }, (_, c) =>
    matrix.map((row) => row[c] ?? ""),
  );

  return {
    headers: transposed[0] ?? [],
    rows: transposed.slice(1),
  };
}

/** 序列化表格为标准 GFM Markdown（避免未转义 | 或换行打断表格结构） */
export function tableDataToMarkdown(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const escapeCell = (value: string) => normalizeCellText(value).replace(/\\*\|/g, "\\|");
  const colCount = Math.max(
    headers.length,
    ...rows.map((row) => row.length),
    0,
  );
  if (colCount === 0) return "";

  const padRow = (cells: readonly string[]) => {
    const out: string[] = [];
    for (let i = 0; i < colCount; i += 1) {
      out.push(escapeCell(cells[i] ?? ""));
    }
    return `| ${out.join(" | ")} |`;
  };

  const lines: string[] = [];
  if (headers.length > 0) {
    lines.push(padRow(headers));
    lines.push(`| ${Array.from({ length: colCount }, () => "---").join(" | ")} |`);
  }
  for (const row of rows) {
    lines.push(padRow(row));
  }
  return lines.join("\n");
}

/** 序列化表格为标准 TSV（直接粘贴进 Excel / WPS / 飞书表格自动分列） */
export function tableDataToTsv(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const escapeTsv = (value: string) => {
    const clean = normalizeCellText(value);
    if (/[\t\n"]/.test(clean)) {
      return `"${clean.replace(/"/g, '""')}"`;
    }
    return clean;
  };

  const allRows: readonly (readonly string[])[] =
    headers.length > 0 ? [headers, ...rows] : rows;

  return allRows
    .map((row) => row.map(escapeTsv).join("\t"))
    .join("\n");
}
