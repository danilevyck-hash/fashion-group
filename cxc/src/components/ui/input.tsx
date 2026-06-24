import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm text-gray-950 transition-colors placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30 focus-visible:border-teal-700 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
