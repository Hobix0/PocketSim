"""
server.py – Game Dev Server für Pythonista (iPhone)
────────────────────────────────────────────────────
Legt einen lokalen Webserver an, der dein JS-Game aus dem
Ordner ~/Documents/game/ ausliefert.
"""

import http.server
import json
import os
import socket
import socketserver
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs

PORT     = 8080
GAME_DIR = os.path.dirname(os.path.abspath(__file__))  # Gleicher Ordner wie server.py
POLL_MS  = 1500

MIME = {
    ".html": "text/html; charset=utf-8",
    ".htm":  "text/html; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".mjs":  "application/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif":  "image/gif",
    ".svg":  "image/svg+xml",
    ".webp": "image/webp",
    ".ico":  "image/x-icon",
    ".mp3":  "audio/mpeg",
    ".ogg":  "audio/ogg",
    ".wav":  "audio/wav",
    ".mp4":  "video/mp4",
    ".webm": "video/webm",
    ".woff": "font/woff",
    ".woff2":"font/woff2",
    ".ttf":  "font/ttf",
    ".glsl": "text/plain",
    ".vert": "text/plain",
    ".frag": "text/plain",
}

# BUG FIX: Client schickt seinen letzten mtime-Wert mit.
# Server vergleicht und setzt "changed" NUR true wenn sich wirklich was geändert hat.
# Vorher: "changed" war immer true → Safari lud alle 1.5s neu (Endlosschleife).
LIVE_RELOAD_JS = f"""
<script>
(function() {{
  let last = 0;
  setInterval(async () => {{
    try {{
      const r = await fetch('/___reload?t=' + last);
      const d = await r.json();
      if (d.changed) location.reload();
      last = d.mtime;
    }} catch(e) {{}}
  }}, {POLL_MS});
}})();
</script>
"""

def dir_listing(path, url_path):
    items = sorted(Path(path).iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
    rows = ""
    if url_path != "/":
        rows += '<tr><td><a href="../">⬆ ..</a></td><td></td></tr>'
    for item in items:
        icon = "📄" if item.is_file() else "📁"
        size = f"{item.stat().st_size:,} B" if item.is_file() else "—"
        link = item.name + ("" if item.is_file() else "/")
        rows += f'<tr><td><a href="{link}">{icon} {item.name}</a></td><td>{size}</td></tr>'
    return f"""<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>📂 {url_path}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: ui-monospace, monospace; background: #0d0d0d; color: #e0e0e0;
            padding: 32px 24px; }}
    h1 {{ font-size: 1.1rem; color: #7c7; margin-bottom: 20px; }}
    table {{ width: 100%; border-collapse: collapse; }}
    td {{ padding: 8px 12px; border-bottom: 1px solid #222; }}
    td:last-child {{ text-align: right; color: #666; font-size: 0.85rem; }}
    a {{ color: #6af; text-decoration: none; }}
    a:hover {{ color: #fff; }}
  </style>
</head>
<body>
  <h1>📂 {url_path}</h1>
  <table>{rows}</table>
</body>
</html>"""

def get_save_slot_path(slot):
    return os.path.join(GAME_DIR, "saves", f"slot{slot}.json")


def latest_mtime(directory):
    latest = 0.0
    try:
        for root, _, files in os.walk(directory):
            for f in files:
                try:
                    mt = os.path.getmtime(os.path.join(root, f))
                    if mt > latest:
                        latest = mt
                except OSError:
                    pass
    except Exception:
        pass
    return latest

class GameHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        ts = time.strftime("%H:%M:%S")
        try:
            msg = fmt % args
            # Null-Bytes + Binärzeichen ersetzen (TLS-Handshake-Daten crashen Pythonista)
            msg = "".join(c if c.isprintable() else "?" for c in msg)
            # Alle HTTPS-Probes unterdrücken: Safari schickt TLS an unseren HTTP-Server.
            # Das ergibt immer einen 400-Fehler – kein echter Fehler, einfach ignorieren.
            if " 400 " in msg or "Bad request" in msg or "Bad HTTP" in msg:
                return
            print(f"  [{ts}]  {self.address_string()}  {msg}")
        except Exception:
            pass

    def send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        url    = parsed.path
        query  = parse_qs(parsed.query)

        if url == "/save-slot":
            slot = int(query.get("slot", ["0"])[0]) if query.get("slot") else 0
            if slot not in (1, 2, 3):
                self.send_error(400, "Ungültiger Slot")
                return

            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode("utf-8"))
            except Exception:
                self.send_error(400, "Ungültiges JSON")
                return

            save_dir = os.path.join(GAME_DIR, "saves")
            os.makedirs(save_dir, exist_ok=True)
            path = get_save_slot_path(slot)
            try:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                body = json.dumps({"ok": True}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_cors()
                self.send_header("Content-Length", len(body))
                self.end_headers()
                self.wfile.write(body)
            except Exception:
                self.send_error(500, "Fehler beim Speichern des Slots")
            return

        self.send_error(404, "Nicht gefunden")

    def do_GET(self):
        parsed = urlparse(self.path)
        url    = parsed.path
        query  = parse_qs(parsed.query)
        print(f"DEBUG GET: {self.path} -> {url}")

        # Live-Reload Endpunkt
        if url == "/___reload":
            current_mtime = latest_mtime(GAME_DIR)
            try:
                client_mtime = float(query.get("t", ["0"])[0])
            except ValueError:
                client_mtime = 0.0

            # BUG FIX: changed nur true wenn mtime sich geändert hat UND
            # der Client schon einen Wert hatte (verhindert Reload beim ersten Aufruf)
            changed = (client_mtime != 0.0) and (current_mtime != client_mtime)

            body = json.dumps({"mtime": current_mtime, "changed": changed}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors()
            self.send_header("Content-Length", len(body))
            self.end_headers()
            self.wfile.write(body)
            return

        # Save-Slot Metadaten
        if url == "/save-slots":
            slots = []
            for slot in range(1, 4):
                path = get_save_slot_path(slot)
                slot_info = {"slot": slot, "exists": False, "name": f"Slot {slot}", "date": None}
                if os.path.isfile(path):
                    try:
                        with open(path, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        slot_info["exists"] = True
                        slot_info["name"] = data.get("name", slot_info["name"])
                        slot_info["date"] = data.get("date")
                    except Exception:
                        pass
                slots.append(slot_info)

            body = json.dumps({"slots": slots}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors()
            self.send_header("Content-Length", len(body))
            self.end_headers()
            self.wfile.write(body)
            return

        # Load Slot
        if url == "/load-slot":
            slot = int(query.get("slot", ["0"])[0]) if query.get("slot") else 0
            if slot not in (1, 2, 3):
                self.send_error(400, "Ungültiger Slot")
                return
            path = get_save_slot_path(slot)
            if not os.path.isfile(path):
                self.send_error(404, "Slot nicht gefunden")
                return
            try:
                with open(path, "rb") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_cors()
                self.send_header("Content-Length", len(data))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                self.send_error(500, "Fehler beim Lesen des Slots")
            return

        # Statische Dateien
        rel  = url.lstrip("/")
        full = os.path.join(GAME_DIR, rel)

        if os.path.isdir(full):
            index = os.path.join(full, "index.html")
            if os.path.exists(index):
                full = index
            else:
                body = dir_listing(full, url or "/").encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_cors()
                self.send_header("Content-Length", len(body))
                self.end_headers()
                self.wfile.write(body)
                return

        if not os.path.isfile(full):
            self.send_error(404, f"Nicht gefunden: {url}")
            return

        ext   = Path(full).suffix.lower()
        ctype = MIME.get(ext, "application/octet-stream")

        try:
            with open(full, "rb") as f:
                data = f.read()

            if ext in (".html", ".htm"):
                html = data.decode("utf-8", errors="replace")
                if "</body>" in html:
                    html = html.replace("</body>", LIVE_RELOAD_JS + "</body>", 1)
                else:
                    html += LIVE_RELOAD_JS
                data = html.encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_cors()
            self.send_header("Content-Length", len(data))
            self.end_headers()
            self.wfile.write(data)

        except PermissionError:
            self.send_error(403, "Zugriff verweigert")

def _get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1    "

def _progress(label, step, total=5):
    filled = "█" * step + "░" * (total - step)
    pct    = int(step / total * 100)
    print(f"\r  {label:<28} [{filled}] {pct:>3}%", end="", flush=True)

def start():
    import threading, sys

    _progress("Ordner prüfen ...",   1)
    os.makedirs(GAME_DIR, exist_ok=True)
    time.sleep(0.15)

    _progress("Netzwerk ermitteln ...", 2)
    ip = _get_ip()
    time.sleep(0.15)

    _progress("Port binden ...",     3)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("", PORT), GameHandler)
    time.sleep(0.1)

    _progress("Handler laden ...",   4)
    time.sleep(0.1)

    _progress("Fertig!",             5)
    time.sleep(0.1)
    print()  # Zeilenumbruch nach dem Balken

    # Daemon-Thread: läuft im Hintergrund weiter nachdem das Script "fertig" ist.
    # Shortcuts bekommt sofort eine Antwort und hängt sich nicht mehr auf.
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    print()
    print("  ╔══════════════════════════════════════╗")
    print("  ║   🎮  Game Dev Server läuft!          ║")
    print("  ╠══════════════════════════════════════╣")
    print(f"  ║   Lokal:    http://localhost:{PORT}     ║")
    print(f"  ║   Netzwerk: http://{ip}:{PORT}  ║")
    print(f"  ║   Ordner:   (gleicher Ordner wie server.py)  ║")
    print("  ║   Live-Reload: ✅ aktiv               ║")
    print("  ║   Via Shortcuts: ✅                    ║")
    print("  ╚══════════════════════════════════════╝")
    print()

    # Direkt in Pythonista gestartet → blockieren bis ■ gedrückt wird
    # Via Shortcuts gestartet       → Script endet sofort, Server läuft weiter
    if sys.stdin.isatty():
        print("  (Direkt gestartet – läuft bis du ■ drückst)\n")
        thread.join()

if __name__ == "__main__":
    start()
