import { Suspense } from "react";
import "./App.css";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { useAuth } from "./admin-common/auth";

function App() {
  const location = useLocation();
  const { user, loading } = useAuth();

  const isLoginPage = location.pathname === "/admin/login";

  if (loading) {
    return (
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 100 }}>
          로그인을 확인중입니다...
        </div>
      </div>
    );
  }

  if (!isLoginPage && user?.role !== "admin") {
    return (
      <Navigate to="/admin/login" state={{ from: location }} replace />
    );
  }

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
