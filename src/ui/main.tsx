console.log("🔎 UI booting…");
window.addEventListener("error", e => console.error("UI error:", e.error || e.message));
window.addEventListener("unhandledrejection", e => console.error("UI unhandled:", e.reason));

import React from "react";
import { createRoot } from "react-dom/client";
import App from "../ui/app";

const root = document.getElementById("root");
if (!root) throw new Error("❌ #root not found");
createRoot(root).render(<App />);

parent.postMessage({ pluginMessage: { type: "ui-ready" } }, "*");