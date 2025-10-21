import { Suspense } from "react";
import "./App.css";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { useAuth } from "./admin-common/auth";

function App() {
  const location = useLocation();
  const { user } = useAuth();

  const isLoginPage = location.pathname === "/admin/login" || location.pathname === "/admin/login-test";

  return (
    <div className="app">
      <div className="app-layout">
        {!isLoginPage && <Sidebar className="app-sidebar" />}
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
