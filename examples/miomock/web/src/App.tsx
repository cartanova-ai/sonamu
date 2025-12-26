import { Suspense } from "react";
import "./App.css";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./admin-common/auth";
import Sidebar from "./components/Sidebar";

function App() {
  const location = useLocation();
  const { user: _ } = useAuth();

  const isLoginPage =
    location.pathname === "/admin/login" || location.pathname === "/admin/login-test";

  return (
    <div className="app">
      <div className="app-layout">
        {!isLoginPage && <Sidebar />}
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
