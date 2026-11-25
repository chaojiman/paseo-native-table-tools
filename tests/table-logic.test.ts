import assert from "node:assert/strict";
import test from "node:test";
import { getUiMessages, resolveUiLocale } from "../client/i18n.ts";
import {
  compareCellValues,
  nextSortDirection,
  parseSortableValue,
  tableDataToMarkdown,
  tableDataToTsv,
  transposeTableData,
} from "../client/table-logic.ts";

test("三态排序顺序循环正确", () => {
  assert.equal(nextSortDirection("none"), "asc");
  assert.equal(nextSortDirection("asc"), "desc");
  assert.equal(nextSortDirection("desc"), "none");
});

test("智能单位解析：时间单位 ms 与 s 自动统一换算", () => {
  const a = parseSortableValue("35.0 ms");
  const b = parseSortableValue("0.180 s");
  const c = parseSortableValue("1.50 s");
  assert.equal(a.kind, "numeric");
  assert.equal(b.kind, "numeric");
  assert.equal(c.kind, "numeric");
  assert.ok(compareCellValues("35.0 ms", "0.180 s", "asc") < 0);
  assert.ok(compareCellValues("0.180 s", "1.50 s", "asc") < 0);
  assert.ok(compareCellValues("35.0 ms", "0.180 s", "desc") > 0);
});

test("智能单位解析：带宽 Mbps / 范围值 / 括号注释正确比较", () => {
  const values = [
    "60.5 Mbps (2.8s)",
    "240.0 Mbps (0.7s)",
    "48.2 Mbps (3.4s)",
    "110.4 Mbps (1.5s)",
  ];
  const sortedDesc = [...values].sort((x, y) => compareCellValues(x, y, "desc"));
  assert.deepEqual(sortedDesc, [
    "240.0 Mbps (0.7s)",
    "110.4 Mbps (1.5s)",
    "60.5 Mbps (2.8s)",
    "48.2 Mbps (3.4s)",
  ]);

  const latencies = ["90 ms（偶抖 250ms）", "42.0 ~ 48.0 ms", "36.5 ms", "70.0 ~ 80.0 ms"];
  const sortedAsc = [...latencies].sort((x, y) => compareCellValues(x, y, "asc"));
  assert.deepEqual(sortedAsc, [
    "36.5 ms",
    "42.0 ~ 48.0 ms",
    "70.0 ~ 80.0 ms",
    "90 ms（偶抖 250ms）",
  ]);
});

test("空值与占位符无论升降序始终沉底", () => {
  const vals = ["—", "80.0 Mbps", "", "55.0 Mbps", "N/A"];
  const asc = [...vals].sort((a, b) => compareCellValues(a, b, "asc"));
  const desc = [...vals].sort((a, b) => compareCellValues(a, b, "desc"));
  assert.equal(asc[0], "55.0 Mbps");
  assert.equal(asc[1], "80.0 Mbps");
  assert.equal(desc[0], "80.0 Mbps");
  assert.equal(desc[1], "55.0 Mbps");
});

test("IP 地址与版本号不被误判为单数值", () => {
  assert.equal(parseSortableValue("203.0.113.10").kind, "text");
  assert.equal(parseSortableValue("2001:db8:85a3::8a2e:370:7334").kind, "text");
  assert.equal(parseSortableValue("v0.17.4").kind, "text");
});

test("行列转置：少对象多维度横表转为清爽竖表且二次转置无损还原", () => {
  const wide = {
    headers: ["节点", "吞吐", "状态", "区域"],
    rows: [
      ["edge-01", "160.0 Mbps", "正常", "ap-east"],
      ["edge-02", "110.0 Mbps", "正常", "ap-northeast"],
      ["edge-03", "240.0 Mbps", "受限", "ap-south"],
    ],
  };

  const vertical = transposeTableData(wide);
  assert.deepEqual(vertical, {
    headers: ["节点", "edge-01", "edge-02", "edge-03"],
    rows: [
      ["吞吐", "160.0 Mbps", "110.0 Mbps", "240.0 Mbps"],
      ["状态", "正常", "正常", "受限"],
      ["区域", "ap-east", "ap-northeast", "ap-south"],
    ],
  });

  assert.deepEqual(transposeTableData(vertical), wide);
});

test("Markdown 与 TSV 表格序列化（含换行清理与重复反斜杠管道符归一化）", () => {
  const headers = ["服务", "吞吐", "说明"];
  const rows = [
    ["api-a", "240.0 Mbps", "主线路 \\\\| 推荐\n低延迟"],
    ["api-b", "110.0 Mbps", "备线路 | 双栈"],
  ];

  const md = tableDataToMarkdown(headers, rows);
  assert.equal(
    md,
    [
      "| 服务 | 吞吐 | 说明 |",
      "| --- | --- | --- |",
      "| api-a | 240.0 Mbps | 主线路 \\| 推荐 低延迟 |",
      "| api-b | 110.0 Mbps | 备线路 \\| 双栈 |",
    ].join("\n"),
  );

  const tsv = tableDataToTsv(headers, rows);
  assert.equal(
    tsv,
    [
      "服务\t吞吐\t说明",
      "api-a\t240.0 Mbps\t主线路 \\\\| 推荐 低延迟",
      "api-b\t110.0 Mbps\t备线路 | 双栈",
    ].join("\n"),
  );
});

test("中英双语 locale 解析与文案字典完整性", () => {
  assert.equal(resolveUiLocale("zh-CN"), "zh-CN");
  assert.equal(resolveUiLocale("zh-Hans"), "zh-CN");
  assert.equal(resolveUiLocale("zh-TW"), "zh-CN");
  assert.equal(resolveUiLocale("en"), "en");
  assert.equal(resolveUiLocale("en-US"), "en");
  assert.equal(resolveUiLocale(""), "en");
  assert.equal(resolveUiLocale(undefined), "en");

  const zh = getUiMessages("zh-CN");
  const en = getUiMessages("en-US");
  assert.equal(zh.copyMd, "复制 MD");
  assert.equal(en.copyMd, "Copy MD");
  assert.equal(zh.winTitleNormal(6, 3), "⠿ 表格独立窗（6 行 × 3 列）");
  assert.equal(en.winTitleNormal(6, 3), "⠿ Table window (6 rows × 3 cols)");
});
