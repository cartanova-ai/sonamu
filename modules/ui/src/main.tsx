import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { SWRConfig } from "swr";
import axios from "axios";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import EntitiesLayout from "./pages/entities/_layout.tsx";
import EntitiesShowPage from "./pages/entities/show.tsx";

export async function swrFetcher(
  url: string,
  params: string = ""
): Promise<any> {
  try {
    const res = await axios.get(url + "?" + params);
    return res.data;
  } catch (e: any) {
    const error: any = new Error(
      e.response.data.message ?? e.response.message ?? "Unknown"
    );
    error.statusCode = e.response?.data.statusCode ?? e.response.status;
    throw error;
  }
}

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
        </Route>
        <Route path="*" element={<div>Page Not Found</div>} />
      </Routes>
    </BrowserRouter>
  </SWRConfig>
);
