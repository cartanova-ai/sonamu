import { Link, Outlet, useLocation } from "react-router-dom";
import "./styles/App.scss";
import "semantic-ui-css/semantic.min.css";
import classNames from "classnames";
import { useEffect, useState } from "react";
import { CommonModal } from "./components/core/CommonModal";
import SearchModal from "./components/SearchModal";
import { SonamuUIService } from "./services/sonamu-ui.service";

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
    {
      name: "Fixture",
      path: "/fixture",
    },
  ];
  const location = useLocation();

  const [showSearch, setShowSearch] = useState(false);
  const [projectName, setProjectName] = useState<string | null>(null);

  // biome-ignore lint/suspicious/noExplicitAny: 키보드 이벤트 호환되지 않아 any 처리
  const handleKeyDown = (event: any) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
      event.preventDefault();
      setShowSearch(true);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: handleKeyDown 함수는 컴포넌트가 마운트될 때만 등록되어야 함
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    SonamuUIService.getSonamuConfig().then((res) => {
      if (res.projectName) {
        setProjectName(res.projectName);
      }
    });
  }, []);

  return (
    <>
      <div className="app">
        <div className="gnb">
          <div className="menu">
            <div className="title">
              <span>🌲 &nbsp; Sonamu UI</span>
              <span className="project-name"> &nbsp; {projectName}</span>
            </div>
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
          <button className="search" type="button" onClick={() => setShowSearch(true)}>
            <span>🔍</span>
            <span>Search</span>
            <kbd className="keycap">⌘</kbd>
            <kbd className="keycap">K</kbd>
          </button>
        </div>
        <div className="content">
          <Outlet context={{ showSearch }} />
        </div>
      </div>
      <SearchModal open={showSearch} onClose={() => setShowSearch(false)} />
      <CommonModal />
    </>
  );
}

export default App;
