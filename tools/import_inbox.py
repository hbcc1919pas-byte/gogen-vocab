"""inbox/ の単語（Claudeが作ったJSON）を検査して、次のパックとして取り込む。

使い方:
  python tools/import_inbox.py            … 検査だけ（書き込まない）
  python tools/import_inbox.py --apply    … 検査に通れば pack00N.json を作り、packs.json・roots.json を更新し、
                                            docs/data/ に同期して、取り込んだ inbox のファイルを inbox/done/ に移す
  --allow-partial                         … 100語・4分野同数でなくても取り込む（通常は止める）

inbox のファイルの形（.json / .txt / .md。```json で囲まれていてもよい）:
  [ {単語}, … ]                       単語だけの配列
  {"words": [ {単語}, … ], "roots": {"新しい語根": {"m": "意味", "ex": "例"}}}
  ※ 新しい語根を使うときは roots に意味を付ける（既にある語根は不要）。
取り込み時に自動で行うこと: verified を false にする／root の表記ゆれを既存の形に統一／category の並びの正規化。
"""
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_words as cw  # noqa: E402

ROOT = cw.ROOT
DATA = cw.DATA
INBOX = ROOT / "inbox"
DOCS_DATA = ROOT / "docs" / "data"


def extract_json(text):
    """ファイルの文字列から JSON を取り出す（```json の囲みや前後の説明文があってもよい）。"""
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    starts = [i for i in (text.find("["), text.find("{")) if i >= 0]
    if not starts:
        raise ValueError("JSON が見つかりません")
    s = min(starts)
    close = "]" if text[s] == "[" else "}"
    e = text.rfind(close)
    return json.loads(text[s:e + 1])


def load_inbox():
    words, new_roots, files = [], {}, []
    if not INBOX.exists():
        return words, new_roots, files
    for p in sorted(INBOX.iterdir()):
        if not p.is_file() or p.suffix.lower() not in (".json", ".txt", ".md"):
            continue
        if p.name.startswith("次の100語"):
            continue
        with open(p, encoding="utf-8") as f:
            text = f.read()
        data = extract_json(text)
        if isinstance(data, dict):
            words.extend(data.get("words", []))
            new_roots.update(data.get("roots", {}))
        elif isinstance(data, list):
            words.extend(data)
        else:
            raise ValueError(f"{p.name}: 形式が違います")
        files.append(p)
    return words, new_roots, files


def main():
    apply = "--apply" in sys.argv
    partial = "--allow-partial" in sys.argv
    errors, warns = [], []

    words, new_roots, files = load_inbox()
    if not files:
        print("inbox/ に取り込むファイルがありません")
        return 1
    print(f"読み込み: {len(files)} ファイル / {len(words)} 語")

    packs_meta = cw.load_json(DATA / "packs.json")
    packs = packs_meta["packs"]
    existing, seen_ids = [], {}
    for p in packs:
        ws = cw.load_json(DATA / p["file"])
        existing.extend(ws)
        for w in ws:
            seen_ids[w["id"]] = p["id"]
    roots = cw.load_json(DATA / "roots.json")

    # 自動整形
    existing_forms = {}
    for w in existing:
        if w.get("root"):
            existing_forms["/".join(sorted(w["root"].split("/")))] = w["root"]
    for k in roots:
        existing_forms.setdefault("/".join(sorted(k.split("/"))), k)
    for w in words:
        if w.get("verified") is not False:
            w["verified"] = False
        if isinstance(w.get("root"), str):
            r = w["root"].strip().lower().replace(" ", "")
            key = "/".join(sorted(r.split("/")))
            if key in existing_forms and existing_forms[key] != r:
                warns.append(f"{w.get('id')}: root {r} を既存の表記 {existing_forms[key]} に統一しました")
                r = existing_forms[key]
            w["root"] = r or None
        if isinstance(w.get("category"), list):
            w["category"] = [c for c in cw.CATEGORIES if c in w["category"]]

    n = len(packs) + 1
    label = f"pack{n:03d}"
    cats = cw.validate_words(words, label, seen_ids, errors, warns)
    cw.root_variants(existing + words, errors)

    # 語根の意味
    for k, v in new_roots.items():
        if k in roots:
            warns.append(f"roots: {k} は既にあるため、inbox 側の意味は使いません")
        elif not (isinstance(v, dict) and v.get("m")):
            errors.append(f"roots: {k} に意味 m がありません")
        else:
            roots[k] = {"m": v["m"], "ex": v.get("ex", "")}
    for w in words:
        r = w.get("root")
        if r and r not in roots:
            errors.append(f"{w.get('id')}: 新しい語根 {r} の意味がありません（inbox の roots に追加してください）")

    # パックの構成（100語・4分野同数）
    if len(words) != 100 or len(set(cats.get(c, 0) for c in cw.CATEGORIES)) != 1:
        msg = f"{label} は100語・4分野同数が基本です（今回 {len(words)}語 {cats}）"
        (warns if partial else errors).append(msg)

    print(f"取り込み先: {label} / 分野別 {cats}")
    for m in warns:
        print("警告:", m)
    for m in errors:
        print("エラー:", m)
    if errors:
        print(f"結果: エラー {len(errors)} 件のため取り込みません")
        return 1
    if not apply:
        print("結果: 検査に通りました。取り込むには --apply を付けて実行してください")
        return 0

    # 書き込み
    with open(DATA / "packs" / f"{label}.json", "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=1)
    packs.append({"id": label, "name": f"パック{n}", "file": f"packs/{label}.json", "count": len(words)})
    with open(DATA / "packs.json", "w", encoding="utf-8") as f:
        json.dump(packs_meta, f, ensure_ascii=False, indent=1)
    with open(DATA / "roots.json", "w", encoding="utf-8") as f:
        json.dump(dict(sorted(roots.items())), f, ensure_ascii=False, indent=1)
    if DOCS_DATA.exists():
        shutil.rmtree(DOCS_DATA)
    shutil.copytree(DATA, DOCS_DATA)
    done = INBOX / "done"
    done.mkdir(exist_ok=True)
    for p in files:
        shutil.move(str(p), str(done / p.name))
    print(f"取り込み完了: {label}（{len(words)}語）。docs/data/ に同期し、inbox のファイルは inbox/done/ に移しました")
    print("次に: python tools/check_words.py → git add / commit / push")
    return 0


if __name__ == "__main__":
    sys.exit(main())
