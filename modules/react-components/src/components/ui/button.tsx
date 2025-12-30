import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import LoaderIcon from "~icons/lucide/loader-2";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // semantic variants (shadcn/ui 기본)
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",

        // solid color variants
        red: "bg-red-500 text-white hover:bg-red-600",
        yellow: "bg-yellow-500 text-white hover:bg-yellow-600",
        green: "bg-green-500 text-white hover:bg-green-600",
        blue: "bg-blue-500 text-white hover:bg-blue-600",
        cyan: "bg-cyan-500 text-white hover:bg-cyan-600",
        purple: "bg-purple-500 text-white hover:bg-purple-600",
        pink: "bg-pink-500 text-white hover:bg-pink-600",
        orange: "bg-orange-500 text-white hover:bg-orange-600",
      },
      size: {
        // button sizes
        // - 아이콘만 있는 버튼: 정사각형 (px-0 aspect-square)
        // - 텍스트 / 아이콘 + 텍스트 버튼: 일반 패딩 유지 (가로 자동 확장)
        xs: "h-6 px-2 py-1 text-xs [&_svg]:size-3 has-[>svg]:px-1.5 has-[>svg:only-child]:px-0 has-[>svg:only-child]:aspect-square",
        sm: "h-7 px-3 py-1.5 text-xs [&_svg]:size-3.5 has-[>svg]:px-2 has-[>svg:only-child]:px-0 has-[>svg:only-child]:aspect-square",
        default:
          "h-9 px-4 py-2 [&_svg]:size-4 has-[>svg]:px-3 has-[>svg:only-child]:px-0 has-[>svg:only-child]:aspect-square",
        lg: "h-11 px-6 py-3 text-base [&_svg]:size-5 has-[>svg]:px-4 has-[>svg:only-child]:px-0 has-[>svg:only-child]:aspect-square",
        xl: "h-13 px-8 py-4 text-lg [&_svg]:size-6 has-[>svg]:px-6 has-[>svg:only-child]:px-0 has-[>svg:only-child]:aspect-square",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    icon?: React.ReactElement;
    loading?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, icon, children, loading, disabled, asChild = false, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    const iconOnly = React.Children.count(children) === 0;

    const leadingIcon = loading ? <LoaderIcon className="animate-spin" /> : icon;

    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {iconOnly ? (
          leadingIcon
        ) : leadingIcon ? (
          <span className="contents">
            {leadingIcon}
            {children}
          </span>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants, type ButtonProps };
