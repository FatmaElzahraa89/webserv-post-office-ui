/* =========================================================
   demo.js: DEMO MODE for GitHub Pages

   GitHub Pages can only serve files: there is no webserv behind it.
   This file plays the part of the server INSIDE the browser:
   every fetch() the pages send is answered here, with the same
   status codes, headers and error pages as the real C++98 server.

   - static files (pages, CSS, JS)  → the real files, from GitHub
   - /uploads                        → shelves kept in localStorage
   - /cgi-bin/...                    → pages written by small JS "scripts"
   - everything else                 → the right error, like webserv

   The real server: github.com/soso0809/webserv (C++98, poll()).
   ========================================================= */
(function () {
  "use strict";

  // ===== Where the site lives (e.g. /webserv-post-office/) =====
  const SCRIPT = document.currentScript.src;
  const BASE = new URL("../", SCRIPT).pathname;          // the folder above js/
  const ROOT = new URL("../", SCRIPT).href;              // the same, as a full URL

  // ===== The files that really exist on GitHub Pages =====
  const STATIC = [
    "/index.html", "/about.html", "/cgi.html", "/delete.html", "/upload.html",
    "/tests.html", "/terminal.html",
    "/css/fonts.css", "/css/pages.css", "/css/style.css",
    "/js/app.js", "/js/request.js", "/js/demo.js",
    "/errors/400.html", "/errors/403.html", "/errors/404.html", "/errors/405.html",
    "/errors/413.html", "/errors/500.html", "/errors/502.html", "/errors/504.html",
    "/errors/50x.html"
  ];
  const FOLDERS = ["/css/", "/js/", "/fonts/", "/errors/"];   // no index.html → 403
  const ERROR_PAGES = [400, 403, 404, 405, 413, 500, 502, 504];
  const MAX_BODY = 10 * 1024 * 1024;                          // client_max_body_size 10M

  const STATUS_TEXT = {
    200: "OK", 201: "Created", 204: "No Content", 301: "Moved Permanently",
    400: "Bad Request", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed",
    411: "Length Required", 413: "Payload Too Large", 500: "Internal Server Error",
    501: "Not Implemented", 502: "Bad Gateway", 504: "Gateway Timeout"
  };

  const realFetch = window.fetch.bind(window);
  const realOpen = window.open.bind(window);

  // ===== Small helpers =====
  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // "/webserv-post-office/about.html" → "/about.html"
  // "/about.html" (an address written in the pages' JS) → "/about.html"
  function serverPath(url) {
    let path = url.pathname;
    if (BASE !== "/" && path.startsWith(BASE)) {
      path = "/" + path.slice(BASE.length);
    }
    return path;
  }

  function isStatic(path) {
    return path === "/" || STATIC.includes(path);
  }

  function siteUrl(path) {                 // "/about.html" → full GitHub Pages address
    if (path === "/") path = "/index.html";
    return ROOT + path.slice(1);
  }

  // ===== Build a reply, like webserv does =====
  function reply(status, body, type, extra) {
    const headers = new Headers({
      "Server": "webserv (demo)",
      "Content-Type": type || "text/html",
      "Content-Length": String(new Blob([body || ""]).size)
    });
    if (extra) {
      Object.keys(extra).forEach(function (k) { headers.set(k, extra[k]); });
    }
    return new Response(status === 204 ? null : body, {
      status: status, statusText: STATUS_TEXT[status] || "", headers: headers
    });
  }

  // an error: with our own error page, like error_page in default.conf
  function errorReply(status, extra) {
    const file = ERROR_PAGES.includes(status) ? status
               : (status >= 500 ? "50x" : null);
    if (!file) {
      const text = status + " " + (STATUS_TEXT[status] || "");
      return Promise.resolve(reply(status, "<h1>" + text + "</h1>", "text/html", extra));
    }
    return realFetch(siteUrl("/errors/" + file + ".html"))
      .then(function (r) { return r.text(); })
      .then(function (html) { return reply(status, html, "text/html", extra); });
  }

  // a real file from GitHub Pages, re-sent with our headers
  function staticReply(path) {
    return realFetch(siteUrl(path)).then(function (r) {
      if (!r.ok) return errorReply(404);
      const type = r.headers.get("Content-Type") || "text/plain";
      return r.arrayBuffer().then(function (buf) { return reply(200, buf, type); });
    });
  }

  // ===== The shelves (/uploads), kept in this browser =====
  const SHELF_KEY = "webserv-demo-shelves";
  let memoryShelves = null;

  function readShelves() {
    try {
      const saved = localStorage.getItem(SHELF_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) { if (memoryShelves) return memoryShelves; }
    if (memoryShelves) return memoryShelves;
    return {                                       // the first visit: two letters wait
      "letter.txt":  { type: "text/plain", size: 26, text: "a letter from the home page" },
      "welcome.txt": { type: "text/plain", size: 40, text: "Welcome to the webserv post office demo!" }
    };
  }

  function saveShelves(shelves) {
    memoryShelves = shelves;
    try { localStorage.setItem(SHELF_KEY, JSON.stringify(shelves)); } catch (e) { /* full or blocked */ }
  }

  function readAsDataUrl(blob) {
    return new Promise(function (resolve) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.readAsDataURL(blob);
    });
  }

  // what we keep from a file: text, a small picture, or only its size
  function keepFile(blob) {
    const type = blob.type || "application/octet-stream";
    const item = { type: type, size: blob.size };
    if (type.startsWith("image/") && blob.size < 1500000) {
      return readAsDataUrl(blob).then(function (data) { item.image = data; return item; });
    }
    if (blob.size < 300000) {
      return blob.text().then(function (text) { item.text = text; return item; });
    }
    item.text = "(" + blob.size + " bytes: too big to keep in the demo)";
    return Promise.resolve(item);
  }

  function listing(shelves) {
    const names = Object.keys(shelves).sort();
    let rows = '<li><a href="../">../</a></li>\n';
    names.forEach(function (name) {
      rows += '<li><a href="' + encodeURIComponent(name) + '">' + escapeHtml(name) + "</a> · " +
              shelves[name].size + " bytes</li>\n";
    });
    return "<!DOCTYPE html><html><head><title>Index of /uploads/</title></head><body>" +
           "<h1>Index of /uploads/</h1><ul>\n" + rows + "</ul></body></html>";
  }

  function bodySize(body) {
    if (!body) return 0;
    if (body instanceof Blob) return body.size;
    if (typeof body === "string") return new Blob([body]).size;
    if (body instanceof FormData) {
      let size = 0;
      body.forEach(function (value) { size += value instanceof Blob ? value.size : String(value).length; });
      return size;
    }
    return 0;
  }

  function uploads(method, path, body) {
    const shelves = readShelves();
    const name = decodeURIComponent(path.replace(/^\/uploads\/?/, ""));

    if (method === "GET") {
      if (name === "") return reply(200, listing(shelves), "text/html");
      const item = shelves[name];
      if (!item) return errorReply(404);
      if (item.image) {
        return realFetch(item.image).then(function (r) { return r.blob(); })
          .then(function (blob) { return reply(200, blob, item.type); });
      }
      return reply(200, item.text || "", "text/plain");
    }

    if (method === "DELETE") {
      if (name === "") return errorReply(403);
      if (!shelves[name]) return errorReply(404);
      delete shelves[name];
      saveShelves(shelves);
      return reply(200, "<h1>File deleted</h1>", "text/html");
    }

    // POST
    if (bodySize(body) > MAX_BODY) return errorReply(413);
    if (!body) return errorReply(411);

    let file = null;
    let fileName = name || "upload.bin";
    if (body instanceof FormData) {
      body.forEach(function (value) {
        if (!file && value instanceof Blob) { file = value; if (value.name) fileName = value.name; }
      });
      if (!file) return errorReply(400);
    } else if (body instanceof Blob) {
      file = body;
    } else {
      file = new Blob([String(body)], { type: "text/plain" });
      if (!name) fileName = "upload.txt";
    }
    fileName = fileName.split("/").pop();

    return keepFile(file).then(function (item) {
      shelves[fileName] = item;
      saveShelves(shelves);
      return reply(201, "<h1>File uploaded</h1><p>/uploads/" + escapeHtml(fileName) + "</p>",
                   "text/html", { "Location": "/uploads/" + fileName });
    });
  }

  // ===== The workshop (/cgi-bin): small scripts, written in JS for the demo =====
  function cgiPage(title, tag, rows, note) {
    let lines = "";
    rows.forEach(function (row) {
      lines += "<dt>" + escapeHtml(row[0]) + "</dt><dd>" + escapeHtml(row[1]) + "</dd>";
    });
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<meta name="color-scheme" content="light">' +
      "<title>" + escapeHtml(title) + " · webserv Post Office</title>" +
      '<link rel="stylesheet" href="' + ROOT + 'css/fonts.css">' +
      "<style>" +
      "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#F2E8D5;color:#1E2A44;font-family:Inter,system-ui,sans-serif}" +
      ".sheet{position:relative;width:100%;max-width:620px;box-sizing:border-box;padding:40px 38px 34px;background:#FBF6EA;border:1.5px solid #CDBF9F;border-radius:12px;box-shadow:0 18px 40px -20px rgba(30,42,68,.5)}" +
      ".tag{font-family:'Courier Prime',monospace;font-weight:700;font-size:14px;letter-spacing:.18em;color:#B8321F}" +
      "h1{margin:8px 0 22px;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:40px;letter-spacing:-.02em}" +
      "dl{margin:0 0 26px;display:grid;grid-template-columns:max-content 1fr;gap:10px 18px}" +
      "dt{font-family:'Courier Prime',monospace;font-weight:700;color:#2347A6}" +
      "dd{margin:0;font-family:'Courier Prime',monospace;white-space:pre-wrap;word-break:break-word}" +
      "p{color:#5A5040;line-height:1.6;margin:0 0 24px}" +
      "a{display:inline-flex;align-items:center;min-height:46px;padding:0 20px;border-radius:10px;background:#1E2A44;color:#FBF6EA;font-weight:600;text-decoration:none}" +
      "small{display:block;margin-top:26px;font-family:'Courier Prime',monospace;font-size:13px;color:#5A5040}" +
      "</style></head><body><main class=\"sheet\">" +
      '<div class="tag">' + escapeHtml(tag) + "</div><h1>" + escapeHtml(title) + "</h1>" +
      "<dl>" + lines + "</dl>" + (note ? "<p>" + note + "</p>" : "") +
      '<a href="' + ROOT + 'cgi.html">Back to the workshop</a>' +
      "<small>webserv post office · demo mode: this page was written in your browser</small>" +
      "</main></body></html>";
  }

  function cookieValue(name) {
    const found = document.cookie.split("; ").find(function (c) { return c.startsWith(name + "="); });
    return found ? found.split("=")[1] : null;
  }

  function cgi(method, path, query, body) {
    const script = path.replace("/cgi-bin/", "");
    const params = new URLSearchParams(query);
    const ok = method === "GET" || method === "POST";

    if (!ok) return errorReply(405);

    if (script === "hello.py" || script === "hello.sh") {
      const name = params.get("name") || "stranger";
      const lang = script === "hello.py" ? "PYTHON" : "BASH";
      return reply(200, cgiPage("CGI GET Test", "THE WORKSHOP · " + lang, [
        ["Hello", name],
        ["REQUEST_METHOD", method],
        ["QUERY_STRING", query || "(empty)"],
        ["SCRIPT_NAME", path],
        ["COOKIE", document.cookie || "(none)"]
      ], "The server passes the request to the script with environment variables, and sends back what the script writes."), "text/html");
    }

    if (script === "form.py") {
      const text = typeof body === "string" ? body : "";
      const size = new Blob([text]).size;
      return reply(200, cgiPage("CGI POST Test", "THE WORKSHOP · PYTHON", [
        ["REQUEST_METHOD", method],
        ["CONTENT_LENGTH", String(size)],
        ["Received Body (" + size + " bytes)", text || "(empty)"]
      ], "The body reaches the script on stdin, and CONTENT_LENGTH says how long it is."), "text/html");
    }

    if (script === "session.py") {
      const cookiePath = "; path=" + BASE + "; SameSite=Lax";
      if (params.get("logout")) {
        document.cookie = "session=; max-age=0" + cookiePath;
        try { localStorage.removeItem("webserv-demo-visits"); } catch (e) { /* blocked */ }
        return reply(200, cgiPage("See you soon", "THE CLERK · SESSION", [
          ["Session", "forgotten"], ["Cookie", "deleted"]
        ], "Your file and your cookie are gone. The next visit counts from 1 again."), "text/html");
      }
      let id = cookieValue("session");
      let visits = 1;
      try { visits = Number(localStorage.getItem("webserv-demo-visits") || 0) + 1; } catch (e) { /* blocked */ }
      if (!id) {
        id = Math.random().toString(16).slice(2, 14);
        visits = 1;
      }
      document.cookie = "session=" + id + cookiePath;
      try { localStorage.setItem("webserv-demo-visits", String(visits)); } catch (e) { /* blocked */ }
      return reply(200, cgiPage("Visit #" + visits, "THE CLERK · SESSION", [
        ["Session", id], ["Visits", String(visits)]
      ], visits === 1 ? "First visit: the clerk gives your browser a cookie (Set-Cookie)."
                      : "The browser showed its cookie, so the clerk remembers you."), "text/html");
    }

    if (script === "slow.py") {                       // killed after 5 s → 504
      return wait(5000).then(function () { return errorReply(504); });
    }
    if (script === "broken.py") {                     // the script crashes → 502
      return errorReply(502);
    }
    return errorReply(404);
  }

  // ===== The post office: one request in, one reply out =====
  function serve(method, url, body) {
    return Promise.resolve(route(method, url, body));
  }

  function route(method, url, body) {
    const path = serverPath(url);
    const query = url.search.slice(1);
    method = method.toUpperCase();

    if (method === "PUT" || !["GET", "POST", "DELETE", "HEAD"].includes(method)) {
      return errorReply(501);
    }
    if (path === "/uploads" || path.startsWith("/uploads/")) {
      if (method === "HEAD") return errorReply(405);
      return uploads(method, path, body);
    }
    if (path.startsWith("/cgi-bin/")) {
      return cgi(method, path, query, body);
    }
    if (path === "/old-page") {                       // return 301 / → the browser follows it
      return staticReply("/").then(function (r) {
        Object.defineProperty(r, "redirected", { value: true });
        return r;
      });
    }
    if (method !== "GET") {                           // location / only allows GET
      return errorReply(405, { "Allow": "GET" });
    }
    if (isStatic(path)) return staticReply(path);
    if (FOLDERS.includes(path)) return errorReply(403);
    return errorReply(404);
  }

  // ===== 1. fetch(): every letter the pages send comes here =====
  window.fetch = function (input, options) {
    if (typeof input !== "string" && !(input instanceof URL)) {
      return realFetch(input, options);
    }
    const url = new URL(input, location.href);
    if (url.origin !== location.origin) return realFetch(input, options);

    const method = (options && options.method) || "GET";
    const body = options && options.body !== undefined ? options.body : null;

    // a little travel time, like a real network
    return wait(180 + Math.random() * 220).then(function () {
      return serve(method, url, body);
    });
  };

  // ===== 2. Showing a reply as a page, in a tab =====
  function showReply(doc, response, path) {
    const type = response.headers.get("Content-Type") || "";
    let pageBase = ROOT;
    if (response.status >= 400) pageBase = ROOT + "errors/";

    if (type.startsWith("image/")) {
      return response.blob().then(readAsDataUrl).then(function (data) {
        doc.open();
        doc.write('<body style="margin:0;background:#1E2A44;display:flex;align-items:center;justify-content:center;min-height:100vh">' +
                  '<img style="max-width:100%" alt="" src="' + data + '"></body>');
        doc.close();
      });
    }
    return response.text().then(function (text) {
      let html;
      if (type.startsWith("text/html")) {
        html = text.replace(/<head>/i, '<head><base href="' + pageBase + '">');
        if (html === text) html = '<base href="' + pageBase + '">' + text;
      } else {
        html = '<title>' + escapeHtml(path) + '</title><pre style="white-space:pre-wrap;font:15px/1.5 monospace;padding:24px">' +
               escapeHtml(text) + "</pre>";
      }
      doc.open();
      doc.write(html);
      doc.close();
    });
  }

  function openVirtual(url, newTab) {
    const tab = newTab ? realOpen("", "_blank") : window;
    if (!tab) return null;
    serve("GET", url, null).then(function (response) {
      showReply(tab.document, response, serverPath(url));
    });
    return tab;
  }

  // ===== 3. window.open(): the "Open ↗" buttons =====
  window.open = function (address, target, features) {
    if (!address) return realOpen(address, target, features);
    const url = new URL(address, location.href);
    if (url.origin !== location.origin) return realOpen(address, target, features);
    const path = serverPath(url);
    if (isStatic(path)) return realOpen(siteUrl(path) + url.search + url.hash, target, features);
    return openVirtual(url, true);
  };

  // ===== 4. Links: static pages go to the right place, the rest is simulated =====
  document.addEventListener("click", function (event) {
    const link = event.target.closest && event.target.closest("a[href]");
    if (!link || event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;

    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;

    const path = serverPath(url);
    const newTab = link.target === "_blank";

    if (isStatic(path)) {
      const right = siteUrl(path) + url.search + url.hash;
      if (url.href !== right) {                       // an address written for the real server
        event.preventDefault();
        if (newTab) realOpen(right, "_blank"); else location.href = right;
      }
      return;                                         // otherwise: a normal link
    }
    event.preventDefault();
    openVirtual(url, newTab);
  }, true);

  // ===== 5. The "demo mode" label =====
  function addLabel() {
    if (document.getElementById("demo-label") || sessionStorageGet()) return;
    const label = document.createElement("div");
    label.id = "demo-label";
    label.setAttribute("role", "note");
    label.innerHTML =
      '<strong>DEMO MODE</strong> The replies are simulated in your browser. ' +
      'The real server is written in C++98.' +
      '<button type="button" aria-label="Close">×</button>';
    const style = document.createElement("style");
    style.textContent =
      "#demo-label{position:fixed;left:16px;bottom:16px;z-index:9999;max-width:min(420px,calc(100vw - 32px));" +
      "box-sizing:border-box;padding:10px 40px 10px 14px;background:#FBF6EA;color:#1E2A44;" +
      "border:2px dashed #B8321F;border-radius:10px;box-shadow:0 10px 24px -12px rgba(30,42,68,.5);" +
      "font:13px/1.45 Inter,system-ui,sans-serif}" +
      "#demo-label strong{display:block;font-family:'Courier Prime',monospace;letter-spacing:.14em;color:#B8321F}" +
      "#demo-label button{position:absolute;top:6px;right:8px;border:0;background:none;color:#1E2A44;" +
      "font-size:20px;line-height:1;cursor:pointer;padding:4px}";
    label.querySelector("button").addEventListener("click", function () {
      label.remove();
      try { sessionStorage.setItem("webserv-demo-label", "closed"); } catch (e) { /* blocked */ }
    });
    document.head.appendChild(style);
    document.body.appendChild(label);
  }

  function sessionStorageGet() {
    try { return sessionStorage.getItem("webserv-demo-label"); } catch (e) { return null; }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addLabel);
  } else {
    addLabel();
  }
})();
