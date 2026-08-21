import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Animated, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface MobileSplashProps {
  onFinish?: () => void;
  minDurationMs?: number;
}

export default function MobileSplash({ onFinish, minDurationMs = 1200 }: MobileSplashProps) {
  const [fadeAnim] = useState(new Animated.Value(1));
  const [scaleAnim] = useState(new Animated.Value(0.95));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Pulse animation
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 6,
      tension: 40,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
        onFinish?.();
      });
    }, minDurationMs);

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={["#0B0814", "#161026", "#0B0814"]}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View style={[styles.content, { transform: [{ scale: scaleAnim }] }]}>
        <LinearGradient
          colors={["#7c3aed", "#06b6d4"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logoBox}
        >
          <Text style={styles.logoText}>O</Text>
        </LinearGradient>
        <Text style={styles.title}>OCS</Text>
        <Text style={styles.subtitle}>ORGANIZED CHURCH SERVICE</Text>
        <View style={styles.indicatorContainer}>
          <ActivityIndicator color="#A855F7" size="small" />
          <Text style={styles.statusText}>Connecting to companion bus...</Text>
        </View>
      </Animated.View>
      <Text style={styles.versionText}>Mobile Companion • v1.10</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B0814",
  },
  content: {
    alignItems: "center",
    gap: 12,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
    marginBottom: 8,
  },
  logoText: {
    fontSize: 40,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 2,
    marginTop: -4,
  },
  indicatorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  statusText: {
    fontSize: 11,
    color: "#DDD7EE",
    fontWeight: "600",
  },
  versionText: {
    position: "absolute",
    bottom: 32,
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
});
