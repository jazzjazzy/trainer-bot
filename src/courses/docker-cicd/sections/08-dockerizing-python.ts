import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "dockerizing-python",
  title: "Dockerizing a Python App",
  part: "Building Images",
  estMinutes: 11,
  summary:
    "The Dockerfile pattern generalises: same skeleton as the Node app with the ecosystem pieces swapped — python:3.12-slim, requirements.txt, pip, a production server as PID 1, and PYTHONUNBUFFERED=1 so logs actually stream.",

  concept: `
One Dockerfile down, and you already know the shape: base image, workdir,
dependency manifests first, install, copy source, define the start command.
Containerising a Python app is the same skeleton with the ecosystem pieces
swapped — which is exactly the point. Docker doesn't care what's inside;
learn the pattern once and you can ship anything.

The app is a tiny FastAPI service:

\`\`\`python
# app.py
from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}
\`\`\`

And its Dockerfile:

\`\`\`bash
# Dockerfile
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
\`\`\`

Line by line, the Python-specific decisions:

### Why \`slim\`, not \`alpine\`

For Node, alpine is the default choice. For Python, prefer
\`python:3.12-slim\` — a stripped-down Debian. The reason is **wheels**:
prebuilt Python packages are compiled against glibc (the "manylinux"
standard), and Alpine uses musl instead. On alpine, \`pip install\` for
anything with C extensions (psycopg2, numpy, cryptography) can't use those
wheels and falls back to compiling from source — which means gcc, headers,
and minutes-long builds, usually erasing alpine's size advantage. Slim keeps
glibc, so wheels just install.

### \`ENV PYTHONUNBUFFERED=1\`

Python buffers stdout when it isn't attached to a terminal — and inside a
container it never is. Without this flag, your \`print()\` and log lines sit
in a buffer and only appear in \`docker logs\` when the buffer fills or the
process exits; a crashed container can die with its last minutes of logs
unwritten. \`PYTHONUNBUFFERED=1\` makes output flush immediately. It's the
same class of surprise as PHP's output buffering — invisible until you're
debugging blind at the worst moment.

### \`pip install --no-cache-dir\`

pip normally keeps downloaded packages in a cache directory for next time.
In an image build there is no next time — the cache would just be dead
weight baked into the layer. \`--no-cache-dir\` skips it and keeps the image
smaller.

### A production server as PID 1

The CMD runs **uvicorn**, a production ASGI server — not \`flask run\` or the
\`python app.py\` dev pattern. Dev servers are single-threaded conveniences
with debuggers attached; the container equivalent of leaving
\`display_errors = On\` in prod. \`--host 0.0.0.0\` matters too: bind to
localhost and the app is unreachable from outside the container, the classic
"it builds but curl gets connection reset" mistake. (For classic WSGI apps —
Flask, Django — the same slot is filled by **gunicorn**.)

### The pattern, made explicit

| Concern | Node | Python |
| --- | --- | --- |
| Base image | node:22-alpine | python:3.12-slim |
| Manifest | package*.json | requirements.txt |
| Install | npm ci | pip install --no-cache-dir |
| Process | node dist/server.js | uvicorn app:app |

Two ecosystems, one shape. In an interview, being able to sketch this table
from memory is worth more than memorising either Dockerfile.
`,

  comparisons: [
    {
      label: "virtualenv + systemd vs the Dockerfile",
      intro:
        "Run the Python API as a managed service. The left is the traditional server recipe — virtualenv, pip, a hand-written systemd unit; the right is the same outcome as eight lines in the repo.",
      php: `# On the server, by hand:
ssh deploy@vps-203
cd /srv/api
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# then hand-write a systemd unit...
sudo nano /etc/systemd/system/api.service
#   ExecStart=/srv/api/.venv/bin/uvicorn app:app --port 8000
sudo systemctl daemon-reload
sudo systemctl enable --now api
# Python version? Whatever the OS shipped. venv path, unit file,
# user, env vars: undocumented server state.`,
      ts: `# Dockerfile — the venv, the unit file, and the runbook in one
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]`,
      note: "The image IS the virtualenv — isolation comes from the container, so there's no venv to activate — and CMD replaces the systemd unit, with Python 3.12 pinned instead of inherited from the OS.",
      rightLang: "bash",
    },
    {
      label: "Node Dockerfile vs Python Dockerfile — one shape",
      intro:
        "The two running examples of this course side by side. Read them as the same five moves: base, workdir, manifests + install, copy source, start command.",
      php: `# Dockerfile (Node/TS API)
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]`,
      ts: `# Dockerfile (Python API)
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]`,
      note: "Only the ecosystem tokens differ: alpine works for Node but Python prefers slim (glibc wheels), package*.json becomes requirements.txt, npm ci becomes pip install, and the compiled-JS build step disappears because Python has nothing to compile.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "Build, run, curl. Predict the transcript — in particular: what PID uvicorn reports (and why), and why the request log line is visible in docker logs immediately rather than minutes later.",
    code: `# Build the image and start a container:
docker build -t pyapi:dev .
docker run -d -p 8000:8000 --name pyapi pyapi:dev

# Hit the health endpoint from the host:
curl -s http://localhost:8000/health

# What has the app logged so far?
docker logs pyapi`,
    output: `$ docker build -t pyapi:dev .
[+] Building 14.2s (11/11) FINISHED
 => [internal] load build definition from Dockerfile                0.0s
 => [internal] load metadata for docker.io/library/python:3.12-slim 0.8s
 => [1/5] FROM docker.io/library/python:3.12-slim@sha256:9b4d63a1   2.6s
 => [2/5] WORKDIR /app                                              0.0s
 => [3/5] COPY requirements.txt ./                                  0.0s
 => [4/5] RUN pip install --no-cache-dir -r requirements.txt        8.9s
 => [5/5] COPY . .                                                  0.1s
 => exporting to image                                              0.3s
 => => naming to docker.io/library/pyapi:dev                        0.0s

$ docker run -d -p 8000:8000 --name pyapi pyapi:dev
e7c41b9d2f30a8c5d16e4f2b9a7c3d80e5f1a2b4c6d8e0f1a3b5c7d9e2f4a6b8

$ curl -s http://localhost:8000/health
{"status":"ok"}

$ docker logs pyapi
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     172.17.0.1:53210 - "GET /health HTTP/1.1" 200 OK

# 'Started server process [1]' — uvicorn is PID 1, thanks to exec-form
# CMD. And every line above is visible IMMEDIATELY because
# PYTHONUNBUFFERED=1 disables stdout buffering; without it, docker logs
# could show nothing until the buffer fills or the process exits.`,
  },

  keyPoints: [
    "Same Dockerfile skeleton as Node, different tokens: `python:3.12-slim`, `requirements.txt`, `pip install --no-cache-dir`, and a server command as CMD.",
    "Prefer `slim` (Debian, glibc) over `alpine` for Python: manylinux wheels are built against glibc, so on musl-based Alpine, pip often compiles C extensions from source — slow builds and a bigger toolchain.",
    "`ENV PYTHONUNBUFFERED=1` disables stdout buffering so print/log output reaches `docker logs` immediately — without it a crashing container can die with its logs still in the buffer.",
    "`pip install --no-cache-dir` keeps pip's download cache out of the image layer.",
    "Run a production server (uvicorn for ASGI, gunicorn for WSGI) as PID 1 — never `flask run` or the dev server — and bind `--host 0.0.0.0`, or the app is unreachable from outside the container.",
    "No venv needed in the image: the container itself is the isolation.",
  ],

  interview: [
    {
      q: "How would you containerise a Python web app, and what differs from a Node app?",
      a: "Structurally, nothing differs — that's the strength of the pattern. Base image, WORKDIR, copy the dependency manifest first, install, copy source, exec-form CMD. The Python specifics: I use `python:3.12-slim` rather than alpine because prebuilt wheels target glibc and Alpine's musl forces source compilation of C extensions; I set `PYTHONUNBUFFERED=1` so logs stream to `docker logs` in real time; I install with `pip install --no-cache-dir` to keep pip's cache out of the layer; and CMD runs a production server — uvicorn for FastAPI, gunicorn for Flask or Django — bound to 0.0.0.0. Also no virtualenv: the container is the isolation boundary, so a venv inside it is redundant.",
    },
    {
      q: "Why choose python:3.12-slim over python:3.12-alpine when alpine images are smaller?",
      a: "Because of wheels. The Python packaging ecosystem publishes prebuilt binary wheels compiled against glibc — the manylinux standard. Alpine uses musl libc, so pip can't use most of those wheels and falls back to building packages like psycopg2, numpy, or cryptography from source. That means installing gcc and headers, multi-minute builds, and often a final image no smaller than slim once the toolchain is in there. Slim is a minimal Debian that keeps glibc, so wheels install in seconds. Alpine is a great default for Node and Go; for Python, slim is the pragmatic choice.",
    },
    {
      q: "A Python container crashes in production and docker logs shows nothing useful from the final minutes. What's the likely cause?",
      a: "Classic stdout buffering. Python buffers standard output when it's not attached to a TTY — which it never is in a container — so print and logging output accumulates in an in-process buffer that only flushes when full or at clean exit. A crash or SIGKILL loses everything still buffered, which is precisely the output you needed. The fix is `ENV PYTHONUNBUFFERED=1` in the Dockerfile (or running python with `-u`), which forces unbuffered streams so every line reaches the container's stdout — and therefore `docker logs` — immediately.",
    },
  ],

  quiz: [
    {
      question: "Why does the Dockerfile set `ENV PYTHONUNBUFFERED=1`?",
      options: [
        "It makes Python start faster by skipping bytecode caching",
        "It stops Python buffering stdout, so logs appear in docker logs immediately instead of being lost on a crash",
        "It's required for uvicorn to bind to 0.0.0.0",
        "It reduces the image size by disabling pip's cache",
      ],
      answerIndex: 1,
      explain:
        "Inside a container stdout isn't a TTY, so Python buffers it. Buffered lines only flush when the buffer fills or the process exits cleanly — a crash loses them. PYTHONUNBUFFERED=1 forces immediate flushing.",
    },
    {
      question: "Why is python:3.12-slim usually a better base than python:3.12-alpine?",
      options: [
        "Slim images are smaller than alpine images",
        "Alpine doesn't include a Python interpreter",
        "Alpine's musl libc can't use most prebuilt (manylinux/glibc) wheels, so pip compiles C extensions from source",
        "Slim includes gunicorn and uvicorn preinstalled",
      ],
      answerIndex: 2,
      explain:
        "Prebuilt wheels target glibc. On musl-based Alpine, pip falls back to source builds for packages with C extensions — needing compilers, taking minutes, and typically erasing the size advantage. Slim keeps glibc so wheels just work.",
    },
    {
      question:
        "The container builds and starts, uvicorn logs 'running on http://127.0.0.1:8000', but `curl localhost:8000` from the host fails despite `-p 8000:8000`. Why?",
      options: [
        "The EXPOSE 8000 instruction is missing",
        "The server is bound to 127.0.0.1 inside the container, so the port mapping has nothing reachable to forward to",
        "PYTHONUNBUFFERED=1 wasn't set",
        "curl can't reach containers; you must use docker exec",
      ],
      answerIndex: 1,
      explain:
        "Port publishing forwards host traffic to the container's network interface — but a server bound to the container's localhost only accepts connections from inside that container. Bind 0.0.0.0 (as in CMD [\"uvicorn\", ..., \"--host\", \"0.0.0.0\"]) so mapped traffic can land.",
    },
  ],
};

export default lesson;
