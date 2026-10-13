import React from "react";
import { View, Text, type ViewProps, type TextProps } from "react-native";
import { cn } from "../../lib/utils";

export interface CardProps extends ViewProps {
  className?: string;
}

export function Card({ className, style, children, ...props }: CardProps) {
  return (
    <View
      className={cn(
        "rounded-[12px] border border-zinc-800/80 bg-zinc-900/90 p-4 shadow-sm",
        className
      )}
      style={style}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardHeader({ className, style, children, ...props }: CardProps) {
  return (
    <View
      className={cn("flex flex-col space-y-1 mb-2.5", className)}
      style={style}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardTitle({ className, style, children, ...props }: TextProps & { className?: string }) {
  return (
    <Text
      className={cn("text-white font-bold text-base tracking-tight", className)}
      style={style}
      {...props}
    >
      {children}
    </Text>
  );
}

export function CardDescription({ className, style, children, ...props }: TextProps & { className?: string }) {
  return (
    <Text
      className={cn("text-zinc-400 text-xs leading-relaxed", className)}
      style={style}
      {...props}
    >
      {children}
    </Text>
  );
}

export function CardContent({ className, style, children, ...props }: CardProps) {
  return (
    <View className={cn("space-y-2.5", className)} style={style} {...props}>
      {children}
    </View>
  );
}

export function CardFooter({ className, style, children, ...props }: CardProps) {
  return (
    <View
      className={cn("flex flex-row items-center pt-3 border-t border-zinc-800/80 mt-3", className)}
      style={style}
      {...props}
    >
      {children}
    </View>
  );
}
