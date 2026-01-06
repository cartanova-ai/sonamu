import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import "./styles/App.scss";
import "semantic-ui-css/semantic.min.css";
import { CommonModal } from "@sonamu-kit/react-components";
import classNames from "classnames";
import SearchModal from "./components/SearchModal";
import { SonamuUIService } from "./services/sonamu-ui.service";

interface AppProps {
  children?: ReactNode;
}

function App({ children }: AppProps) {
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
        document.title = `${res.projectName}: Sonamu UI`;
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
        <div className="content">{children}</div>
      </div>
      <SearchModal open={showSearch} onClose={() => setShowSearch(false)} />
      <CommonModal />
    </>
  );
}

export default App;
