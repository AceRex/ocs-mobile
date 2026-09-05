import React from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "../../lib/utils";

export interface SeparatorProps extends ViewProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function Separator({
  orientation = "horizontal",
  className,
  style,
  ...props
}: SeparatorProps) {
  return (
    <View
      className={cn(
        orientation === "horizontal"
          ? "h-[1px] w-full bg-zinc-800/80"
          : "w-[1px] h-full bg-zinc-800/80",
        className
      )}
      style={style}
      {...props}
    />
  );
}
