import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  mediaDevices,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStream,
} from "react-native-webrtc";
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
    sendWebRtcOffer,
    sendWebRtcIceCandidate,
    setWebRtcAnswerHandler,
    setWebRtcIceHandler,
    requestControlReclaim,
  } = useSocketStore();

  const effectiveProgramSourceId = switcherActiveDisplay === "display1"
    ? (switcherDisplay1Source || "general")
    : (switcherDisplay2Source || (switcherCameraSlots[0]?.socketId || "speaker"));

  const isThisDeviceProgram = socket?.id != null && socket.id === effectiveProgramSourceId;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [facing, setFacing] = useState<"front" | "environment">("environment");
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const showFeedback = (text: string, ok: boolean) => {
    setFeedback({ text, ok });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, []);

  // Sync state if remote dropped camera status
  useEffect(() => {
    if (!isCameraSource && cameraActive) {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      setCameraActive(false);
    }
  }, [isCameraSource, cameraActive]);

  const handleStartNativeCamera = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      const res = await optInAsCamera();
      if (!res.ok) {
        showFeedback(res.error || "Failed to join camera slot", false);
        setIsConnecting(false);
        return;
      }

      showFeedback(`Connected as Camera ${res.slotIndex || cameraSlotIndex || 1} of 6`, true);

      // Clean up any existing stream/pc
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }

      const stream = await mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event: any) => {
        if (event.candidate) {
          sendWebRtcIceCandidate(event.candidate);
        }
      };

      setWebRtcAnswerHandler(async (answer: any) => {
        try {
          if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          }
        } catch (err) {
          console.error("[LiveSwitcher] Error setting remote description from answer:", err);
        }
      });

      setWebRtcIceHandler(async (candidate: any) => {
        try {
          if (peerConnectionRef.current && candidate) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch (err) {
          console.error("[LiveSwitcher] Error adding ICE candidate from desktop:", err);
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendWebRtcOffer(offer);

      setCameraActive(true);
    } catch (err: any) {
      console.error("[LiveSwitcher] Failed to start native camera stream:", err);
      showFeedback(err?.message || "Failed to start camera hardware", false);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      setCameraActive(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStopNativeCamera = async () => {
    try {
      setWebRtcAnswerHandler(null);
      setWebRtcIceHandler(null);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      setCameraActive(false);

      const res = await optOutAsCamera();
      if (res.ok) {
        showFeedback("Camera stream stopped", true);
      } else {
        showFeedback(res.error || "Failed to stop camera slot", false);
      }
    } catch (err: any) {
      showFeedback(err?.message || "Error stopping camera", false);
    }
  };

  const handleFlipCamera = async () => {
    const nextFacing = facing === "environment" ? "front" : "environment";
    setFacing(nextFacing);

    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack && typeof (videoTrack as any)._switchCamera === "function") {
        (videoTrack as any)._switchCamera();
        return;
      }
      try {
        const newStream = await mediaDevices.getUserMedia({
          video: {
            facingMode: nextFacing,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
        const newTrack = newStream.getVideoTracks()[0];
        if (newTrack && peerConnectionRef.current) {
          const senders = peerConnectionRef.current.getSenders();
          const videoSender = senders.find((s: any) => s.track?.kind === "video");
          if (videoSender) {
            await videoSender.replaceTrack(newTrack);
          }
        }
        if (videoTrack) videoTrack.stop();
        localStreamRef.current = newStream;
        setLocalStream(newStream);
      } catch (err: any) {
        console.error("[LiveSwitcher] Error switching camera lens:", err);
        showFeedback("Failed to switch camera lens", false);
      }
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
        <View className={`p-4 rounded-[12px] border ${
          isCameraSource
            ? isThisDeviceProgram
              ? "bg-red-600/10 border-red-500/40"
              : "bg-emerald-500/10 border-emerald-500/30"
            : "bg-white/[0.04] border-white/10"
        }`}>
          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40">WebRTC Camera Studio</Text>
              <Text className="text-white font-black text-base mt-0.5">
                {isCameraSource ? `Slot ${cameraSlotIndex || 1} of 6` : "Camera Standby"}
              </Text>
            </View>
            {isCameraSource && (
              <View className={`flex-row items-center gap-1.5 px-3 py-1 rounded-full border ${
                isThisDeviceProgram
                  ? "bg-red-500/30 border-red-400/60"
                  : "bg-emerald-500/20 border-emerald-500/30"
              }`}>
                <View className={`w-2 h-2 rounded-full ${isThisDeviceProgram ? "bg-red-400 animate-ping" : "bg-emerald-400"}`} />
                <Text className={`text-[10px] font-black ${isThisDeviceProgram ? "text-red-300" : "text-emerald-300"}`}>
                  {isThisDeviceProgram ? "● LIVE ON PROGRAM" : "STANDBY • STREAMING"}
                </Text>
              </View>
            )}
          </View>

          <Text className="text-white/40 text-xs leading-relaxed mb-4">
            {isCameraSource
              ? "Streaming continuous 30–60 FPS hardware-accelerated WebRTC video into the Live Switcher."
              : "Stream your mobile camera continuously via WebRTC with zero snapshot polling or shutter locks."}
          </Text>

          {/* Action buttons / Viewfinder */}
          {isCameraSource ? (
            <View>
              {localStream ? (
                <View className="mb-3 overflow-hidden rounded-[12px] border border-white/20 bg-black aspect-video relative">
                  <RTCView
                    streamURL={localStream.toURL()}
                    style={{ width: "100%", height: "100%" }}
                    objectFit="cover"
                    mirror={facing === "front"}
                  />
                  <View className="absolute top-2 left-2 flex-row items-center gap-1.5 px-2.5 py-1 rounded-[12px] bg-black/60 border border-white/10">
                    <View className={`w-2 h-2 rounded-full ${isThisDeviceProgram ? "bg-red-500 animate-ping" : "bg-emerald-500"}`} />
                    <Text className="text-white text-[10px] font-bold">
                      {isThisDeviceProgram ? "PROGRAM (ON AIR)" : `CAM ${cameraSlotIndex || 1} • STREAMING`}
                    </Text>
                  </View>
                </View>
              ) : (
                <View className="mb-3 p-4 rounded-[12px] bg-white/[0.04] border border-white/10 items-center justify-center">
                  <Text className="text-white/60 text-xs font-semibold">
                    {isConnecting ? "Initializing native camera..." : "Camera active (Slot " + (cameraSlotIndex || 1) + ")"}
                  </Text>
                </View>
              )}

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={handleFlipCamera}
                  className="flex-1 flex-row items-center justify-center gap-2 bg-white/10 border border-white/15 py-3 rounded-[12px] active:scale-95"
                >
                  <ArrowCounterClockwise size={16} color="white" />
                  <Text className="text-white font-bold text-xs">
                    Flip ({facing === "environment" ? "Back" : "Front"})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleStopNativeCamera}
                  className="px-5 flex-row items-center justify-center gap-1.5 bg-red-600/20 border border-red-500/30 py-3 rounded-[12px] active:scale-95"
                >
                  <Stop size={15} color="#fca5a5" weight="fill" />
                  <Text className="text-red-300 font-semibold text-xs">Stop Stream</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleStartNativeCamera}
                disabled={isConnecting}
                className={`flex-1 flex-row items-center justify-center gap-2 ${
                  isConnecting ? "bg-emerald-800 opacity-60" : "bg-emerald-600 active:scale-95"
                } border border-emerald-400/40 py-3.5 rounded-[12px]`}
              >
                <VideoCamera size={16} color="white" weight="fill" />
                <Text className="text-white font-bold text-sm">
                  {isConnecting ? "Negotiating Stream..." : "Join as Camera (Native WebRTC)"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
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

            {/* Camera grid (controller mode) - DEF-07: Filter out viewing device's own camera */}
            {(() => {
              const visibleCameraSlots = switcherCameraSlots.filter((slot) => slot.socketId !== socket?.id);
              return (
                <View>
                  <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
                    Camera Sources ({visibleCameraSlots.length}/6)
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
                              className={`flex-1 py-1 rounded-[12px] items-center justify-center ${
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
                        <Text className="text-white/30 text-sm mt-2">No other cameras connected</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

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
            {switcherCameraSlots.length} camera{switcherCameraSlots.length !== 1 ? "s" : ""} connected · WebRTC Studio Streaming
          </Text>
        </View>
      </ScrollView>
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
