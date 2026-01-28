import * as React from "react";
import { useSonamuBaseContext } from "../../contexts";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export interface PaginationProps {
  value: number;
  onValueChange: (page: number) => void;
  total: number;
  itemsPerPage: number;
  className?: string;
  maxVisible?: number;
}

export const Pagination = React.forwardRef<HTMLDivElement, PaginationProps>(
  ({ value, onValueChange, total, itemsPerPage, className, maxVisible = 6 }, ref) => {
    const { SD } = useSonamuBaseContext();
    const totalPages = Math.ceil(total / itemsPerPage);
    const currentPage = value;
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, total);

    return (
      <div ref={ref} className={cn("flex items-center justify-between pt-6", className)}>
        <div className="text-xs text-muted-foreground">
          {(
            SD("rc.pagination.showing") as unknown as (
              start: number,
              end: number,
              total: number,
            ) => string
          )(startItem, endItem, total)}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={currentPage === 1}
            onClick={() => onValueChange(currentPage - 1)}
          >
            {SD("rc.pagination.previous")}
          </Button>
          <div className="flex items-center gap-1">
            {(() => {
              let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
              const endPage = Math.min(totalPages, startPage + maxVisible - 1);
              if (endPage - startPage + 1 < maxVisible) {
                startPage = Math.max(1, endPage - maxVisible + 1);
              }
              return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map(
                (page) => (
                  <Button
                    key={page}
                    variant="outline"
                    size="sm"
                    className={`h-8 w-8 text-xs ${page === currentPage ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => onValueChange(page)}
                  >
                    {page}
                  </Button>
                ),
              );
            })()}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={currentPage === totalPages}
            onClick={() => onValueChange(currentPage + 1)}
          >
            {SD("rc.pagination.next")}
          </Button>
        </div>
      </div>
    );
  },
);

Pagination.displayName = "Pagination";
