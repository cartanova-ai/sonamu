import * as React from "react";
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
    const totalPages = Math.ceil(total / itemsPerPage);
    const currentPage = value;

    return (
      <div ref={ref} className={cn("flex items-center justify-between pt-6", className)}>
        <div className="text-xs text-muted-foreground">
          Showing {(currentPage - 1) * itemsPerPage + 1}-
          {Math.min(currentPage * itemsPerPage, total)} of {total} results
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={currentPage === 1}
            onClick={() => onValueChange(currentPage - 1)}
          >
            Previous
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
            Next
          </Button>
        </div>
      </div>
    );
  },
);

Pagination.displayName = "Pagination";
