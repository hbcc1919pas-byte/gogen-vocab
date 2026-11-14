"""単語データの検査スクリプト。

検査項目: 必須項目、型、id重複、root表記ゆれ、KJV出典の有無、root の意味(roots.json)、
          packs.json との語数一致、パックごとの4分野の比率。
使い方: python tools/check_words.py
終了コード: エラーがあれば 1、なければ 0（警告のみなら 0）。
import_inbox.py からも validate_words() を使う。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CATEGORIES = ["bible", "highschool", "exam", "daily"]
REQUIRED = ["id", "word", "pos", "ipa", "meaning", "etymology", "root", "synonyms",
            "antonyms", "related", "examples", "category", "level", "verified"]
ROOT_RE = re.compile(r"^[a-z]+(/[a-z]+)*$")


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def validate_words(words, label, seen_ids, errors, warns):
    """words を検査し、errors / warns に追記する。seen_ids（id→出所）も更新する。"""
    cats = {}
    for w in words:
        wid = w.get("id", "?")
        for k in REQUIRED:
            if k not in w:
                errors.append(f"{label} {wid}: 必須項目 {k} がありません")
        if wid in seen_ids:
            errors.append(f"{label} {wid}: id が重複しています（{seen_ids[wid]} と {label}）")
        seen_ids[wid] = label
        if not isinstance(w.get("meaning"), list) or not w.get("meaning"):
            errors.append(f"{label} {wid}: meaning は空でない配列にしてください")
        if not isinstance(w.get("level"), int) or w.get("level") not in (1, 2, 3):
            errors.append(f"{label} {wid}: level は 1〜3 の整数です")
        if not isinstance(w.get("verified"), bool):
            errors.append(f"{label} {wid}: verified は true/false です")
        ipa = w.get("ipa", "")
        if not (isinstance(ipa, str) and ipa.startswith("/") and ipa.endswith("/")):
            errors.append(f"{label} {wid}: ipa は /…/ の形式にしてください: {ipa}")
        for lst in ("synonyms", "antonyms", "related"):
            for x in w.get(lst, []) or []:
                if not (isinstance(x, dict) and x.get("w") and x.get("m")):
                    errors.append(f"{label} {wid}: {lst} は {{w, m}} の形にしてください")
                    break
        wcats = w.get("category", [])
        if not isinstance(wcats, list) or not wcats:
            errors.append(f"{label} {wid}: category は空でない配列にしてください")
            wcats = []
        for c in wcats:
            if c not in CATEGORIES:
                errors.append(f"{label} {wid}: 不明な category {c}")
            cats[c] = cats.get(c, 0) + 1
        r = w.get("root")
        if r is not None and not (isinstance(r, str) and ROOT_RE.match(r)):
            errors.append(f"{label} {wid}: root の表記が不正です（小文字とスラッシュのみ）: {r}")
        ex = w.get("examples", [])
        if not 2 <= len(ex) <= 3:
            errors.append(f"{label} {wid}: 例文は2〜3文にしてください（{len(ex)}文）")
        kjv_n = 0
        for e in ex:
            if not e.get("en") or not e.get("ja"):
                errors.append(f"{label} {wid}: 例文に en/ja がありません")
            if e.get("kjv"):
                kjv_n += 1
                if not e.get("ref"):
                    errors.append(f"{label} {wid}: KJV例文に出典 ref がありません")
        if "bible" in wcats and kjv_n == 0:
            errors.append(f"{label} {wid}: 聖書語にKJV例文がありません")
        if "bible" not in wcats and kjv_n:
            warns.append(f"{label} {wid}: 聖書語でないのにKJV例文があります")
    return cats


def root_variants(all_words, errors):
    """root の表記ゆれ（例: 'clud/clus' と 'clus/clud'）を検出する。"""
    groups = {}
    for w in all_words:
        r = w.get("root")
        if r:
            groups.setdefault("/".join(sorted(r.split("/"))), set()).add(r)
    for forms in groups.values():
        if len(forms) > 1:
            errors.append(f"root の表記ゆれ: {sorted(forms)}")


def main():
    errors, warns = [], []
    packs = load_json(DATA / "packs.json")["packs"]
    seen_ids = {}
    all_words = []
    for p in packs:
        path = DATA / p["file"]
        if not path.exists():
            errors.append(f"{p['id']}: ファイルがありません {path}")
            continue
        words = load_json(path)
        if len(words) != p.get("count"):
            errors.append(f"{p['id']}: packs.json の語数 {p.get('count')} と実際の語数 {len(words)} が違います")
        cats = validate_words(words, p["id"], seen_ids, errors, warns)
        if len(set(cats.get(c, 0) for c in CATEGORIES)) > 1:
            warns.append(f"{p['id']}: 4分野の語数が同数ではありません {cats}")
        all_words.extend(words)
        print(f"{p['id']}: {len(words)}語 分野別 {cats}")
    root_variants(all_words, errors)
    roots = {}
    for w in all_words:
        if w.get("root"):
            roots.setdefault(w["root"], []).append(w["id"])
    rpath = DATA / "roots.json"
    if rpath.exists():
        meanings = load_json(rpath)
        for r in roots:
            if r not in meanings or not meanings[r].get("m"):
                errors.append(f"roots.json に語根 {r} の意味がありません")
        for r in meanings:
            if r not in roots:
                warns.append(f"roots.json の語根 {r} はどの単語にも使われていません")
    else:
        errors.append("data/roots.json がありません")
    print(f"root の種類: {len(roots)}（2語以上でつながるもの: {sum(1 for v in roots.values() if len(v) > 1)}）")
    for m in warns:
        print("警告:", m)
    for m in errors:
        print("エラー:", m)
    print(f"結果: 全{len(all_words)}語 / エラー {len(errors)} / 警告 {len(warns)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
