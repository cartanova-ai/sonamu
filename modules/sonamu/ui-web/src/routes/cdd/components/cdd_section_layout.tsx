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
    <section id={id} className="mb-12 scroll-mt-20">
      <div className="flex items-baseline gap-2 mb-6 border-b border-slate-200 pb-2">
        <Icon className="w-5 h-5 text-slate-400 translate-y-[1px]" />
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
      </div>
      <div className="pl-0 md:pl-7">{children}</div>
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
    <div className="flex-1 flex flex-col min-h-0">
      <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4 shrink-0">
        <div className="max-w-7xl mx-auto flex justify-between items-center">{navChildren}</div>
      </nav>

      <div className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-7xl mx-auto flex px-6 py-10 gap-12">
          <aside className="hidden lg:block w-48 flex-shrink-0 sticky top-6 h-fit">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 ml-4">
              Contents
            </p>
            <ul className="space-y-1">
              {tocSections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={() => onSectionClick(s.id)}
                    className={classNames(
                      "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                      activeSection === s.id
                        ? "bg-slate-100 text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-50",
                    )}
                  >
                    <s.icon className="w-4 h-4" />
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </aside>

          <div className="flex-1 max-w-3xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
