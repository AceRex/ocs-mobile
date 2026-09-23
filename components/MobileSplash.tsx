import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Animated, ActivityIndicator, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import AppLogo from "./AppLogo";

// Build identifier — update this whenever building a new APK to confirm version on device
const BUILD_ID = "Sep03-00:25";

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
        colors={["#0B1020", "#12182B", "#0B1020"]}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.content, { transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.logoContainer}>
          <AppLogo variant="icon" height={72} width={72} />
        </View>
        <AppLogo variant="horizontal" height={30} color="white" />
        <Text style={styles.subtitle}>MOBILE COMPANION & CAMERA SWITCHER</Text>
        <View style={styles.indicatorContainer}>
          <ActivityIndicator color="#00E5FF" size="small" />
          <Text style={styles.statusText}>Connecting to companion bus...</Text>
        </View>
      </Animated.View>
      <Text style={styles.versionText}>wave.io Companion • v1.10 • {BUILD_ID}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B0814",
  },
  content: {
    alignItems: "center",
    gap: 12,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
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
