import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { toast as sonnerToast } from "sonner";
import App from "./App.tsx";
import { sanitizeUserMessage } from "./lib/errorMessages";
import "./index.css";
import "./styles/premium.css";
import "./styles/cinematic.css";
import "./styles/studio.css";
import "./styles/finish.css";
import "./styles/atelier.css";
import "./styles/vision.css";
import "./styles/private-bank.css";
import "./styles/v4-app.css";
import "./styles/v4-fixes.css";
import "./styles/v4-dark-polish.css";
import "./styles/home-polish.css";
import "./styles/monochrome-banking.css";
import "./styles/atelier-banking-layout.css";

// Never show technical wording in error popups, wherever they come from.
const originalError = sonnerToast.error;
(sonnerToast as { error: typeof sonnerToast.error }).error = ((message, data) =>
  originalError(
    sanitizeUserMessage(message) as Parameters<typeof originalError>[0],
    data && typeof data.description === "string"
      ? { ...data, description: sanitizeUserMessage(data.description) as string }
      : data,
  )) as typeof sonnerToast.error;

// Native shell / installed-app entry: never show the marketing landing.
// Android WebView user agents contain "; wv)"; installed PWAs report
// standalone display mode. Both must land in the app at /app instead.
const isNativeWebView = typeof navigator !== "undefined" && navigator.userAgent.includes("; wv)");
const isStandaloneDisplayMode =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (navigator as { standalone?: boolean }).standalone === true);
if (
  (isNativeWebView || isStandaloneDisplayMode) &&
  (window.location.pathname === "/" || window.location.pathname === "/index.html")
) {
  window.location.replace("/app");
} else {
  createRoot(document.getElementById("root")!).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
