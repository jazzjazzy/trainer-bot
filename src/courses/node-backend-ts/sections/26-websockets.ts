import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "websockets",
  title: "WebSockets: What the Long-Lived Process Unlocks",
  part: "Scaling & Shipping",
  estMinutes: 10,
  summary:
    "WebSockets need a process that holds thousands of open connections for hours — structurally impossible in classic PHP-FPM, and exactly what Node's event loop was built for.",

  concept: `
This is the payoff section for the whole runtime story. A WebSocket is a TCP
connection that stays open for **hours** — the server can push a message the
instant something happens, no request required. Now run that through the
PHP-FPM math: each connection would pin an entire FPM worker for its whole
lifetime. With \`pm.max_children = 20\`, your twenty-first chat user takes the
site down. That's why real-time PHP always meant either polling or escaping
FPM entirely (Ratchet, Swoole, ReactPHP — all of which are "run PHP as a
long-lived event loop", i.e. reinventing Node's model).

In Node, ten thousand idle sockets are just ten thousand entries in a Set.
The event loop only wakes when one of them actually has data. No workers are
consumed by waiting — waiting is the event loop's natural state.

### The upgrade handshake

A WebSocket starts life as a plain HTTP GET with \`Upgrade: websocket\`
headers. The server answers \`101 Switching Protocols\`, and from then on the
same TCP connection is a persistent, two-way message channel. The \`ws\`
library attaches to the HTTP server you already have, so both protocols share
one port:

\`\`\`ts
// src/server.ts
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { app } from "./app.js";       // your Express app

const server = createServer(app);      // HTTP requests → Express
const wss = new WebSocketServer({ server }); // upgrades → ws

wss.on("connection", (ws, req) => {
  ws.on("message", (data) => { /* client → server */ });
  ws.on("close", () => { /* cleanup */ });
  ws.on("error", console.error);
});

server.listen(3000);
\`\`\`

### Broadcast: module state as a feature

\`wss.clients\` is a live \`Set\` of every open socket **in this process** —
module-level state persisting across requests, the exact thing PHP never had.
A minimal chat broadcast is a loop:

\`\`\`ts
ws.on("message", (data) => {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data.toString());
  }
});
\`\`\`

### Heartbeat: dead sockets don't say goodbye

A laptop lid closing or wifi dropping never sends a close frame — the socket
looks open forever and leaks memory. The standard fix: periodically \`ping()\`
every client and \`terminate()\` any that didn't answer the previous ping with
a \`pong\`. Track it with an \`isAlive\` flag flipped by the \`pong\` listener
and swept by a \`setInterval\` — the pattern straight from the ws README.

### The scaling footnote

\`wss.clients\` only knows **this process's** sockets. Run two instances
behind a load balancer and a broadcast from instance A never reaches clients
on instance B — the same processes-share-nothing rule as any other scaling.
The fix is to externalize the fan-out: publish messages to Redis pub/sub and
have every instance relay to its own local clients. Socket.IO is the
batteries-included layer over raw sockets (rooms, auto-reconnect, fallbacks,
a ready-made Redis adapter). And if you only need one-way server→client push
(live dashboards, notifications), Server-Sent Events do it over plain HTTP
with automatic reconnect and far less machinery.
`,

  comparisons: [
    {
      label: "Polling endpoint vs server push",
      intro:
        "A chat needs new messages to reach clients quickly. The classic PHP answer: clients ask over and over. The socket answer: the server tells them.",
      php: `<?php // public/poll.php
// Client JS: setInterval(() => fetch('/poll.php?since=' + last), 3000)
$since = (int) ($_GET['since'] ?? 0);
$pdo = new PDO(getenv('DSN'));
$stmt = $pdo->prepare(
    'SELECT id, author, body FROM messages WHERE id > ? ORDER BY id'
);
$stmt->execute([$since]);
header('Content-Type: application/json');
echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
// A FULL request cycle per poll — bootstrap, connect, query —
// even when the answer is "nothing new".
// 1,000 idle users at 3s intervals = 333 req/s of mostly nothing.`,
      ts: `// src/chat.ts — push: the server sends WHEN something happens
import WebSocket, { WebSocketServer } from "ws";
import { server } from "./server.js";

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    // one incoming message fans out instantly — zero polling
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data.toString());
      }
    }
  });
});
// 1,000 idle users = 1,000 quiet sockets in a Set. No traffic at all
// until someone actually types.`,
      note: "Polling pays a full request cycle per client per interval to usually learn nothing; a socket costs a little memory and transmits only when there is something to say.",
    },
    {
      label: "Long-polling a worker vs a connection lifecycle",
      intro:
        "Long-polling was PHP's best approximation of push: hold the request open until data arrives. Watch what each version does to server capacity.",
      php: `<?php // long-poll.php — hold the request open until data or timeout
$since = (int) ($_GET['since'] ?? 0);
$deadline = time() + 25;
while (time() < $deadline) {
    $rows = fetchNewerThan($since);   // repo helper
    if ($rows !== []) {
        echo json_encode($rows);
        exit;                          // worker finally freed
    }
    sleep(1); // this FPM worker is PINNED for up to 25s doing nothing
}
echo '[]';
// pm.max_children = 20 → twenty waiting clients saturate
// the entire pool. User 21 gets a spinner.`,
      ts: `// One connection object lives for the whole session
wss.on("connection", (ws, req) => {
  const user = authenticate(req.headers.cookie); // once, at upgrade

  ws.on("message", (data) => {
    // arrives any time: no new request, no re-auth, no re-bootstrap
    broadcast(\`\${user.name}: \${data.toString()}\`);
  });

  ws.on("close", () => {
    broadcast(\`\${user.name} left\`);
  });
});
// Idle sockets cost memory, not workers. The event loop only
// wakes for sockets that actually have data.`,
      note: "Long-polling converts 'waiting' into a consumed FPM worker; a WebSocket converts it into an idle file descriptor the event loop ignores until it speaks.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A broadcast hub in miniature — a Set of fake clients standing in for wss.clients, plus the ws heartbeat pattern. Carol's wifi dies without a close frame: predict which sweep removes her and who receives the final broadcast, then run it.",
    code: `// A broadcast hub in miniature: what wss.clients plus a heartbeat actually do.

interface FakeClient {
  id: string;
  isAlive: boolean;
  send(msg: string): void;
}

const clients = new Set<FakeClient>();

function connect(id: string): FakeClient {
  const client: FakeClient = {
    id,
    isAlive: true,
    send(msg: string) {
      console.log(\`   -> \${id} got: \${msg}\`);
    },
  };
  clients.add(client);
  console.log(\`+ \${id} connected (\${clients.size} online)\`);
  return client;
}

function terminate(client: FakeClient) {
  clients.delete(client);
  console.log(\`- \${client.id} missed pong, terminated (\${clients.size} online)\`);
}

function broadcast(from: string, text: string) {
  console.log(\`broadcast from \${from}: "\${text}"\`);
  for (const client of clients) {
    client.send(\`\${from}: \${text}\`);
  }
}

// The ws heartbeat pattern: whoever never answered the PREVIOUS ping
// is dead — terminate. Everyone else gets pinged again.
function heartbeatSweep() {
  console.log("heartbeat sweep:");
  for (const client of clients) {
    if (!client.isAlive) {
      terminate(client);
      continue;
    }
    client.isAlive = false; // a pong will flip it back to true
    console.log(\`   ping -> \${client.id}\`);
  }
}

function pongFrom(client: FakeClient) {
  client.isAlive = true; // the 'pong' listener in real ws code
}

const alice = connect("alice");
const bob = connect("bob");
const carol = connect("carol");

broadcast("alice", "hello everyone");

heartbeatSweep(); // pings all three
pongFrom(alice);
pongFrom(bob);
// carol's wifi died mid-session: no close frame ever arrives, so the
// socket still LOOKS open. Only the missed pong reveals the truth.

heartbeatSweep(); // carol is swept out; alice and bob get pinged again
pongFrom(alice);
pongFrom(bob);

broadcast("bob", "who is still here?");`,
  },

  keyPoints: [
    "A WebSocket connection lasts hours; in PHP-FPM it would pin one worker per connection, so `pm.max_children` becomes your max concurrent users — in Node an idle socket is just a Set entry the event loop ignores.",
    "`new WebSocketServer({ server })` from the `ws` package attaches to your existing `node:http` server, so HTTP and WebSocket traffic share one port; the connection starts as an HTTP GET answered with `101 Switching Protocols`.",
    "The lifecycle is events on one long-lived object: `wss.on('connection')`, then per-socket `message`, `close`, and `error` — auth happens once at upgrade, not per message.",
    "Broadcast = iterate `wss.clients` and `send()` to every socket with `readyState === WebSocket.OPEN` — module-level state across requests, used as a feature.",
    "Dead connections never send a close frame: ping every client on an interval, mark `isAlive = false`, flip it on `pong`, and `terminate()` whoever missed the previous ping.",
    "`wss.clients` only sees this process's sockets — multi-instance broadcast needs Redis pub/sub (Socket.IO ships an adapter); for one-way push, Server-Sent Events are the simpler alternative.",
  ],

  interview: [
    {
      q: "Why are WebSockets natural in Node but effectively impossible in classic PHP-FPM?",
      a: "It comes down to what a connection costs. PHP-FPM allocates a whole worker process per active request, and a WebSocket is a request that never ends — so every connected user permanently consumes a worker, and a pool of 20 workers means 20 concurrent users, total. Node inverts the cost model: one event-loop process holds all the sockets as file descriptors, and an idle socket costs a little memory and zero CPU because the loop only wakes when data arrives. That's why real-time PHP solutions like Ratchet or Swoole all abandon FPM and run PHP as a long-lived event loop — they adopt Node's model. In Node you just attach `new WebSocketServer({ server })` to the HTTP server you already have.",
    },
    {
      q: "How do you detect and clean up dead WebSocket connections?",
      a: "You can't rely on the close event, because an abrupt network drop — wifi dying, a laptop lid closing — never sends a close frame, so the socket looks open indefinitely and leaks memory. The standard pattern is a heartbeat: a `setInterval` walks `wss.clients`, calls `ws.terminate()` on any client whose `isAlive` flag is still false from the last round, then sets `isAlive = false` and sends `ws.ping()` to the rest. Each socket's `pong` listener flips `isAlive` back to true. Live clients answer between sweeps; dead ones get reaped on the next pass. I'd also clear the interval on server close so shutdown stays clean.",
    },
    {
      q: "You scale your chat service to three instances behind a load balancer and users report missing messages. What happened and how do you fix it?",
      a: "Each Node process's `wss.clients` only contains the sockets connected to that process — processes share nothing. A user on instance A broadcasts, and instances B and C never hear about it, so two-thirds of users miss the message. The fix is to externalize the fan-out, same as we externalize sessions: every instance publishes messages to Redis pub/sub and subscribes to the channel, then relays incoming messages to its own local clients. Socket.IO packages exactly this as its Redis adapter, along with rooms and automatic reconnection. It's the same rule as all Node scaling — anything that must be visible across instances cannot live in process memory.",
    },
  ],

  quiz: [
    {
      question:
        "Why can't a classic PHP-FPM setup serve a WebSocket-based chat to thousands of users?",
      options: [
        "PHP cannot parse the WebSocket binary framing protocol",
        "Each open connection would pin one FPM worker for its whole lifetime, so the pool size caps concurrent users",
        "PHP-FPM closes all connections after 30 seconds regardless of configuration",
        "WebSockets require HTTPS, which FPM does not support",
      ],
      answerIndex: 1,
      explain:
        "FPM's unit of concurrency is a worker process that handles one request at a time. A WebSocket is a request that lasts hours, so every connected client permanently consumes a worker — pm.max_children = 20 means user 21 is locked out. Node holds all sockets in one process, where idle connections cost only memory.",
    },
    {
      question: "What problem does the ping/pong heartbeat solve?",
      options: [
        "It keeps the TCP connection from being garbage-collected by V8",
        "It measures latency so you can route users to the nearest server",
        "Abruptly dropped connections never send a close frame, so without pings dead sockets look open forever and leak",
        "It re-authenticates the user on every interval",
      ],
      answerIndex: 2,
      explain:
        "A clean disconnect fires the close event, but a wifi drop or closed laptop lid just goes silent. The server pings on an interval, marks isAlive = false, and terminates any socket that failed to pong since the previous sweep — the pattern recommended by the ws library itself.",
    },
    {
      question:
        "Two Node instances run behind a load balancer. A client on instance A sends a chat message that instance A broadcasts via wss.clients. Who receives it?",
      options: [
        "Every connected client on both instances — the load balancer relays broadcasts",
        "Only clients connected to instance A; instance B's clients never see it without something like Redis pub/sub",
        "Nobody — broadcasts require sticky sessions to work at all",
        "Only clients that joined after the message was sent",
      ],
      answerIndex: 1,
      explain:
        "wss.clients is in-process state: it lists only the sockets this process accepted. Processes share nothing, so cross-instance broadcast must go through an external channel — each instance publishes to Redis pub/sub and relays to its own local sockets (Socket.IO's Redis adapter automates this).",
    },
    {
      question:
        "You need to push live notification counts to browsers — clients never send data back. What's the lightest-weight fit?",
      options: [
        "Server-Sent Events: one-way server-to-client push over plain HTTP with built-in reconnect",
        "WebSockets — they are the only way a server can push",
        "Short polling every 500ms",
        "A long-polling endpoint with a 25-second timeout",
      ],
      answerIndex: 0,
      explain:
        "SSE covers exactly the one-way push case with far less machinery than WebSockets: it is plain HTTP, the browser's EventSource reconnects automatically, and no upgrade handshake or ping/pong protocol is needed. Reach for WebSockets when traffic must flow both directions.",
    },
  ],
};

export default lesson;
