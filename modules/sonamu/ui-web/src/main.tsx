import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import EntitiesLayout from "./pages/entities/_layout.tsx";
import EntitiesShowPage from "./pages/entities/show.tsx";
import FixtureIndex from "./pages/fixture/index.tsx";
import MigrationsIndex from "./pages/migrations/index.tsx";
import { ScaffoldingIndex } from "./pages/scaffolding/index.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 3,
      retryDelay: 3000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<div />} />
          <Route path="/entities" element={<EntitiesLayout />}>
            <Route path=":entityId" element={<EntitiesShowPage />} />
          </Route>
          <Route path="/migrations" element={<MigrationsIndex />} />
          <Route path="/scaffolding" element={<ScaffoldingIndex />} />
          <Route path="/fixture" element={<FixtureIndex />} />
        </Route>
        <Route path="*" element={<div>Page Not Found</div>} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>,
);
