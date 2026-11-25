export type UiLocale = "en" | "zh-CN";

export interface UiMessages {
  readonly copyMd: string;
  readonly copyTable: string;
  readonly popupView: string;
  readonly transposeView: string;
  readonly expandWidth: string;
  readonly compactWidth: string;
  readonly expandHeight: string;
  readonly limitHeight: string;
  readonly resetWidth: string;
  readonly resetSort: string;
  readonly winDragHint: string;
  readonly winDefaultTitle: string;
  readonly winFlipToOriginal: string;
  readonly winFlipToTransposed: string;
  readonly winResetPos: string;
  readonly winClose: string;
  readonly headerHint: string;
  readonly sortAsc: string;
  readonly sortDesc: string;
  readonly sortReset: string;
  readonly toastCopyFailed: string;
  readonly toastExpandedWidth: string;
  readonly toastRestoredWidth: string;
  readonly toastExpandedHeight: string;
  readonly toastLimitedHeight: string;
  readonly toastResetWidth: string;
  readonly toastResetSort: string;
  readonly toastWinCopiedMd: string;
  readonly toastWinCopiedTsv: string;
  readonly toastWinResetPos: string;
  readonly toastCopiedMd: (rowCount: number) => string;
  readonly toastCopiedTsv: string;
  readonly toastCopiedCell: (text: string) => string;
  readonly toastSortedColumn: (label: string, dirText: string) => string;
  readonly winTitleTransposed: (dims: number, items: number) => string;
  readonly winTitleNormal: (rows: number, cols: number) => string;
}

const ZH_CN_MESSAGES: UiMessages = {
  copyMd: "复制 MD",
  copyTable: "复制表格",
  popupView: "弹窗查看",
  transposeView: "转置查看",
  expandWidth: "宽屏展开",
  compactWidth: "恢复紧凑",
  expandHeight: "展开全高",
  limitHeight: "限制高度",
  resetWidth: "重置列宽",
  resetSort: "重置排序",
  winDragHint: "按住此处拖动窗口位置｜拖动窗口右下角调整大小",
  winDefaultTitle: "表格独立悬浮窗",
  winFlipToOriginal: "切回原方向",
  winFlipToTransposed: "行列转置",
  winResetPos: "居中复位",
  winClose: "× 关闭",
  headerHint: "单击排序（升序 / 降序 / 还原）｜拖动右边缘调列宽｜Alt+单击复制",
  sortAsc: "升序 ▲",
  sortDesc: "降序 ▼",
  sortReset: "已还原原序",
  toastCopyFailed: "复制失败",
  toastExpandedWidth: "已宽屏展开（支持横向滑动）",
  toastRestoredWidth: "已恢复默认表格宽度",
  toastExpandedHeight: "已展开表格全部高度",
  toastLimitedHeight: "已恢复最大高度限制（表头吸顶）",
  toastResetWidth: "已重置列宽",
  toastResetSort: "已恢复表格原始顺序",
  toastWinCopiedMd: "已复制悬浮窗当前视图 Markdown",
  toastWinCopiedTsv: "已复制悬浮窗当前视图表格（Excel / 飞书）",
  toastWinResetPos: "已恢复悬浮窗默认位置与尺寸",
  toastCopiedMd: (rowCount) => `已复制 Markdown 表格（${rowCount} 行）`,
  toastCopiedTsv: "已复制表格（可直接粘贴到 Excel / 飞书）",
  toastCopiedCell: (text) => `已复制：${text}`,
  toastSortedColumn: (label, dirText) => `${label}：${dirText}`,
  winTitleTransposed: (dims, items) => `⠿ 转置对比窗（${dims} 维度 × ${items} 对象）`,
  winTitleNormal: (rows, cols) => `⠿ 表格独立窗（${rows} 行 × ${cols} 列）`,
};

const EN_MESSAGES: UiMessages = {
  copyMd: "Copy MD",
  copyTable: "Copy TSV",
  popupView: "Pop out",
  transposeView: "Transpose",
  expandWidth: "Expand width",
  compactWidth: "Compact width",
  expandHeight: "Full height",
  limitHeight: "Cap height",
  resetWidth: "Reset widths",
  resetSort: "Reset sort",
  winDragHint: "Drag header to move | Drag bottom-right corner to resize",
  winDefaultTitle: "Floating table viewer",
  winFlipToOriginal: "Original view",
  winFlipToTransposed: "Transpose",
  winResetPos: "Recenter",
  winClose: "× Close",
  headerHint: "Click to sort (asc / desc / reset) | Drag right edge to resize | Alt+click to copy",
  sortAsc: "Ascending ▲",
  sortDesc: "Descending ▼",
  sortReset: "Original order",
  toastCopyFailed: "Copy failed",
  toastExpandedWidth: "Expanded table width (scroll horizontally)",
  toastRestoredWidth: "Restored compact table width",
  toastExpandedHeight: "Expanded full table height",
  toastLimitedHeight: "Restored max-height cap (sticky header)",
  toastResetWidth: "Reset column widths",
  toastResetSort: "Restored original row order",
  toastWinCopiedMd: "Copied current window view as Markdown",
  toastWinCopiedTsv: "Copied current window view as TSV (for spreadsheets)",
  toastWinResetPos: "Restored default window position and size",
  toastCopiedMd: (rowCount) => `Copied Markdown table (${rowCount} rows)`,
  toastCopiedTsv: "Copied table as TSV (paste into Excel / Sheets)",
  toastCopiedCell: (text) => `Copied: ${text}`,
  toastSortedColumn: (label, dirText) => `${label}: ${dirText}`,
  winTitleTransposed: (dims, items) => `⠿ Transposed view (${dims} fields × ${items} items)`,
  winTitleNormal: (rows, cols) => `⠿ Table window (${rows} rows × ${cols} cols)`,
};

/** 解析宿主语言标签，中文环境返回 zh-CN，其余默认返回 en */
export function resolveUiLocale(rawLocale?: string | null): UiLocale {
  const normalized = (rawLocale ?? "").trim().toLowerCase();
  if (normalized === "zh" || normalized.startsWith("zh-") || normalized.startsWith("zh_")) {
    return "zh-CN";
  }
  return "en";
}

/** 根据语言标签获取完整 UI 文案字典 */
export function getUiMessages(rawLocale?: string | null): UiMessages {
  return resolveUiLocale(rawLocale) === "zh-CN" ? ZH_CN_MESSAGES : EN_MESSAGES;
}
