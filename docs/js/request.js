/* =========================================================
   request.js: one shared helper for all inner pages

   sendLetter(method, url, body, cardId)
     1. sends a real HTTP request to our server with fetch()
     2. when the answer arrives, fills the postcard with id = cardId:
        the status code, its postmark word, the headers and the body
   ========================================================= */


// ===== The word on the postmark for each status code =====
// (the same table as on the home page)
const POSTMARK = {
  200: "DELIVERED",
  201: "RECEIVED",
  204: "SHREDDED",
  301: "FORWARDED",
  400: "UNREADABLE",
  403: "NO ENTRY",
  404: "ADDRESS UNKNOWN",
  405: "WRONG COUNTER",
  411: "NO WEIGHT GIVEN",
  413: "TOO HEAVY",
  500: "POST OFFICE ON FIRE",
  501: "NOT DONE HERE",
  504: "TOO SLOW"
};


// ===== Send a letter and show the reply =====
function sendLetter(method, url, body, cardId) {
  const card = document.getElementById(cardId);

  // the options of the request: the method, and a body if there is one
  const options = { method: method };
  if (body !== null) {
    options.body = body;
  }

  // return the fetch, so a page can do something AFTER the reply
  // (the Mailroom uses this to refresh its list)
  return fetch(url, options)
    .then(function (response) {
      // response.text() reads the body; it also needs a little time,
      // so it has its own .then
      return response.text().then(function (text) {
        response.bodyText = text;       // keep the body: Inspections checks what's inside
        fillPostcard(card, method, url, response, text);
        return response;
      });
    })
    .catch(function () {
      // the server did not answer at all (stopped? crashed?)
      fillPostcard(card, method, url, null, "");
    });
}


// ===== Write everything on the postcard =====
function fillPostcard(card, method, url, response, text) {
  let code = "???";
  let lines = "No answer: is the server running?";

  if (response) {
    code = response.status;
    lines =
      "HTTP/1.1 " + code + " " + response.statusText + "\n" +
      "Server: " + (response.headers.get("Server") || "unknown") + "\n" +
      "Content-Type: " + (response.headers.get("Content-Type") || "-") + "\n" +
      "Content-Length: " + (response.headers.get("Content-Length") || "-") + "\n" +
      "Re: " + method + " " + url;
  }

  card.querySelector(".postmark-code").textContent = code;
  card.querySelector(".postmark-word").textContent = POSTMARK[code] || "RETURNED";
  if (method === "DELETE" && code === 200) {
    card.querySelector(".postmark-word").textContent = "SHREDDED";   // our server answers 200 to DELETE
  }
  card.querySelector(".postcard-lines").textContent = lines;

  // the body: only the first 1500 characters, so the card stays small
  const bodyBox = card.querySelector(".postcard-body");
  if (bodyBox) {
    bodyBox.textContent = text ? text.slice(0, 1500) : "(empty body)";
  }

  // hide the "waiting" box next to the card, if the page has one
  const waiting = document.getElementById(card.id + "-waiting");
  if (waiting) {
    waiting.style.display = "none";
  }

  // replay the stamp animation every time:
  // remove "show", let the browser notice, then add it again
  card.classList.remove("show");
  void card.offsetWidth;
  card.classList.add("show");
}
