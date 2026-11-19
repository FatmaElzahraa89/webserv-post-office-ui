// ===== 1. The rooms =====
const DEPARTMENTS = ["archives", "parcels", "shredder", "workshop", "deadletter"];

// ===== 2. Which department each request goes to =====
const DEPARTMENT = {
  get:      "archives",
  post:     "parcels",
  delete:   "shredder",
  cgi:      "workshop",
  notfound: "deadletter"
};

// ===== The real request for each button =====
const REQUESTS = {
  get:      { method: "GET",    url: "/about.html" },
  post:     { method: "POST",   url: "/uploads" },
  delete:   { method: "DELETE", url: "/uploads/letter.txt" },
  cgi:      { method: "GET",    url: "/cgi-bin/hello.py" },
  notfound: { method: "GET",    url: "/nowhere" }
};

// ===== The word on the postmark for each status code =====
const POSTMARK = {
  200: "DELIVERED",
  201: "RECEIVED",
  204: "SHREDDED",
  400: "UNREADABLE",
  403: "NO ENTRY",
  404: "ADDRESS UNKNOWN",
  405: "WRONG COUNTER",
  413: "TOO HEAVY",
  500: "POST OFFICE ON FIRE",
  501: "NOT DONE HERE"
};

let chosen = "get";
let timer = null;
let count = 0;
let answer = null;    // the server's answer, kept until the postcard shows it
const SPEED = 900;   // time between two rooms, in milliseconds

// ===== 3. Helpers =====
function findRoom(name) {
  return document.querySelector('.room[data-room="' + name + '"]');
}

function addTracking(room) {
  const seconds = (count * SPEED / 1000).toFixed(1);   // 0.0, 1.2, 2.4 ...
  count = count + 1;

  const li = document.createElement("li");
  li.innerHTML =
    '<span class="t-time">+' + seconds + 's</span>' +
    '<span class="t-room">' + room.querySelector("h3").textContent + '</span>' +
    '<span class="t-code">' + room.querySelector(".room-code").textContent + '</span>';
  document.getElementById("tracking-list").appendChild(li);
}

function showPostcard() {
  const req = REQUESTS[chosen];
  let code = "???";
  let server = "no answer";

  if (answer) {                                    // did the server answer?
    code = answer.status;                          // e.g. 404
    server = answer.headers.get("Server") || "unknown";
  }

  document.getElementById("postmark-code").textContent = code;
  document.getElementById("postmark-word").textContent = POSTMARK[code] || "RETURNED";
  if (req.method === "DELETE" && code === 200) {
    document.getElementById("postmark-word").textContent = "SHREDDED";
  }
  document.getElementById("postcard-lines").textContent =
    "HTTP/1.1 " + code + "\n" +
    "Server: " + server + "\n" +
    "To: the visitor\n" +
    "Re: " + req.method + " " + req.url;

   document.getElementById("postcard").classList.add("show");
}

function resetRooms() {
  clearInterval(timer);
  document.querySelectorAll(".room").forEach(function (room) {
    room.classList.remove("active", "passed", "dim");
  });
}

// ===== 4. Picking a request =====
const pickButtons = document.querySelectorAll(".pick");

pickButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    pickButtons.forEach(function (b) { b.classList.remove("selected"); });
    button.classList.add("selected");
    chosen = button.dataset.kind;
    resetRooms();
  });
});

// ===== 5. Send the letter! =====
document.getElementById("send").addEventListener("click", function () {
  resetRooms();
  document.getElementById("tracking-list").innerHTML = "";
  document.getElementById("tracking-empty").style.display = "none";
  count = 0;
  answer = null;
  const req = REQUESTS[chosen];
  let body = null;
  if (req.method === "POST") {                 // POST needs something to upload
    body = new FormData();
    body.append("file", new Blob(["a letter from the home page"]), "letter.txt");
  }
  fetch(req.url, { method: req.method, body: body })
    .then(function (response) { answer = response; })    // keep the answer
    .catch(function () { answer = null; });              // server down → no answer

  const target = DEPARTMENT[chosen];

  // the route: always the same, only the department changes
  const route = ["mailbox", "desk", "opening", "sorting", target, "stamping", "carrier"];

  // fade the departments that are NOT on the route
  DEPARTMENTS.forEach(function (name) {
    if (name !== target) findRoom(name).classList.add("dim");
  });

  let step = 0;

  timer = setInterval(function () {
    // the room the envelope just left stays red ("passed")
    if (step > 0) {
      const previous = findRoom(route[step - 1]);
      previous.classList.remove("active");
      previous.classList.add("passed");
    }

    // journey finished?
    if (step >= route.length) {
      clearInterval(timer);
      showPostcard();
      return;
    }

    // move the envelope into the next room
    const room = findRoom(route[step]);
    room.classList.add("active");
    room.appendChild(document.getElementById("envelope"));
    addTracking(room);

    step = step + 1;
  }, SPEED);
});