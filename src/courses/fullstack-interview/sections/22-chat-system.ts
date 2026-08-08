import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "chat-system",
  title: "Design a Chat System",
  part: "The Classic Questions",
  estMinutes: 13,
  summary:
    "Real-time messaging turns on the transport choice (WebSockets over polling), per-conversation sequence ordering, and the fact that connection servers are stateful — so you need a user-to-server registry and cross-server delivery over pub/sub.",

  concept: `
"Design WhatsApp / Slack / Messenger" tests whether you can reason about
**long-lived connections** — a server model that a request-per-page PHP
background makes worth calling out explicitly. In classic LAMP, a request
comes in, you render, you're done; nothing is held open. Chat inverts that:
the server keeps a socket open per user for minutes or hours. Naming that shift
out loud — "this changes the server from stateless request handlers to stateful
connection holders" — is senior signal, not a gap.

### Requirements

- **1:1 and group** messaging.
- **Delivery states:** sent, delivered, read.
- **Presence:** who is online.
- **History:** messages persist and sync to new devices.

### The transport decision

- **Polling** ("any new messages?" every 2s) is simple but wrong at scale:
  latency up to the poll interval, and N idle users still hammer the server
  with empty requests.
- **WebSockets** hold one bidirectional connection so the server can *push* the
  instant a message arrives — low latency, no busy-work. The cost is that the
  connection is **stateful**, which drives the rest of the design.

### Data model

- \`messages(conversation_id, seq, sender_id, body, created_at)\` — keyed by
  **conversation + a per-conversation sequence number**, not wall-clock time.
- \`conversations\` and \`conversation_members\`.
- **Per-device sync cursors:** the last \`seq\` each device has seen, so a
  reconnecting device asks "everything after seq N" and catches up exactly.

### Ordering: sequence numbers beat timestamps

Two messages can share a millisecond, and clocks on different servers drift, so
wall-clock \`created_at\` can't totally order a conversation. Assign a
**monotonic per-conversation sequence** at the owning partition; clients render
strictly by \`seq\`. Timestamps are for display, sequence is for order.

### Scale: connection servers are stateful

Because a socket lives on **one** connection server, you can't just load-balance
statelessly. You need:

- A **registry** mapping \`user -> connection server\` (e.g. in Redis), updated
  on connect/disconnect.
- **Cross-server delivery:** when alice on server A messages bob on server B,
  A publishes to a **pub/sub** channel and B — subscribed on bob's behalf —
  pushes down bob's socket. This is the associative-array-of-connections idea
  scaled across machines.

### Offline delivery

If the recipient has no live socket, **store** the message (it's already
persisted) and **push on reconnect** using their device's sync cursor — plus a
mobile push notification. Delivery is "store, then deliver when reachable",
never "fire and hope".
`,

  comparisons: [
    {
      label: "Transport: 2-second polling vs WebSocket + pub/sub",
      intro:
        "Two designs for delivering a message from one user to another. The weak one polls a database on a timer; the strong one pushes over a held connection and routes across servers with pub/sub.",
      php: `# WEAK: short-polling
client:
  loop:
    - every 2s: GET /messages?since=:cursor   # even when idle
server:
  handler: stateless
  reads: SELECT ... WHERE seq > :cursor
problems:
  latency: up to 2s per message
  load: N idle clients = N/2 queries per second doing nothing
  presence: no real signal — only "polled recently"
  typing_indicators: effectively impossible`,
      ts: `# STRONG: WebSocket connection servers + pub/sub
services:
  gateway: terminates WebSockets, one socket per device
  registry: redis  # user_id -> connection_server_id
  router: pub/sub  # cross-server message fan-out
  store: postgres  # messages(conversation_id, seq, ...)
flow_send:
  - alice's server assigns conv seq, persists message
  - looks up recipients in registry
  - same server: push directly down the socket
  - other server: publish to pub/sub; that server pushes
delivery_offline:
  - no live socket: message already stored
  - on reconnect: client sends last seq; server replays after it
  - also emit a mobile push notification`,
      note:
        "Polling trades latency and wasted load for simplicity; WebSockets push instantly but make the connection stateful, which is exactly why you need a user-to-server registry and pub/sub for cross-server delivery.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
    {
      label: "Ordering: wall-clock timestamps vs per-conversation sequence",
      intro:
        "Order the messages in one conversation. The weak version sorts by created_at; the strong version sorts by a monotonic sequence assigned per conversation.",
      php: `// WEAK: order by wall-clock timestamp
type Msg = { convId: string; senderId: string; body: string; createdAt: number };

function ordered(msgs: Msg[]): Msg[] {
  // Two messages in the same millisecond tie; server clock
  // drift can even invert their true order. Result is not a
  // total order, so the log can render differently per reader.
  return [...msgs].sort((a, b) => a.createdAt - b.createdAt);
}`,
      ts: `// STRONG: monotonic per-conversation sequence
type Msg = { convId: string; seq: number; senderId: string; body: string };

// The conversation's owning partition assigns the next seq
// atomically, so every message has a distinct, monotonic rank.
function ordered(msgs: Msg[]): Msg[] {
  return [...msgs].sort((a, b) => a.seq - b.seq); // total order, stable
}
// Timestamps are still stored — but for display, not ordering.`,
      note:
        "Timestamps collide within a millisecond and drift across servers, so they can't totally order a conversation; a per-conversation sequence gives every message a distinct monotonic rank that every device renders identically.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Two connection servers (cs-1 holds alice, cs-2 holds bob and carol) and a pub/sub router. It sends a 1:1 and a group conversation, printing each routing hop (same-server vs cross-server) and each inbox ordered by per-conversation sequence. Predict which deliveries are cross-server.",
    code: `type UserId = string;
type ServerId = string;

interface Message {
  conv: string;
  seq: number;      // per-conversation sequence, assigned at publish
  from: UserId;
  text: string;
}

// Stateful connection servers, each holding live WebSocket sessions.
class ConnectionServer {
  readonly inboxes = new Map<UserId, Message[]>();
  constructor(readonly id: ServerId, readonly online: Set<UserId>) {}
  deliver(to: UserId, msg: Message): void {
    if (!this.inboxes.has(to)) this.inboxes.set(to, []);
    this.inboxes.get(to)!.push(msg);
    console.log(\`    \${this.id} -> socket(\${to}): \${msg.conv}#\${msg.seq} "\${msg.text}"\`);
  }
}

const cs1 = new ConnectionServer("cs-1", new Set(["alice"]));
const cs2 = new ConnectionServer("cs-2", new Set(["bob", "carol"]));
const servers = [cs1, cs2];

// Registry: which server currently holds each user's connection.
const registry = new Map<UserId, ServerId>();
for (const s of servers) for (const u of s.online) registry.set(u, s.id);
const byId = new Map(servers.map((s) => [s.id, s] as const));

// Conversation membership + per-conversation sequence counters.
const members = new Map<string, UserId[]>([
  ["c:ab", ["alice", "bob"]],
  ["g:abc", ["alice", "bob", "carol"]],
]);
const nextSeq = new Map<string, number>();

// Pub/sub router: fan the message to each recipient's server (a hop).
function send(conv: string, from: UserId, text: string): void {
  const seq = (nextSeq.get(conv) ?? 0) + 1;
  nextSeq.set(conv, seq);
  const msg: Message = { conv, seq, from, text };
  const origin = registry.get(from)!;
  console.log(\`  publish \${conv}#\${seq} from \${from} (on \${origin}): "\${text}"\`);
  for (const u of members.get(conv)!) {
    if (u === from) continue;
    const target = registry.get(u)!;
    const hop = target === origin ? "same-server" : "cross-server via pub/sub";
    console.log(\`    route to \${u} on \${target} [\${hop}]\`);
    byId.get(target)!.deliver(u, msg);
  }
}

console.log("=== 1:1 conversation alice <-> bob ===");
send("c:ab", "alice", "morning");
send("c:ab", "bob", "hey");
send("c:ab", "alice", "standup at 10?");

console.log("\\n=== group g:abc (alice, bob, carol) ===");
send("g:abc", "carol", "shipping today");
send("g:abc", "alice", "nice");

console.log("\\n=== each inbox, ordered by per-conversation seq ===");
for (const s of servers) {
  for (const [user, msgs] of s.inboxes) {
    const ordered = [...msgs].sort((a, b) =>
      a.conv === b.conv ? a.seq - b.seq : a.conv.localeCompare(b.conv),
    );
    const line = ordered.map((m) => \`\${m.conv}#\${m.seq}:\${m.text}\`).join(" | ");
    console.log(\`  \${user}@\${s.id}: \${line}\`);
  }
}`,
  },

  keyPoints: [
    "Chat replaces stateless request handling with stateful long-lived connections — naming that shift from a request-per-page background is a strength move, not a confession.",
    "Prefer WebSockets over polling: the server pushes instantly instead of N idle clients polling on a timer, which is high latency and wasted load.",
    "Model messages as (conversation_id, seq, ...) and order by a monotonic per-conversation sequence — timestamps collide within a millisecond and drift across clocks.",
    "Connection servers are stateful, so you need a registry mapping user -> connection server, updated on connect/disconnect.",
    "Cross-server delivery uses pub/sub: the sender's server publishes; the recipient's server, subscribed on their behalf, pushes down the socket.",
    "Offline delivery is store-then-push: the message is already persisted, so on reconnect the device replays everything after its last-seen seq, plus a mobile push notification.",
  ],

  interview: [
    {
      q: "Why WebSockets over polling for a chat system, and what does that choice cost you architecturally?",
      a: "Polling every couple of seconds means each message waits up to the poll interval and every idle client keeps querying for nothing — latency and wasted load that both get worse with scale. A WebSocket holds one bidirectional connection so the server pushes the instant a message lands: low latency, no busy-work, and it makes presence and typing indicators natural. The cost is that the connection is stateful — it lives on one specific server. I'm coming from a request-per-page PHP world where nothing is held open, so I'd call that shift out explicitly: it means I now need a registry mapping each user to their connection server and a way to route messages between servers, which is the real design work.",
    },
    {
      q: "Why order messages by a per-conversation sequence number instead of a timestamp?",
      a: "Because a timestamp doesn't give a total order. Two messages can land in the same millisecond, and different servers' clocks drift, so sorting by created_at can render a conversation differently for different readers — the classic 'their reply appears above my question' bug. Instead I assign a monotonic sequence number per conversation at the owning partition, so every message has a distinct, increasing rank that all devices sort by identically. Timestamps still get stored, but for display, not for ordering. The per-device sync cursor is just the last seq that device has acknowledged.",
    },
    {
      q: "A user on server A sends to a user connected to server B. Walk me through delivery, including if B's user is offline.",
      a: "A assigns the conversation's next sequence number, persists the message, then looks up the recipient in the registry — the user-to-server map, typically in Redis. If the recipient is on A, A pushes straight down their socket. If they're on B, A publishes to a pub/sub channel; B is subscribed on that user's behalf and pushes it down their socket. If the recipient has no live connection, I don't lose the message — it's already persisted, so I store the delivery and, on reconnect, the device sends its last-seen sequence and I replay everything after it, plus I fire a mobile push notification so they know. Delivery is always store-then-deliver-when-reachable, never fire-and-forget.",
    },
  ],

  quiz: [
    {
      question: "Why are WebSocket connection servers described as 'stateful', and what does that force into the design?",
      options: [
        "They cache database rows, so you need a bigger cache",
        "Each user's live socket lives on one specific server, so you need a user-to-server registry and cross-server routing",
        "They store passwords in memory, so you need encryption",
        "They cannot be restarted, so you need a backup server",
      ],
      answerIndex: 1,
      explain:
        "A held WebSocket lives on exactly one connection server, so you can't route to a user statelessly. You need a registry mapping user -> server (updated on connect/disconnect) and pub/sub to deliver a message to whichever server holds the recipient.",
    },
    {
      question: "Why order a conversation by a per-conversation sequence number rather than created_at?",
      options: [
        "Timestamps take more storage than integers",
        "Sequence numbers are encrypted and timestamps are not",
        "Timestamps can collide within a millisecond and drift across clocks, so they don't give a total order",
        "created_at cannot be indexed",
      ],
      answerIndex: 2,
      explain:
        "Wall-clock time isn't a reliable total order: two messages can share a millisecond and server clocks drift. A monotonic per-conversation sequence gives every message a distinct rank that all devices render identically; timestamps remain for display.",
    },
    {
      question: "In this design, how is a message delivered to a recipient connected to a different server?",
      options: [
        "The sender opens a direct socket to the recipient's device",
        "The sender's server writes to the DB and the recipient polls it",
        "The sender's server publishes to pub/sub; the recipient's server pushes it down the socket",
        "The load balancer copies the connection to every server",
      ],
      answerIndex: 2,
      explain:
        "Since connections are stateful, the sender's server looks up the recipient in the registry and publishes to a pub/sub channel; the server holding the recipient's socket is subscribed and pushes the message down that socket.",
    },
  ],
};

export default lesson;
