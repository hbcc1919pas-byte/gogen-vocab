"""Claude に「次の100語」を作らせるための依頼文を作る。

使い方: python tools/make_prompt.py ["追加の希望（例：神学用語は救済論を中心に）"]
出力:   inbox/次の100語_依頼文.md  （これを Claude に貼り付ける。出てきたJSONを inbox/ に保存する）
今ある単語id・語根（意味つき）を依頼文に入れるので、重複や語根の表記ゆれを防げる。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_words as cw  # noqa: E402

TEMPLATE = """# 英単語アプリ「語源英単語」：パック{n:03d}（次の100語）を作ってください

下の「形式」どおりのJSONで、**100語**を出力してください。出力はJSONだけ（説明文は不要）。コードブロック（```json）で囲んでかまいません。

## 構成
- 4分野を**各25語**：bible（聖書・神学）／highschool（高校で学ぶ語）／exam（大学受験の頻出語）／daily（日常会話の語）。
- 下の「既にある単語」と重複しないこと。
- 語根でつながる語（例：clud/clus）を、既存の語やこのパック内の語と結びつくように入れること。
- 語根は、下の「既にある語根」の表記をそのまま使う。新しい語根を使うときは、JSONの `roots` に意味を付ける。
{extra}
## 形式（1語ごと）
```json
{{
  "id": "atonement（英語の小文字。一意）",
  "word": "atonement",
  "pos": "名詞",
  "ipa": "/əˈtoʊnmənt/（米音のIPA。カナ表記は不可）",
  "meaning": ["贖い", "罪の償い"],
  "etymology": "at + one + -ment（確信の持てない語源は書かず、分かる範囲にとどめる）",
  "root": "one（語根のキー。小文字。複数形は clud/clus のように / でつなぐ。不確かなら null）",
  "synonyms": [{{"w": "expiation", "m": "償い"}}],
  "antonyms": [],
  "related": [{{"w": "reconciliation", "m": "和解"}}],
  "examples": [
    {{"en": "…", "ja": "…", "kjv": true, "ref": "Romans 5:11"}},
    {{"en": "自然で短い例文", "ja": "日本語訳"}}
  ],
  "category": ["bible"],
  "level": 3,
  "verified": false,
  "note": "覚え方のイメージ（任意。なければ空文字）"
}}
```
全体は次のどちらかの形：
- `[ {{単語}}, … ]`
- `{{"words": [ {{単語}}, … ], "roots": {{"新しい語根": {{"m": "意味", "ex": "例: word1, word2"}}}}}}`

## 守ること
- 例文は各語2〜3文（英文と日本語訳）。短く自然な文にする。
- bible の語は、**KJV（欽定訳）の原文を一字一句正確に**引用した例文を1文入れ、`"kjv": true` と `"ref": "書名 章:節"` を付ける。KJV以外の現代英訳は使わない。単語そのものがKJVに出てこない語は、概念を示す節を引用し、note にその旨を書く。確信が持てない聖句は、確実な別の節に差し替える。
- level は 1基礎・2標準・3発展。
- `verified` は必ず false。
- 語源・IPA・訳に確信が持てないものは、書かないか、「要確認」と分かるようにする。

## 既にある語根（この表記を使う）
{roots}

## 既にある単語（id）
{words}
"""


def main():
    extra_text = sys.argv[1] if len(sys.argv) > 1 else ""
    packs = cw.load_json(cw.DATA / "packs.json")["packs"]
    ids = []
    for p in packs:
        ids.extend(w["id"] for w in cw.load_json(cw.DATA / p["file"]))
    roots = cw.load_json(cw.DATA / "roots.json")
    roots_txt = "\n".join(f"- {k}：{v['m']}" for k, v in sorted(roots.items()))
    extra = f"- 追加の希望：{extra_text}\n" if extra_text else ""
    text = TEMPLATE.format(n=len(packs) + 1, extra=extra, roots=roots_txt, words=", ".join(sorted(ids)))
    out = cw.ROOT / "inbox" / "次の100語_依頼文.md"
    out.parent.mkdir(exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"作成: {out}（既存 {len(ids)}語・語根 {len(roots)}種を含む）")


if __name__ == "__main__":
    main()
