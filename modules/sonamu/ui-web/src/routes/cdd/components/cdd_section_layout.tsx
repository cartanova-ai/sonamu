import classNames from "classnames";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import type { SectionDescriptor } from "../types";

export function ViewerSection({
  id,
  title,
  Icon,
  children,
}: {
  id: string;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-16 scroll-mt-24 last:mb-0">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-1.5 rounded-md bg-slate-50 text-slate-400">
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">{title}</h2>
      </div>
      <div className="pl-10">{children}</div>
    </section>
  );
}

export function CddSectionLayout({
  navChildren,
  tocSections,
  activeSection,
  onSectionClick,
  children,
}: {
  navChildren: React.ReactNode;
  tocSections: SectionDescriptor[];
  activeSection: string;
  onSectionClick: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white text-slate-900 selection:bg-blue-100 [&_h1]:!m-0 [&_h2]:!m-0 [&_h3]:!m-0 [&_h4]:!m-0 [&_h5]:!m-0 [&_h6]:!m-0">
      <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 shrink-0">
        <div className="max-w-4xl mx-auto h-16 flex items-center justify-between">
          {navChildren}
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-12 flex gap-16">
          <aside className="hidden xl:block w-48 shrink-0 sticky top-28 h-fit">
            <nav className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-4 ml-3">
                Contents
              </span>
              {tocSections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onSectionClick(s.id);
                    document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={classNames(
                    "px-3 py-2 text-[13px] font-medium rounded-lg transition-all flex items-center gap-2",
                    activeSection === s.id
                      ? "bg-slate-50 text-blue-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50/50",
                  )}
                >
                  <ChevronRightIcon
                    className={classNames(
                      "w-3 h-3 transition-transform",
                      activeSection === s.id ? "rotate-90" : "",
                    )}
                  />
                  {s.title}
                </a>
              ))}
            </nav>
          </aside>

          <main className="flex-1 max-w-2xl">{children}</main>
        </div>
      </div>
    </div>
  );
}
