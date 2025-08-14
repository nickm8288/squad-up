import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Entrypoint for the Squad Up React application.  This file mounts
// the top-level component into the root DOM element.  The App
// component includes authentication gating and the core UI.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
