import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Star, CaretRight, IconProps } from "phosphor-react-native";
import { DESIGN_TOKENS } from "../constants/theme";

export interface QuickActionCardProps {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<IconProps>;
  gradient: [string, string] | string[];
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onPress: () => void;
  badge?: string;
  disabled?: boolean;
}

/**
 * Reusable QuickActionCard Component
 * Implements the dark premium visual hierarchy with universal 12px border radius,
 * distinguishable static linear gradient, favorite toggle, and accessible touch target.
 *
 * NOTE: The favorite star button is structured as an isolated sibling touchable with
 * high zIndex rather than a nested TouchableOpacity, eliminating touch responder collisions
 * on physical iOS and Android devices.
 */
export const QuickActionCard = React.memo(function QuickActionCard({
  id,
  title,
  description,
  icon: IconComponent,
  gradient,
  isFavorite = false,
  onToggleFavorite,
  onPress,
  badge,
  disabled = false,
}: QuickActionCardProps) {
  const gradColors = (gradient as [string, string]) || ["#00E5FF", "#00A8FF"];

  return (
    <View style={[styles.cardWrapper, disabled && styles.cardDisabled]}>
      {/* 1. Main Card Touch Target (Navigates to tool route) */}
      <TouchableOpacity
        activeOpacity={0.78}
        onPress={onPress}
        disabled={disabled}
        style={styles.cardContainer}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${description}`}
      >
        {/* Subtle Gradient Backplate Accent */}
        <LinearGradient
          colors={[gradColors[0] + "1A", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.gradientBackplate]}
        />

        {/* Top Row: Icon Badge & Badge Indicator */}
        <View style={styles.topRow}>
          <LinearGradient
            colors={gradColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconContainer}
          >
            <IconComponent size={20} color="#FFFFFF" weight="bold" />
          </LinearGradient>

          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>

        {/* Title & Description */}
        <View style={styles.contentSection}>
          <View style={styles.titleRow}>
            <Text style={styles.titleText} numberOfLines={1}>
              {title}
            </Text>
            <CaretRight size={13} color="rgba(255, 255, 255, 0.35)" weight="bold" />
          </View>

          <Text style={styles.descriptionText} numberOfLines={2}>
            {description}
          </Text>
        </View>
      </TouchableOpacity>

      {/* 2. Isolated Favorite Button (Sibling with higher zIndex - zero touch collision) */}
      {onToggleFavorite && (
        <TouchableOpacity
          onPress={onToggleFavorite}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={styles.favoriteButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
        >
          <Star
            size={18}
            color={isFavorite ? "#FBBF24" : "rgba(255, 255, 255, 0.3)"}
            weight={isFavorite ? "fill" : "regular"}
          />
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  cardWrapper: {
    flex: 1,
    position: "relative",
  },
  cardContainer: {
    flex: 1,
    minHeight: 126,
    backgroundColor: DESIGN_TOKENS.cardBackground,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    borderWidth: 1,
    borderColor: DESIGN_TOKENS.cardBorder,
    padding: 14,
    justifyContent: "space-between",
    position: "relative",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
      },
    }),
  },
  cardDisabled: {
    opacity: 0.5,
  },
  gradientBackplate: {
    borderRadius: DESIGN_TOKENS.borderRadius,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingRight: 28, // Leave room for top-right star
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: DESIGN_TOKENS.borderRadius,
  },
  badgeText: {
    color: "#FCA5A5",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  favoriteButton: {
    position: "absolute",
    top: 10,
    right: 10,
    padding: 6,
    borderRadius: DESIGN_TOKENS.borderRadius, // Strictly 12px
    zIndex: 30,
    elevation: 5,
  },
  contentSection: {
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.2,
    flex: 1,
    marginRight: 4,
  },
  descriptionText: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.52)",
    lineHeight: 15,
  },
});

export default QuickActionCard;
