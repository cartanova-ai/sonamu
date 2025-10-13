import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadDynamicRoutes } from "@sonamu-kit/react-sui";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SWRConfig } from "swr";
import { swrFetcher } from "./services/sonamu.shared";
import { AuthProvider } from "./admin-common/auth";
import "semantic-ui-css/semantic.min.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <SWRConfig
    value={{
      errorRetryInterval: 3000,
      errorRetryCount: 3,
      fetcher: swrFetcher,
      revalidateOnFocus: true,
    }}
  >
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<App />}>
            {loadDynamicRoutes(import.meta.glob("./pages/**/*.tsx"))}
          </Route>
          <Route path="*" element={<div>404 Page Not Found</div>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </SWRConfig>,
);
