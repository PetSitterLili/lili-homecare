"""Use a private browser profile and local synthetic Drive to test offline recovery."""
import functools
import http.server
import json
import os
from pathlib import Path
import shutil
import threading
from playwright.sync_api import expect, sync_playwright

DOCS = Path(__file__).resolve().parents[1] / "docs"


class FixtureServer(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Only the test server injects a synthetic cloud transport. The app,
        # IndexedDB, service worker, PDF engine and photo viewer run normally.
        if self.path.partition("?")[0] != "/drive.mjs":
            return super().do_GET()
        shim = """
DriveStore.prototype.connect=async function(){this.token='fixture';this.expires=Date.now()+3600000;this.root='fixture-root';};
DriveStore.prototype.list=async function(){return [];};
DriveStore.prototype.families=async function(){return [];};
DriveStore.prototype.reserve=async function(){return crypto.randomUUID();};
DriveStore.prototype.upload=async function(){return {id:crypto.randomUUID()};};
DriveStore.prototype.save=async function(data,remote,role,reserved){
 const id=remote?.id||reserved;await window.fixtureWrite(id,JSON.stringify(data));return {id,version:'1'};
};
DriveStore.prototype.load=async function(id){
 const data=JSON.parse(await window.fixtureRead(id));return {data,base:await digest(data),version:'1',etag:null};
};
"""
        data = (DOCS.joinpath("drive.mjs").read_text() + shim).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/javascript")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


def main():
    handler = functools.partial(FixtureServer, directory=str(DOCS))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    cloud = {}
    with sync_playwright() as engine:
        chrome = os.environ.get("CHROME_BIN") or shutil.which("google-chrome") or shutil.which("chromium")
        browser = engine.chromium.launch(executable_path=chrome, args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        ctx.expose_function("fixtureWrite", lambda k,v: cloud.__setitem__(k,v))
        ctx.expose_function("fixtureRead", lambda k: cloud[k])
        ctx.route("https://accounts.google.com/**", lambda route: route.abort())
        p = ctx.new_page()
        errors = []
        p.on("pageerror", lambda e: errors.append(str(e)))
        button = lambda name: p.get_by_role("button", name=name, exact=True)
        p.goto(f"http://127.0.0.1:{server.server_port}/")
        p.evaluate("navigator.serviceWorker.ready.then(()=>true)")
        p.wait_for_function("!!navigator.serviceWorker.controller")
        button("新增家庭").click()
        p.get_by_label("家庭代表名", exact=False).fill("Mobile QA")
        button("先填狗狗資料").click()
        expect(button("貓咪資料")).to_have_count(0)
        button("新增一位毛寶").click()
        p.get_by_label("名字", exact=True).fill("Demo Dog")
        assert p.evaluate("document.documentElement.scrollWidth <= innerWidth")
        button("連接 Google Drive").click()
        button("連接").click()
        expect(p.locator("#saveState")).to_contain_text("已同步至 Google Drive",timeout=15000)
        ctx.set_offline(True)
        p.get_by_label("每日次數與預計時段").fill("offline change")
        expect(p.locator("#saveState")).to_contain_text("離線 · 已存本機")
        button("內部照片").click()
        p.locator("#photoFiles").set_input_files(str(DOCS/"assets"/"cat.png"))
        p.get_by_label("說明（可留白）").fill("private test caption")
        expect(p.locator("#saveState")).to_contain_text("離線 · 已存本機")
        p.reload(wait_until="domcontentloaded")
        expect(p.get_by_role("heading",name="Mobile QA")).to_be_visible()
        expect(p.get_by_text("offline change",exact=False).first).to_be_visible()
        button("內部照片").click()
        expect(p.get_by_label("說明（可留白）")).to_have_value("private test caption")
        button("放大照片 private test caption").click()
        expect(p.locator("#fullPhoto")).to_be_visible()
        p.get_by_label("關閉照片").click()
        button("A4 計畫書").click()
        button("產生／更新 A4 預覽").click()
        button("仍產生預覽").click()
        expect(p.locator(".preview img").first).to_be_visible()
        ctx.set_offline(False)
        expect(p.locator("#saveState")).to_contain_text("已同步至 Google Drive",timeout=20000)
        assert any(json.loads(v)["booking"]["times"]=="offline change" for v in cloud.values())
        assert not errors,errors
        print("PASS 390px dog-only layout, local edits, original photo and caption, offline reload, PDF preview, automatic catch-up to synthetic Drive")
        browser.close()
    server.shutdown()


if __name__ == "__main__":
    main()
