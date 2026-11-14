"""data/ の正本を docs/data/ にコピーする（GitHub Pages は docs/ だけを公開するため）。

使い方: python tools/sync_data.py
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data"
DST = ROOT / "docs" / "data"


def main():
    if DST.exists():
        shutil.rmtree(DST)
    shutil.copytree(SRC, DST)
    n = sum(1 for _ in DST.rglob("*.json"))
    print(f"コピー完了: {n} ファイル -> {DST}")


if __name__ == "__main__":
    main()
