import { type FormEvent } from "react";

/** 이벤트를 제공하지 않는 Select 콜백을 기존 폼 콜백과 연결합니다. */
export function createFormEvent(): FormEvent<Element> {
  const nativeEvent = new Event("change", { bubbles: true, cancelable: true });
  const target = document.createElement("div");
  let propagationStopped = false;

  return {
    get bubbles() {
      return nativeEvent.bubbles;
    },
    get cancelable() {
      return nativeEvent.cancelable;
    },
    currentTarget: target,
    get defaultPrevented() {
      return nativeEvent.defaultPrevented;
    },
    get eventPhase() {
      return nativeEvent.eventPhase;
    },
    get isTrusted() {
      return nativeEvent.isTrusted;
    },
    nativeEvent,
    preventDefault: () => nativeEvent.preventDefault(),
    isDefaultPrevented: () => nativeEvent.defaultPrevented,
    stopPropagation: () => {
      propagationStopped = true;
      nativeEvent.stopPropagation();
    },
    isPropagationStopped: () => propagationStopped,
    persist: () => undefined,
    target,
    get timeStamp() {
      return nativeEvent.timeStamp;
    },
    get type() {
      return nativeEvent.type;
    },
  };
}
