import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { toast as sonnerToast } from "sonner";
import App from "./App.tsx";
import { sanitizeUserMessage } from "./lib/errorMessages";
import "./index.css";

// Never show technical wording in error popups, wherever they come from.
const originalError = sonnerToast.error;
(sonnerToast as { error: typeof sonnerToast.error }).error = ((message, data) =>
  originalError(
    sanitizeUserMessage(message) as Parameters<typeof originalError>[0],
    data && typeof data.description === "string"
      ? { ...data, description: sanitizeUserMessage(data.description) as string }
      : data,
  )) as typeof sonnerToast.error;

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
