import classNames from "classnames";
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
    <section
      id={id}
      className="group grid grid-cols-1 lg:grid-cols-[140px_1fr] items-start gap-y-4 gap-x-8 mb-10 pb-10 border-b border-dashed border-slate-200 last:border-0 scroll-mt-28"
    >
      <div className="flex items-center gap-2 lg:flex-row-reverse lg:text-right text-slate-400">
        <h2 className="text-xs font-bold uppercase tracking-widest group-hover:text-slate-600 transition-colors">
          {title}
        </h2>
        <Icon className="w-3.5 h-3.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="min-w-0">{children}</div>
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
    <div className="flex-1 flex flex-col min-h-0 bg-white [&_h1]:!m-0 [&_h2]:!m-0 [&_h3]:!m-0 [&_h4]:!m-0 [&_h5]:!m-0 [&_h6]:!m-0">
      <nav className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-slate-100 px-8 py-3 shrink-0">
        <div className="max-w-5xl mx-auto flex justify-between items-center">{navChildren}</div>
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto flex px-8 py-10 gap-10">
          <aside className="hidden xl:block w-48 flex-shrink-0 sticky top-4 h-fit">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 ml-2">
              On this page
            </p>
            <ul className="space-y-0.5 border-l border-slate-100">
              {tocSections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onSectionClick(s.id);
                      document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className={classNames(
                      "block pl-4 py-1.5 text-xs font-medium border-l -ml-px transition-all",
                      activeSection === s.id
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300",
                    )}
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </aside>

          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
