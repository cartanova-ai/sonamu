import { createContext, useContext } from "react";
import { type ReactNode } from "react";

const PortalContainerContext = createContext<HTMLElement | null>(null);

/**
 * 아래 트리의 팝오버, 메뉴, 대화상자, 시트, 드로어가 포털로 붙을 요소를 정합니다.
 * 주지 않거나 null이면 지금처럼 document.body에 붙습니다. 부품의 Portal이나 Root에 직접 준 container가 이깁니다.
 * 확대·축소한 미리보기나 섀도 DOM처럼 body로 나가면 자리가 어긋나는 영역을 감쌉니다.
 *
 * @example
 * const [box, setBox] = useState<HTMLElement | null>(null);
 * <div ref={setBox}>
 *   <PortalContainerProvider container={box}>{children}</PortalContainerProvider>
 * </div>
 */
export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
  );
}

/** 가장 가까운 PortalContainerProvider가 준 요소입니다. 없으면 null입니다. */
export function usePortalContainer() {
  return useContext(PortalContainerContext);
}
