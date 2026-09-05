import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
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
} from "phosphor-react-native";
import { useSocketStore } from "../store/socketStore";

export default function LiveSwitcherScreen() {
  const router = useRouter();
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
    deviceName,
    serverIp,
    lastHost,
    socket,
    optInAsCamera,
    optOutAsCamera,
    setSwitcherProgram,
    setSwitcherRoute,
    requestControlReclaim,
  } = useSocketStore();

  const isThisDeviceProgram = socket?.id != null && socket.id === switcherProgramSourceId;

  const showFeedback = (text: string, ok: boolean) => {
    setFeedback({ text, ok });
    setTimeout(() => setFeedback(null), 3000);
  };

  const launchWebRtcCamera = async () => {
    const host = serverIp || lastHost || "localhost";
    const nameParam = encodeURIComponent(deviceName || "Phone Camera");
    const url = `http://${host}:4000/switcher-camera?name=${nameParam}`;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (_) {
      try {
        await Linking.openURL(url);
      } catch (e) {
        showFeedback("Could not open camera stream URL", false);
      }
    }
  };

  const handleStartCamera = async () => {
    const res = await optInAsCamera();
    if (res.ok) {
      showFeedback(`You are Camera ${res.slotIndex} of 6`, true);
      // Launch continuous hardware WebRTC camera studio
      await launchWebRtcCamera();
    } else {
      showFeedback(res.error || "Failed to join camera slot", false);
    }
  };

  const handleStopCamera = async () => {
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
      showFeedback(`Cut to: ${slot?.name || "Camera"}`, true);
    } else {
      showFeedback(res.error || "Switch failed", false);
    }
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
          className="bg-purple-600/80 border border-purple-400/30 py-3 px-8 rounded-xl"
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
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-2 rounded-xl active:bg-white/10">
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

        {/* ── Camera Source section ────────────────────────────────────────── */}
        <View className={`border rounded-xl p-4 ${
          isThisDeviceProgram
            ? "bg-red-500/10 border-red-500/40"
            : isCameraSource
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-white/[0.04] border-white/10"
        }`}>
          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40">Continuous Camera Source</Text>
              <Text className="text-white font-black text-base mt-0.5">
                {isCameraSource ? `Slot ${cameraSlotIndex} of 6` : "Not Active"}
              </Text>
            </View>
            {isCameraSource && (
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

          <Text className="text-white/40 text-xs leading-relaxed mb-4">
            {isCameraSource
              ? "Your phone is connected as a continuous 30/60 FPS WebRTC video source. Tap Open Viewfinder to view your camera controls."
              : "Stream your phone camera directly into the Live Switcher with hardware-accelerated continuous video."}
          </Text>

          <View className="flex-row gap-2">
            {!isCameraSource ? (
              <TouchableOpacity
                onPress={handleStartCamera}
                className="flex-1 flex-row items-center justify-center gap-2 bg-red-600 border border-red-400/40 py-3.5 rounded-xl active:scale-95 shadow-lg shadow-red-600/30"
              >
                <VideoCamera size={16} color="white" weight="fill" />
                <Text className="text-white font-bold text-sm">Start WebRTC Camera</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  onPress={launchWebRtcCamera}
                  className="flex-1 flex-row items-center justify-center gap-2 bg-purple-600/90 border border-purple-400/30 py-3 rounded-xl active:scale-95"
                >
                  <Camera size={16} color="white" weight="bold" />
                  <Text className="text-white font-bold text-xs">Open Viewfinder</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleStopCamera}
                  className="px-4 flex-row items-center justify-center gap-1.5 bg-white/10 border border-white/15 py-3 rounded-xl active:scale-95"
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
            {/* Camera grid (controller mode) */}
            <View>
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Camera Sources ({switcherCameraSlots.length}/6)</Text>
              <View className="flex-row flex-wrap gap-2">
                {switcherCameraSlots.map((slot) => {
                  const isProgram = slot.socketId === switcherProgramSourceId;
                  return (
                    <TouchableOpacity
                      key={slot.socketId}
                      onPress={() => handleSetProgram(slot.socketId)}
                      className={`flex-1 min-w-[45%] py-3 px-3 rounded-xl border ${
                        isProgram
                          ? "bg-red-600/20 border-red-500/50"
                          : "bg-white/[0.04] border-white/10 active:bg-white/10"
                      }`}
                    >
                      <View className="flex-row items-center justify-between mb-1">
                        <Text className="text-[8px] font-bold text-white/40 uppercase">CAM {slot.slotIndex}</Text>
                        {isProgram && (
                          <View className="flex-row items-center gap-1">
                            <View className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            <Text className="text-[8px] font-black text-red-400">LIVE</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-sm font-bold text-white" numberOfLines={1}>{slot.name}</Text>
                    </TouchableOpacity>
                  );
                })}
                {switcherCameraSlots.length === 0 && (
                  <View className="flex-1 py-6 items-center">
                    <VideoCamera size={28} color="rgba(255,255,255,0.2)" />
                    <Text className="text-white/30 text-sm mt-2">No cameras connected yet</Text>
                    <Text className="text-white/20 text-xs mt-1">Have phones tap "Start WebRTC Camera" to connect</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Destination routing */}
            <View className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3">Route to Display</Text>
              {[
                { dest: "general" as const, label: "General View", Icon: Monitor, active: switcherRouteGeneral },
                { dest: "speaker" as const, label: "Speaker View", Icon: UsersThree, active: switcherRouteSpeaker },
              ].map(({ dest, label, Icon, active }) => (
                <TouchableOpacity
                  key={dest}
                  onPress={() => handleRouteToggle(dest)}
                  disabled={!switcherProgramSourceId}
                  className={`flex-row items-center justify-between px-3 py-3 mb-2 rounded-xl border ${
                    active
                      ? dest === "general"
                        ? "bg-sky-500/20 border-sky-500/40"
                        : "bg-violet-500/20 border-violet-500/40"
                      : "bg-white/[0.03] border-white/10"
                  } ${!switcherProgramSourceId ? "opacity-40" : "active:scale-98"}`}
                >
                  <View className="flex-row items-center gap-2">
                    <Icon size={15} color={active ? (dest === "general" ? "#38bdf8" : "#a78bfa") : "rgba(255,255,255,0.4)"} />
                    <Text className={`font-semibold text-sm ${active ? "text-white" : "text-white/50"}`}>{label}</Text>
                  </View>
                  <View className={`px-2 py-0.5 rounded-full border ${
                    active
                      ? dest === "general" ? "bg-sky-500/30 border-sky-500/40" : "bg-violet-500/30 border-violet-500/40"
                      : "bg-white/5 border-white/10"
                  }`}>
                    <Text className={`text-[9px] font-black ${active ? "text-white" : "text-white/30"}`}>
                      {active ? "LIVE" : "OFF"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              {!switcherProgramSourceId && (
                <Text className="text-white/25 text-[10px] mt-1">Select a program source first</Text>
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
          /* Passive mode — waiting for controller permission */
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
            {switcherCameraSlots.length} camera{switcherCameraSlots.length !== 1 ? "s" : ""} connected · Phase A WebRTC
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
