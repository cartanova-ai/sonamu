import { Outlet } from "react-router-dom";
import "./styles/App.scss";
import "semantic-ui-css/semantic.min.css";
import { CommonModal } from "./components/core/CommonModal";

function App() {
  return (
    <>
      <div className="app">
        <div className="gnb">
          <div className="title">🌲 &nbsp; Sonamu UI</div>
          <div className="menus">
            <div className="menu selected">Entities</div>
            <div className="menu">DB Migration</div>
            <div className="menu">Scaffolding</div>
          </div>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </div>
      <CommonModal />
    </>
  );
}

export default App;
