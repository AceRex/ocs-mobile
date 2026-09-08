import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  StyleSheet,
  Platform,
  Modal,
  ActivityIndicator,
  Linking,
  TextInput,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CameraView, CameraViewRef, useCameraPermissions, type CameraType } from "expo-camera";
import {
  CaretLeft,
  VideoCamera,
  ArrowCounterClockwise,
  CheckCircle,
  Warning,
  LockKey,
  Broadcast,
  Stop,
  UsersThree,
  Monitor,
  Lightning,
  SlidersHorizontal,
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Clock,
  ArrowsOut,
  Sparkle,
  ArrowsLeftRight,
  X,
  BookOpen,
  IdentificationCard,
  TelevisionSimple,
  Megaphone,
  Eye,
  EyeSlash,
  Cube,
} from "phosphor-react-native";
import { useSocketStore, LiveBroadcastConfig, defaultBroadcastConfig } from "../store/socketStore";

// ── Color Grading & Effect Profiles ──────────────────────────────────────────
interface ColorEffect {
  id: string;
  name: string;
  desc: string;
  overlayColor: string;
  filterCss?: string;
}

const COLOR_EFFECTS: ColorEffect[] = [
  { id: "normal", name: "Natural", desc: "True color sensor output", overlayColor: "transparent" },
  { id: "cinema-warm", name: "Cinema Warm", desc: "Golden sanctuary illumination", overlayColor: "rgba(245, 158, 11, 0.12)", filterCss: "sepia(0.25) saturate(1.25) contrast(1.05)" },
  { id: "cinema-cool", name: "Cinema Cool", desc: "Teal-blue cinematic film", overlayColor: "rgba(56, 189, 248, 0.12)", filterCss: "hue-rotate(185deg) contrast(1.15) saturate(1.1)" },
  { id: "vivid-stage", name: "Vivid Stage", desc: "High-contrast stage lighting", overlayColor: "rgba(168, 85, 247, 0.08)", filterCss: "saturate(1.45) contrast(1.2)" },
  { id: "monochrome", name: "Monochrome", desc: "High-contrast black & white", overlayColor: "rgba(0, 0, 0, 0.22)", filterCss: "grayscale(1) contrast(1.25)" },
  { id: "sepia", name: "Sepia Vintage", desc: "Nostalgic golden-brown", overlayColor: "rgba(180, 83, 9, 0.16)", filterCss: "sepia(0.75) contrast(1.1)" },
  { id: "teal-orange", name: "Teal & Orange", desc: "Hollywood blockbuster grade", overlayColor: "rgba(20, 184, 166, 0.10)", filterCss: "contrast(1.2) saturate(1.3) hue-rotate(15deg)" },
];

// ── Camera Resolution / Framerate Presets ────────────────────────────────────
interface CameraPreset {
  id: string;
  label: string;
  desc: string;
  quality: "fast" | "hd" | "eco";
  fps: number;
}

const CAMERA_PRESETS: CameraPreset[] = [
  { id: "4k60", label: "4K 60FPS", desc: "Ultra Studio Broadcast", quality: "hd", fps: 60 },
  { id: "1080p60", label: "1080P 60FPS", desc: "Fluid Production FHD", quality: "hd", fps: 60 },
  { id: "1080p30", label: "1080P 30FPS", desc: "Standard High Definition", quality: "fast", fps: 30 },
  { id: "720p30", label: "720P 30FPS", desc: "Low Bandwidth / High Stability", quality: "eco", fps: 30 },
];

export default function LiveSwitcherScreen() {
  let router: any;
  try {
    router = useRouter();
  } catch (_) {
    router = {
      push: (_path: string) => {},
      back: () => {},
      replace: (_path: string) => {},
    };
  }
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const {
    isPaired,
    isCameraSource,
    cameraSlotIndex,
    isSwitcherController,
    switcherCameraSlots,
    switcherProgramSourceId,
    switcherRouteGeneral,
    switcherRouteSpeaker,
    switcherTransitionSetting,
    switcherActiveTransition,
    switcherActiveDisplay,
    switcherDisplay1Source,
    switcherDisplay2Source,
    deviceName,
    serverIp,
    lastHost,
    lastPort,
    socket,
    optInAsCamera,
    optOutAsCamera,
    setSwitcherProgram,
    setSwitcherRoute,
    setSwitcherTransitionSetting,
    setSwitcherActiveDisplay,
    setSwitcherDisplaySource,
    sendSwitcherCameraFrame,
    requestControlReclaim,
    liveBroadcastConfig,
    updateBroadcastConfig,
  } = useSocketStore();

  const bConfig = liveBroadcastConfig || defaultBroadcastConfig;

  const effectiveProgramSourceId = switcherActiveDisplay === "display1"
    ? (switcherDisplay1Source || "general")
    : (switcherDisplay2Source || (switcherCameraSlots[0]?.socketId || "speaker"));

  const isThisDeviceProgram = socket?.id != null && socket.id === effectiveProgramSourceId;

  // ── expo-camera state ─────────────────────────────────────────────────────
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraReady, setIsCameraReady] = useState<boolean>(false);
  const [facing, setFacing] = useState<CameraType>("back");
  const [isMirrored, setIsMirrored] = useState<boolean>(false);
  const [selectedPreset, setSelectedPreset] = useState<CameraPreset>(CAMERA_PRESETS[0]);
  const [selectedEffect, setSelectedEffect] = useState<ColorEffect>(COLOR_EFFECTS[0]);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [torch, setTorch] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(0);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showEffectsDrawer, setShowEffectsDrawer] = useState<boolean>(false);
  const [showCenterReticle, setShowCenterReticle] = useState<boolean>(true);
  const [showStudioModal, setShowStudioModal] = useState<boolean>(false);
  const [studioTab, setStudioTab] = useState<"scale" | "logo" | "lowerThird" | "bible" | "ticker">("scale");

  const cameraRef = useRef<any>(null);
  const inFlightRef = useRef<boolean>(false);

  const showFeedback = (text: string, ok: boolean) => {
    setFeedback({ text, ok });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Auto-request permission on mount if eligible
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  // If desktop operator grants us controller permission, stop camera immediately
  useEffect(() => {
    if (isSwitcherController && isStreaming) {
      handleStopLive();
    }
  }, [isSwitcherController, isStreaming]);

  // Pick optimal low-overhead picture size for streaming on camera ready
  const handleCameraReady = useCallback(() => {
    setIsCameraReady(true);
  }, []);

  // High-performance adaptive cadence frame engine with hardware sensor breathing room
  useEffect(() => {
    let isMounted = true;
    let animFrameId: any = null;
    let lastCaptureFinishTime = 0;

    const pumpFrame = async () => {
      if (!isMounted || !isStreaming || !permission?.granted || !isCameraReady) return;

      const now = performance.now();
      // Cadence pacing: 110ms (~9 FPS) for 60fps studio preset, 150ms (~6.5 FPS) for 30fps preset.
      // Dedicated inter-frame breathing intervals allow the on-screen viewfinder preview to render fluidly
      // without hardware sensor starvation or CameraX queue saturation.
      const cadenceMs = selectedPreset.fps >= 60 ? 110 : 150;

      if (!inFlightRef.current && now - lastCaptureFinishTime >= cadenceMs && cameraRef.current) {
        inFlightRef.current = true;
        try {
          // Low-latency broadcast JPEG compression (~18KB payload) prevents CPU/memory bottlenecks.
          // shutterSound: false disables Android MediaActionSound system audio thread locks.
          const qualityVal = selectedPreset.quality === "hd" ? 0.20 : selectedPreset.quality === "eco" ? 0.10 : 0.15;
          const photo = await cameraRef.current?.takePictureAsync({
            quality: qualityVal,
            base64: true,
            shutterSound: false,
          });
          if (photo?.base64 && isMounted) {
            sendSwitcherCameraFrame(photo.base64, isMirrored, {
              id: selectedEffect.id,
              filter: selectedEffect.filterCss || "none",
              overlayColor: selectedEffect.overlayColor,
            });
          }
          lastCaptureFinishTime = performance.now();
        } catch (err: any) {
          if (__DEV__) {
            console.warn("[Camera Pump Handled Error]", err?.message || err);
          }
          // On transient capture recovery condition, back off 300ms cleanly
          lastCaptureFinishTime = performance.now() + 300;
        } finally {
          inFlightRef.current = false;
        }
      }

      if (isMounted && isStreaming) {
        animFrameId = requestAnimationFrame(pumpFrame);
      }
    };

    if (isStreaming && permission?.granted && isCameraReady) {
      animFrameId = requestAnimationFrame(pumpFrame);
    }

    return () => {
      isMounted = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      inFlightRef.current = false;
    };
  }, [isStreaming, permission?.granted, isCameraReady, selectedPreset, isMirrored, selectedEffect, sendSwitcherCameraFrame]);

  // If desktop drops our camera slot, stop streaming
  useEffect(() => {
    if (!isCameraSource && isStreaming) {
      setIsStreaming(false);
    }
  }, [isCameraSource, isStreaming]);

  // ── Go Live: request permission → opt-in → frame pump ──────────────────────
  const handleGoLive = async () => {
    if (isConnecting || isStreaming) return;
    setIsConnecting(true);
    try {
      let granted = permission?.granted;
      if (!granted) {
        const result = await requestPermission();
        granted = result?.granted;
      }
      if (!granted) {
        showFeedback("Camera permission is required", false);
        return;
      }

      const res = await optInAsCamera();
      if (!res.ok) {
        showFeedback(res.error || "Failed to join camera slot", false);
        return;
      }

      setIsStreaming(true);
      showFeedback(`Transmitting as Camera ${res.slotIndex || cameraSlotIndex || 1} of 6`, true);
    } catch (err: any) {
      console.error("[LiveSwitcher] Go Live error:", err);
      showFeedback(err?.message || "Failed to start camera", false);
      setIsStreaming(false);
    } finally {
      setIsConnecting(false);
    }
  };

  // ── Stop Live: stop frame pump → opt-out ──────────────────────────────────
  const handleStopLive = async () => {
    setIsStreaming(false);
    try {
      const res = await optOutAsCamera();
      if (res.ok) {
        showFeedback("Camera stream stopped", true);
      }
    } catch (_) {}
  };

  // ── Flip camera lens ───────────────────────────────────────────────────────
  const handleFlipCamera = () => {
    setTorch(false);
    setIsCameraReady(false);
    setFacing((prev) => (prev === "back" ? "front" : "back"));
  };

  // ── Switcher Mixer Methods (When holding controller permission) ────────────
  const handleSetProgram = async (deviceId: string) => {
    if (!isSwitcherController) {
      showFeedback("You don't hold controller permission", false);
      return;
    }
    const res = await setSwitcherProgram(deviceId);
    if (res.ok) {
      const slot = switcherCameraSlots.find((s) => s.socketId === deviceId);
      showFeedback(`Switching to: ${slot?.name || "Camera"}`, true);
    } else {
      showFeedback(res.error || "Switch failed", false);
    }
  };

  const handleTransitionSetting = async (patch: { type?: any; duration?: number; direction?: any }) => {
    if (!isSwitcherController) {
      showFeedback("You don't hold controller permission", false);
      return;
    }
    const res = await setSwitcherTransitionSetting(patch);
    if (res.ok) {
      showFeedback("Transition setting updated", true);
    } else {
      showFeedback(res.error || "Update failed", false);
    }
  };

  const getSourceName = useCallback((srcId: string | null) => {
    if (!srcId) return "None (Standby)";
    if (srcId === "general") return "General Screen (Slides)";
    if (srcId === "speaker") return "Speaker Screen (Stage)";
    const cam = switcherCameraSlots.find((s) => s.socketId === srcId);
    if (cam) return `${cam.name || "Camera"} (Cam ${cam.slotIndex})`;
    return srcId;
  }, [switcherCameraSlots]);

  const handleSetActiveDisplay = async (targetDisplay: "display1" | "display2") => {
    if (!isSwitcherController) {
      showFeedback("You don't hold controller permission", false);
      return;
    }
    const res = await setSwitcherActiveDisplay(targetDisplay);
    if (res.ok) {
      const src = targetDisplay === "display1" ? switcherDisplay1Source : switcherDisplay2Source;
      showFeedback(`Showing ${targetDisplay === "display1" ? "Display 1" : "Display 2"}: ${getSourceName(src)}`, true);
    } else {
      showFeedback(res.error || "Failed to switch display", false);
    }
  };

  const handleSetDisplaySource = async (displayId: "display1" | "display2", sourceId: string) => {
    if (!isSwitcherController) {
      showFeedback("You don't hold controller permission", false);
      return;
    }
    const res = await setSwitcherDisplaySource(displayId, sourceId);
    if (res.ok) {
      showFeedback(`Assigned ${displayId === "display1" ? "Display 1" : "Display 2"} ➔ ${getSourceName(sourceId)}`, true);
    } else {
      showFeedback(res.error || "Failed to set display source", false);
    }
  };

  const handleCycleSource = (displayId: "display1" | "display2") => {
    const currentSource = displayId === "display1" ? (switcherDisplay1Source || "general") : (switcherDisplay2Source || "speaker");
    const allSources: { id: string; name: string }[] = [
      { id: "general", name: "General Screen" },
      { id: "speaker", name: "Speaker Screen" },
      ...switcherCameraSlots.map((c) => ({ id: c.socketId, name: c.name || `Cam ${c.slotIndex}` })),
    ];
    const currentIndex = allSources.findIndex((s) => s.id === currentSource);
    const nextIndex = (currentIndex + 1) % allSources.length;
    handleSetDisplaySource(displayId, allSources[nextIndex].id);
  };

  const handleRouteToggle = async (dest: "general" | "speaker") => {
    if (!isSwitcherController) {
      showFeedback("You don't hold controller permission", false);
      return;
    }
    const current = dest === "general" ? switcherRouteGeneral : switcherRouteSpeaker;
    const res = await setSwitcherRoute(dest, !current);
    if (res.ok) {
      showFeedback(`${dest === "general" ? "General View" : "Speaker View"} → ${!current ? "LIVE" : "off"}`, true);
    } else {
      showFeedback(res.error || "Route failed", false);
    }
  };

  const handleReclaimControl = () => {
    requestControlReclaim();
    showFeedback("Reclaim request sent to desktop", true);
  };

  // ── Unpaired Screen ────────────────────────────────────────────────────────
  if (!isPaired) {
    return (
      <SafeAreaView className="flex-1 bg-[#0c0b10] justify-center items-center px-6">
        <StatusBar barStyle="light-content" />
        <LockKey size={44} color="#9333ea" weight="duotone" />
        <Text className="text-2xl font-black text-white text-center mt-4 mb-2">Not Connected</Text>
        <Text className="text-white/50 text-sm text-center mb-8">Pair with the desktop workstation to use Live studio & camera.</Text>
        <TouchableOpacity
          onPress={() => router.push("/connect")}
          className="bg-purple-600/80 border border-purple-400/30 py-3 px-8 rounded-[12px]"
        >
          <Text className="text-white font-bold">Go to Connect</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const renderStudioModal = () => (
    <Modal
      visible={showStudioModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowStudioModal(false)}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.studioModalCard}>
          {/* Header */}
          <View style={styles.studioModalHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 32, height: 32, borderRadius: 12, backgroundColor: "rgba(168, 85, 247, 0.25)", alignItems: "center", justifyContent: "center" }}>
                <TelevisionSimple size={18} color="#C084FC" weight="bold" />
              </View>
              <View>
                <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "900" }}>Broadcast Studio</Text>
                <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "600" }}>Scaling, Overlays & Scripture Link</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowStudioModal(false)} style={styles.closeBtn}>
              <X size={18} color="#FFFFFF" weight="bold" />
            </TouchableOpacity>
          </View>

          {/* Studio Tab Bar */}
          <View style={styles.studioTabBar}>
            {[
              { id: "scale" as const, label: "Scale", icon: Cube },
              { id: "logo" as const, label: "Logo", icon: Sparkle },
              { id: "lowerThird" as const, label: "Speaker", icon: IdentificationCard },
              { id: "bible" as const, label: "Bible", icon: BookOpen },
              { id: "ticker" as const, label: "Ticker", icon: Megaphone },
            ].map(({ id, label, icon: Icon }) => {
              const active = studioTab === id;
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => setStudioTab(id)}
                  style={[styles.studioTabBtn, active && styles.studioTabBtnActive]}
                >
                  <Icon size={13} color={active ? "#C084FC" : "rgba(255,255,255,0.4)"} weight={active ? "fill" : "bold"} />
                  <Text style={[styles.studioTabBtnText, active && styles.studioTabBtnTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tab Content Body */}
          <ScrollView style={styles.studioModalBody} showsVerticalScrollIndicator={false}>
            {/* 1. SCALE & FRAMING */}
            {studioTab === "scale" && (
              <View style={{ gap: 14 }}>
                <Text style={styles.settingsSectionTitle}>CANVAS SCALING & INSET</Text>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                  Scale the live screen to create space for church graphic frames, lower graphics, or picture-in-picture.
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { scale: 1.0, label: "100% Full" },
                    { scale: 0.95, label: "95% Inset" },
                    { scale: 0.90, label: "90% Frame" },
                    { scale: 0.85, label: "85% Studio" },
                    { scale: 0.80, label: "80% PIP" },
                    { scale: 0.75, label: "75% Inset" },
                  ].map(({ scale, label }) => {
                    const isCur = Math.abs(bConfig.scale - scale) < 0.02;
                    return (
                      <TouchableOpacity
                        key={scale}
                        onPress={() => updateBroadcastConfig({ scale })}
                        style={[styles.scalePresetBtn, isCur && styles.scalePresetBtnActive]}
                      >
                        <Text style={[styles.scalePresetBtnText, isCur && styles.scalePresetBtnTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.settingsSectionTitle, { marginTop: 8 }]}>FIT MODE</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { mode: "cover" as const, label: "Cover (Fill Screen)" },
                    { mode: "contain" as const, label: "Contain (Safe Frame)" },
                  ].map(({ mode, label }) => {
                    const isCur = bConfig.fitMode === mode;
                    return (
                      <TouchableOpacity
                        key={mode}
                        onPress={() => updateBroadcastConfig({ fitMode: mode })}
                        style={[styles.scalePresetBtn, { flex: 1 }, isCur && styles.scalePresetBtnActive]}
                      >
                        <Text style={[styles.scalePresetBtnText, isCur && styles.scalePresetBtnTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 2. LOGO / WATERMARK */}
            {studioTab === "logo" && (
              <View style={{ gap: 14 }}>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Enable Event Watermark Logo</Text>
                  <TouchableOpacity
                    onPress={() => updateBroadcastConfig({ logo: { ...bConfig.logo, enabled: !bConfig.logo.enabled } })}
                    style={[styles.togglePill, bConfig.logo.enabled && styles.togglePillOn]}
                  >
                    <Text style={styles.togglePillText}>{bConfig.logo.enabled ? "ON" : "OFF"}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.settingsSectionTitle}>LOGO PRESET</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { id: "cross" as const, label: "✝ Cross" },
                    { id: "ocs" as const, label: "OCS Badge" },
                    { id: "dove" as const, label: "🕊 Dove" },
                    { id: "custom" as const, label: "Custom URL" },
                  ].map(({ id, label }) => {
                    const isCur = bConfig.logo.preset === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() => updateBroadcastConfig({ logo: { ...bConfig.logo, preset: id } })}
                        style={[styles.scalePresetBtn, { flex: 1 }, isCur && styles.scalePresetBtnActive]}
                      >
                        <Text style={[styles.scalePresetBtnText, isCur && styles.scalePresetBtnTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {bConfig.logo.preset === "custom" && (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>Image URL / Asset Path</Text>
                    <TextInput
                      value={bConfig.logo.url}
                      onChangeText={(url) => updateBroadcastConfig({ logo: { ...bConfig.logo, url } })}
                      placeholder="https://... or church-logo.png"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      style={styles.studioTextInput}
                    />
                  </View>
                )}

                <Text style={styles.settingsSectionTitle}>SCREEN POSITION</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { pos: "top-right" as const, label: "Top-Right" },
                    { pos: "top-left" as const, label: "Top-Left" },
                    { pos: "bottom-right" as const, label: "Bottom-Right" },
                    { pos: "bottom-left" as const, label: "Bottom-Left" },
                  ].map(({ pos, label }) => {
                    const isCur = bConfig.logo.position === pos;
                    return (
                      <TouchableOpacity
                        key={pos}
                        onPress={() => updateBroadcastConfig({ logo: { ...bConfig.logo, position: pos } })}
                        style={[styles.scalePresetBtn, { width: "48%" }, isCur && styles.scalePresetBtnActive]}
                      >
                        <Text style={[styles.scalePresetBtnText, isCur && styles.scalePresetBtnTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.settingsSectionTitle}>OPACITY</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[0.5, 0.75, 0.9, 1.0].map((op) => {
                    const isCur = Math.abs(bConfig.logo.opacity - op) < 0.05;
                    return (
                      <TouchableOpacity
                        key={op}
                        onPress={() => updateBroadcastConfig({ logo: { ...bConfig.logo, opacity: op } })}
                        style={[styles.scalePresetBtn, { flex: 1 }, isCur && styles.scalePresetBtnActive]}
                      >
                        <Text style={[styles.scalePresetBtnText, isCur && styles.scalePresetBtnTextActive]}>{Math.round(op * 100)}%</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 3. SPEAKER LOWER THIRD */}
            {studioTab === "lowerThird" && (
              <View style={{ gap: 14 }}>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Enable Speaker Lower Third</Text>
                  <TouchableOpacity
                    onPress={() => updateBroadcastConfig({ lowerThird: { ...bConfig.lowerThird, enabled: !bConfig.lowerThird.enabled } })}
                    style={[styles.togglePill, bConfig.lowerThird.enabled && styles.togglePillOn]}
                  >
                    <Text style={styles.togglePillText}>{bConfig.lowerThird.enabled ? "ON" : "OFF"}</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>Speaker Name / Title</Text>
                  <TextInput
                    value={bConfig.lowerThird.title}
                    onChangeText={(title) => updateBroadcastConfig({ lowerThird: { ...bConfig.lowerThird, title } })}
                    placeholder="e.g. Pastor John Doe"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    style={styles.studioTextInput}
                  />
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>Topic / Role Subtitle</Text>
                  <TextInput
                    value={bConfig.lowerThird.subtitle}
                    onChangeText={(subtitle) => updateBroadcastConfig({ lowerThird: { ...bConfig.lowerThird, subtitle } })}
                    placeholder="e.g. Senior Pastor • Sunday Worship"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    style={styles.studioTextInput}
                  />
                </View>

                <Text style={styles.settingsSectionTitle}>POSITION & WIDTH</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { label: "Left", x: 35 },
                    { label: "Center", x: 50 },
                    { label: "Right", x: 65 },
                  ].map(({ label, x }) => {
                    const isCur = Math.abs((bConfig.lowerThird.x ?? 35) - x) < 5;
                    return (
                      <TouchableOpacity
                        key={label}
                        onPress={() => updateBroadcastConfig({ lowerThird: { ...bConfig.lowerThird, x } })}
                        style={[styles.scalePresetBtn, { flex: 1 }, isCur && styles.scalePresetBtnActive]}
                      >
                        <Text style={[styles.scalePresetBtnText, isCur && styles.scalePresetBtnTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { label: "Compact (40%)", width: 40 },
                    { label: "Standard (55%)", width: 55 },
                    { label: "Wide (70%)", width: 70 },
                  ].map(({ label, width }) => {
                    const isCur = Math.abs((bConfig.lowerThird.width ?? 55) - width) < 5;
                    return (
                      <TouchableOpacity
                        key={label}
                        onPress={() => updateBroadcastConfig({ lowerThird: { ...bConfig.lowerThird, width } })}
                        style={[styles.scalePresetBtn, { flex: 1 }, isCur && styles.scalePresetBtnActive]}
                      >
                        <Text style={[styles.scalePresetBtnText, isCur && styles.scalePresetBtnTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.settingsSectionTitle}>GRAPHIC THEME</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { theme: "glass" as const, label: "Frosted Glass" },
                    { theme: "gradient" as const, label: "Sunset Gold" },
                    { theme: "purple" as const, label: "Royal Purple" },
                    { theme: "minimal" as const, label: "Minimal Dark" },
                  ].map(({ theme, label }) => {
                    const isCur = bConfig.lowerThird.theme === theme;
                    return (
                      <TouchableOpacity
                        key={theme}
                        onPress={() => updateBroadcastConfig({ lowerThird: { ...bConfig.lowerThird, theme } })}
                        style={[styles.scalePresetBtn, { width: "48%" }, isCur && styles.scalePresetBtnActive]}
                      >
                        <Text style={[styles.scalePresetBtnText, isCur && styles.scalePresetBtnTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 4. BIBLE SCRIPTURE LOWER THIRD & AUTO TRIGGER */}
            {studioTab === "bible" && (
              <View style={{ gap: 14 }}>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Enable Scripture Lower Third</Text>
                  <TouchableOpacity
                    onPress={() => updateBroadcastConfig({ bibleLowerThird: { ...bConfig.bibleLowerThird, enabled: !bConfig.bibleLowerThird.enabled } })}
                    style={[styles.togglePill, bConfig.bibleLowerThird.enabled && styles.togglePillOn]}
                  >
                    <Text style={styles.togglePillText}>{bConfig.bibleLowerThird.enabled ? "ON" : "OFF"}</Text>
                  </TouchableOpacity>
                </View>

                {/* Auto Trigger Toggle */}
                <View style={[styles.toggleRow, { backgroundColor: "rgba(168, 85, 247, 0.12)", borderColor: "rgba(168, 85, 247, 0.3)" }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: "#F0ABFC", fontSize: 13, fontWeight: "700" }}>⚡ Scripture Auto-Trigger</Text>
                    <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>
                      Auto-triggers when speaker mentions scripture or presentation slide advances
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => updateBroadcastConfig({ bibleLowerThird: { ...bConfig.bibleLowerThird, autoTrigger: !bConfig.bibleLowerThird.autoTrigger } })}
                    style={[styles.togglePill, bConfig.bibleLowerThird.autoTrigger && styles.togglePillOn]}
                  >
                    <Text style={styles.togglePillText}>{bConfig.bibleLowerThird.autoTrigger ? "ACTIVE" : "OFF"}</Text>
                  </TouchableOpacity>
                </View>

                {/* 1-Click Show / Dismiss On Air */}
                <TouchableOpacity
                  onPress={() => updateBroadcastConfig({ bibleLowerThird: { ...bConfig.bibleLowerThird, isShowing: !bConfig.bibleLowerThird.isShowing } })}
                  style={[
                    styles.studioActionBtn,
                    bConfig.bibleLowerThird.isShowing ? { backgroundColor: "#DC2626" } : { backgroundColor: "#9333EA" },
                  ]}
                >
                  <Text style={styles.studioActionBtnText}>
                    {bConfig.bibleLowerThird.isShowing ? "HIDE SCRIPTURE FROM LIVE BROADCAST" : "SHOW SCRIPTURE ON AIR NOW"}
                  </Text>
                </TouchableOpacity>

                <View style={{ gap: 6 }}>
                  <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>Active Scripture Reference</Text>
                  <TextInput
                    value={bConfig.bibleLowerThird.currentRef}
                    onChangeText={(currentRef) => updateBroadcastConfig({ bibleLowerThird: { ...bConfig.bibleLowerThird, currentRef } })}
                    placeholder="e.g. John 3:16"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    style={styles.studioTextInput}
                  />
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>Scripture Body</Text>
                  <TextInput
                    value={bConfig.bibleLowerThird.currentText}
                    onChangeText={(currentText) => updateBroadcastConfig({ bibleLowerThird: { ...bConfig.bibleLowerThird, currentText } })}
                    placeholder="Scripture verse text..."
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    multiline
                    numberOfLines={3}
                    style={[styles.studioTextInput, { height: 70, textAlignVertical: "top" }]}
                  />
                </View>

                <Text style={styles.settingsSectionTitle}>POSITION & WIDTH</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { label: "Bottom (85%)", y: 85 },
                    { label: "Lower-Mid (75%)", y: 75 },
                    { label: "Center (50%)", y: 50 },
                  ].map(({ label, y }) => {
                    const isCur = Math.abs((bConfig.bibleLowerThird.y ?? 85) - y) < 5;
                    return (
                      <TouchableOpacity
                        key={label}
                        onPress={() => updateBroadcastConfig({ bibleLowerThird: { ...bConfig.bibleLowerThird, y } })}
                        style={[styles.scalePresetBtn, { flex: 1 }, isCur && styles.scalePresetBtnActive]}
                      >
                        <Text style={[styles.scalePresetBtnText, isCur && styles.scalePresetBtnTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { label: "Standard (90%)", width: 90 },
                    { label: "Full Width (96%)", width: 96 },
                    { label: "Compact (80%)", width: 80 },
                  ].map(({ label, width }) => {
                    const isCur = Math.abs((bConfig.bibleLowerThird.width ?? 90) - width) < 4;
                    return (
                      <TouchableOpacity
                        key={label}
                        onPress={() => updateBroadcastConfig({ bibleLowerThird: { ...bConfig.bibleLowerThird, width } })}
                        style={[styles.scalePresetBtn, { flex: 1 }, isCur && styles.scalePresetBtnActive]}
                      >
                        <Text style={[styles.scalePresetBtnText, isCur && styles.scalePresetBtnTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.settingsSectionTitle}>AUTO-DISMISS TIMER</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { sec: 10, label: "10s" },
                    { sec: 15, label: "15s" },
                    { sec: 30, label: "30s" },
                    { sec: 0, label: "Manual" },
                  ].map(({ sec, label }) => {
                    const isCur = bConfig.bibleLowerThird.autoDismissSec === sec;
                    return (
                      <TouchableOpacity
                        key={sec}
                        onPress={() => updateBroadcastConfig({ bibleLowerThird: { ...bConfig.bibleLowerThird, autoDismissSec: sec } })}
                        style={[styles.scalePresetBtn, { flex: 1 }, isCur && styles.scalePresetBtnActive]}
                      >
                        <Text style={[styles.scalePresetBtnText, isCur && styles.scalePresetBtnTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 5. LIVE TICKER */}
            {studioTab === "ticker" && (
              <View style={{ gap: 14 }}>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Enable Announcement Ticker</Text>
                  <TouchableOpacity
                    onPress={() => updateBroadcastConfig({ ticker: { ...bConfig.ticker, enabled: !bConfig.ticker.enabled } })}
                    style={[styles.togglePill, bConfig.ticker.enabled && styles.togglePillOn]}
                  >
                    <Text style={styles.togglePillText}>{bConfig.ticker.enabled ? "ON" : "OFF"}</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>Ticker Message</Text>
                  <TextInput
                    value={bConfig.ticker.text}
                    onChangeText={(text) => updateBroadcastConfig({ ticker: { ...bConfig.ticker, text } })}
                    placeholder="Welcome to church! • Tithes & Offerings..."
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    multiline
                    numberOfLines={2}
                    style={[styles.studioTextInput, { height: 60, textAlignVertical: "top" }]}
                  />
                </View>

                <Text style={styles.settingsSectionTitle}>SCROLL SPEED</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { speed: "slow" as const, label: "Slow" },
                    { speed: "medium" as const, label: "Normal" },
                    { speed: "fast" as const, label: "Fast" },
                  ].map(({ speed, label }) => {
                    const isCur = bConfig.ticker.speed === speed;
                    return (
                      <TouchableOpacity
                        key={speed}
                        onPress={() => updateBroadcastConfig({ ticker: { ...bConfig.ticker, speed } })}
                        style={[styles.scalePresetBtn, { flex: 1 }, isCur && styles.scalePresetBtnActive]}
                      >
                        <Text style={[styles.scalePresetBtnText, isCur && styles.scalePresetBtnTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW MODE 1: SWITCHER CONTROLLER (VIDEO PRODUCTION MIXER DECK)
  // If granted switcher control, directly render the mixer without camera access
  // ──────────────────────────────────────────────────────────────────────────
  if (isSwitcherController) {
    return (
      <SafeAreaView className="flex-1 bg-[#0c0b10]">
        <StatusBar barStyle="light-content" />

        {/* Mixer Header */}
        <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-white/[0.06]">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-2 rounded-[12px] active:bg-white/10">
            <CaretLeft size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-base font-black text-white">Live</Text>
            <Text className="text-[10px] text-purple-400 font-bold tracking-wide">
              Production Director • Controller Active
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowStudioModal(true)}
            className="mr-2 flex-row items-center gap-1.5 px-3 py-1.5 rounded-[12px] bg-purple-600/30 border border-purple-500/50 active:bg-purple-600/50"
          >
            <TelevisionSimple size={14} color="#C084FC" weight="bold" />
            <Text className="text-purple-200 text-xs font-bold">Studio</Text>
          </TouchableOpacity>
          {feedback && (
            <View className={`flex-row items-center gap-1 px-3 py-1.5 rounded-full border ${
              feedback.ok ? "bg-emerald-500/15 border-emerald-500/30" : "bg-red-500/15 border-red-500/30"
            }`}>
              {feedback.ok
                ? <CheckCircle size={11} color="#34d399" />
                : <Warning size={11} color="#f87171" />}
              <Text className={`text-[10px] font-semibold ${feedback.ok ? "text-emerald-400" : "text-red-400"}`}>
                {feedback.text}
              </Text>
            </View>
          )}
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>

          {/* ── Live Display Channels (Display 1 & 2) Deck ── */}
          <View className="bg-white/[0.04] border border-white/10 rounded-[12px] p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-1.5">
                <Monitor size={14} color="#38bdf8" />
                <Text className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  Live Display Channels
                </Text>
              </View>
              <Text className="text-[9px] font-mono text-white/40">Select What To Show</Text>
            </View>

            {/* A/B Cards */}
            <View className="flex-row gap-2.5 mb-3">
              {/* Display 1 Card */}
              <View className={`flex-1 p-3 rounded-[12px] border ${
                switcherActiveDisplay === "display1"
                  ? "bg-red-500/10 border-red-500/50"
                  : "bg-black/30 border-white/5"
              }`}>
                <View className="flex-row items-center justify-between mb-1.5">
                  <View className="flex-row items-center gap-1">
                    <View className="w-4 h-4 rounded-[12px] bg-sky-500/20 items-center justify-center border border-sky-500/40">
                      <Text className="text-sky-400 text-[9px] font-black">1</Text>
                    </View>
                    <Text className="text-xs font-black text-white">DISP 1</Text>
                  </View>
                  <View className={`px-1.5 py-0.5 rounded-[12px] ${
                    switcherActiveDisplay === "display1" ? "bg-red-500" : "bg-white/10"
                  }`}>
                    <Text className={`text-[7px] font-black ${switcherActiveDisplay === "display1" ? "text-white" : "text-white/40"}`}>
                      {switcherActiveDisplay === "display1" ? "ON AIR" : "STANDBY"}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => handleCycleSource("display1")}
                  className="bg-black/60 border border-white/10 py-1.5 px-2 rounded-[12px] mb-2"
                >
                  <Text className="text-white text-[10px] font-bold" numberOfLines={1}>
                    {getSourceName(switcherDisplay1Source)}
                  </Text>
                  <Text className="text-white/30 text-[8px]">Tap to cycle source</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleSetActiveDisplay("display1")}
                  className={`py-2 rounded-[12px] items-center justify-center border ${
                    switcherActiveDisplay === "display1"
                      ? "bg-red-500 border-red-400"
                      : "bg-white/10 border-white/15"
                  }`}
                >
                  <Text className={`text-[10px] font-black ${switcherActiveDisplay === "display1" ? "text-white" : "text-white/70"}`}>
                    {switcherActiveDisplay === "display1" ? "SHOWING [1]" : "SHOW DISP 1"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Display 2 Card */}
              <View className={`flex-1 p-3 rounded-[12px] border ${
                switcherActiveDisplay === "display2"
                  ? "bg-red-500/10 border-red-500/50"
                  : "bg-black/30 border-white/5"
              }`}>
                <View className="flex-row items-center justify-between mb-1.5">
                  <View className="flex-row items-center gap-1">
                    <View className="w-4 h-4 rounded-[12px] bg-violet-500/20 items-center justify-center border border-violet-500/40">
                      <Text className="text-violet-400 text-[9px] font-black">2</Text>
                    </View>
                    <Text className="text-xs font-black text-white">DISP 2</Text>
                  </View>
                  <View className={`px-1.5 py-0.5 rounded-[12px] ${
                    switcherActiveDisplay === "display2" ? "bg-red-500" : "bg-white/10"
                  }`}>
                    <Text className={`text-[7px] font-black ${switcherActiveDisplay === "display2" ? "text-white" : "text-white/40"}`}>
                      {switcherActiveDisplay === "display2" ? "ON AIR" : "STANDBY"}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => handleCycleSource("display2")}
                  className="bg-black/60 border border-white/10 py-1.5 px-2 rounded-[12px] mb-2"
                >
                  <Text className="text-white text-[10px] font-bold" numberOfLines={1}>
                    {getSourceName(switcherDisplay2Source)}
                  </Text>
                  <Text className="text-white/30 text-[8px]">Tap to cycle source</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleSetActiveDisplay("display2")}
                  className={`py-2 rounded-[12px] items-center justify-center border ${
                    switcherActiveDisplay === "display2"
                      ? "bg-red-500 border-red-400"
                      : "bg-white/10 border-white/15"
                  }`}
                >
                  <Text className={`text-[10px] font-black ${switcherActiveDisplay === "display2" ? "text-white" : "text-white/70"}`}>
                    {switcherActiveDisplay === "display2" ? "SHOWING [2]" : "SHOW DISP 2"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Swap Button */}
            <TouchableOpacity
              onPress={() => handleSetActiveDisplay(switcherActiveDisplay === "display1" ? "display2" : "display1")}
              className="py-2.5 px-3 rounded-[12px] bg-white/10 border border-white/15 flex-row items-center justify-center gap-2 active:bg-white/20"
            >
              <ArrowsOut size={14} color="#f59e0b" />
              <Text className="text-white text-xs font-bold">
                Swap: Switch to {switcherActiveDisplay === "display1" ? "Display 2" : "Display 1"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Camera grid (controller mode) - DEF-07: Filter out viewing device's own camera */}
          {(() => {
            const visibleCameraSlots = switcherCameraSlots.filter((slot) => slot.socketId !== socket?.id);
            return (
              <View>
                <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
                  Connected Camera Sources ({visibleCameraSlots.length}/6)
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {visibleCameraSlots.map((slot) => {
                    const isProgram = slot.socketId === effectiveProgramSourceId;
                    const isDisp1 = switcherDisplay1Source === slot.socketId;
                    const isDisp2 = switcherDisplay2Source === slot.socketId;

                    return (
                      <View
                        key={slot.socketId}
                        className={`flex-1 min-w-[45%] p-3 rounded-[12px] border ${
                          isProgram
                            ? "bg-red-500/10 border-red-500/40"
                            : "bg-white/[0.04] border-white/10"
                        }`}
                      >
                        <View className="flex-row items-center justify-between mb-2">
                          <View className="flex-row items-center gap-1.5">
                            <View
                              className={`w-2 h-2 rounded-full ${
                                isProgram ? "bg-red-500" : "bg-emerald-500"
                              }`}
                            />
                            <Text className="text-white font-bold text-xs">
                              {slot.name || `Cam ${slot.slotIndex}`}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            {isDisp1 && (
                              <View className="px-1.5 py-0.5 rounded-[12px] bg-sky-500/30 border border-sky-500/40">
                                <Text className="text-sky-300 text-[8px] font-black">DISP 1</Text>
                              </View>
                            )}
                            {isDisp2 && (
                              <View className="px-1.5 py-0.5 rounded-[12px] bg-violet-500/30 border border-violet-500/40">
                                <Text className="text-violet-300 text-[8px] font-black">DISP 2</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        <View className="flex-row gap-1.5 mt-1">
                          <TouchableOpacity
                            onPress={() => handleSetProgram(slot.socketId)}
                            className={`flex-1 py-1.5 rounded-[12px] items-center justify-center ${
                              isProgram
                                ? "bg-red-600"
                                : "bg-white/10 active:bg-white/20"
                            }`}
                          >
                            <Text className="text-white text-[9px] font-black">
                              {isProgram ? "PROGRAM" : "CUT TO"}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleSetDisplaySource("display1", slot.socketId)}
                            className="px-2 py-0.5 rounded-[12px] bg-sky-500/20 border border-sky-500/30 active:bg-sky-500/40"
                          >
                            <Text className="text-sky-300 text-[8px] font-black">1</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleSetDisplaySource("display2", slot.socketId)}
                            className="px-2 py-0.5 rounded-[12px] bg-violet-500/20 border border-violet-500/30 active:bg-violet-500/40"
                          >
                            <Text className="text-violet-300 text-[8px] font-black">2</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                  {visibleCameraSlots.length === 0 && (
                    <View className="flex-1 py-6 items-center">
                      <VideoCamera size={28} color="rgba(255,255,255,0.2)" />
                      <Text className="text-white/30 text-sm mt-2">No active camera streams</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })()}

          {/* Sanctuary Screen & Studio Overlays */}
          <View>
            <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Sanctuary Display & Studio Overlays</Text>
            <View className="flex-row gap-2">
              <View className="flex-1 p-3 rounded-[12px] bg-white/[0.04] border border-white/10">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-white font-bold text-xs">General Screen</Text>
                  <Text className="text-[8px] text-white/40">Presentation</Text>
                </View>
                <View className="flex-row gap-1.5 mt-2">
                  <TouchableOpacity
                    onPress={() => handleSetDisplaySource("display1", "general")}
                    className="flex-1 py-1 rounded-[12px] bg-sky-500/20 border border-sky-500/30 items-center justify-center"
                  >
                    <Text className="text-sky-300 text-[9px] font-black">Set as 1</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSetDisplaySource("display2", "general")}
                    className="flex-1 py-1 rounded-[12px] bg-violet-500/20 border border-violet-500/30 items-center justify-center"
                  >
                    <Text className="text-violet-300 text-[9px] font-black">Set as 2</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Studio Overlays & Scaling Button Card (Replacing Stage Screen) */}
              <TouchableOpacity
                onPress={() => setShowStudioModal(true)}
                className="flex-1 p-3 rounded-[12px] bg-purple-900/25 border border-purple-500/40 justify-between"
                activeOpacity={0.8}
              >
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-purple-200 font-bold text-xs">Studio Overlays</Text>
                  {(bConfig.logo.enabled || bConfig.lowerThird.enabled || bConfig.bibleLowerThird.isShowing || bConfig.ticker.enabled || bConfig.scale < 1.0) && (
                    <View className="w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                </View>
                <Text className="text-[9px] text-white/40 mb-2">Scaling, Logo & Bible</Text>
                <View className="py-1.5 rounded-[12px] bg-purple-600/50 border border-purple-400/40 items-center justify-center">
                  <Text className="text-white text-[9px] font-black uppercase">Open Studio Modal</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Transition Library Controls ── */}
          <View className="bg-white/[0.04] border border-white/10 rounded-[12px] p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-1.5">
                <SlidersHorizontal size={13} color="rgba(255,255,255,0.6)" />
                <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40">Transition Library</Text>
              </View>
              <View className="bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                <Text className="text-[9px] font-bold text-emerald-400 uppercase">Single-Bus</Text>
              </View>
            </View>

            {/* Type selector: Cut, Fade, Wipe */}
            <View className="flex-row gap-2 mb-3">
              {[
                { id: "cut" as const, label: "Cut", Icon: Lightning },
                { id: "fade" as const, label: "Fade", Icon: SlidersHorizontal },
                { id: "wipe" as const, label: "Wipe", Icon: ArrowRight },
              ].map(({ id, label, Icon }) => {
                const isSelected = switcherTransitionSetting.type === id;
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => handleTransitionSetting({ type: id })}
                    className={`flex-1 py-2.5 px-2 rounded-[12px] border flex-row items-center justify-center gap-1.5 ${
                      isSelected
                        ? "bg-red-500/20 border-red-500/50"
                        : "bg-white/[0.03] border-white/10 active:bg-white/10"
                    }`}
                  >
                    <Icon size={14} color={isSelected ? "#f87171" : "rgba(255,255,255,0.4)"} weight={isSelected ? "bold" : "regular"} />
                    <Text className={`text-xs font-bold ${isSelected ? "text-white" : "text-white/50"}`}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Direction selector when Wipe is selected */}
            {switcherTransitionSetting.type === "wipe" && (
              <View className="mb-3">
                <Text className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-2">Wipe Direction</Text>
                <View className="flex-row gap-1.5">
                  {[
                    { id: "left-to-right" as const, label: "L → R", Icon: ArrowRight },
                    { id: "right-to-left" as const, label: "R → L", Icon: ArrowLeft },
                    { id: "top-to-bottom" as const, label: "T → B", Icon: ArrowDown },
                    { id: "bottom-to-top" as const, label: "B → T", Icon: ArrowUp },
                  ].map(({ id, label, Icon }) => {
                    const isSelected = switcherTransitionSetting.direction === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() => handleTransitionSetting({ direction: id })}
                        className={`flex-1 py-2 rounded-[12px] border flex-row items-center justify-center gap-1 ${
                          isSelected
                            ? "bg-amber-500/20 border-amber-500/50"
                            : "bg-white/[0.03] border-white/10 active:bg-white/10"
                        }`}
                      >
                        <Icon size={11} color={isSelected ? "#fde68a" : "rgba(255,255,255,0.4)"} />
                        <Text className={`text-[10px] font-semibold ${isSelected ? "text-amber-200 font-bold" : "text-white/40"}`}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Duration presets */}
            {switcherTransitionSetting.type !== "cut" && (
              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-1">
                    <Clock size={11} color="rgba(255,255,255,0.3)" />
                    <Text className="text-[9px] font-bold uppercase tracking-widest text-white/30">Duration</Text>
                  </View>
                  <Text className="text-[11px] font-mono font-bold text-white/80">
                    {switcherTransitionSetting.duration} ms
                  </Text>
                </View>
                <View className="flex-row gap-1.5">
                  {[250, 500, 750, 1000, 1500].map((ms) => {
                    const isCurrent = switcherTransitionSetting.duration === ms;
                    return (
                      <TouchableOpacity
                        key={ms}
                        onPress={() => handleTransitionSetting({ duration: ms })}
                        className={`flex-1 py-1.5 rounded-[12px] border items-center justify-center ${
                          isCurrent
                            ? "bg-white/20 border-white/40"
                            : "bg-white/[0.02] border-white/5 active:bg-white/10"
                        }`}
                      >
                        <Text className={`text-[10px] font-mono ${isCurrent ? "text-white font-bold" : "text-white/40"}`}>
                          {ms}ms
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* Live Output Sharing Deck */}
          <View className="bg-white/[0.04] border border-white/10 rounded-[12px] p-4">
            <View className="mb-2">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40">Share Live Output</Text>
              <Text className="text-[10px] text-white/30 mt-0.5">
                Displays Live Output without interrupting active presentations on sanctuary screens.
              </Text>
            </View>

            {[
              {
                dest: "general" as const,
                label: "Share to General Screen",
                sublabel: switcherRouteGeneral ? "Live Output on sanctuary display" : "Showing church presentation",
                Icon: Monitor,
                active: switcherRouteGeneral,
              },
              {
                dest: "speaker" as const,
                label: "Share to Speaker Screen",
                sublabel: switcherRouteSpeaker ? "Live Output on confidence display" : "Showing stage confidence monitor",
                Icon: UsersThree,
                active: switcherRouteSpeaker,
              },
            ].map(({ dest, label, sublabel, Icon, active }) => (
              <TouchableOpacity
                key={dest}
                onPress={() => handleRouteToggle(dest)}
                disabled={!switcherProgramSourceId}
                className={`flex-row items-center justify-between px-3 py-2.5 mb-2 rounded-[12px] border ${
                  active
                    ? dest === "general"
                      ? "bg-sky-500/20 border-sky-500/40"
                      : "bg-violet-500/20 border-violet-500/40"
                    : "bg-white/[0.03] border-white/10"
                } ${!switcherProgramSourceId ? "opacity-40" : "active:scale-98"}`}
              >
                <View className="flex-row items-center gap-2.5 flex-1 pr-2">
                  <Icon size={16} color={active ? (dest === "general" ? "#38bdf8" : "#a78bfa") : "rgba(255,255,255,0.4)"} />
                  <View>
                    <Text className={`font-bold text-xs ${active ? "text-white" : "text-white/70"}`}>{label}</Text>
                    <Text className="text-[9px] text-white/30 mt-0.5">{sublabel}</Text>
                  </View>
                </View>
                <View className={`px-2 py-0.5 rounded-[12px] border ${
                  active
                    ? dest === "general" ? "bg-sky-500/30 border-sky-500/40" : "bg-violet-500/30 border-violet-500/40"
                    : "bg-white/5 border-white/10"
                }`}>
                  <Text className={`text-[8px] font-black ${active ? "text-white" : "text-white/30"}`}>
                    {active ? "● ON AIR" : "OFF"}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Return control to desktop */}
          <TouchableOpacity
            onPress={handleReclaimControl}
            className="flex-row items-center justify-center gap-2 bg-white/[0.04] border border-white/10 py-3.5 rounded-[12px] active:bg-white/10"
          >
            <ArrowCounterClockwise size={15} color="rgba(255,255,255,0.5)" />
            <Text className="text-white/50 font-semibold text-sm">Return Control to Desktop</Text>
          </TouchableOpacity>
        </ScrollView>
        {renderStudioModal()}
      </SafeAreaView>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW MODE 2: FULLSCREEN PRO-CAMCORDER CAMERA VIEWFINDER (DEFAULT VIEW)
  // Matching the reference pro-camera framing, corner brackets, and controls
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.viewfinderRoot}>
      <StatusBar barStyle="light-content" hidden />

      {/* ── Camera Hardware Layer ── */}
      {permission?.granted ? (
        <View style={StyleSheet.absoluteFill}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mirror={isMirrored}
            animateShutter={false}
            pictureSize={pictureSize}
            enableTorch={facing === "back" && torch}
            zoom={zoom}
            onCameraReady={handleCameraReady}
            onMountError={(err) => {
              console.warn("[LiveSwitcher Camera Mount Error]", err);
              showFeedback("Camera error: " + (err?.message || "Failed to mount"), false);
            }}
          />
          {/* Color Grading & Real-time Tint Filter Overlay */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: selectedEffect.overlayColor, pointerEvents: "none" },
            ]}
          />
        </View>
      ) : (
        <View style={styles.permissionFallback}>
          <VideoCamera size={48} color="#9333ea" weight="duotone" />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            {permission && !permission.canAskAgain
              ? "Camera permission is disabled in system settings. Please enable camera access to stream."
              : "Allow camera access to transmit high-definition video to the church production switcher."}
          </Text>
          <TouchableOpacity
            onPress={permission && !permission.canAskAgain ? () => Linking.openSettings() : requestPermission}
            style={styles.grantButton}
          >
            <Text style={styles.grantButtonText}>
              {permission && !permission.canAskAgain ? "Open System Settings" : "Grant Camera Permission"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── 4 White Corner Framing Brackets (Exact Reference Match) ── */}
      <View style={styles.cornerTopLeft} pointerEvents="none" />
      <View style={styles.cornerTopRight} pointerEvents="none" />
      <View style={styles.cornerBottomLeft} pointerEvents="none" />
      <View style={styles.cornerBottomRight} pointerEvents="none" />

      {/* ── Center Focus Reticle Box & Crosshair [ + ] ── */}
      {showCenterReticle && (
        <View style={styles.centerReticleBox} pointerEvents="none">
          {/* 4 Inner Reticle Corners */}
          <View style={styles.reticleTopLeft} />
          <View style={styles.reticleTopRight} />
          <View style={styles.reticleBottomLeft} />
          <View style={styles.reticleBottomRight} />

          {/* Centered Crosshair + */}
          <View style={styles.crosshairHoriz} />
          <View style={styles.crosshairVert} />
        </View>
      )}

      {/* ── Broadcast Overlays & Scaling Layer (Preview On Viewfinder) ── */}

      {/* 1. Scale Framing Guide (if scale < 1.0) */}
      {bConfig.scale < 1.0 && (
        <View
          style={{
            position: "absolute",
            top: `${((1 - bConfig.scale) / 2) * 100}%`,
            bottom: `${((1 - bConfig.scale) / 2) * 100}%`,
            left: `${((1 - bConfig.scale) / 2) * 100}%`,
            right: `${((1 - bConfig.scale) / 2) * 100}%`,
            borderWidth: 2,
            borderColor: "rgba(168, 85, 247, 0.7)",
            borderRadius: 12,
            pointerEvents: "none",
            zIndex: 12,
          }}
        >
          <View style={{ position: "absolute", top: 6, left: 8, backgroundColor: "rgba(168, 85, 247, 0.85)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 }}>
            <Text style={{ color: "#FFF", fontSize: 9, fontWeight: "900" }}>
              {Math.round(bConfig.scale * 100)}% BROADCAST INSET
            </Text>
          </View>
        </View>
      )}

      {/* 2. Watermark / Event Logo */}
      {bConfig.logo.enabled && (
        <View
          pointerEvents="none"
          style={[
            styles.logoContainer,
            bConfig.logo.position === "top-right" && { top: 76, right: 24 },
            bConfig.logo.position === "top-left" && { top: 76, left: 24 },
            bConfig.logo.position === "bottom-right" && { bottom: 90, right: 24 },
            bConfig.logo.position === "bottom-left" && { bottom: 90, left: 24 },
            { opacity: bConfig.logo.opacity },
          ]}
        >
          {bConfig.logo.preset === "cross" ? (
            <View style={[styles.logoBadge, { width: bConfig.logo.size, height: bConfig.logo.size * 0.75 }]}>
              <Text style={styles.logoCrossText}>✝</Text>
              <Text style={styles.logoTextSmall}>FAITH</Text>
            </View>
          ) : bConfig.logo.preset === "ocs" ? (
            <View style={[styles.logoBadge, { width: bConfig.logo.size, height: bConfig.logo.size * 0.75 }]}>
              <Text style={styles.logoOcsText}>OCS</Text>
              <Text style={styles.logoLiveDot}>● LIVE</Text>
            </View>
          ) : bConfig.logo.preset === "dove" ? (
            <View style={[styles.logoBadge, { width: bConfig.logo.size, height: bConfig.logo.size * 0.75 }]}>
              <Text style={styles.logoDoveText}>🕊</Text>
              <Text style={styles.logoTextSmall}>PEACE</Text>
            </View>
          ) : bConfig.logo.url ? (
            <Image
              source={{ uri: bConfig.logo.url }}
              style={{ width: bConfig.logo.size, height: bConfig.logo.size * 0.75, resizeMode: "contain" }}
            />
          ) : null}
        </View>
      )}

      {/* 3. Speaker Lower Third (if active and not suppressed by bible) */}
      {bConfig.lowerThird.enabled && !bConfig.bibleLowerThird.isShowing && (
        <View
          pointerEvents="none"
          style={[
            styles.lowerThirdContainer,
            bConfig.lowerThird.theme === "purple" && styles.lowerThirdPurple,
            bConfig.lowerThird.theme === "gradient" && styles.lowerThirdGradient,
            bConfig.lowerThird.theme === "minimal" && styles.lowerThirdMinimal,
          ]}
        >
          <View style={styles.lowerThirdAccentBar} />
          <View style={styles.lowerThirdContent}>
            <Text style={styles.lowerThirdTitle} numberOfLines={1}>
              {bConfig.lowerThird.title || "Speaker"}
            </Text>
            {bConfig.lowerThird.subtitle ? (
              <Text style={styles.lowerThirdSubtitle} numberOfLines={1}>
                {bConfig.lowerThird.subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {/* 4. Bible Scripture Lower Third (High-Priority Broadcast Graphic) */}
      {bConfig.bibleLowerThird.enabled && bConfig.bibleLowerThird.isShowing && (
        <View style={styles.bibleLowerThirdContainer}>
          <View style={styles.bibleLowerThirdCard}>
            <View style={styles.bibleLowerThirdHeader}>
              <View style={styles.bibleTagRow}>
                <BookOpen size={14} color="#FDE047" weight="bold" />
                <Text style={styles.bibleRefText}>
                  {bConfig.bibleLowerThird.currentRef || "Scripture"}
                </Text>
                <View style={styles.bibleVersionPill}>
                  <Text style={styles.bibleVersionText}>
                    {bConfig.bibleLowerThird.version || "KJV"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => updateBroadcastConfig({ bibleLowerThird: { ...bConfig.bibleLowerThird, isShowing: false } })}
                style={styles.bibleDismissBtn}
              >
                <X size={12} color="#FFFFFF" weight="bold" />
              </TouchableOpacity>
            </View>
            <Text style={styles.bibleBodyText} numberOfLines={3}>
              "{bConfig.bibleLowerThird.currentText}"
            </Text>
          </View>
        </View>
      )}

      {/* 5. Live Announcement Ticker Banner */}
      {bConfig.ticker.enabled && bConfig.ticker.text ? (
        <View style={styles.tickerContainer} pointerEvents="none">
          <View style={styles.tickerBadge}>
            <Text style={styles.tickerBadgeText}>NEWS</Text>
          </View>
          <Text style={styles.tickerText} numberOfLines={1}>
            {bConfig.ticker.text}
          </Text>
        </View>
      ) : null}

      {/* ── Top Bar Controls: Back, 4K 60FPS Pill, Icons, LIVE Status ── */}
      <SafeAreaView style={styles.topBarContainer}>
        <View style={styles.topBarRow}>
          {/* Left Controls */}
          <View style={styles.topBarLeft}>
            {/* Back Icon */}
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.circleIconBtn}
              activeOpacity={0.7}
            >
              <CaretLeft size={22} color="#FFFFFF" weight="bold" />
            </TouchableOpacity>

            {/* 4K 60FPS Settings Pill (replaces battery) */}
            <TouchableOpacity
              onPress={() => setShowSettingsModal(true)}
              style={styles.settingsPill}
              activeOpacity={0.8}
            >
              <Text style={styles.settingsPillText}>{selectedPreset.label}</Text>
            </TouchableOpacity>

            {/* Torch Light (rear camera only) */}
            {facing === "back" && (
              <TouchableOpacity
                onPress={() => setTorch((t) => !t)}
                style={[styles.circleIconBtn, torch && styles.circleIconBtnActive]}
                activeOpacity={0.7}
              >
                <Lightning size={18} color={torch ? "#FDE047" : "#FFFFFF"} weight={torch ? "fill" : "bold"} />
              </TouchableOpacity>
            )}

            {/* Flip Camera */}
            <TouchableOpacity
              onPress={handleFlipCamera}
              style={styles.circleIconBtn}
              activeOpacity={0.7}
            >
              <ArrowCounterClockwise size={18} color="#FFFFFF" weight="bold" />
            </TouchableOpacity>

            {/* Mirror Toggle (Parity & Orientation Control) */}
            <TouchableOpacity
              onPress={() => {
                setIsMirrored((m) => !m);
                showFeedback(!isMirrored ? "Camera Mirrored" : "Camera Unmirrored", true);
              }}
              style={[styles.circleIconBtn, isMirrored && styles.circleIconBtnActivePurple]}
              activeOpacity={0.7}
            >
              <ArrowsLeftRight size={18} color={isMirrored ? "#C084FC" : "#FFFFFF"} weight="bold" />
            </TouchableOpacity>

            {/* Color Grade / Effects Toggle */}
            <TouchableOpacity
              onPress={() => setShowEffectsDrawer((v) => !v)}
              style={[styles.circleIconBtn, selectedEffect.id !== "normal" && styles.circleIconBtnActivePurple]}
              activeOpacity={0.7}
            >
              <Sparkle size={18} color={selectedEffect.id !== "normal" ? "#C084FC" : "#FFFFFF"} weight="fill" />
            </TouchableOpacity>

            {/* Broadcast Studio Overlays & Scaling Modal */}
            <TouchableOpacity
              onPress={() => setShowStudioModal(true)}
              style={[
                styles.circleIconBtn,
                (bConfig.logo.enabled || bConfig.lowerThird.enabled || bConfig.bibleLowerThird.isShowing || bConfig.ticker.enabled || bConfig.scale < 1.0) && styles.circleIconBtnActivePurple,
              ]}
              activeOpacity={0.7}
            >
              <TelevisionSimple size={18} color="#FFFFFF" weight="bold" />
            </TouchableOpacity>
          </View>

          {/* Right Status: 12px "LIVE" (Red) or "ON STANDBY" */}
          <View style={styles.statusBadgeWrapper}>
            <View
              style={[
                styles.statusDot,
                isThisDeviceProgram && isStreaming ? styles.statusDotLive : styles.statusDotStandby,
              ]}
            />
            <Text style={styles.statusText}>
              {isThisDeviceProgram && isStreaming ? "LIVE" : "ON STANDBY"}
            </Text>
          </View>
        </View>

        {/* Transient feedback toast */}
        {feedback && (
          <View style={[styles.feedbackToast, feedback.ok ? styles.feedbackOk : styles.feedbackError]}>
            <Text style={styles.feedbackToastText}>{feedback.text}</Text>
          </View>
        )}
      </SafeAreaView>

      {/* ── Right-Side Shutter / Record Clicker (Rounded Full) ── */}
      <View style={styles.rightShutterArea} pointerEvents="box-none">
        <TouchableOpacity
          onPress={isStreaming ? handleStopLive : handleGoLive}
          disabled={isConnecting}
          activeOpacity={0.8}
          style={styles.shutterOuterCircle}
        >
          <View
            style={[
              styles.shutterInnerCircle,
              isStreaming ? styles.shutterInnerCircleActive : styles.shutterInnerCircleStandby,
            ]}
          >
            {isConnecting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : isStreaming ? (
              <View style={styles.shutterSquare} />
            ) : null}
          </View>
        </TouchableOpacity>
        <Text style={styles.shutterAirLabel}>
          {isStreaming ? (isThisDeviceProgram ? "ON AIR" : "STREAMING") : "TAP TO AIR"}
        </Text>
      </View>

      {/* ── Bottom Bar: Slot Label & AUTO indicator (No countdown timer) ── */}
      <SafeAreaView style={styles.bottomBarContainer} pointerEvents="none">
        <View style={styles.bottomBarRow}>
          <Text style={styles.bottomSlotText}>
            {isCameraSource ? `CAM ${cameraSlotIndex || 1}` : "SLOT STANDBY"}
            {` • ${selectedPreset.fps} FPS`}
          </Text>
          <Text style={styles.bottomAutoText}>AUTO</Text>
        </View>
      </SafeAreaView>

      {/* ── Color Grading & Effects Drawer Modal ── */}
      <Modal
        visible={showEffectsDrawer}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEffectsDrawer(false)}
      >
        <View style={styles.drawerBackdrop}>
          <View style={styles.drawerSheet}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerTitleGroup}>
                <Sparkle size={18} color="#C084FC" weight="fill" />
                <Text style={styles.drawerTitle}>Color Grading & Live LUTs</Text>
              </View>
              <TouchableOpacity onPress={() => setShowEffectsDrawer(false)} style={styles.closeBtn}>
                <X size={18} color="#FFFFFF" weight="bold" />
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.effectsScroll}>
              {COLOR_EFFECTS.map((fx) => {
                const isActive = selectedEffect.id === fx.id;
                return (
                  <TouchableOpacity
                    key={fx.id}
                    onPress={() => setSelectedEffect(fx)}
                    style={[styles.effectChip, isActive && styles.effectChipActive]}
                  >
                    <View style={[styles.effectChipColorBox, { backgroundColor: fx.overlayColor === "transparent" ? "#333" : fx.overlayColor }]} />
                    <Text style={[styles.effectChipName, isActive && styles.effectChipNameActive]}>
                      {fx.name}
                    </Text>
                    <Text style={styles.effectChipDesc}>{fx.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Full Camera Settings Modal ── */}
      <Modal
        visible={showSettingsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.settingsModalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Camera Studio Settings</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)} style={styles.closeBtn}>
                <X size={18} color="#FFFFFF" weight="bold" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.settingsBody} showsVerticalScrollIndicator={false}>
              {/* Resolution & FPS */}
              <Text style={styles.settingsSectionTitle}>BROADCAST RESOLUTION & CADENCE</Text>
              <View style={styles.settingsGrid}>
                {CAMERA_PRESETS.map((preset) => {
                  const isCur = selectedPreset.id === preset.id;
                  return (
                    <TouchableOpacity
                      key={preset.id}
                      onPress={() => setSelectedPreset(preset)}
                      style={[styles.presetCard, isCur && styles.presetCardActive]}
                    >
                      <View style={styles.presetCardTop}>
                        <Text style={[styles.presetCardLabel, isCur && styles.presetCardLabelActive]}>
                          {preset.label}
                        </Text>
                        {isCur && <CheckCircle size={15} color="#C084FC" weight="fill" />}
                      </View>
                      <Text style={styles.presetCardDesc}>{preset.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Reticle / Overlays */}
              <Text style={[styles.settingsSectionTitle, { marginTop: 16 }]}>VIEWFINDER RETICLE</Text>
              <TouchableOpacity
                onPress={() => setShowCenterReticle((v) => !v)}
                style={styles.toggleRow}
              >
                <Text style={styles.toggleLabel}>Center Focus Box & Crosshair [ + ]</Text>
                <View style={[styles.togglePill, showCenterReticle && styles.togglePillOn]}>
                  <Text style={styles.togglePillText}>{showCenterReticle ? "ENABLED" : "OFF"}</Text>
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Render Studio Overlays & Scaling Modal */}
      {renderStudioModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Pro Viewfinder Root ────────────────────────────────────────────────────
  viewfinderRoot: {
    flex: 1,
    backgroundColor: "#000000",
    position: "relative",
  },

  // ── 4 White Corner Framing Brackets ────────────────────────────────────────
  cornerTopLeft: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 48,
    height: 48,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: "#FFFFFF",
    zIndex: 10,
  },
  cornerTopRight: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 48,
    height: 48,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: "#FFFFFF",
    zIndex: 10,
  },
  cornerBottomLeft: {
    position: "absolute",
    bottom: 20,
    left: 20,
    width: 48,
    height: 48,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: "#FFFFFF",
    zIndex: 10,
  },
  cornerBottomRight: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 48,
    height: 48,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: "#FFFFFF",
    zIndex: 10,
  },

  // ── Center Focus Reticle Box & Crosshair [ + ] ─────────────────────────────
  centerReticleBox: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 96,
    height: 96,
    transform: [{ translateX: -48 }, { translateY: -48 }],
    zIndex: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  reticleTopLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 18,
    height: 18,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: "#FFFFFF",
  },
  reticleTopRight: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 18,
    height: 18,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: "#FFFFFF",
  },
  reticleBottomLeft: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 18,
    height: 18,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: "#FFFFFF",
  },
  reticleBottomRight: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: "#FFFFFF",
  },
  crosshairHoriz: {
    width: 18,
    height: 2,
    backgroundColor: "#FFFFFF",
  },
  crosshairVert: {
    width: 2,
    height: 18,
    backgroundColor: "#FFFFFF",
    position: "absolute",
  },

  // ── Top Bar Container ──────────────────────────────────────────────────────
  topBarContainer: {
    position: "absolute",
    top: 24,
    left: 24,
    right: 24,
    zIndex: 25,
  },
  topBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  circleIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  circleIconBtnActive: {
    backgroundColor: "rgba(234, 179, 8, 0.3)",
    borderColor: "rgba(234, 179, 8, 0.6)",
  },
  circleIconBtnActivePurple: {
    backgroundColor: "rgba(168, 85, 247, 0.3)",
    borderColor: "rgba(168, 85, 247, 0.6)",
  },
  settingsPill: {
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
  },
  settingsPillText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  // ── Top-Right Status Badge (Strictly 12px text) ────────────────────────────
  statusBadgeWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 9999,
  },
  statusDotLive: {
    backgroundColor: "#EF4444",
    ...Platform.select({
      web: { boxShadow: "0 0 8px #EF4444" },
      default: { shadowColor: "#EF4444", shadowOpacity: 0.9, shadowRadius: 6 },
    }),
  },
  statusDotStandby: {
    backgroundColor: "#10B981",
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },

  // ── Right-Side Rounded Full Clicker / Shutter ──────────────────────────────
  rightShutterArea: {
    position: "absolute",
    right: 28,
    top: "50%",
    transform: [{ translateY: -44 }],
    alignItems: "center",
    zIndex: 30,
    gap: 6,
  },
  shutterOuterCircle: {
    width: 68,
    height: 68,
    borderRadius: 9999, // Circular rounded-full
    borderWidth: 3.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    ...Platform.select({
      web: { boxShadow: "0 4px 14px rgba(0, 0, 0, 0.5)" },
      default: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 8 },
    }),
  },
  shutterInnerCircle: {
    width: 52,
    height: 52,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInnerCircleStandby: {
    backgroundColor: "#FFFFFF",
  },
  shutterInnerCircleActive: {
    backgroundColor: "#EF4444",
    ...Platform.select({
      web: { boxShadow: "0 0 16px #EF4444" },
      default: { shadowColor: "#EF4444", shadowOpacity: 0.9, shadowRadius: 10 },
    }),
  },
  shutterSquare: {
    width: 18,
    height: 18,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  shutterAirLabel: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    textShadowColor: "#000",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // ── Bottom Bar ─────────────────────────────────────────────────────────────
  bottomBarContainer: {
    position: "absolute",
    bottom: 24,
    left: 24,
    right: 24,
    zIndex: 25,
  },
  bottomBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bottomSlotText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  bottomAutoText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  // ── Modals & Drawers ───────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  settingsModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#16151f",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsBody: {
    flexGrow: 0,
  },
  settingsSectionTitle: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
    marginBottom: 10,
  },
  settingsGrid: {
    gap: 8,
  },
  presetCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    padding: 12,
  },
  presetCardActive: {
    backgroundColor: "rgba(168, 85, 247, 0.15)",
    borderColor: "rgba(168, 85, 247, 0.5)",
  },
  presetCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  presetCardLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "bold",
  },
  presetCardLabelActive: {
    color: "#C084FC",
  },
  presetCardDesc: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 11,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    padding: 12,
  },
  toggleLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  togglePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  togglePillOn: {
    backgroundColor: "#7c3aed",
  },
  togglePillText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
  },

  // ── Color Grading Drawer ───────────────────────────────────────────────────
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  drawerSheet: {
    backgroundColor: "#16151f",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderTopWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    padding: 20,
    paddingBottom: 36,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  drawerTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  drawerTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },
  effectsScroll: {
    gap: 10,
    paddingVertical: 4,
  },
  effectChip: {
    width: 108,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
  },
  effectChipActive: {
    backgroundColor: "rgba(168, 85, 247, 0.18)",
    borderColor: "#C084FC",
  },
  effectChipColorBox: {
    width: 32,
    height: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    marginBottom: 6,
  },
  effectChipName: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 2,
  },
  effectChipNameActive: {
    color: "#C084FC",
  },
  effectChipDesc: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 9,
    textAlign: "center",
  },

  // ── Feedback Toast ─────────────────────────────────────────────────────────
  feedbackToast: {
    alignSelf: "center",
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  feedbackOk: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderColor: "rgba(16, 185, 129, 0.4)",
  },
  feedbackError: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  feedbackToastText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "bold",
  },

  // ── Permission Fallback ────────────────────────────────────────────────────
  permissionFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#0c0b10",
  },
  permissionTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
  },
  permissionText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  grantButton: {
    backgroundColor: "#7c3aed",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  grantButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },

  // ── Broadcast Overlays Styles ──────────────────────────────────────────────
  logoContainer: {
    position: "absolute",
    zIndex: 20,
  },
  logoBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
  logoCrossText: {
    fontSize: 22,
    color: "#FDE047",
    fontWeight: "900",
  },
  logoOcsText: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: 1,
  },
  logoDoveText: {
    fontSize: 22,
  },
  logoLiveDot: {
    fontSize: 8,
    color: "#EF4444",
    fontWeight: "800",
    marginTop: 2,
  },
  logoTextSmall: {
    fontSize: 7,
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "700",
    letterSpacing: 1,
  },
  lowerThirdContainer: {
    position: "absolute",
    bottom: 75,
    left: 20,
    maxWidth: "80%",
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 12,
    flexDirection: "row",
    overflow: "hidden",
    zIndex: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  lowerThirdAccentBar: {
    width: 5,
    backgroundColor: "#C084FC",
  },
  lowerThirdContent: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  lowerThirdTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  lowerThirdSubtitle: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  lowerThirdPurple: {
    backgroundColor: "rgba(88, 28, 135, 0.85)",
    borderColor: "rgba(168, 85, 247, 0.3)",
  },
  lowerThirdGradient: {
    backgroundColor: "rgba(124, 45, 18, 0.85)",
    borderColor: "rgba(251, 146, 60, 0.3)",
  },
  lowerThirdMinimal: {
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  bibleLowerThirdContainer: {
    position: "absolute",
    bottom: 75,
    left: 16,
    right: 16,
    zIndex: 23,
  },
  bibleLowerThirdCard: {
    backgroundColor: "rgba(10, 10, 15, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(234, 179, 8, 0.4)",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  bibleLowerThirdHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  bibleTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bibleRefText: {
    color: "#FDE047",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  bibleVersionPill: {
    backgroundColor: "rgba(234, 179, 8, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 12,
  },
  bibleVersionText: {
    color: "#FDE047",
    fontSize: 9,
    fontWeight: "800",
  },
  bibleDismissBtn: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  bibleBodyText: {
    color: "rgba(255, 255, 255, 0.95)",
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
  },
  tickerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 28,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    zIndex: 21,
  },
  tickerBadge: {
    backgroundColor: "#DC2626",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    marginRight: 8,
  },
  tickerBadgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "900",
  },
  tickerText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
  },

  // ── Broadcast Studio Modal Styles ──────────────────────────────────────────
  studioModalCard: {
    backgroundColor: "#13111a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    width: "100%",
    maxWidth: 480,
    maxHeight: "85%",
    overflow: "hidden",
  },
  studioModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  studioTabBar: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    gap: 6,
  },
  studioTabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  studioTabBtnActive: {
    backgroundColor: "rgba(168, 85, 247, 0.25)",
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.5)",
  },
  studioTabBtnText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 10,
    fontWeight: "700",
  },
  studioTabBtnTextActive: {
    color: "#C084FC",
    fontWeight: "800",
  },
  studioModalBody: {
    padding: 16,
  },
  scalePresetBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  scalePresetBtnActive: {
    backgroundColor: "rgba(168, 85, 247, 0.25)",
    borderColor: "#A855F7",
  },
  scalePresetBtnText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 11,
    fontWeight: "700",
  },
  scalePresetBtnTextActive: {
    color: "#F3E8FF",
    fontWeight: "800",
  },
  studioTextInput: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#FFFFFF",
    fontSize: 12,
  },
  studioActionBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  studioActionBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
