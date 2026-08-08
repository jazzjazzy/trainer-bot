import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "docker-cicd",
  title: "Docker, CI/CD & Deployment",
  subtitle: "Ship it: containers, pipelines, and zero-downtime deploys.",
  description:
    "Trade FTP uploads and hand-edited servers for Docker images, GitHub Actions pipelines, and healthcheck-gated deploys. Build small images, wire up Compose for local dev, and ship the same artifact from laptop to production.",
  tags: ["docker", "ci", "github-actions", "devops", "deployment"],
  level: "Intermediate",
  accent: "#2496ed",
  badge: "OPS",
  parts: [
    "From FTP to Containers",
    "Building Images",
    "Compose & Local Dev",
    "CI with GitHub Actions",
    "Deploy & Operate",
  ],
  comparison: {
    leftLabel: "Manual ops",
    leftLang: "bash",
    rightLabel: "Containerised",
    rightLang: "yaml",
  },
  tutor: {
    audience:
      "a developer with 25 years of PHP experience who has deployed by FTP, cPanel, and SSH-into-a-LAMP-box for most of their career, and is now learning Docker, CI/CD, and modern deployment to be competitive in job interviews",
    persona:
      "Assume they deeply understand servers, HTTP, and databases but have never containerised an app or written a CI pipeline. Map new ideas to their ops history: an image is the whole server snapshot instead of an FTP upload, a Dockerfile is a scripted version of the setup they used to do by hand over SSH, compose.yaml is the vhost + services config they used to click together in cPanel, and a GitHub Actions workflow is their old deploy checklist turned into code. Keep examples concrete (a Node/TS app and a Python app), always explain what a command actually does on the machine, and frame every topic as something they may be asked about in a DevOps-adjacent interview.",
  },
  lessons,
};

export default course;
