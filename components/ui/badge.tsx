import React from "react";
import { View, Text, type ViewProps } from "react-native";
import { cn } from "../../lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "purple"
  | "amber"
  | "outline";

export interface BadgeProps extends ViewProps {
  variant?: BadgeVariant;
  className?: string;
  textClassName?: string;
  isPill?: boolean;
  children: React.ReactNode;
}

const badgeContainerStyles: Record<BadgeVariant, string> = {
  default: "bg-zinc-800 border-zinc-700/60",
  secondary: "bg-zinc-900 border-zinc-800",
  destructive: "bg-red-500/15 border-red-500/30",
  success: "bg-emerald-500/15 border-emerald-500/30",
  purple: "bg-purple-500/15 border-purple-500/30",
  amber: "bg-amber-500/15 border-amber-500/30",
  outline: "border-zinc-700 bg-transparent",
};

const badgeTextStyles: Record<BadgeVariant, string> = {
  default: "text-zinc-200",
  secondary: "text-zinc-400",
  destructive: "text-red-400",
  success: "text-emerald-400",
  purple: "text-purple-300",
  amber: "text-amber-300",
  outline: "text-zinc-300",
};

export function Badge({
  variant = "default",
  isPill = false,
  className,
  textClassName,
  children,
  ...props
}: BadgeProps) {
  return (
    <View
      className={cn(
        "flex-row items-center gap-1.5 px-2.5 py-1 border",
        isPill ? "rounded-full" : "rounded-[12px]",
        badgeContainerStyles[variant],
        className
      )}
      {...props}
    >
      {typeof children === "string" ? (
        <Text
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            badgeTextStyles[variant],
            textClassName
          )}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
