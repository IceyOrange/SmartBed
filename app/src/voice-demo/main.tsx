import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import VoiceDemoApp from "./VoiceDemoApp";
import "./voice-demo.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VoiceDemoApp />
  </StrictMode>,
);
