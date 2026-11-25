import { Platform } from "react-native";
import { getUiMessages, type UiMessages } from "./i18n";
import {
  compareCellValues,
  nextSortDirection,
  normalizeCellText,
  tableDataToMarkdown,
  tableDataToTsv,
  transposeTableData,
  type SortDirection,
  type TableData,
} from "./table-logic";

export interface LocaleSourceLike {
  readonly locale: string;
  subscribe?: (listener: () => void) => () => void;
}

// 本插件不开启 DOM lib，在此仅声明 client/web.ts 实际用到的最小 DOM 接口。
interface DomRectLike {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

interface StyleDeclarationLike {
  [key: string]: string;
}

interface ElementLike {
  tagName: string;
  id: string;
  textContent: string | null;
  scrollHeight: number;
  clientHeight: number;
  style: StyleDeclarationLike;
  parentElement: ElementLike | null;
  children: ArrayLike<ElementLike>;
  dataset: Record<string, string | undefined>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  closest(selector: string): ElementLike | null;
  querySelector(selector: string): ElementLike | null;
  querySelectorAll(selector: string): ArrayLike<ElementLike>;
  appendChild<T extends ElementLike>(child: T): T;
  remove(): void;
  getBoundingClientRect(): DomRectLike;
  addEventListener(type: string, listener: (event: EventLike) => void): void;
  removeEventListener(type: string, listener: (event: EventLike) => void): void;
}

interface TextareaLike extends ElementLike {
  value: string;
  focus(): void;
  select(): void;
}

interface EventLike {
  target: ElementLike | null;
  key?: string;
  clientX?: number;
  clientY?: number;
  button?: number;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

interface SelectionLike {
  toString(): string;
}

interface DocumentLike {
  documentElement?: ElementLike | null;
  head: ElementLike | null;
  body: ElementLike | null;
  createElement(tag: string): ElementLike;
  getElementById(id: string): ElementLike | null;
  querySelectorAll(selector: string): ArrayLike<ElementLike>;
  addEventListener(type: string, listener: (event: EventLike) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (event: EventLike) => void, capture?: boolean): void;
  execCommand?(commandId: string): boolean;
}

interface WindowLike {
  innerWidth: number;
  innerHeight: number;
  getSelection?(): SelectionLike | null;
  getComputedStyle?(el: ElementLike): {
    backgroundColor?: string;
    overflowX?: string;
    overflowY?: string;
  };
  matchMedia?(query: string): { matches: boolean };
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(id: number): void;
  addEventListener(type: string, listener: () => void, capture?: boolean): void;
  removeEventListener(type: string, listener: () => void, capture?: boolean): void;
}

interface NavigatorLike {
  language?: string;
  clipboard?: {
    writeText(text: string): Promise<void>;
  };
}

interface MutationObserverLike {
  observe(target: ElementLike, options: { childList: boolean; subtree: boolean }): void;
  disconnect(): void;
}

declare const document: DocumentLike | undefined;
declare const window: WindowLike | undefined;
declare const navigator: NavigatorLike | undefined;
declare const MutationObserver: (new (callback: () => void) => MutationObserverLike) | undefined;

const STYLE_ID = "paseo-native-table-tools-style";
const TOOLBAR_ID = "paseo-native-table-tools-toolbar";
const FLOAT_WIN_ID = "paseo-native-table-tools-float-win";
const TOAST_ID = "paseo-native-table-tools-toast";
const RESIZE_EDGE_PX = 8;
const MIN_COL_WIDTH_PX = 48;
const MAX_TABLE_HEIGHT_CSS = "min(62vh, 520px)";

const CSS_TEXT = `
/* 1. 修复 Paseo 原生与 Better Paseo 插件用户长消息气泡向左侧溢出的问题 */
[data-testid="user-message"],
[data-testid="user-message"] > div:first-child {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
[data-testid="user-message"] > div:first-child > div:not([data-testid="user-message-trailing-row"]) {
  display: block !important;
  width: fit-content !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  overflow-x: hidden !important;
}
[data-testid="user-message"] div,
[data-testid="user-message"] [data-message-text="true"] {
  max-width: 100% !important;
  min-width: 0 !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
  box-sizing: border-box !important;
}
[data-plugin-row="true"] .r-173mn98 {
  width: 100% !important;
  max-width: min(760px, 100%) !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
[data-plugin-row="true"] .r-173mn98 > div {
  display: block !important;
  width: fit-content !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  overflow-x: hidden !important;
}
[data-plugin-row="true"] .r-173mn98 > div div {
  max-width: 100% !important;
  min-width: 0 !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
  box-sizing: border-box !important;
}

/* 2. 表格智能防假高（表头不折行自动撑开合理列宽）+ 超高内部滚动与吸顶表头 */
[data-ntt-scroll-wrap="true"]:not([data-ntt-full-height="true"]) {
  max-height: ${MAX_TABLE_HEIGHT_CSS} !important;
  overflow-y: auto !important;
  overflow-x: auto !important;
  overscroll-behavior-y: auto;
}
table[data-ntt-enhanced="true"] th[data-ntt-sortable="true"] {
  position: sticky;
  top: 0;
  z-index: 2;
  white-space: nowrap;
  cursor: pointer;
  user-select: text;
  transition: background-color 120ms ease;
}
body[data-ntt-host-theme="dark"] table[data-ntt-enhanced="true"] th[data-ntt-sortable="true"] {
  background-color: #22252e;
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.12);
}
body[data-ntt-host-theme="light"] table[data-ntt-enhanced="true"] th[data-ntt-sortable="true"] {
  background-color: #f4f6f9;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.1);
}
body[data-ntt-host-theme="dark"] table[data-ntt-enhanced="true"] th[data-ntt-sortable="true"]:hover {
  background-color: #2c303c;
}
body[data-ntt-host-theme="light"] table[data-ntt-enhanced="true"] th[data-ntt-sortable="true"]:hover {
  background-color: #e8ecf2;
}
table[data-ntt-enhanced="true"] th[data-ntt-resize-edge="true"] {
  cursor: col-resize !important;
  box-shadow: inset -2px 0 0 rgba(99, 102, 241, 0.9) !important;
}
table[data-ntt-enhanced="true"] th[data-ntt-sortable="true"]::after {
  content: " ⇅";
  opacity: 0;
  font-size: 0.85em;
  margin-left: 2px;
  transition: opacity 120ms ease;
}
table[data-ntt-enhanced="true"] th[data-ntt-sortable="true"]:hover::after {
  opacity: 0.55;
}
table[data-ntt-enhanced="true"] th[data-ntt-sort="asc"]::after {
  content: " ▲";
  opacity: 0.9;
}
table[data-ntt-enhanced="true"] th[data-ntt-sort="desc"]::after {
  content: " ▼";
  opacity: 0.9;
}
table[data-ntt-enhanced="true"] td:hover {
  background-color: rgba(128, 128, 128, 0.06);
}
table[data-ntt-expanded="true"] {
  width: max-content !important;
  max-width: none !important;
}
table[data-ntt-expanded="true"] th,
table[data-ntt-expanded="true"] td {
  white-space: nowrap !important;
}
table[data-ntt-resized="true"] {
  table-layout: fixed !important;
  max-width: none !important;
}
table[data-ntt-resized="true"] th,
table[data-ntt-resized="true"] td {
  box-sizing: border-box !important;
  overflow-wrap: anywhere;
}
body[data-ntt-resizing="true"],
body[data-ntt-resizing="true"] * {
  cursor: col-resize !important;
  user-select: none !important;
}
body[data-ntt-dragging-win="true"],
body[data-ntt-dragging-win="true"] * {
  cursor: move !important;
  user-select: none !important;
}

/* 3. 悬浮工具条 */
#${TOOLBAR_ID} {
  position: fixed;
  z-index: 99990;
  display: none;
  align-items: center;
  gap: 4px;
  padding: 3px 5px;
  border-radius: 7px;
  border: 1px solid rgba(128, 128, 128, 0.28);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 11px;
  line-height: 1.2;
  backdrop-filter: blur(8px);
}
#${TOOLBAR_ID}[data-ntt-theme="dark"] {
  background: rgba(28, 30, 36, 0.94);
  color: #e6e8ee;
  border-color: rgba(255, 255, 255, 0.16);
}
#${TOOLBAR_ID}[data-ntt-theme="light"] {
  background: rgba(255, 255, 255, 0.95);
  color: #1f2328;
  border-color: rgba(0, 0, 0, 0.14);
}
#${TOOLBAR_ID} button,
#${FLOAT_WIN_ID} .ntt-win-actions button {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 4px 8px;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
}
#${TOOLBAR_ID} button:hover,
#${FLOAT_WIN_ID} .ntt-win-actions button:hover {
  background: rgba(128, 128, 128, 0.22);
}

/* 4. 可拖拽、可自由缩放的非模态转置悬浮窗（不挡底部对话滚动与阅读） */
#${FLOAT_WIN_ID} {
  position: fixed;
  z-index: 99992;
  display: none;
  flex-direction: column;
  min-width: 360px;
  min-height: 220px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  resize: both;
  overflow: hidden;
  border-radius: 11px;
  border: 1px solid rgba(128, 128, 128, 0.34);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
#${FLOAT_WIN_ID}[data-ntt-theme="dark"] {
  background: rgba(26, 28, 35, 0.98);
  color: #e6e8ee;
  border-color: rgba(255, 255, 255, 0.18);
}
#${FLOAT_WIN_ID}[data-ntt-theme="light"] {
  background: rgba(255, 255, 255, 0.98);
  color: #1f2328;
  border-color: rgba(0, 0, 0, 0.16);
}
#${FLOAT_WIN_ID} .ntt-win-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.22);
  cursor: move;
  user-select: none;
  font-size: 12px;
  flex-shrink: 0;
}
#${FLOAT_WIN_ID}[data-ntt-theme="dark"] .ntt-win-header {
  background: rgba(36, 39, 49, 0.95);
}
#${FLOAT_WIN_ID}[data-ntt-theme="light"] .ntt-win-header {
  background: rgba(244, 246, 249, 0.95);
}
#${FLOAT_WIN_ID} .ntt-win-title {
  font-weight: 600;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#${FLOAT_WIN_ID} .ntt-win-actions {
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: default;
  flex-shrink: 0;
}
#${FLOAT_WIN_ID} .ntt-win-body {
  overflow: auto;
  padding: 12px;
  flex: 1;
  min-height: 0;
}
#${FLOAT_WIN_ID} table {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
  line-height: 1.5;
}
#${FLOAT_WIN_ID} th,
#${FLOAT_WIN_ID} td {
  border: 1px solid rgba(128, 128, 128, 0.24);
  padding: 7px 10px;
  text-align: left;
  vertical-align: top;
}
#${FLOAT_WIN_ID} th {
  position: sticky;
  top: 0;
  z-index: 2;
  font-weight: 600;
  white-space: nowrap;
}
#${FLOAT_WIN_ID}[data-ntt-theme="dark"] th {
  background: #252832;
}
#${FLOAT_WIN_ID}[data-ntt-theme="light"] th {
  background: #f4f6f9;
}
#${FLOAT_WIN_ID} td:first-child {
  font-weight: 600;
  white-space: nowrap;
}

/* 5. Toast 提示 */
#${TOAST_ID} {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 99995;
  display: none;
  max-width: 340px;
  padding: 7px 12px;
  border-radius: 8px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 12px;
  line-height: 1.4;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.24);
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#${TOAST_ID}[data-ntt-theme="dark"] {
  background: rgba(32, 35, 42, 0.96);
  color: #f0f2f7;
  border: 1px solid rgba(255, 255, 255, 0.14);
}
#${TOAST_ID}[data-ntt-theme="light"] {
  background: rgba(24, 26, 31, 0.92);
  color: #ffffff;
}
`;

function toArray<T>(list: ArrayLike<T>): T[] {
  const out: T[] = [];
  for (let i = 0; i < list.length; i += 1) {
    out.push(list[i]);
  }
  return out;
}

function detectTheme(): "dark" | "light" {
  if (window && document?.body && window.getComputedStyle) {
    const bg = window.getComputedStyle(document.body).backgroundColor ?? "";
    const m = bg.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
      const r = Number(m[1]);
      const g = Number(m[2]);
      const b = Number(m[3]);
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      return luminance < 128 ? "dark" : "light";
    }
  }
  if (window?.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "dark";
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 降级到 execCommand
  }

  if (!document?.body || !document.execCommand) return false;
  const textarea = document.createElement("textarea") as TextareaLike;
  textarea.value = text;
  textarea.setAttribute("data-paseo-markdown-ignore", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  try {
    textarea.focus();
    textarea.select();
    return Boolean(document.execCommand("copy"));
  } finally {
    textarea.remove();
  }
}

function getHeaderCells(table: ElementLike): ElementLike[] {
  const thead = table.querySelector("thead");
  if (thead) {
    const tr = thead.querySelector("tr");
    if (tr) return toArray(tr.querySelectorAll("th, td"));
  }
  const firstTr = table.querySelector("tr");
  if (!firstTr) return [];
  const ths = toArray(firstTr.querySelectorAll("th"));
  return ths.length > 0 ? ths : [];
}

function getBodyContainerAndRows(table: ElementLike): {
  container: ElementLike | null;
  rows: ElementLike[];
} {
  const tbody = table.querySelector("tbody");
  if (tbody) {
    const rows = toArray(tbody.children).filter((el) => el.tagName.toUpperCase() === "TR");
    if (!table.querySelector("thead") && rows.length > 0 && rows[0].querySelectorAll("th").length > 0) {
      return { container: tbody, rows: rows.slice(1) };
    }
    return { container: tbody, rows };
  }
  const allRows = toArray(table.querySelectorAll("tr"));
  return { container: table, rows: allRows.slice(1) };
}

function isMarkdownTable(table: ElementLike): boolean {
  if (table.getAttribute("data-ntt-ignore") === "true") return false;
  const headers = getHeaderCells(table);
  if (headers.length < 2) return false;
  const { rows } = getBodyContainerAndRows(table);
  if (rows.length < 1) return false;
  return true;
}

/** 找到仅包裹当前单个 table 的外层容器（不改动 DOM 层级，仅打标用于限高与吸顶滚动） */
function findDedicatedTableWrapper(table: ElementLike): ElementLike | null {
  if (table.closest(`#${FLOAT_WIN_ID}`)) return null;
  const parent = table.parentElement;
  if (!parent) return null;
  if (parent.tagName.toUpperCase() === "DIV" && parent.children.length === 1) {
    return parent;
  }
  return null;
}

function extractTableData(table: ElementLike): TableData {
  const headers = getHeaderCells(table).map((cell) => normalizeCellText(cell.textContent ?? ""));
  const { rows: trList } = getBodyContainerAndRows(table);
  const rows = trList.map((tr) =>
    toArray(tr.children)
      .filter((el) => {
        const tag = el.tagName.toUpperCase();
        return tag === "TD" || tag === "TH";
      })
      .map((cell) => normalizeCellText(cell.textContent ?? "")),
  );
  return { headers, rows };
}

function ensureOriginalOrderMarks(rows: ElementLike[]): void {
  const hasMissing = rows.some((row) => row.getAttribute("data-ntt-orig-idx") === null);
  if (!hasMissing) return;
  let maxIdx = -1;
  for (const row of rows) {
    const existing = row.getAttribute("data-ntt-orig-idx");
    if (existing !== null) {
      const parsed = Number(existing);
      if (Number.isFinite(parsed) && parsed > maxIdx) maxIdx = parsed;
    }
  }
  for (const row of rows) {
    if (row.getAttribute("data-ntt-orig-idx") === null) {
      maxIdx += 1;
      row.setAttribute("data-ntt-orig-idx", String(maxIdx));
    }
  }
}

function enhanceTable(table: ElementLike, headerHint: string): void {
  if (!isMarkdownTable(table)) return;
  table.setAttribute("data-ntt-enhanced", "true");
  const wrap = findDedicatedTableWrapper(table);
  if (wrap) {
    wrap.setAttribute("data-ntt-scroll-wrap", "true");
  }
  const headers = getHeaderCells(table);
  headers.forEach((th, idx) => {
    th.setAttribute("data-ntt-sortable", "true");
    th.setAttribute("data-ntt-col-idx", String(idx));
    if (!th.getAttribute("title") || th.getAttribute("data-ntt-auto-title") === "true") {
      th.setAttribute("title", headerHint);
      th.setAttribute("data-ntt-auto-title", "true");
    }
  });
  const { rows } = getBodyContainerAndRows(table);
  ensureOriginalOrderMarks(rows);
}

function resetTableSort(table: ElementLike): boolean {
  const { container, rows } = getBodyContainerAndRows(table);
  if (!container || rows.length < 2) return false;
  const headers = getHeaderCells(table);
  let wasSorted = false;
  for (const th of headers) {
    if (th.getAttribute("data-ntt-sort")) {
      wasSorted = true;
      th.removeAttribute("data-ntt-sort");
    }
  }
  if (!wasSorted) return false;

  const sorted = [...rows].sort((a, b) => {
    const ai = Number(a.getAttribute("data-ntt-orig-idx") ?? "0");
    const bi = Number(b.getAttribute("data-ntt-orig-idx") ?? "0");
    return ai - bi;
  });
  for (const row of sorted) {
    container.appendChild(row);
  }
  table.removeAttribute("data-ntt-sorted");
  return true;
}

function resetTableWidths(table: ElementLike): boolean {
  const wasResized = table.getAttribute("data-ntt-resized") === "true";
  const wasExpanded = table.getAttribute("data-ntt-expanded") === "true";
  if (!wasResized && !wasExpanded) return false;

  table.removeAttribute("data-ntt-resized");
  table.removeAttribute("data-ntt-expanded");
  table.style.width = "";
  table.style.minWidth = "";

  for (const th of getHeaderCells(table)) {
    th.style.width = "";
    th.style.minWidth = "";
    th.removeAttribute("data-ntt-resize-edge");
  }
  return true;
}

function toggleExpandedWidth(table: ElementLike): boolean {
  const isExpanded = table.getAttribute("data-ntt-expanded") === "true";
  if (isExpanded) {
    table.removeAttribute("data-ntt-expanded");
    return false;
  }
  if (table.getAttribute("data-ntt-resized") === "true") {
    table.removeAttribute("data-ntt-resized");
    table.style.width = "";
    table.style.minWidth = "";
    for (const th of getHeaderCells(table)) {
      th.style.width = "";
      th.style.minWidth = "";
    }
  }
  table.setAttribute("data-ntt-expanded", "true");
  return true;
}

function toggleTableFullHeight(table: ElementLike): boolean {
  const wrap = findDedicatedTableWrapper(table);
  if (!wrap) return false;
  const isFull = wrap.getAttribute("data-ntt-full-height") === "true";
  if (isFull) {
    wrap.removeAttribute("data-ntt-full-height");
    return false;
  }
  wrap.setAttribute("data-ntt-full-height", "true");
  return true;
}

function sortTableByColumn(table: ElementLike, colIndex: number): SortDirection {
  const headers = getHeaderCells(table);
  const targetTh = headers[colIndex];
  if (!targetTh) return "none";

  const current = (targetTh.getAttribute("data-ntt-sort") as SortDirection | null) ?? "none";
  const next = nextSortDirection(current);
  const { container, rows } = getBodyContainerAndRows(table);
  if (!container || rows.length < 2) return "none";

  ensureOriginalOrderMarks(rows);

  for (const th of headers) {
    th.removeAttribute("data-ntt-sort");
  }

  if (next === "none") {
    const restored = [...rows].sort((a, b) => {
      const ai = Number(a.getAttribute("data-ntt-orig-idx") ?? "0");
      const bi = Number(b.getAttribute("data-ntt-orig-idx") ?? "0");
      return ai - bi;
    });
    for (const row of restored) {
      container.appendChild(row);
    }
    table.removeAttribute("data-ntt-sorted");
    return "none";
  }

  const decorated = rows.map((row, currentPos) => {
    const cells = toArray(row.children).filter((el) => {
      const tag = el.tagName.toUpperCase();
      return tag === "TD" || tag === "TH";
    });
    const text = normalizeCellText(cells[colIndex]?.textContent ?? "");
    const origIdx = Number(row.getAttribute("data-ntt-orig-idx") ?? String(currentPos));
    return { row, text, origIdx };
  });

  decorated.sort((a, b) => {
    const cmp = compareCellValues(a.text, b.text, next);
    return cmp !== 0 ? cmp : a.origIdx - b.origIdx;
  });

  for (const item of decorated) {
    container.appendChild(item.row);
  }
  targetTh.setAttribute("data-ntt-sort", next);
  table.setAttribute("data-ntt-sorted", "true");
  return next;
}

function findScrollContainerRect(table: ElementLike): DomRectLike {
  const tableRect = table.getBoundingClientRect();
  let cur = table.parentElement;
  let depth = 0;
  while (cur && depth < 4) {
    const style = window?.getComputedStyle?.(cur);
    const overflowX = style?.overflowX ?? "";
    const overflowY = style?.overflowY ?? "";
    if (
      overflowX === "auto" ||
      overflowX === "scroll" ||
      overflowX === "hidden" ||
      overflowY === "auto" ||
      overflowY === "scroll"
    ) {
      const rect = cur.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          top: Math.max(tableRect.top, rect.top),
          left: Math.max(tableRect.left, rect.left),
          right: Math.min(tableRect.right, rect.right),
          bottom: Math.min(tableRect.bottom, rect.bottom),
          width: Math.max(0, Math.min(tableRect.right, rect.right) - Math.max(tableRect.left, rect.left)),
          height: Math.max(0, Math.min(tableRect.bottom, rect.bottom) - Math.max(tableRect.top, rect.top)),
        };
      }
    }
    cur = cur.parentElement;
    depth += 1;
  }
  return tableRect;
}

function isNearRightEdge(el: ElementLike, clientX: number | undefined): boolean {
  if (typeof clientX !== "number") return false;
  const rect = el.getBoundingClientRect();
  return rect.width >= 20 && rect.right - clientX >= -2 && rect.right - clientX <= RESIZE_EDGE_PX;
}

function buildHtmlTable(doc: DocumentLike, data: TableData, headerHint: string): ElementLike {
  const table = doc.createElement("table");
  const thead = doc.createElement("thead");
  const headTr = doc.createElement("tr");
  for (const h of data.headers) {
    const th = doc.createElement("th");
    th.textContent = h;
    headTr.appendChild(th);
  }
  thead.appendChild(headTr);
  table.appendChild(thead);

  const tbody = doc.createElement("tbody");
  for (const row of data.rows) {
    const tr = doc.createElement("tr");
    for (const cell of row) {
      const td = doc.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  enhanceTable(table, headerHint);
  return table;
}

interface ActiveResize {
  table: ElementLike;
  th: ElementLike;
  startX: number;
  startColWidth: number;
  startTableWidth: number;
}

interface ActiveWinDrag {
  startMouseX: number;
  startMouseY: number;
  startLeft: number;
  startTop: number;
}

/** 在桌面/Web 端挂载原生表格增强与用户长气泡防溢出（内置中英双语自适应）；移动端为安全 no-op */
export function mountNativeTableTools(i18nSource?: LocaleSourceLike): () => void {
  if (Platform.OS !== "web" || !document || !window) {
    return () => {};
  }

  const doc = document;
  const win = window;
  const head = doc.head;
  const body = doc.body;
  if (!head || !body) {
    return () => {};
  }

  const getMsg = (): UiMessages =>
    getUiMessages(
      i18nSource?.locale || doc.documentElement?.getAttribute("lang") || navigator?.language,
    );

  const syncHostThemeAttr = () => {
    body.setAttribute("data-ntt-host-theme", detectTheme());
  };
  syncHostThemeAttr();

  // 注入并始终更新最新样式
  let styleEl = doc.getElementById(STYLE_ID);
  if (!styleEl) {
    styleEl = doc.createElement("style");
    styleEl.id = STYLE_ID;
    head.appendChild(styleEl);
  }
  styleEl.textContent = CSS_TEXT;

  // 创建悬浮工具条
  const toolbar = doc.createElement("div");
  toolbar.id = TOOLBAR_ID;
  toolbar.setAttribute("data-paseo-markdown-ignore", "true");

  const btnCopyMd = doc.createElement("button");
  btnCopyMd.setAttribute("type", "button");

  const btnCopyTsv = doc.createElement("button");
  btnCopyTsv.setAttribute("type", "button");

  const btnPopupWin = doc.createElement("button");
  btnPopupWin.setAttribute("type", "button");

  const btnTransposeWin = doc.createElement("button");
  btnTransposeWin.setAttribute("type", "button");

  const btnToggleExpand = doc.createElement("button");
  btnToggleExpand.setAttribute("type", "button");

  const btnToggleHeight = doc.createElement("button");
  btnToggleHeight.setAttribute("type", "button");
  btnToggleHeight.style.display = "none";

  const btnResetWidth = doc.createElement("button");
  btnResetWidth.setAttribute("type", "button");
  btnResetWidth.style.display = "none";

  const btnResetSort = doc.createElement("button");
  btnResetSort.setAttribute("type", "button");
  btnResetSort.style.display = "none";

  toolbar.appendChild(btnCopyMd);
  toolbar.appendChild(btnCopyTsv);
  toolbar.appendChild(btnPopupWin);
  toolbar.appendChild(btnTransposeWin);
  toolbar.appendChild(btnToggleExpand);
  toolbar.appendChild(btnToggleHeight);
  toolbar.appendChild(btnResetWidth);
  toolbar.appendChild(btnResetSort);
  body.appendChild(toolbar);

  // 创建非模态、可拖拽位置、右下角可缩放的转置悬浮窗
  const floatWin = doc.createElement("div");
  floatWin.id = FLOAT_WIN_ID;
  floatWin.setAttribute("data-paseo-markdown-ignore", "true");

  const winHeader = doc.createElement("div");
  winHeader.setAttribute("class", "ntt-win-header");

  const winTitle = doc.createElement("div");
  winTitle.setAttribute("class", "ntt-win-title");

  const winActions = doc.createElement("div");
  winActions.setAttribute("class", "ntt-win-actions");

  const btnWinFlip = doc.createElement("button");
  btnWinFlip.setAttribute("type", "button");

  const btnWinCopyMd = doc.createElement("button");
  btnWinCopyMd.setAttribute("type", "button");

  const btnWinCopyTsv = doc.createElement("button");
  btnWinCopyTsv.setAttribute("type", "button");

  const btnWinResetPos = doc.createElement("button");
  btnWinResetPos.setAttribute("type", "button");

  const btnWinClose = doc.createElement("button");
  btnWinClose.setAttribute("type", "button");

  winActions.appendChild(btnWinFlip);
  winActions.appendChild(btnWinCopyMd);
  winActions.appendChild(btnWinCopyTsv);
  winActions.appendChild(btnWinResetPos);
  winActions.appendChild(btnWinClose);

  winHeader.appendChild(winTitle);
  winHeader.appendChild(winActions);

  const winBody = doc.createElement("div");
  winBody.setAttribute("class", "ntt-win-body");

  floatWin.appendChild(winHeader);
  floatWin.appendChild(winBody);
  body.appendChild(floatWin);

  // 创建轻量 Toast
  const toast = doc.createElement("div");
  toast.id = TOAST_ID;
  toast.setAttribute("data-paseo-markdown-ignore", "true");
  body.appendChild(toast);

  let activeTable: ElementLike | null = null;
  let hoveredResizeTh: ElementLike | null = null;
  let activeResize: ActiveResize | null = null;
  let activeWinDrag: ActiveWinDrag | null = null;
  let hasCustomWinGeometry = false;
  let suppressClickUntil = 0;
  let hideTimer: number | null = null;
  let toastTimer: number | null = null;
  let scanTimer: number | null = null;

  let winSourceData: TableData | null = null;
  let winTransposed = true;
  let winTableEl: ElementLike | null = null;

  const showToast = (message: string) => {
    const theme = detectTheme();
    syncHostThemeAttr();
    toast.setAttribute("data-ntt-theme", theme);
    toast.textContent = message;
    toast.style.display = "block";
    if (toastTimer !== null) win.clearTimeout(toastTimer);
    toastTimer = win.setTimeout(() => {
      toast.style.display = "none";
      toastTimer = null;
    }, 1500);
  };

  const clearResizeHover = () => {
    if (hoveredResizeTh) {
      hoveredResizeTh.removeAttribute("data-ntt-resize-edge");
      hoveredResizeTh = null;
    }
  };

  const clampWinIntoViewport = () => {
    if (floatWin.style.display === "none") return;
    const rect = floatWin.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const maxLeft = Math.max(8, win.innerWidth - 120);
    const minLeft = Math.min(8, -(rect.width - 120));
    const maxTop = Math.max(8, win.innerHeight - 56);
    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, Math.round(rect.left)));
    const clampedTop = Math.max(8, Math.min(maxTop, Math.round(rect.top)));
    floatWin.style.left = `${clampedLeft}px`;
    floatWin.style.top = `${clampedTop}px`;
  };

  const resetFloatWinGeometry = () => {
    const defaultWidth = Math.min(Math.round(win.innerWidth * 0.78), 1080);
    const defaultHeight = Math.min(Math.round(win.innerHeight * 0.72), 680);
    const left = Math.max(12, Math.round((win.innerWidth - defaultWidth) / 2));
    const top = Math.max(12, Math.round((win.innerHeight - defaultHeight) / 2));
    floatWin.style.width = `${defaultWidth}px`;
    floatWin.style.height = `${defaultHeight}px`;
    floatWin.style.left = `${left}px`;
    floatWin.style.top = `${top}px`;
    hasCustomWinGeometry = false;
  };

  const updateFloatWinTexts = () => {
    const msg = getMsg();
    if (!winSourceData) {
      winTitle.textContent = msg.winDefaultTitle;
      btnWinFlip.textContent = msg.winFlipToOriginal;
      return;
    }
    const viewData = winTransposed ? transposeTableData(winSourceData) : winSourceData;
    winTitle.textContent = winTransposed
      ? msg.winTitleTransposed(viewData.rows.length, Math.max(0, viewData.headers.length - 1))
      : msg.winTitleNormal(viewData.rows.length, viewData.headers.length);
    btnWinFlip.textContent = winTransposed ? msg.winFlipToOriginal : msg.winFlipToTransposed;
  };

  const renderFloatWinTable = () => {
    if (!winSourceData) return;
    if (winTableEl) {
      winTableEl.remove();
      winTableEl = null;
    }
    const msg = getMsg();
    const viewData = winTransposed ? transposeTableData(winSourceData) : winSourceData;
    updateFloatWinTexts();
    winTableEl = buildHtmlTable(doc, viewData, msg.headerHint);
    winBody.appendChild(winTableEl);
  };

  const openFloatWin = (table: ElementLike, initialTransposed: boolean) => {
    winSourceData = extractTableData(table);
    winTransposed = initialTransposed;
    const theme = detectTheme();
    syncHostThemeAttr();
    floatWin.setAttribute("data-ntt-theme", theme);
    renderFloatWinTable();
    toolbar.style.display = "none";
    floatWin.style.display = "flex";
    if (!hasCustomWinGeometry) {
      resetFloatWinGeometry();
    } else {
      clampWinIntoViewport();
    }
  };

  const closeFloatWin = () => {
    floatWin.style.display = "none";
    if (winTableEl) {
      winTableEl.remove();
      winTableEl = null;
    }
    winSourceData = null;
  };

  const syncLanguageUi = () => {
    const msg = getMsg();
    btnCopyMd.textContent = msg.copyMd;
    btnCopyTsv.textContent = msg.copyTable;
    btnPopupWin.textContent = msg.popupView;
    btnTransposeWin.textContent = msg.transposeView;
    btnResetWidth.textContent = msg.resetWidth;
    btnResetSort.textContent = msg.resetSort;

    winHeader.setAttribute("title", msg.winDragHint);
    btnWinCopyMd.textContent = msg.copyMd;
    btnWinCopyTsv.textContent = msg.copyTable;
    btnWinResetPos.textContent = msg.winResetPos;
    btnWinClose.textContent = msg.winClose;
    updateFloatWinTexts();

    for (const th of toArray(doc.querySelectorAll('th[data-ntt-auto-title="true"]'))) {
      th.setAttribute("title", msg.headerHint);
    }
  };

  const positionToolbar = (table: ElementLike) => {
    if (table.closest(`#${FLOAT_WIN_ID}`)) {
      toolbar.style.display = "none";
      return;
    }
    const visibleRect = findScrollContainerRect(table);
    if (visibleRect.width < 60 || visibleRect.bottom < 0 || visibleRect.top > win.innerHeight) {
      toolbar.style.display = "none";
      return;
    }

    const msg = getMsg();
    const theme = detectTheme();
    syncHostThemeAttr();

    const isExpanded = table.getAttribute("data-ntt-expanded") === "true";
    const isResized = table.getAttribute("data-ntt-resized") === "true";
    const isSorted = table.getAttribute("data-ntt-sorted") === "true";
    const wrap = findDedicatedTableWrapper(table);
    const isFullHeight = wrap?.getAttribute("data-ntt-full-height") === "true";
    const isHeightCapped = Boolean(
      wrap && (isFullHeight || wrap.scrollHeight > wrap.clientHeight + 6),
    );

    toolbar.setAttribute("data-ntt-theme", theme);
    btnCopyMd.textContent = msg.copyMd;
    btnCopyTsv.textContent = msg.copyTable;
    btnPopupWin.textContent = msg.popupView;
    btnTransposeWin.textContent = msg.transposeView;
    btnResetWidth.textContent = msg.resetWidth;
    btnResetSort.textContent = msg.resetSort;
    btnToggleExpand.textContent = isExpanded ? msg.compactWidth : msg.expandWidth;
    btnToggleHeight.style.display = isHeightCapped ? "inline-block" : "none";
    btnToggleHeight.textContent = isFullHeight ? msg.limitHeight : msg.expandHeight;
    btnResetWidth.style.display = isResized ? "inline-block" : "none";
    btnResetSort.style.display = isSorted ? "inline-block" : "none";
    toolbar.style.display = "flex";

    const barRect = toolbar.getBoundingClientRect();
    const top = Math.max(8, Math.min(win.innerHeight - barRect.height - 8, visibleRect.top - barRect.height - 4));
    const left = Math.max(8, Math.min(win.innerWidth - barRect.width - 8, visibleRect.right - barRect.width));
    toolbar.style.top = `${Math.round(top)}px`;
    toolbar.style.left = `${Math.round(left)}px`;
  };

  const cancelHide = () => {
    if (hideTimer !== null) {
      win.clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const scheduleHide = () => {
    if (activeResize) return;
    cancelHide();
    hideTimer = win.setTimeout(() => {
      toolbar.style.display = "none";
      activeTable = null;
      hideTimer = null;
    }, 180);
  };

  const scanAllTables = () => {
    syncHostThemeAttr();
    const headerHint = getMsg().headerHint;
    const tables = toArray(doc.querySelectorAll("table"));
    for (const table of tables) {
      enhanceTable(table, headerHint);
    }
  };

  const scheduleScan = () => {
    if (scanTimer !== null) return;
    scanTimer = win.setTimeout(() => {
      scanTimer = null;
      scanAllTables();
    }, 120);
  };

  // 工具条按钮事件
  const handleCopyMd = () => {
    if (!activeTable) return;
    const msg = getMsg();
    const { headers, rows } = extractTableData(activeTable);
    const md = tableDataToMarkdown(headers, rows);
    void copyText(md).then((ok) => {
      showToast(ok ? msg.toastCopiedMd(rows.length) : msg.toastCopyFailed);
    });
  };

  const handleCopyTsv = () => {
    if (!activeTable) return;
    const msg = getMsg();
    const { headers, rows } = extractTableData(activeTable);
    const tsv = tableDataToTsv(headers, rows);
    void copyText(tsv).then((ok) => {
      showToast(ok ? msg.toastCopiedTsv : msg.toastCopyFailed);
    });
  };

  const handleOpenPopup = () => {
    if (!activeTable) return;
    openFloatWin(activeTable, false);
  };

  const handleOpenTranspose = () => {
    if (!activeTable) return;
    openFloatWin(activeTable, true);
  };

  const handleToggleExpand = () => {
    if (!activeTable) return;
    const msg = getMsg();
    const expanded = toggleExpandedWidth(activeTable);
    positionToolbar(activeTable);
    showToast(expanded ? msg.toastExpandedWidth : msg.toastRestoredWidth);
  };

  const handleToggleHeight = () => {
    if (!activeTable) return;
    const msg = getMsg();
    const full = toggleTableFullHeight(activeTable);
    positionToolbar(activeTable);
    showToast(full ? msg.toastExpandedHeight : msg.toastLimitedHeight);
  };

  const handleResetWidth = () => {
    if (!activeTable) return;
    if (resetTableWidths(activeTable)) {
      positionToolbar(activeTable);
      showToast(getMsg().toastResetWidth);
    }
  };

  const handleResetSort = () => {
    if (!activeTable) return;
    if (resetTableSort(activeTable)) {
      positionToolbar(activeTable);
      showToast(getMsg().toastResetSort);
    }
  };

  // 转置悬浮窗按钮与拖拽事件
  const handleWinHeaderMouseDown = (event: EventLike) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (typeof event.clientX !== "number" || typeof event.clientY !== "number") return;
    if (event.target?.closest(".ntt-win-actions")) return;

    event.preventDefault();
    const rect = floatWin.getBoundingClientRect();
    activeWinDrag = {
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };
    hasCustomWinGeometry = true;
    body.setAttribute("data-ntt-dragging-win", "true");
  };

  const handleWinFlip = () => {
    winTransposed = !winTransposed;
    renderFloatWinTable();
  };

  const handleWinCopyMd = () => {
    if (!winTableEl) return;
    const msg = getMsg();
    const { headers, rows } = extractTableData(winTableEl);
    void copyText(tableDataToMarkdown(headers, rows)).then((ok) => {
      showToast(ok ? msg.toastWinCopiedMd : msg.toastCopyFailed);
    });
  };

  const handleWinCopyTsv = () => {
    if (!winTableEl) return;
    const msg = getMsg();
    const { headers, rows } = extractTableData(winTableEl);
    void copyText(tableDataToTsv(headers, rows)).then((ok) => {
      showToast(ok ? msg.toastWinCopiedTsv : msg.toastCopyFailed);
    });
  };

  const handleWinResetPos = () => {
    resetFloatWinGeometry();
    showToast(getMsg().toastWinResetPos);
  };

  const handleKeyDown = (event: EventLike) => {
    if (event.key === "Escape" && floatWin.style.display === "flex") {
      closeFloatWin();
    }
  };

  btnCopyMd.addEventListener("click", handleCopyMd);
  btnCopyTsv.addEventListener("click", handleCopyTsv);
  btnPopupWin.addEventListener("click", handleOpenPopup);
  btnTransposeWin.addEventListener("click", handleOpenTranspose);
  btnToggleExpand.addEventListener("click", handleToggleExpand);
  btnToggleHeight.addEventListener("click", handleToggleHeight);
  btnResetWidth.addEventListener("click", handleResetWidth);
  btnResetSort.addEventListener("click", handleResetSort);
  toolbar.addEventListener("mouseenter", cancelHide);
  toolbar.addEventListener("mouseleave", scheduleHide);

  winHeader.addEventListener("mousedown", handleWinHeaderMouseDown);
  btnWinFlip.addEventListener("click", handleWinFlip);
  btnWinCopyMd.addEventListener("click", handleWinCopyMd);
  btnWinCopyTsv.addEventListener("click", handleWinCopyTsv);
  btnWinResetPos.addEventListener("click", handleWinResetPos);
  btnWinClose.addEventListener("click", closeFloatWin);

  // 文档级事件委托
  const handleMouseOver = (event: EventLike) => {
    if (activeResize || activeWinDrag) return;
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;
    if (target.closest(`#${TOOLBAR_ID}`)) {
      cancelHide();
      return;
    }
    const table = target.closest('table[data-ntt-enhanced="true"]');
    if (table && !table.closest(`#${FLOAT_WIN_ID}`)) {
      cancelHide();
      activeTable = table;
      positionToolbar(table);
    } else if (activeTable) {
      scheduleHide();
    }
  };

  const handleMouseMove = (event: EventLike) => {
    // 1. 正在拖动转置悬浮窗
    if (activeWinDrag) {
      if (typeof event.clientX !== "number" || typeof event.clientY !== "number") return;
      const dx = event.clientX - activeWinDrag.startMouseX;
      const dy = event.clientY - activeWinDrag.startMouseY;
      const rect = floatWin.getBoundingClientRect();
      const maxLeft = Math.max(8, win.innerWidth - 120);
      const minLeft = Math.min(8, -(rect.width - 120));
      const maxTop = Math.max(8, win.innerHeight - 48);
      const nextLeft = Math.max(minLeft, Math.min(maxLeft, Math.round(activeWinDrag.startLeft + dx)));
      const nextTop = Math.max(8, Math.min(maxTop, Math.round(activeWinDrag.startTop + dy)));
      floatWin.style.left = `${nextLeft}px`;
      floatWin.style.top = `${nextTop}px`;
      return;
    }

    // 2. 正在拖拽列宽
    if (activeResize) {
      if (typeof event.clientX !== "number") return;
      const delta = event.clientX - activeResize.startX;
      const nextColWidth = Math.max(MIN_COL_WIDTH_PX, Math.round(activeResize.startColWidth + delta));
      const actualDelta = nextColWidth - activeResize.startColWidth;
      const nextTableWidth = Math.max(120, Math.round(activeResize.startTableWidth + actualDelta));

      activeResize.th.style.width = `${nextColWidth}px`;
      activeResize.th.style.minWidth = `${nextColWidth}px`;
      activeResize.table.style.width = `${nextTableWidth}px`;
      activeResize.table.style.minWidth = `${nextTableWidth}px`;
      if (!activeResize.table.closest(`#${FLOAT_WIN_ID}`)) {
        positionToolbar(activeResize.table);
      }
      return;
    }

    // 3. 悬停表头右边缘提示
    const target = event.target;
    if (!target || typeof target.closest !== "function") {
      clearResizeHover();
      return;
    }
    const th = target.closest('table[data-ntt-enhanced="true"] th[data-ntt-sortable="true"]');
    if (th && isNearRightEdge(th, event.clientX)) {
      if (hoveredResizeTh !== th) {
        clearResizeHover();
        hoveredResizeTh = th;
        th.setAttribute("data-ntt-resize-edge", "true");
      }
    } else {
      clearResizeHover();
    }
  };

  const handleMouseDown = (event: EventLike) => {
    if (event.button !== undefined && event.button !== 0) return;
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;

    // 若用户在拖动悬浮窗右下角原生缩放手柄，标记为已自定义尺寸
    if (target === floatWin) {
      hasCustomWinGeometry = true;
    }

    const th = target.closest('table[data-ntt-enhanced="true"] th[data-ntt-sortable="true"]');
    if (!th || !isNearRightEdge(th, event.clientX) || typeof event.clientX !== "number") return;

    const table = th.closest('table[data-ntt-enhanced="true"]');
    if (!table) return;

    event.preventDefault();
    event.stopPropagation();

    const headers = getHeaderCells(table);
    const colWidths = headers.map((header) => Math.max(MIN_COL_WIDTH_PX, Math.round(header.getBoundingClientRect().width)));
    const totalWidth = Math.max(
      Math.round(table.getBoundingClientRect().width),
      colWidths.reduce((sum, w) => sum + w, 0),
    );

    table.removeAttribute("data-ntt-expanded");
    table.setAttribute("data-ntt-resized", "true");
    headers.forEach((header, idx) => {
      header.style.width = `${colWidths[idx]}px`;
      header.style.minWidth = `${colWidths[idx]}px`;
    });
    table.style.width = `${totalWidth}px`;
    table.style.minWidth = `${totalWidth}px`;

    const colIdx = Number(th.getAttribute("data-ntt-col-idx") ?? "0");
    activeResize = {
      table,
      th,
      startX: event.clientX,
      startColWidth: colWidths[colIdx] ?? Math.round(th.getBoundingClientRect().width),
      startTableWidth: totalWidth,
    };
    if (!table.closest(`#${FLOAT_WIN_ID}`)) {
      activeTable = table;
    }
    body.setAttribute("data-ntt-resizing", "true");
  };

  const handleMouseUp = () => {
    if (activeWinDrag) {
      activeWinDrag = null;
      body.removeAttribute("data-ntt-dragging-win");
    }
    if (!activeResize) return;
    const finished = activeResize;
    activeResize = null;
    body.removeAttribute("data-ntt-resizing");
    suppressClickUntil = Date.now() + 260;
    if (!finished.table.closest(`#${FLOAT_WIN_ID}`)) {
      positionToolbar(finished.table);
    }
  };

  const handleClick = (event: EventLike) => {
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;
    if (target.closest(`#${TOOLBAR_ID}`)) return;

    const table = target.closest('table[data-ntt-enhanced="true"]');
    if (!table) return;

    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.altKey) {
      const cell = target.closest("td, th");
      if (!cell) return;
      const text = normalizeCellText(cell.textContent ?? "");
      if (!text) return;
      event.preventDefault();
      event.stopPropagation();
      void copyText(text).then((ok) => {
        if (ok) showToast(getMsg().toastCopiedCell(text));
      });
      return;
    }

    if (target.closest("a")) return;
    const selectedText = win.getSelection?.()?.toString().trim() ?? "";
    if (selectedText.length > 0) return;

    const th = target.closest('th[data-ntt-sortable="true"]');
    if (!th) return;
    if (isNearRightEdge(th, event.clientX)) return;

    const colIdxAttr = th.getAttribute("data-ntt-col-idx");
    if (colIdxAttr === null) return;
    const colIdx = Number(colIdxAttr);
    if (!Number.isFinite(colIdx)) return;

    const direction = sortTableByColumn(table, colIdx);
    if (!table.closest(`#${FLOAT_WIN_ID}`)) {
      activeTable = table;
      positionToolbar(table);
    }
    const msg = getMsg();
    const label = normalizeCellText(th.textContent ?? "");
    const dirText =
      direction === "asc" ? msg.sortAsc : direction === "desc" ? msg.sortDesc : msg.sortReset;
    showToast(msg.toastSortedColumn(label, dirText));
  };

  const handleDblClick = (event: EventLike) => {
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;
    const table = target.closest('table[data-ntt-enhanced="true"]');
    if (!table) return;

    const th = target.closest('th[data-ntt-sortable="true"]');
    if (th && isNearRightEdge(th, event.clientX)) {
      if (resetTableWidths(table)) {
        if (!table.closest(`#${FLOAT_WIN_ID}`)) {
          positionToolbar(table);
        }
        showToast(getMsg().toastResetWidth);
      }
      return;
    }

    const td = target.closest("td");
    if (!td) return;
    const text = normalizeCellText(td.textContent ?? "");
    if (!text) return;
    void copyText(text).then((ok) => {
      if (ok) showToast(getMsg().toastCopiedCell(text));
    });
  };

  const handleViewportChange = () => {
    if (activeTable && toolbar.style.display !== "none") {
      positionToolbar(activeTable);
    }
    clampWinIntoViewport();
  };

  syncLanguageUi();
  const unsubscribeI18n = i18nSource?.subscribe?.(() => {
    syncLanguageUi();
    if (activeTable && toolbar.style.display !== "none") {
      positionToolbar(activeTable);
    }
  });

  doc.addEventListener("mouseover", handleMouseOver, true);
  doc.addEventListener("mousemove", handleMouseMove, true);
  doc.addEventListener("mousedown", handleMouseDown, true);
  doc.addEventListener("mouseup", handleMouseUp, true);
  doc.addEventListener("click", handleClick, true);
  doc.addEventListener("dblclick", handleDblClick, true);
  doc.addEventListener("keydown", handleKeyDown, true);
  win.addEventListener("scroll", handleViewportChange, true);
  win.addEventListener("resize", handleViewportChange, false);

  scanAllTables();

  let observer: MutationObserverLike | null = null;
  if (typeof MutationObserver === "function") {
    observer = new MutationObserver(() => {
      scheduleScan();
    });
    observer.observe(body, { childList: true, subtree: true });
  }

  return () => {
    unsubscribeI18n?.();
    observer?.disconnect();
    if (hideTimer !== null) win.clearTimeout(hideTimer);
    if (toastTimer !== null) win.clearTimeout(toastTimer);
    if (scanTimer !== null) win.clearTimeout(scanTimer);

    body.removeAttribute("data-ntt-resizing");
    body.removeAttribute("data-ntt-dragging-win");
    body.removeAttribute("data-ntt-host-theme");
    clearResizeHover();

    doc.removeEventListener("mouseover", handleMouseOver, true);
    doc.removeEventListener("mousemove", handleMouseMove, true);
    doc.removeEventListener("mousedown", handleMouseDown, true);
    doc.removeEventListener("mouseup", handleMouseUp, true);
    doc.removeEventListener("click", handleClick, true);
    doc.removeEventListener("dblclick", handleDblClick, true);
    doc.removeEventListener("keydown", handleKeyDown, true);
    win.removeEventListener("scroll", handleViewportChange, true);
    win.removeEventListener("resize", handleViewportChange, false);

    btnCopyMd.removeEventListener("click", handleCopyMd);
    btnCopyTsv.removeEventListener("click", handleCopyTsv);
    btnPopupWin.removeEventListener("click", handleOpenPopup);
    btnTransposeWin.removeEventListener("click", handleOpenTranspose);
    btnToggleExpand.removeEventListener("click", handleToggleExpand);
    btnToggleHeight.removeEventListener("click", handleToggleHeight);
    btnResetWidth.removeEventListener("click", handleResetWidth);
    btnResetSort.removeEventListener("click", handleResetSort);
    toolbar.removeEventListener("mouseenter", cancelHide);
    toolbar.removeEventListener("mouseleave", scheduleHide);

    winHeader.removeEventListener("mousedown", handleWinHeaderMouseDown);
    btnWinFlip.removeEventListener("click", handleWinFlip);
    btnWinCopyMd.removeEventListener("click", handleWinCopyMd);
    btnWinCopyTsv.removeEventListener("click", handleWinCopyTsv);
    btnWinResetPos.removeEventListener("click", handleWinResetPos);
    btnWinClose.removeEventListener("click", closeFloatWin);

    const tables = toArray(doc.querySelectorAll('table[data-ntt-enhanced="true"]'));
    for (const table of tables) {
      resetTableSort(table);
      resetTableWidths(table);
      const wrap = findDedicatedTableWrapper(table);
      if (wrap) {
        wrap.removeAttribute("data-ntt-scroll-wrap");
        wrap.removeAttribute("data-ntt-full-height");
      }
      table.removeAttribute("data-ntt-enhanced");
      table.removeAttribute("data-ntt-sorted");
      for (const th of toArray(table.querySelectorAll("th[data-ntt-sortable]"))) {
        if (th.getAttribute("data-ntt-auto-title") === "true") {
          th.removeAttribute("title");
          th.removeAttribute("data-ntt-auto-title");
        }
        th.removeAttribute("data-ntt-sortable");
        th.removeAttribute("data-ntt-col-idx");
        th.removeAttribute("data-ntt-sort");
        th.removeAttribute("data-ntt-resize-edge");
      }
      for (const tr of toArray(table.querySelectorAll("tr[data-ntt-orig-idx]"))) {
        tr.removeAttribute("data-ntt-orig-idx");
      }
    }

    toolbar.remove();
    floatWin.remove();
    toast.remove();
    styleEl?.remove();
  };
}
