import "./App.css";
import { swrFetcher } from "./services/sonamu.shared";
import { SWRConfig } from "swr";
import BrandsList from "./BrandsList";

function App() {
  return (
    <SWRConfig
      value={{
        errorRetryInterval: 3000,
        errorRetryCount: 3,
        fetcher: swrFetcher,
        revalidateOnFocus: true,
      }}
    >
      <div className="App">
        <BrandsList />
      </div>
    </SWRConfig>
  );
}

export default App;
