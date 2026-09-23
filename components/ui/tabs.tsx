import React from "react";
import { View, Text, TouchableOpacity, type ViewProps } from "react-native";
import { cn } from "../../lib/utils";

export interface TabsListProps extends ViewProps {
  className?: string;
  children: React.ReactNode;
}

export function TabsList({ className, style, children, ...props }: TabsListProps) {
  return (
    <View
      className={cn(
        "flex-row bg-zinc-950/80 p-1 rounded-[12px] border border-zinc-800/80",
        className
      )}
      style={style}
      {...props}
    >
      {children}
    </View>
  );
}

export interface TabsTriggerProps {
  isActive: boolean;
  onPress: () => void;
  className?: string;
  textClassName?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function TabsTrigger({
  isActive,
  onPress,
  className,
  textClassName,
  icon,
  children,
}: TabsTriggerProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={cn(
        "flex-1 flex-row items-center justify-center gap-2 py-2 px-3 rounded-[10px] transition-all",
        isActive
          ? "bg-zinc-800/90 border border-zinc-700/50 shadow-sm"
          : "bg-transparent border border-transparent",
        className
      )}
    >
      {icon}
      {typeof children === "string" ? (
        <Text
          className={cn(
            "text-xs font-bold tracking-tight",
            isActive ? "text-white" : "text-zinc-400",
            textClassName
          )}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </TouchableOpacity>
  );
}

export interface TabsContentProps extends ViewProps {
  value: string;
  activeValue: string;
  className?: string;
  children: React.ReactNode;
}

export function TabsContent({
  value,
  activeValue,
  className,
  children,
  ...props
}: TabsContentProps) {
  if (value !== activeValue) return null;
  return (
    <View className={cn("flex-1", className)} {...props}>
      {children}
    </View>
  );
}
