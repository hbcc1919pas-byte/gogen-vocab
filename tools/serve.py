"""ローカル確認用サーバー。ブラウザを閉じたら自動で終了する。

- docs/ を http://127.0.0.1:8046/ で配信する。
- ページ（app.js）が /__heartbeat を定期的に呼ぶ。20秒以上途絶えたら終了。
- 一度も heartbeat が来ない場合も、起動から3分で終了する。
- 二重起動は、ポートが使用中であることで防ぐ。
使い方: python tools/serve.py   （--no-open でブラウザを自動で開かない）
"""
import http.server
import socketserver
import sys
import threading
import time
import webbrowser
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
PORT = 8046
HEARTBEAT_TIMEOUT = 20     # 秒
STARTUP_LIMIT = 180        # 秒（一度も heartbeat が来ない場合）

state = {"last": None, "start": time.time()}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(DOCS), **k)

    def do_GET(self):
        if self.path.startswith("/__heartbeat"):
            state["last"] = time.time()
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


def watchdog(server):
    while True:
        time.sleep(1)
        now = time.time()
        if state["last"] is None:
            if now - state["start"] > STARTUP_LIMIT:
                print("heartbeat が来ないため終了します（3分経過）")
                break
        elif now - state["last"] > HEARTBEAT_TIMEOUT:
            print("ブラウザが閉じられたため終了します")
            break
    server.shutdown()


def main():
    socketserver.TCPServer.allow_reuse_address = False
    try:
        server = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        print(f"ポート {PORT} は使用中です（すでに起動している可能性があります）")
        return 1
    server.daemon_threads = True
    threading.Thread(target=watchdog, args=(server,), daemon=True).start()
    url = f"http://127.0.0.1:{PORT}/"
    print("起動:", url)
    if "--no-open" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
