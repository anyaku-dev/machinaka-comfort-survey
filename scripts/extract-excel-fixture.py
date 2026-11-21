"""国交省 分析ツール（記入例）から、算定ロジック照合用のフィクスチャを抽出する。

使い方:
  curl -L -o /tmp/001740897.xlsx https://www.mlit.go.jp/toshi/content/001740897.xlsx
  python3 -m pip install openpyxl
  python3 scripts/extract-excel-fixture.py /tmp/001740897.xlsx tests/fixtures/mlit-example-v1.1.json

抽出するのは記入例の数値（架空データ）と、Excel が保存時に計算したキャッシュ値のみ。
"""
import json
import sys

import openpyxl


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def main(src, dst):
    wb_f = openpyxl.load_workbook(src)  # formulas
    wb_v = openpyxl.load_workbook(src, data_only=True)  # cached values
    i1f = wb_f["入力①"]
    i1v = wb_v["入力①"]
    surveyor_cols = ["L", "M", "N", "O", "P", "Q"]

    # 調査者別の入力値（数式セルは除外。活動の種類1～20は数式なので含めない）
    surveyors = []
    for col in surveyor_cols:
        values = {}
        for r in range(61, 246):
            f = i1f[f"{col}{r}"].value
            if isinstance(f, str) and f.startswith("="):
                continue
            v = num(f)
            if v is not None:
                values[str(r)] = v
        surveyors.append({"column": col, "values": values})

    representative = {}
    for r in list(range(61, 74)) + list(range(75, 117)) + list(range(122, 246)):
        v = num(i1v[f"J{r}"].value)
        if v is not None:
            representative[str(r)] = v

    excel_average = {}
    for r in range(122, 246):
        v = num(i1v[f"K{r}"].value)
        if v is not None:
            excel_average[str(r)] = v

    activity_type_formulas = {}
    for r in range(146, 166):
        activity_type_formulas[str(r)] = {
            "label": i1f[f"G{r}"].value,
            "formulaL": i1f[f"L{r}"].value,
            "excelAverageJ": num(i1v[f"J{r}"].value),
        }

    i2 = wb_v["入力②"]
    keys = ["male", "female", "genderUnknown", "infant", "child", "teen", "adult", "elderly",
            "ageUnknown", "walkFast", "walkSlow", "japanese", "foreigner", "nationalityUnknown"]
    groups = []
    for r in range(10, 110):
        presence = i2[f"D{r}"].value
        gtype = i2[f"E{r}"].value
        if not presence:
            continue
        g = {"row": r, "presence": presence, "groupType": gtype}
        for k, col in zip(keys, "FGHIJKLMNOPQRS"):
            g[k] = num(i2[f"{col}{r}"].value) or 0
        groups.append(g)

    calc = wb_v["計算_集計"]
    cached = {}
    for a in ["C8", "D8", "E8", "F8", "F17", "F18", "F19", "F20", "AR8", "CH8", "CI8", "CJ8",
              "CK8", "CL8", "CW8", "CX8", "CY8"]:
        cached[a] = calc[a].value

    # 主観・活動の乖離（row 15）: 隣接する2列（主観・活動）の代表値差 >= 2 で「＊」
    def col_range(a, b):
        from openpyxl.utils import column_index_from_string, get_column_letter
        return [get_column_letter(i) for i in range(column_index_from_string(a), column_index_from_string(b) + 1)]

    gap = {}
    for start, end in [("DD", "EA"), ("FF", "GC"), ("GD", "HC"), ("HD", "HW")]:
        cols = col_range(start, end)
        for i in range(0, len(cols), 2):
            c1, c2 = cols[i], cols[i + 1]
            gap[c1] = {
                "subjective": num(calc[f"{c1}8"].value),
                "activity": num(calc[f"{c2}8"].value),
                "flag": calc[f"{c1}15"].value or "",
            }

    space_b_display = {}
    for col in col_range("HX", "JR"):
        v8 = calc[f"{col}8"].value
        space_b_display[col] = {"value": v8 if v8 != "" else None, "display": calc[f"{col}9"].value or ""}

    out = {
        "source": "https://www.mlit.go.jp/toshi/content/001740897.xlsx (分析ツール・記入例 ver.1.1)",
        "note": "Excel保存時のキャッシュ値。数値は記入例の架空データ。",
        "measureMinutes": {"pass": num(i2["F5"].value), "stay": num(i2["F6"].value)},
        "surveyors": surveyors,
        "representative": representative,
        "excelAverageK": excel_average,
        "activityTypeFormulas": activity_type_formulas,
        "observationGroups": groups,
        "cached": cached,
        "gapFlags": gap,
        "spaceBDisplay": space_b_display,
    }
    with open(dst, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
