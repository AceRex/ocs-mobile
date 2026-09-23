import React from "react";
import {
  Image,
  ImageStyle,
  StyleProp,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";

// Canonical brand assets with cropped padding for crisp high-DPI rendering
const LOGO_HORIZONTAL_FULL_COLOR = require("../assets/images/brand/logo_horizontal_full_color.png");
const LOGO_HORIZONTAL_WHITE = require("../assets/images/brand/logo_horizontal_white.png");
const LOGO_ICON_FULL_COLOR = require("../assets/images/brand/logo_icon_full_color.png");
const LOGO_ICON_WHITE = require("../assets/images/brand/logo_icon_white.png");

export interface AppLogoProps {
  variant?: "horizontal" | "icon";
  color?: "fullColor" | "white";
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/**
 * Canonical AppLogo Component
 * Renders the official wave.io application identity using high-resolution raster masters
 * strictly preserving aspect ratio without stretching, excessive whitespace, or text recreation.
 */
export default function AppLogo({
  variant = "horizontal",
  color = "fullColor",
  width,
  height,
  style,
  containerStyle,
  onPress,
  accessibilityLabel = "wave.io",
}: AppLogoProps) {
  const isHorizontal = variant === "horizontal";

  // Aspect ratios:
  // Horizontal master: 1077 x 232 -> ratio ~4.64
  // Icon master: 228 x 232 -> ratio ~1.0
  const aspectRatio = isHorizontal ? 1077 / 232 : 1;

  let computedWidth: number;
  let computedHeight: number;

  if (width !== undefined && height !== undefined) {
    computedWidth = width;
    computedHeight = height;
  } else if (height !== undefined) {
    computedHeight = height;
    computedWidth = Math.round(height * aspectRatio);
  } else if (width !== undefined) {
    computedWidth = width;
    computedHeight = Math.round(width / aspectRatio);
  } else {
    // Default dimension presets
    if (isHorizontal) {
      computedHeight = 32;
      computedWidth = Math.round(32 * aspectRatio); // ~148
    } else {
      computedHeight = 36;
      computedWidth = 36;
    }
  }

  const source = isHorizontal
    ? color === "white"
      ? LOGO_HORIZONTAL_WHITE
      : LOGO_HORIZONTAL_FULL_COLOR
    : color === "white"
      ? LOGO_ICON_WHITE
      : LOGO_ICON_FULL_COLOR;

  const imageElement = (
    <Image
      source={source}
      style={[
        {
          width: computedWidth,
          height: computedHeight,
          resizeMode: "contain",
        },
        style,
      ]}
      accessibilityLabel={accessibilityLabel}
      accessible={true}
    />
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={containerStyle}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {imageElement}
      </TouchableOpacity>
    );
  }

  if (containerStyle) {
    return <View style={containerStyle}>{imageElement}</View>;
  }

  return imageElement;
}
