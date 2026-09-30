import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./theme.css";

const rootEl = document.querySelector<HTMLElement>("[data-generated-space-root]");
if (!rootEl) {
  throw new Error("missing generated space root element");
}

// QueryClient local (mêmes réglages que le SDK : pas de refetch au focus,
// staleTime 30s, 1 tentative) — remplace spaceQueryClient de @hatch/space-sdk.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <div className="biztrack-root">
        <App />
      </div>
    </QueryClientProvider>
  </StrictMode>,
);
