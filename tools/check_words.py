"""単語データの検査スクリプト。

検査項目: 必須項目、型、id重複、root表記ゆれ、KJV出典の有無、packs.jsonとの語数一致。
使い方: python tools/check_words.py
終了コード: エラーがあれば 1、なければ 0（警告のみなら 0）。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CATEGORIES = {"bible", "highschool", "exam", "daily"}
REQUIRED = ["id", "word", "pos", "ipa", "meaning", "etymology", "root", "synonyms",
            "antonyms", "related", "examples", "category", "level", "verified"]
ROOT_RE = re.compile(r"^[a-z]+(/[a-z]+)*$")


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


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
        cats = {}
        for w in words:
            wid = w.get("id", "?")
            for k in REQUIRED:
                if k not in w:
                    errors.append(f"{wid}: 必須項目 {k} がありません")
            if wid in seen_ids:
                errors.append(f"{wid}: id が重複しています（{seen_ids[wid]} と {p['id']}）")
            seen_ids[wid] = p["id"]
            if not isinstance(w.get("meaning"), list) or not w.get("meaning"):
                errors.append(f"{wid}: meaning は空でない配列にしてください")
            if not isinstance(w.get("level"), int) or w.get("level") not in (1, 2, 3):
                errors.append(f"{wid}: level は 1〜3 の整数です")
            if not isinstance(w.get("verified"), bool):
                errors.append(f"{wid}: verified は true/false です")
            ipa = w.get("ipa", "")
            if not (ipa.startswith("/") and ipa.endswith("/")):
                errors.append(f"{wid}: ipa は /…/ の形式にしてください: {ipa}")
            for c in w.get("category", []):
                if c not in CATEGORIES:
                    errors.append(f"{wid}: 不明な category {c}")
                cats[c] = cats.get(c, 0) + 1
            if not w.get("category"):
                errors.append(f"{wid}: category が空です")
            r = w.get("root")
            if r is not None and not ROOT_RE.match(r):
                errors.append(f"{wid}: root の表記が不正です（小文字とスラッシュのみ）: {r}")
            ex = w.get("examples", [])
            if not 2 <= len(ex) <= 3:
                errors.append(f"{wid}: 例文は2〜3文にしてください（{len(ex)}文）")
            kjv_n = 0
            for e in ex:
                if not e.get("en") or not e.get("ja"):
                    errors.append(f"{wid}: 例文に en/ja がありません")
                if e.get("kjv"):
                    kjv_n += 1
                    if not e.get("ref"):
                        errors.append(f"{wid}: KJV例文に出典 ref がありません")
            if "bible" in w.get("category", []) and kjv_n == 0:
                errors.append(f"{wid}: 聖書語にKJV例文がありません")
            if "bible" not in w.get("category", []) and kjv_n:
                warns.append(f"{wid}: 聖書語でないのにKJV例文があります")
            all_words.append(w)
        print(f"{p['id']}: {len(words)}語 分野別 {cats}")
    # root の表記ゆれ（同じ綴りの別表記、例: 'clud/clus' と 'clus/clud'）
    groups = {}
    for w in all_words:
        r = w.get("root")
        if r:
            key = "/".join(sorted(r.split("/")))
            groups.setdefault(key, set()).add(r)
    for key, forms in groups.items():
        if len(forms) > 1:
            errors.append(f"root の表記ゆれ: {sorted(forms)}")
    roots = {}
    for w in all_words:
        if w.get("root"):
            roots.setdefault(w["root"], []).append(w["id"])
    print(f"root の種類: {len(roots)}（2語以上でつながるもの: {sum(1 for v in roots.values() if len(v) > 1)}）")
    for m in warns:
        print("警告:", m)
    for m in errors:
        print("エラー:", m)
    print(f"結果: 全{len(all_words)}語 / エラー {len(errors)} / 警告 {len(warns)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
