import { Suspense } from "react";
import "./App.css";
import { Outlet } from "react-router-dom";
import Sidebar from "./components/Sidebar";

function App() {
  return (
    <div className="app">
      <div className="app-layout">
        <Sidebar className="app-sidebar" />
        <div className="app-content">
          <Suspense>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default App;
