import { Suspense } from "react";
import "./App.css";
import { Outlet } from "react-router-dom";

function App() {
  return (
    <div className="app">
      <Suspense>
        <Outlet />
      </Suspense>
    </div>
  );
}

export default App;
