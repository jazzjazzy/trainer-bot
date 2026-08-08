import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "bfs-dfs-basics",
  title: "Trees, Graphs, BFS and DFS Basics",
  part: "Live Coding & Take-Homes",
  estMinutes: 13,
  summary:
    "Represent a graph as Map<string, string[]>, traverse it with BFS (a queue, for shortest hops) or DFS (recursion or a stack, for reachability), and always guard with a visited Set — the same recursion you've used walking PHP category trees.",

  concept: `
The graph knowledge that covers screen-level questions is small and worth
owning cold: **represent** the graph, **traverse** it with BFS or DFS, and
**never revisit a node** (a \`visited\` \`Set\`). Trees are just graphs with no
cycles and one parent per node, so the same machinery handles both. And you've
walked these structures for 25 years — nested category trees, threaded
comments, directory listings — a graph traversal is that same recursive shape,
just with a guard against cycles.

### Representation: the adjacency list

Store the graph as \`Map<string, string[]>\` — each node mapped to its
neighbours. That's an associative array of arrays, exactly \`$graph[$node] =
[...]\` in PHP:

\`\`\`ts
const graph = new Map<string, string[]>([
  ["a", ["b", "c"]],
  ["b", ["a", "d"]],
]);
\`\`\`

For a grid problem (islands, mazes) the "graph" is implicit: a cell's
neighbours are the up/down/left/right cells that are in bounds. You don't build
the Map — you compute neighbours on the fly.

### BFS: a queue, explored level by level

Breadth-first search uses a **queue** (an array with \`push\`/\`shift\`) and fans
out one ring at a time. The first time BFS reaches a node, it did so by the
**fewest hops** — which is why BFS is the answer to **"shortest path in an
unweighted graph"** and anything "level by level". Mark a node visited **when
you enqueue it**, not when you dequeue it, or the same node gets queued several
times over.

### DFS: recursion or an explicit stack

Depth-first search dives as far as it can before backtracking. Written
recursively it's tiny — visit, then recurse into each unvisited neighbour —
and it's the natural fit for **reachability**, **counting connected components**
("number of islands"), cycle detection, and any exhaustive "explore every path"
question. If recursion depth is a worry (a very deep graph can overflow the
call stack), swap the call stack for an explicit array used as a stack — same
traversal, heap memory instead.

### The visited Set is not optional

Any real graph can have cycles, and a traversal without a \`visited\` guard
loops forever: a → b → a → b … So the rule is unconditional — mark nodes
visited and skip anything already marked. In DFS, check the base case
(\`if (visited.has(node)) return\`) **first**, before doing any work. Trees are
the one case you can sometimes skip it, because they have no cycles — but
adding it costs nothing and saves you when the "tree" turns out to have a stray
back edge.

### BFS or DFS? The sentence to say

Interviewers want the choice justified out loud: **unweighted shortest path or
level-order → BFS; existence, exhaustive enumeration, or backtracking → DFS;
either works for a plain "visit everything", and both are O(V + E).** Weighted
shortest path is neither — that's Dijkstra, out of scope for most screens but
worth naming so they know you know the boundary.
`,

  comparisons: [
    {
      label: "Traversal without vs with a visited Set",
      intro:
        "Collect every node reachable from a start node in a graph that has cycles. The left forgets to track visited nodes and never terminates; the right marks on enqueue.",
      php: `// BFS with NO visited set - loops forever on a cycle
function reachable(start: string, graph: Map<string, string[]>): string[] {
  const queue = [start];
  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const nb of graph.get(node) ?? []) {
      queue.push(nb); // a -> b -> a -> b -> ... never ends
    }
  }
  return order;
}`,
      ts: `// BFS with a visited Set - each node enqueued once
function reachable(start: string, graph: Map<string, string[]>): string[] {
  const visited = new Set<string>([start]);
  const queue = [start];
  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const nb of graph.get(node) ?? []) {
      if (!visited.has(nb)) {
        visited.add(nb); // mark on ENQUEUE, never revisit
        queue.push(nb);
      }
    }
  }
  return order;
}`,
      note:
        "Marking visited on enqueue (not on dequeue) guarantees a node enters the queue at most once — that both terminates the traversal and keeps it O(V + E).",
    },
    {
      label: "DFS: unguarded recursion vs base-case-first",
      intro:
        "Count how many nodes are reachable from a start node. The left recurses before checking anything and overflows the stack on a cycle; the right puts the base case first.",
      php: `// recurse before checking - blows the stack on any cycle
function countReachable(node: string, graph: Map<string, string[]>): number {
  let count = 1;
  for (const nb of graph.get(node) ?? []) {
    count += countReachable(nb, graph); // no visited, no base case
  }
  return count; // a cycle -> infinite recursion -> stack overflow
}`,
      ts: `// base case FIRST, visited Set guards cycles and double-counts
function countReachable(
  node: string,
  graph: Map<string, string[]>,
  visited = new Set<string>(),
): number {
  if (visited.has(node)) return 0; // base case before any work
  visited.add(node);
  let count = 1;
  for (const nb of graph.get(node) ?? []) {
    count += countReachable(nb, graph, visited);
  }
  return count;
}`,
      note:
        "The visited check as the first line does double duty: it terminates cycles and stops a node being counted twice when several neighbours point at it.",
    },
    {
      label: "Choosing the traversal, said aloud",
      intro:
        "The same graph question can want BFS or DFS. One candidate uses a single hammer; the other picks from what's asked — the reasoning an interviewer is actually grading.",
      php: `// Weak: one hammer for every graph question
//
// "I'll just use DFS with recursion for all of it -
//  reachability, shortest path, level order, whatever.
//  It's a graph, I traverse it, done."`,
      ts: `// Strong: pick the traversal from what's asked
//
// "Shortest path in an UNWEIGHTED graph, or anything
//  'level by level'? BFS - the first time I reach a node
//  is by a shortest hop count. Just need to know if a node
//  is reachable, or want to enumerate / backtrack (islands,
//  permutations)? DFS - recursion or an explicit stack.
//  Both need a visited Set; both are O(V + E). Weighted
//  shortest path is neither - that's Dijkstra."`,
      note:
        "Naming the decision rule — and its boundary (weighted → Dijkstra) — is the senior signal. The choice, stated in one sentence, is worth more than the code.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A small friend graph as an adjacency list. Predict the BFS level order from 'ana' (who's 1 hop away, 2 hops, …) and the two reachability answers, then run it. Note 'finn' and 'gil' are a separate component.",
    code: `// Adjacency list: who is directly connected to whom.
const friends = new Map<string, string[]>([
  ["ana",  ["ben", "cy"]],
  ["ben",  ["ana", "dee"]],
  ["cy",   ["ana", "dee"]],
  ["dee",  ["ben", "cy", "eve"]],
  ["eve",  ["dee"]],
  ["finn", ["gil"]],   // separate component
  ["gil",  ["finn"]],
]);

// BFS: shortest number of hops, explored one ring at a time.
function bfsLevels(start: string): void {
  const visited = new Set<string>([start]);
  let frontier = [start];
  let level = 0;
  while (frontier.length > 0) {
    console.log(\`  level \${level}: \${frontier.join(", ")}\`);
    const next: string[] = [];
    for (const person of frontier) {
      for (const friend of friends.get(person) ?? []) {
        if (!visited.has(friend)) {
          visited.add(friend); // mark on enqueue
          next.push(friend);
        }
      }
    }
    frontier = next;
    level++;
  }
}

console.log("BFS friend levels from 'ana':");
bfsLevels("ana");

// DFS: can we reach 'goal' from 'start'? Recursion + a visited Set.
function canReach(start: string, goal: string): boolean {
  const visited = new Set<string>();
  function dfs(person: string): boolean {
    if (person === goal) return true; // base case first
    visited.add(person);
    for (const friend of friends.get(person) ?? []) {
      if (!visited.has(friend) && dfs(friend)) return true;
    }
    return false;
  }
  return dfs(start);
}

console.log("\\nDFS reachability:");
console.log("  ana -> eve?", canReach("ana", "eve"));
console.log("  ana -> finn?", canReach("ana", "finn"));
`,
  },

  keyPoints: [
    "Screen-level graph work needs three things: represent it (Map<string, string[]> adjacency list — PHP's $graph[$node] = [...]), traverse with BFS or DFS, and guard with a visited Set.",
    "BFS uses a queue and explores level by level, so the first time it reaches a node is by the fewest hops — it's the answer to unweighted shortest path and level-order questions.",
    "Mark a node visited when you ENQUEUE it in BFS, not when you dequeue, or the same node gets added to the queue multiple times.",
    "DFS (recursion or an explicit stack) dives deep and backtracks — the natural fit for reachability, counting connected components / islands, and exhaustive path search.",
    "A visited Set is mandatory on any graph with cycles; in DFS put the 'already visited?' check as the first line — the same recursive shape as walking a PHP category tree, plus a cycle guard.",
    "Say the choice aloud: unweighted shortest path or level-order → BFS; existence / exhaustive / backtracking → DFS; both O(V + E); weighted shortest path is Dijkstra, not either.",
  ],

  interview: [
    {
      q: "When do you use BFS versus DFS?",
      a: "I pick from what the question asks. If it's a shortest path in an unweighted graph, or anything 'level by level', I use BFS, because the first time a queue-based search reaches a node it's via the fewest hops. If it's about existence — can I reach X, is there a cycle — or exhaustive enumeration like counting islands or generating combinations, I use DFS, usually recursive. For a plain 'visit everything', either works and both are O(V + E). And I'd flag the boundary: weighted shortest path isn't either of these — that's Dijkstra.",
    },
    {
      q: "Why does BFS find the shortest path in an unweighted graph, and why mark visited on enqueue?",
      a: "BFS explores in rings: all nodes one hop away, then two hops, and so on. Because every edge counts as one, the first time you reach a node you've done so in the minimum number of hops — no later, longer path can beat it. I mark a node visited the moment I enqueue it, not when I dequeue it, because otherwise several neighbours can each add the same node to the queue before it's processed, which wastes work and can corrupt a distance or level count. Marking on enqueue guarantees each node enters the queue exactly once.",
    },
    {
      q: "A recursive DFS on a large graph is throwing a stack overflow. What's happening and how do you fix it?",
      a: "Two possibilities. The common one is a missing or misplaced visited check: if I recurse into neighbours without first returning on an already-visited node, a cycle makes the recursion never terminate. The base case has to be the first line — if visited has the node, return. The other possibility is a genuinely deep but acyclic graph that exceeds the call-stack depth even when the logic is correct; there I convert the recursion to an explicit stack — an array I push and pop — so the frontier lives on the heap instead of the call stack. Same traversal, no stack-depth limit.",
    },
  ],

  quiz: [
    {
      question: "Which problem is BFS the natural choice for?",
      options: [
        "Counting the number of connected components",
        "Shortest path in an unweighted graph",
        "Detecting whether any cycle exists",
        "Generating all permutations of a set",
      ],
      answerIndex: 1,
      explain:
        "BFS fans out in rings, so the first time it reaches a node is by the fewest hops — exactly what unweighted shortest path needs. Counting components, cycle detection, and enumerating permutations are all more natural with DFS.",
    },
    {
      question: "In BFS, when should you mark a node as visited?",
      options: [
        "When you dequeue it for processing",
        "When you enqueue it",
        "After you've processed all of its neighbours",
        "Only if the node has no unvisited neighbours",
      ],
      answerIndex: 1,
      explain:
        "Marking on enqueue guarantees each node is added to the queue at most once. Marking on dequeue lets multiple neighbours enqueue the same node first, wasting work and potentially inflating level/distance bookkeeping.",
    },
    {
      question:
        "What is the mandatory guard in any graph traversal that might contain cycles?",
      options: [
        "Sorting the nodes before traversing",
        "A visited Set, checked before you revisit a node",
        "Capping recursion depth at a fixed number",
        "Always choosing BFS over DFS",
      ],
      answerIndex: 1,
      explain:
        "Without tracking visited nodes, a cycle sends the traversal round forever (a → b → a → …). A visited Set — checked first in DFS, and updated on enqueue in BFS — makes every node processed exactly once and keeps the traversal O(V + E).",
    },
    {
      question:
        "How do you typically represent a graph for these problems, and what's the PHP analogue?",
      options: [
        "A single flat array of edges; PHP's list()",
        "An adjacency list Map<string, string[]>; PHP's $graph[$node] = [neighbours]",
        "A cryptographic hash of each node; PHP's hash()",
        "A linked list of every node; PHP's SplDoublyLinkedList",
      ],
      answerIndex: 1,
      explain:
        "The adjacency list — each node mapped to its neighbour list — is the go-to for the sparse graphs in screen questions, and it's literally an associative array of arrays in PHP. An adjacency matrix also exists but wastes space on sparse graphs.",
    },
  ],
};

export default lesson;
