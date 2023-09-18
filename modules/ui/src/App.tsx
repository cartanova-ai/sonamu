import { Link, Outlet, useLocation } from "react-router-dom";
import "./styles/App.scss";
import "semantic-ui-css/semantic.min.css";
import { CommonModal } from "./components/core/CommonModal";
import classNames from "classnames";

function App() {
  const menus = [
    {
      name: "Entities",
      path: "/entities",
    },
    {
      name: "DB Migration",
      path: "/migrations",
    },
    {
      name: "Scaffolding",
      path: "/scaffolding",
    },
  ];
  const location = useLocation();

  return (
    <>
      <div className="app">
        <div className="gnb">
          <div className="title">🌲 &nbsp; Sonamu UI</div>
          <div className="menus">
            {menus.map((menu, menuIndex) => (
              <Link
                key={menuIndex}
                className={classNames("menu", {
                  selected: location.pathname.includes(menu.path),
                })}
                to={menu.path}
              >
                <div>{menu.name}</div>
              </Link>
            ))}
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
