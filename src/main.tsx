import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AIProvider } from "./ai/AIContext";
import { applyTheme, getTheme } from "./lib/theme";
import "highlight.js/styles/github-dark.css";
import "./styles.css";

applyTheme(getTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AIProvider>
      <App />
    </AIProvider>
  </React.StrictMode>
);
