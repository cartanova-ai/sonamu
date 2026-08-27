import { CommonModal } from "@sonamu-kit/react-components";
import { Link, useLocation } from "@tanstack/react-router";
import classNames from "classnames";
import { type ReactNode } from "react";
import { useEffect, useState } from "react";

import SearchModal from "./components/SearchModal";
import { useSonamuContext } from "./contexts/sonamu-provider";
import { SUPPORTED_LOCALES, useLocale, useSetLocale } from "./i18n";
import { SonamuUIService } from "./services/sonamu-ui.service";

interface AppProps {
  children?: ReactNode;
}

function App({ children }: AppProps) {
  const { SD } = useSonamuContext();
  const locale = useLocale();
  const setLocale = useSetLocale();

  const menus = [
    { name: SD("nav.entities"), path: "/entities" },
    { name: SD("nav.migration"), path: "/migrations" },
    { name: SD("nav.scaffolding"), path: "/scaffolding" },
    { name: SD("nav.fixture"), path: "/fixture" },
    { name: SD("nav.i18n"), path: "/i18n" },
    { name: SD("nav.tasks"), path: "/tasks" },
    { name: SD("nav.testResults"), path: "/test-results" },
    { name: SD("nav.cdd"), path: "/cdd" },
  ];
  const location = useLocation();

  const [showSearch, setShowSearch] = useState(false);
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setShowSearch(true);
      }
    };
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
        <div className="w-full h-gnb bg-sidebar-bg text-white sticky top-0 left-0 flex items-center z-100 border-b border-white/10 justify-between">
          <div className="flex">
            <div className="p-4 font-bold w-sidemenu tracking-[-0.5px]">
              <span>🌲 &nbsp; Sonamu UI</span>
              <span className="font-normal text-text-muted text-[0.9em] ml-2">
                &nbsp; {projectName}
              </span>
            </div>
            <div className="flex gap-[0.3em] text-[0.9em]">
              {menus.map((menu, menuIndex) => (
                <Link
                  key={menuIndex}
                  className={classNames(
                    "self-center px-6 py-[0.8em] cursor-pointer text-center text-text-light! no-underline rounded-md transition-all duration-200",
                    "hover:bg-white/10 hover:text-white!",
                    {
                      "bg-white/15! font-semibold text-white!": location.pathname.includes(
                        menu.path,
                      ),
                    },
                  )}
                  to={menu.path}
                >
                  <div>{menu.name}</div>
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={locale}
              onChange={(event) => {
                const selectedLocale = event.target.value;
                if (selectedLocale === "ko" || selectedLocale === "en") {
                  setLocale(selectedLocale);
                }
              }}
              className="px-2 py-[0.4em] rounded-md border border-white/10 bg-black/20 cursor-pointer text-text-muted text-[0.85em] transition-all duration-200 hover:border-accent hover:text-white"
            >
              {SUPPORTED_LOCALES.map((loc) => (
                <option key={loc.value} value={loc.value}>
                  {loc.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="mr-4 px-4 py-[0.4em] rounded-[20px] border border-white/10 bg-black/20 cursor-pointer text-text-muted text-[0.9em] transition-all duration-200 hover:border-accent hover:text-white *:mr-2"
              onClick={() => setShowSearch(true)}
            >
              <span>🔍</span>
              <span>{SD("nav.search")}</span>
              <kbd className="keycap">⌘</kbd>
              <kbd className="keycap">K</kbd>
            </button>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
      <SearchModal open={showSearch} onClose={() => setShowSearch(false)} />
      <CommonModal />
    </>
  );
}

export default App;
