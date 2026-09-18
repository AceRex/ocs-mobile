import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  type TouchableOpacityProps,
} from "react-native";
import { cn } from "../../lib/utils";

export type ButtonVariant =
  | "default"
  | "destructive"
  | "destructiveOutline"
  | "success"
  | "successOutline"
  | "outline"
  | "secondary"
  | "ghost"
  | "accent";

export type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps extends TouchableOpacityProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  textClassName?: string;
  isLoading?: boolean;
  children?: React.ReactNode;
}

const variantContainerStyles: Record<ButtonVariant, string> = {
  default: "bg-zinc-100 border border-zinc-200 active:bg-zinc-300",
  destructive: "bg-red-600 border border-red-700 active:bg-red-700",
  destructiveOutline: "bg-red-950/30 border border-red-800/50 active:bg-red-900/50",
  success: "bg-emerald-600 border border-emerald-700 active:bg-emerald-700",
  successOutline: "bg-emerald-950/30 border border-emerald-800/50 active:bg-emerald-900/50",
  outline: "bg-zinc-900/60 border border-zinc-800 active:bg-zinc-800",
  secondary: "bg-zinc-800 border border-zinc-700/60 active:bg-zinc-700",
  ghost: "bg-transparent active:bg-zinc-800/50",
  accent: "bg-violet-600 border border-violet-500 active:bg-violet-700",
};

const variantTextStyles: Record<ButtonVariant, string> = {
  default: "text-zinc-900 font-bold",
  destructive: "text-white font-bold",
  destructiveOutline: "text-red-300 font-bold",
  success: "text-white font-bold",
  successOutline: "text-emerald-300 font-bold",
  outline: "text-zinc-200 font-medium",
  secondary: "text-zinc-100 font-medium",
  ghost: "text-zinc-300 font-medium",
  accent: "text-white font-bold",
};

const sizeContainerStyles: Record<ButtonSize, string> = {
  default: "h-11 px-4 py-2.5",
  sm: "h-9 px-3 py-1.5",
  lg: "h-13 px-5 py-3",
  icon: "w-10 h-10 p-0 items-center justify-center",
};

const sizeTextStyles: Record<ButtonSize, string> = {
  default: "text-sm",
  sm: "text-xs",
  lg: "text-base",
  icon: "text-sm",
};

export function Button({
  variant = "default",
  size = "default",
  className,
  textClassName,
  isLoading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const containerClass = cn(
    "flex-row items-center justify-center rounded-[12px] transition-all",
    variantContainerStyles[variant],
    sizeContainerStyles[size],
    disabled && "opacity-40",
    className
  );

  const textClass = cn(
    variantTextStyles[variant],
    sizeTextStyles[size],
    textClassName
  );

  return (
    <TouchableOpacity
      className={containerClass}
      disabled={disabled || isLoading}
      activeOpacity={0.75}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={variant === "default" ? "#18181b" : "#ffffff"}
        />
      ) : typeof children === "string" ? (
        <Text className={textClass}>{children}</Text>
      ) : (
        children
      )}
    </TouchableOpacity>
  );
}
