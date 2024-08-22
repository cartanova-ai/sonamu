import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { SWRConfig } from "swr";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import EntitiesLayout from "./pages/entities/_layout.tsx";
import EntitiesShowPage from "./pages/entities/show.tsx";
import MigrationsIndex from "./pages/migrations/index.tsx";
import { ScaffoldingIndex } from "./pages/scaffolding/index.tsx";
import { swrFetcher } from "./services/sonamu.shared.ts";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <SWRConfig
    value={{
      errorRetryInterval: 3000,
      errorRetryCount: 3,
      fetcher: swrFetcher,
      revalidateOnFocus: true,
    }}
  >
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route path="/entities" element={<EntitiesLayout />}>
            <Route path=":entityId" element={<EntitiesShowPage />} />
          </Route>
          <Route path="/migrations" element={<MigrationsIndex />} />
          <Route path="/scaffolding" element={<ScaffoldingIndex />} />
        </Route>
        <Route path="*" element={<div>Page Not Found</div>} />
      </Routes>
    </BrowserRouter>
  </SWRConfig>
);
