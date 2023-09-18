import classNames from "classnames";
import { useEffect, useRef, useState } from "react";

export function useSheetTable(options: {
  sheets: {
    name: string;
  }[];
  onExecute?: (sheet: string, y: number, x: number) => void;
  onKeywordChanged?: (sheet: string, keyword: string) => void;
  onKeydown: (e: KeyboardEvent) => boolean;
}) {
  const { sheets, onExecute, onKeywordChanged, onKeydown } = options;

  const sheetConfigsRef = useRef<
    {
      name: string;
      width: number;
      height: number;
    }[]
  >(
    sheets.map((sheet) => ({
      name: sheet.name,
      width: 0,
      height: 0,
    }))
  );
  useEffect(() => {
    sheetConfigsRef.current = sheets.map((sheet) => ({
      name: sheet.name,
      width: 0,
      height: 0,
    }));
  }, [sheets.length]);

  // cursor
  type Cursor = {
    sheet: string;
    y: number;
    x: number;
  };
  const [cursor, setCursor] = useState<Cursor>({
    sheet: "props",
    y: 0,
    x: 0,
  });
  const [focusedCursor, setFocusedCursor] = useState<Cursor | null>(null);

  // Key
  const moveCursorToDown = (amount: number) => {
    setCursor((cursor) => {
      const sheetIndex = sheetConfigsRef.current.findIndex(
        (sheetConfig) => sheetConfig.name === cursor.sheet
      );
      if (sheetIndex === -1) {
        return { ...cursor, y: 0 };
      }
      const sheet = sheetConfigsRef.current[sheetIndex];
      if (cursor.y === sheet.height - 1) {
        const nextSheet = sheetConfigsRef.current[sheetIndex + 1];
        if (!nextSheet) {
          return cursor;
        } else {
          return {
            sheet: nextSheet.name,
            y: 0,
            x: Math.min(nextSheet.width - 1, cursor.x),
          };
        }
      } else {
        return {
          ...cursor,
          sheet: cursor.sheet,
          y: Math.min(sheet.height - 1, cursor.y + amount),
        };
      }
    });
    // TODO: 커서 위치에 따라 스크롤 이동
  };
  const moveCursorToUp = (amount: number) => {
    setCursor((cursor) => {
      const sheetIndex = sheetConfigsRef.current.findIndex(
        (sheetConfig) => sheetConfig.name === cursor.sheet
      );
      if (sheetIndex === -1) {
        return { ...cursor, y: 0 };
      }
      if (cursor.y === 0) {
        const prevSheet = sheetConfigsRef.current[sheetIndex - 1];
        if (!prevSheet) {
          return cursor;
        } else {
          return { sheet: prevSheet.name, y: prevSheet.height - 1, x: 0 };
        }
      } else {
        return {
          ...cursor,
          sheet: cursor.sheet,
          y: Math.max(0, cursor.y - amount),
        };
      }
    });
    // TODO: 커서 위치에 따라 스크롤 이동
  };
  const moveCursorToLeft = (amount: number) => {
    setCursor((cursor) => {
      const sheetIndex = sheetConfigsRef.current.findIndex(
        (sheetConfig) => sheetConfig.name === cursor.sheet
      );
      if (sheetIndex === -1) {
        return { ...cursor, y: 0 };
      }
      if (cursor.x === 0) {
        const prevSheet = sheetConfigsRef.current[sheetIndex - 1];
        if (!prevSheet) {
          return cursor;
        } else {
          return {
            ...cursor,
            sheet: prevSheet.name,
            y: 0,
            x: prevSheet.width - 1,
          };
        }
      } else {
        return {
          ...cursor,
          sheet: cursor.sheet,
          x: Math.max(0, cursor.x - amount),
        };
      }
    });
    // TODO: 커서 위치에 따라 스크롤 이동
  };
  const moveCursorToRight = (amount: number) => {
    setCursor((cursor) => {
      const sheetIndex = sheetConfigsRef.current.findIndex(
        (sheetConfig) => sheetConfig.name === cursor.sheet
      );
      if (sheetIndex === -1) {
        return { ...cursor, y: 0 };
      }
      const sheet = sheetConfigsRef.current.find(
        (sheetConfig) => sheetConfig.name === cursor.sheet
      );
      if (!sheet) {
        return { ...cursor, y: 0 };
      }

      if (cursor.x === sheet.width - 1) {
        const nextSheet = sheetConfigsRef.current[sheetIndex + 1];
        if (!nextSheet) {
          return cursor;
        } else {
          return {
            sheet: nextSheet.name,
            y: 0,
            x: 0,
          };
        }
      } else {
        return {
          ...cursor,
          sheet: cursor.sheet,
          x: Math.min(sheet.width - 1, cursor.x + amount),
        };
      }
    });
    // TODO: 커서 위치에 따라 스크롤 이동
  };

  // 키 타이머 (1초 이내 입력인 경우 keyword를 누적하고 아닌 경우 초기화 후 입력)
  const keyTimerRef = useRef<{ keyword: string; timestamp: number } | null>();
  const keySwitchRef = useRef<boolean>(true);
  useEffect(() => {
    // keydown
    const applyingOnKeyDown = (e: KeyboardEvent) => {
      if (!keySwitchRef.current) {
        return;
      }

      if (onKeydown) {
        const toPropargate = onKeydown(e);
        if (toPropargate === false) {
          return;
        }
      }

      switch (e.key) {
        case "ArrowDown":
          moveCursorToDown(e.metaKey ? Infinity : 1);
          e.preventDefault();
          return;
        case "ArrowUp":
          moveCursorToUp(e.metaKey ? Infinity : 1);
          e.preventDefault();
          return;
        case "ArrowLeft":
          moveCursorToLeft(e.metaKey ? Infinity : 1);
          e.preventDefault();
          return;
        case "ArrowRight":
          moveCursorToRight(e.metaKey ? Infinity : 1);
          e.preventDefault();
          return;
        case "PageDown":
          moveCursorToDown(10);
          e.preventDefault();
          return;
        case "PageUp":
          moveCursorToUp(10);
          e.preventDefault();
          return;
        case "Home":
          moveCursorToLeft(Infinity);
          e.preventDefault();
          return;
        case "End":
          moveCursorToRight(Infinity);
          e.preventDefault();
          return;
        case "Enter":
          if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
          ) {
            return;
          }
          setFocusedCursor(cursor);
          if (onExecute) {
            onExecute(cursor.sheet, cursor.y, cursor.x);
          }
          return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        const THRESHOLD = 300; // 연속 키입력 0.3초
        const nowTimestamp = Date.now();
        const prevTimestamp = keyTimerRef.current?.timestamp ?? nowTimestamp;
        const diff = nowTimestamp - prevTimestamp;
        keyTimerRef.current = {
          timestamp: nowTimestamp,
          keyword:
            diff < THRESHOLD
              ? (keyTimerRef.current?.keyword ?? "") + e.key
              : e.key,
        };
        const keyword = keyTimerRef.current?.keyword ?? e.key;
        if (onKeywordChanged) {
          onKeywordChanged(cursor.sheet, keyword);
        }
        return;
      }
      console.log(`${e.key} pressed`);
    };

    // outside click
    const onMousedown = (e: MouseEvent) => {
      if (focusedCursor === null) {
        return;
      } else if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      setFocusedCursor(null);
    };

    document.addEventListener("keydown", applyingOnKeyDown);
    document.addEventListener("mousedown", onMousedown);
    return () => {
      document.removeEventListener("keydown", applyingOnKeyDown);
      document.removeEventListener("mousedown", onMousedown);
    };
  }, [options, cursor, focusedCursor]);

  return {
    regRow: (sheet: string, y: number) => {
      const sheetConfig = sheetConfigsRef.current.find(
        (sheetConfig) => sheetConfig.name === sheet
      );
      if (sheetConfig) {
        sheetConfig.height = Math.max(sheetConfig.height, y + 1);
      }

      return {
        className: classNames({
          "cursor-row-pointed": cursor.sheet === sheet && cursor.y === y,
        }),
      };
    },
    regCell: (sheet: string, y: number, x: number) => {
      const sheetConfig = sheetConfigsRef.current.find(
        (sheetConfig) => sheetConfig.name === sheet
      );
      if (sheetConfig) {
        sheetConfig.width = Math.max(sheetConfig.width, x + 1);
        sheetConfig.height = Math.max(sheetConfig.height, y + 1);
      }

      return {
        className: classNames({
          "cursor-cell-pointed":
            cursor.sheet === sheet && cursor.y === y && cursor.x === x,
        }),
        onClick: () =>
          setCursor({
            sheet,
            y,
            x,
          }),
        onDoubleClick: () => {
          setCursor({
            sheet,
            y,
            x,
          });
          setFocusedCursor({
            sheet,
            y,
            x,
          });
          if (onExecute) {
            onExecute(sheet, y, x);
          }
        },
      };
    },
    turnKeyHandler: (on: boolean) => {
      keySwitchRef.current = on;
    },
    cursor,
    setCursor,
    focusedCursor,
    setFocusedCursor,
    isFocused: (sheet: string, y: number, x: number) =>
      !!focusedCursor &&
      focusedCursor?.sheet === sheet &&
      focusedCursor?.y === y &&
      focusedCursor?.x === x,
    execute: () => {},
  };
}
