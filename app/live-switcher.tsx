import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Modal,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
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
  Camera,
  Lightning,
  SlidersHorizontal,
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Clock,
  ArrowsOut,
  Lightbulb,
} from "phosphor-react-native";
import { useSocketStore } from "../store/socketStore";

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
    socket,
    optInAsCamera,
    optOutAsCamera,
    setSwitcherProgram,
    setSwitcherRoute,
    setSwitcherTransitionSetting,
    setSwitcherActiveDisplay,
    setSwitcherDisplaySource,
    requestControlReclaim,
    sendSwitcherCameraFrame,
  } = useSocketStore();

  const effectiveProgramSourceId = switcherActiveDisplay === "display1"
    ? (switcherDisplay1Source || "general")
    : (switcherDisplay2Source || (switcherCameraSlots[0]?.socketId || "speaker"));

  const isThisDeviceProgram = socket?.id != null && socket.id === effectiveProgramSourceId;

  // ── Native Camera Studio State ─────────────────────────────────────────────
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [showViewfinderModal, setShowViewfinderModal] = useState<boolean>(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [torch, setTorch] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(0);
  const [streamQuality, setStreamQuality] = useState<'fast' | 'hd' | 'eco'>('fast');
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [sentFps, setSentFps] = useState<number>(0);

  const cameraRef = useRef<any>(null);
  const fpsTrackerRef = useRef({ count: 0, lastCheck: Date.now() });

  // Keep isCameraActive synced with server camera-slot status
  useEffect(() => {
    if (isCameraSource && !isCameraActive) {
      setIsCameraActive(true);
    } else if (!isCameraSource && isCameraActive) {
      setIsCameraActive(false);
      setShowViewfinderModal(false);
      setTorch(false);
    }
  }, [isCameraSource]);

  const showFeedback = (text: string, ok: boolean) => {
    setFeedback({ text, ok });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Pick optimal low-overhead picture size for streaming on camera ready
  const handleCameraReady = useCallback(async () => {
    try {
      if (cameraRef.current?.getAvailablePictureSizesAsync) {
        const sizes: string[] = await cameraRef.current.getAvailablePictureSizesAsync();
        if (sizes && sizes.length > 0) {
          const preferred =
            sizes.find((s) => s === '640x480') ||
            sizes.find((s) => s === '800x600') ||
            sizes.find((s) => s === '1280x720') ||
            sizes.find((s) => s === '960x540') ||
            sizes[sizes.length - 1];
          if (preferred) setPictureSize(preferred);
        }
      }
    } catch (_) {}
  }, []);

  // ── High-performance continuous frame streaming engine ────────────────────
  useEffect(() => {
    let isMounted = true;
    let isCapturing = false;
    let animFrameId: any = null;
    let lastCaptureTime = 0;

    const fpsInterval = setInterval(() => {
      const now = Date.now();
      const delta = (now - fpsTrackerRef.current.lastCheck) / 1000;
      if (delta > 0) {
        setSentFps(Math.round(fpsTrackerRef.current.count / delta));
        fpsTrackerRef.current.count = 0;
        fpsTrackerRef.current.lastCheck = now;
      }
    }, 1000);

    const pumpFrame = async () => {
      if (!isMounted || !isCameraActive || !permission?.granted) return;

      const now = performance.now();
      // Cadence pacing: fast = ~45ms (~22fps), hd = ~65ms (~15fps), eco = ~95ms (~10fps)
      const minInterval = streamQuality === 'fast' ? 45 : streamQuality === 'hd' ? 65 : 95;

      if (!isCapturing && now - lastCaptureTime >= minInterval && cameraRef.current) {
        isCapturing = true;
        lastCaptureTime = now;
        try {
          const qualityVal = streamQuality === 'hd' ? 0.35 : streamQuality === 'eco' ? 0.18 : 0.25;
          const photo = await cameraRef.current.takePictureAsync({
            quality: qualityVal,
            base64: true,
            skipProcessing: true,
            shutterSound: false,
            fastMode: true,
            maxDownsampling: 2,
          });
          if (photo?.base64 && isMounted) {
            sendSwitcherCameraFrame(photo.base64);
            fpsTrackerRef.current.count++;
          }
        } catch (_) {
          // Drop frame silently if camera HAL is busy
        } finally {
          isCapturing = false;
        }
      }

      if (isMounted && isCameraActive) {
        animFrameId = requestAnimationFrame(pumpFrame);
      }
    };

    if (isCameraActive && permission?.granted) {
      animFrameId = requestAnimationFrame(pumpFrame);
    }

    return () => {
      isMounted = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      clearInterval(fpsInterval);
    };
  }, [isCameraActive, permission?.granted, streamQuality]);

  const handleStartCamera = async () => {
    if (!permission?.granted) {
      const permRes = await requestPermission();
      if (!permRes.granted) {
        showFeedback("Camera permission is required to stream", false);
        return;
      }
    }
    const res = await optInAsCamera();
    if (res.ok) {
      setIsCameraActive(true);
      setShowViewfinderModal(true);
      showFeedback(`Connected as Camera ${res.slotIndex} of 6`, true);
    } else {
      showFeedback(res.error || "Failed to join camera slot", false);
    }
  };

  const handleStopCamera = async () => {
    setIsCameraActive(false);
    setShowViewfinderModal(false);
    setTorch(false);
    const res = await optOutAsCamera();
    if (res.ok) {
      showFeedback("Camera stream stopped", true);
    } else {
      showFeedback(res.error || "Failed to stop", false);
    }
  };

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

  if (!isPaired) {
    return (
      <SafeAreaView className="flex-1 bg-[#0c0b10] justify-center items-center px-6">
        <StatusBar barStyle="light-content" />
        <LockKey size={44} color="#9333ea" weight="duotone" />
        <Text className="text-2xl font-black text-white text-center mt-4 mb-2">Not Connected</Text>
        <Text className="text-white/50 text-sm text-center mb-8">Pair with the desktop workstation to use the Live Switcher.</Text>
        <TouchableOpacity
          onPress={() => router.push("/connect")}
          className="bg-purple-600/80 border border-purple-400/30 py-3 px-8 rounded-[12px]"
        >
          <Text className="text-white font-bold">Go to Connect</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0c0b10]">
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-white/[0.06]">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-2 rounded-[12px] active:bg-white/10">
          <CaretLeft size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-base font-black text-white">Live Switcher</Text>
          <Text className="text-[10px] text-white/40">
            {isSwitcherController ? "You are the controller" : isCameraSource ? `Camera ${cameraSlotIndex} of 6` : "Passive mode"}
          </Text>
        </View>
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

        {/* ── Native Camera Source Card ────────────────────────────────────── */}
        <View className={`border rounded-[12px] p-4 ${
          isThisDeviceProgram
            ? "bg-red-500/10 border-red-500/40"
            : isCameraActive
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-white/[0.04] border-white/10"
        }`}>
          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40">Camera Stream</Text>
              <Text className="text-white font-black text-base mt-0.5">
                {isCameraActive ? `Slot ${cameraSlotIndex || 1} of 6` : "Camera Standby"}
              </Text>
            </View>
            {isCameraActive && (
              <View className={`flex-row items-center gap-1.5 px-3 py-1 rounded-full border ${
                isThisDeviceProgram
                  ? "bg-red-500/30 border-red-400/60"
                  : "bg-emerald-500/20 border-emerald-500/30"
              }`}>
                <View className={`w-2 h-2 rounded-full ${isThisDeviceProgram ? "bg-red-400" : "bg-emerald-400"}`} />
                <Text className={`text-[10px] font-black ${isThisDeviceProgram ? "text-red-300" : "text-emerald-300"}`}>
                  {isThisDeviceProgram ? "LIVE ON PROGRAM" : "STANDBY • STREAMING"}
                </Text>
              </View>
            )}
          </View>

          {/* Embedded viewfinder preview when camera is active */}
          {isCameraActive && permission?.granted ? (
            <View className="mb-4">
              <View className={`w-full h-44 rounded-[12px] overflow-hidden relative border ${
                isThisDeviceProgram ? "border-red-500" : "border-emerald-500/50"
              }`}>
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing={facing}
                  animateShutter={false}
                  pictureSize={pictureSize}
                  enableTorch={facing === 'back' && torch}
                  zoom={zoom}
                  onCameraReady={handleCameraReady}
                />
                {/* Floating overlay indicators on preview */}
                <View className="absolute top-2 left-2 right-2 flex-row items-center justify-between pointer-events-none">
                  <View className={`px-2 py-0.5 rounded-full border ${
                    isThisDeviceProgram ? "bg-red-600/90 border-red-400" : "bg-black/70 border-white/20"
                  }`}>
                    <Text className="text-[9px] font-black text-white">
                      {isThisDeviceProgram ? "● ON AIR" : `CAM ${cameraSlotIndex || 1}`}
                    </Text>
                  </View>
                  <View className="bg-black/70 px-2 py-0.5 rounded-full border border-white/20">
                    <Text className="text-[9px] font-mono font-bold text-emerald-400">{sentFps} FPS</Text>
                  </View>
                </View>

                {/* Quick actions bar over preview */}
                <View className="absolute bottom-2 right-2 flex-row gap-1.5">
                  {facing === 'back' && (
                    <TouchableOpacity
                      onPress={() => setTorch((t) => !t)}
                      className={`p-2 rounded-[12px] border ${torch ? "bg-amber-500/80 border-amber-400" : "bg-black/60 border-white/20"}`}
                    >
                      <Lightbulb size={13} color="white" weight={torch ? "fill" : "regular"} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
                    className="p-2 rounded-[12px] bg-black/60 border border-white/20"
                  >
                    <ArrowCounterClockwise size={13} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowViewfinderModal(true)}
                    className="p-2 rounded-[12px] bg-black/60 border border-white/20"
                  >
                    <ArrowsOut size={13} color="white" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            <Text className="text-white/40 text-xs leading-relaxed mb-4">
              Stream your mobile camera directly into the Switcher with zero external browser tabs or network restrictions.
            </Text>
          )}

          {/* Action buttons */}
          <View className="flex-row gap-2">
            {!isCameraActive ? (
              <TouchableOpacity
                onPress={handleStartCamera}
                className="flex-1 flex-row items-center justify-center gap-2 bg-red-600 border border-red-400/40 py-3.5 rounded-[12px] active:scale-95"
              >
                <VideoCamera size={16} color="white" weight="fill" />
                <Text className="text-white font-bold text-sm">Start Live Camera</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => setShowViewfinderModal(true)}
                  className="flex-1 flex-row items-center justify-center gap-2 bg-purple-600/90 border border-purple-400/30 py-3 rounded-[12px] active:scale-95"
                >
                  <Camera size={16} color="white" weight="bold" />
                  <Text className="text-white font-bold text-xs">Fullscreen Studio</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleStopCamera}
                  className="px-4 flex-row items-center justify-center gap-1.5 bg-white/10 border border-white/15 py-3 rounded-[12px] active:scale-95"
                >
                  <Stop size={15} color="rgba(255,255,255,0.7)" weight="fill" />
                  <Text className="text-white/70 font-semibold text-xs">Stop</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* ── Controller section ─────────────────────────────────────────────── */}
        {isSwitcherController ? (
          <>
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

            {/* Camera grid (controller mode) */}
            <View>
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Camera Sources ({switcherCameraSlots.length}/6)</Text>
              <View className="flex-row flex-wrap gap-2">
                {switcherCameraSlots.map((slot) => {
                  const isTargetOfTransition = switcherActiveTransition?.toId === slot.socketId;
                  const isProgram = isTargetOfTransition || slot.socketId === effectiveProgramSourceId;
                  const isDisp1 = switcherDisplay1Source === slot.socketId;
                  const isDisp2 = switcherDisplay2Source === slot.socketId;
                  return (
                    <View
                      key={slot.socketId}
                      className={`flex-1 min-w-[45%] py-3 px-3 rounded-[12px] border ${
                        isProgram
                          ? "bg-red-600/20 border-red-500/50"
                          : "bg-white/[0.04] border-white/10"
                      }`}
                    >
                      <View className="flex-row items-center justify-between mb-1">
                        <View className="flex-row items-center gap-1">
                          <Text className="text-[8px] font-bold text-white/40 uppercase">CAM {slot.slotIndex}</Text>
                          {isDisp1 && <Text className="text-[8px] font-black text-sky-400 bg-sky-500/20 px-1 rounded-[12px]">D1</Text>}
                          {isDisp2 && <Text className="text-[8px] font-black text-violet-400 bg-violet-500/20 px-1 rounded-[12px]">D2</Text>}
                        </View>
                        {isProgram && (
                          <View className="flex-row items-center gap-1">
                            <View className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            <Text className="text-[8px] font-black text-red-400">LIVE</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-sm font-bold text-white" numberOfLines={1}>{slot.name}</Text>

                      {/* Quick assignment buttons */}
                      <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-white/10">
                        <Text className="text-[8px] text-white/30">Set as:</Text>
                        <View className="flex-row gap-1">
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
                    </View>
                  );
                })}
                {switcherCameraSlots.length === 0 && (
                  <View className="flex-1 py-6 items-center">
                    <VideoCamera size={28} color="rgba(255,255,255,0.2)" />
                    <Text className="text-white/30 text-sm mt-2">No cameras connected yet</Text>
                    <Text className="text-white/20 text-xs mt-1">Tap "Start Live Camera" to connect this phone</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Sanctuary & Stage Screens */}
            <View>
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Sanctuary & Stage Displays</Text>
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

                <View className="flex-1 p-3 rounded-[12px] bg-white/[0.04] border border-white/10">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-white font-bold text-xs">Speaker Screen</Text>
                    <Text className="text-[8px] text-white/40">Confidence</Text>
                  </View>
                  <View className="flex-row gap-1.5 mt-2">
                    <TouchableOpacity
                      onPress={() => handleSetDisplaySource("display1", "speaker")}
                      className="flex-1 py-1 rounded-[12px] bg-sky-500/20 border border-sky-500/30 items-center justify-center"
                    >
                      <Text className="text-sky-300 text-[9px] font-black">Set as 1</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleSetDisplaySource("display2", "speaker")}
                      className="flex-1 py-1 rounded-[12px] bg-violet-500/20 border border-violet-500/30 items-center justify-center"
                    >
                      <Text className="text-violet-300 text-[9px] font-black">Set as 2</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

            {/* ── Transition Library Controls ─────────────────────────────────── */}
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

              {/* Social Media Stream Card */}
              <View className="flex-row items-center justify-between px-3 py-2.5 rounded-[12px] border border-white/5 bg-black/30">
                <View className="flex-row items-center gap-2.5">
                  <Broadcast size={16} color="rgba(255,255,255,0.4)" />
                  <View>
                    <Text className="font-bold text-xs text-white/60">Social Media & Stream</Text>
                    <Text className="text-[9px] text-white/25">YouTube, Facebook & RTMP</Text>
                  </View>
                </View>
                <View className="px-2 py-0.5 rounded-[12px] bg-amber-500/10 border border-amber-500/20">
                  <Text className="text-[8px] font-bold text-amber-300 uppercase">Hub Ready</Text>
                </View>
              </View>

              {!switcherProgramSourceId && (
                <Text className="text-white/25 text-[10px] mt-2">Select a camera source first</Text>
              )}
            </View>

            {/* Return control to desktop */}
            <TouchableOpacity
              onPress={handleReclaimControl}
              className="flex-row items-center justify-center gap-2 bg-white/[0.04] border border-white/10 py-3.5 rounded-xl active:bg-white/10"
            >
              <ArrowCounterClockwise size={15} color="rgba(255,255,255,0.5)" />
              <Text className="text-white/50 font-semibold text-sm">Return Control to Desktop</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* Passive mode */
          <View className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5 items-center">
            <LockKey size={36} color="rgba(255,255,255,0.2)" weight="duotone" />
            <Text className="text-white/60 font-bold text-sm mt-3 text-center">Controller Mode Not Active</Text>
            <Text className="text-white/30 text-xs text-center mt-2 leading-relaxed max-w-[240px]">
              The desktop operator can grant you controller permission from the Remote panel → device menu → Grant Switcher Control.
            </Text>
          </View>
        )}

        {/* Connected cameras status */}
        <View className="flex-row items-center justify-center gap-2 mt-1 mb-4">
          <Broadcast size={12} color="rgba(255,255,255,0.2)" />
          <Text className="text-white/25 text-[10px]">
            {switcherCameraSlots.length} camera{switcherCameraSlots.length !== 1 ? "s" : ""} connected · Native Studio Streaming
          </Text>
        </View>
      </ScrollView>

      {/* ── Fullscreen Studio Camera Viewfinder Modal ──────────────────────── */}
      <Modal
        visible={showViewfinderModal && isCameraActive}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowViewfinderModal(false)}
      >
        <View style={styles.fullscreenContainer}>
          {permission?.granted ? (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              animateShutter={false}
              pictureSize={pictureSize}
              enableTorch={facing === 'back' && torch}
              zoom={zoom}
              onCameraReady={handleCameraReady}
            />
          ) : (
            <View style={styles.permissionFallback}>
              <Text style={styles.permissionText}>Camera permission needed</Text>
              <TouchableOpacity onPress={requestPermission} style={styles.grantButton}>
                <Text style={styles.grantButtonText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Studio Tally Border: 12px border radius mandate */}
          <View
            style={[
              styles.tallyBorder,
              isThisDeviceProgram ? styles.tallyBorderProgram : styles.tallyBorderStandby,
            ]}
          />

          {/* Top Studio HUD */}
          <View style={styles.topHud}>
            <View style={styles.tallyBadge}>
              <View
                style={[
                  styles.tallyDot,
                  isThisDeviceProgram ? styles.tallyDotProgram : styles.tallyDotStandby,
                ]}
              />
              <Text style={styles.tallyBadgeText}>
                {isThisDeviceProgram ? "● LIVE ON PROGRAM" : `STANDBY • CAM ${cameraSlotIndex || 1}`}
              </Text>
              <Text style={styles.fpsValue}>{sentFps} FPS</Text>
            </View>

            <View style={styles.topActions}>
              {facing === 'back' && (
                <TouchableOpacity
                  onPress={() => setTorch((t) => !t)}
                  style={[styles.hudBtn, torch && styles.hudBtnActive]}
                  activeOpacity={0.8}
                >
                  <Lightbulb size={16} color="white" weight={torch ? "fill" : "regular"} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
                style={styles.hudBtn}
                activeOpacity={0.8}
              >
                <ArrowCounterClockwise size={16} color="white" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowViewfinderModal(false)}
                style={styles.hudBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.hudBtnText}>Dock</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom Controls Deck */}
          <View style={styles.bottomHud}>
            {/* Stream Quality Selector */}
            <View style={styles.pillRow}>
              {(['fast', 'hd', 'eco'] as const).map((q) => (
                <TouchableOpacity
                  key={q}
                  onPress={() => setStreamQuality(q)}
                  style={[styles.qualityPill, streamQuality === q && styles.qualityPillActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.qualityPillText, streamQuality === q && styles.qualityPillTextActive]}>
                    {q === 'fast' ? '⚡ FAST (22 FPS)' : q === 'hd' ? '🌟 HD (15 FPS)' : '🌱 ECO (10 FPS)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Zoom Controls */}
            <View style={styles.zoomRow}>
              {[0, 0.05, 0.1].map((z, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => setZoom(z)}
                  style={[styles.zoomBtn, zoom === z && styles.zoomBtnActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.zoomBtnText, zoom === z && styles.zoomBtnTextActive]}>
                    {idx === 0 ? '1x' : idx === 1 ? '1.5x' : '2x'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Stop Camera Button */}
            <TouchableOpacity
              onPress={handleStopCamera}
              style={styles.stopStreamButton}
              activeOpacity={0.8}
            >
              <Stop size={16} color="white" weight="fill" />
              <Text style={styles.stopStreamButtonText}>Stop Camera Stream</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  tallyBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 6,
    borderRadius: 12,
    pointerEvents: 'none',
    zIndex: 40,
  },
  tallyBorderStandby: {
    borderColor: 'rgba(16, 185, 129, 0.65)',
  },
  tallyBorderProgram: {
    borderColor: 'rgba(239, 68, 68, 0.95)',
  },
  permissionFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 16,
  },
  grantButton: {
    backgroundColor: '#9333ea',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  grantButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  topHud: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 50,
  },
  tallyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  tallyDot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
  },
  tallyDotStandby: {
    backgroundColor: '#10b981',
  },
  tallyDotProgram: {
    backgroundColor: '#ef4444',
  },
  tallyBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  fpsValue: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginLeft: 4,
  },
  topActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  hudBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hudBtnActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#fbbf24',
  },
  hudBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  bottomHud: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 24,
    left: 16,
    right: 16,
    zIndex: 50,
    gap: 10,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  qualityPill: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
  },
  qualityPillActive: {
    backgroundColor: 'rgba(147, 51, 234, 0.4)',
    borderColor: '#a855f7',
  },
  qualityPillText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    fontWeight: 'bold',
  },
  qualityPillTextActive: {
    color: '#ffffff',
  },
  zoomRow: {
    flexDirection: 'row',
    gap: 8,
  },
  zoomBtn: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  zoomBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  zoomBtnText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontWeight: 'bold',
  },
  zoomBtnTextActive: {
    color: '#ffffff',
  },
  stopStreamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
    shadowColor: '#dc2626',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  stopStreamButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'black',
    letterSpacing: 0.5,
  },
});
