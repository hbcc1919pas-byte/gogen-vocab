# 語源英単語（46_claude_english_vocab）

語源（語根）でつなげて覚える英単語アプリ。スマホで使う静的サイト（GitHub Pages）。
公開URL: https://hbcc1919pas-byte.github.io/gogen-vocab/

仕様は `仕様書.md`（第11節の追記が優先）。ここには日常の操作だけを書く。

## フォルダ
| 場所 | 内容 |
|---|---|
| `data/` | 単語データの正本。`packs.json`（パック一覧）、`packs/pack00N.json`（100語ずつ）、`roots.json`（語根の意味） |
| `docs/` | 公開フォルダ（アプリ本体と、`data/` のコピー `docs/data/`） |
| `tools/` | 検査・取り込み・確認用の Python スクリプト |
| `inbox/` | 新しい100語を入れる場所（Git には入らない）。取り込み済みは `inbox/done/` へ移る |

## 新しい100語を追加する流れ
1. 依頼文を作る: `python tools/make_prompt.py ["追加の希望"]` → `inbox/次の100語_依頼文.md`
2. その内容を Claude に貼り付け、出てきたJSONを `inbox/` に保存する（.json / .txt / .md、```json で囲まれていてもよい。複数ファイル可）。
3. 検査だけ行う: `python tools/import_inbox.py`
   必須項目・id重複・IPAの形式・KJV出典・語根の表記ゆれ・新しい語根の意味・100語4分野同数を調べる。
4. 問題なければ取り込む: `python tools/import_inbox.py --apply`
   `pack00N.json` を作り、`packs.json`・`roots.json` を更新し、`docs/data/` に同期する。
5. 全体を検査: `python tools/check_words.py`
6. 公開: `git add -A` → `git commit` → `git push`（約1〜2分で反映）。

※ KJVの聖句は、取り込み時に原文との照合まではできない。公開前に目で確かめる。
※ 取り込んだ語は必ず `verified:false`（画面に「要確認」）。辞書で確認できたら `true` に直す（直したら `python tools/sync_data.py`）。

## 確認用サーバー
`python tools/serve.py` → http://127.0.0.1:8046/ 。ブラウザを閉じると自動で終了する（開かなくても3分で終了）。

## 記録（学習データ）
覚えた／苦手・復習予定は、端末のブラウザ（localStorage）にだけ保存される。「記録」タブで書き出し・読み込みができる。
