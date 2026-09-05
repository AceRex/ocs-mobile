import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StatusBar,
  Alert,
  Modal,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  CaretLeft,
  Monitor,
  Play,
  Pause,
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  Clock,
  Broadcast,
  Eye,
  VideoCamera,
  NotePencil,
  Article,
  CheckCircle,
  X,
  BookOpen,
  Sparkle,
} from "phosphor-react-native";
import { useSocketStore } from "../store/socketStore";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { TabsList, TabsTrigger } from "../components/ui/tabs";

const PRESET_TEMPLATES = [
  {
    title: "Sunday Sermon Outline",
    content: `THE POWER OF UNWAVERING FAITH
Text: Hebrews 11:1-6

I. THE FOUNDATION OF FAITH
- Faith is the substance of things hoped for, the evidence of things not seen.
- Without faith, it is impossible to please God.
- Walking by faith, not by physical sight.

II. OVERCOMING THE MOUNTAIN
- Speak to the mountain with authority (Mark 11:23).
- Doubt whispers in the storm; faith anchors in the promise.
- Trusting God in seasons of waiting and silence.

III. THE REWARD OF PERSEVERANCE
- He who comes to God must believe that He is a rewarder of those who seek Him.
- Let us not grow weary in well-doing.
- For in due season we shall reap if we faint not.

CALL TO ACTION:
Step forward today in holy confidence. Your breakthrough begins with your obedience.`,
  },
  {
    title: "Opening Prayer & Welcome",
    content: `WELCOME & CALL TO WORSHIP

"This is the day the Lord has made; let us rejoice and be glad in it." (Psalm 118:24)

PASTORAL WELCOME:
Good morning Church! We welcome everyone joining us in person and across our online broadcast. You are in the house of miracles today.

OPENING PRAYER:
Heavenly Father, we invite Your Holy Spirit into this sanctuary. Open our hearts to receive Your Word. Heal the broken, strengthen the weary, and let Your glory fill this place from the altar to the doors. In Jesus' mighty name we pray. Amen!`,
  },
  {
    title: "Communion Liturgy",
    content: `THE LORD'S SUPPER & COMMUNION
1 Corinthians 11:23-26

"For I received from the Lord what I also passed on to you: The Lord Jesus, on the night he was betrayed, took bread, and when he had given thanks, he broke it and said, 'This is my body, which is for you; do this in remembrance of me.'

In the same way, after supper he took the cup, saying, 'This cup is the new covenant in my blood; do this, whenever you drink it, in remembrance of me.'

For whenever you eat this bread and drink this cup, you proclaim the Lord's death until he comes."

PRAYER OF THANKSGIVING:
Lord Jesus, we thank You for the cross, the sacrifice of Your body, and the cleansing power of Your blood. As one body, we partake with reverence and grateful hearts.`,
  },
];

export default function PresentationScreen() {
  const router = useRouter();
  const {
    isConnected,
    isPaired,
    isAdmin,
    sendStageControl,
    overlayContent,
    overlayTimer,
    shareContentToDesktop,
    sendCameraFrame,
    startCameraSync,
    stopCameraSync,
  } = useSocketStore();

  const [mode, setMode] = useState<"live" | "notes">("live");
  const [fontSize, setFontSize] = useState<number>(28);
  const [isMirrored, setIsMirrored] = useState<boolean>(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(1.5);
  const [customNotes, setCustomNotes] = useState<string>("");
  const [scriptTitle, setScriptTitle] = useState<string>("");
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Camera Sync State
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<"front" | "back">("front");
  const [cameraOpacity, setCameraOpacity] = useState<number>(0.35);
  const cameraRef = useRef<any>(null);

  const scrollRef = useRef<ScrollView | null>(null);
  const scrollOffset = useRef<number>(0);

  // Camera Frame Streaming to Desktop Loop (Adaptive non-blocking pump)
  useEffect(() => {
    let isMounted = true;
    let isCapturing = false;
    let animFrame: any = null;
    let lastTime = 0;

    if (isCameraActive && cameraPermission?.granted) {
      startCameraSync();
      const pump = async () => {
        if (!isMounted || !isCameraActive || !cameraPermission?.granted) return;
        const now = performance.now();
        if (!isCapturing && now - lastTime >= 60 && cameraRef.current) {
          isCapturing = true;
          lastTime = now;
          try {
            const photo = await cameraRef.current?.takePictureAsync({
              quality: 0.28,
              base64: true,
              shutterSound: false,
            });
            if (photo?.base64 && isMounted) {
              sendCameraFrame(photo.base64);
            }
          } catch (err) {
            console.warn('[Presentation Camera] Frame capture error:', err);
          } finally {
            isCapturing = false;
          }
        }
        if (isMounted && isCameraActive) {
          animFrame = requestAnimationFrame(pump);
        }
      };
      animFrame = requestAnimationFrame(pump);
    } else {
      stopCameraSync();
    }
    return () => {
      isMounted = false;
      if (animFrame) cancelAnimationFrame(animFrame);
    };
  }, [isCameraActive, cameraPermission?.granted]);

  // Auto-scroll loop
  useEffect(() => {
    let animFrame: any = null;
    if (isAutoScrolling) {
      const step = () => {
        scrollOffset.current += scrollSpeed * 0.8;
        scrollRef.current?.scrollTo({ y: scrollOffset.current, animated: false });
        animFrame = requestAnimationFrame(step);
      };
      animFrame = requestAnimationFrame(step);
    }
    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
    };
  }, [isAutoScrolling, scrollSpeed]);

  const handleToggleCameraSync = async () => {
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        Alert.alert(
          "Permission Required",
          "Camera access is needed to stream your mobile camera to the desktop teleprompter."
        );
        return;
      }
    }
    setIsCameraActive((prev) => {
      const next = !prev;
      showFeedback(next ? "Camera Sync Active • Streaming" : "Camera Sync Stopped");
      return next;
    });
  };

  const handleShareToDesktop = async () => {
    if (!customNotes.trim()) {
      Alert.alert("Empty Content", "Please enter content in the editor before sharing to desktop.");
      return;
    }
    const title = scriptTitle.trim() || "Mobile Content";
    const res = await shareContentToDesktop(title, customNotes);
    if (res.ok) {
      showFeedback(`Shared "${title}" to Desktop!`);
    } else {
      Alert.alert("Sharing Failed", res.error || "Could not share content. Check workstation pairing.");
    }
  };

  const formatTimer = (timer: any): string => {
    if (timer == null) return "00:00";
    const sec = typeof timer === "number" ? timer : Number(timer?.time || 0);
    if (!Number.isFinite(sec) || sec <= 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleStageCmd = (cmd: string, label: string) => {
    if (!isAdmin) {
      Alert.alert("Admin Required", "Admin privileges required to advance stage slides.");
      return;
    }
    sendStageControl(cmd)
      .then((res) => {
        if (res.ok) {
          showFeedback(label);
        } else {
          showFeedback(res.error || "Action failed");
        }
      })
      .catch((err) => showFeedback(err?.message || "Network error"));
  };

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2000);
  };

  const hasLiveOverlay =
    overlayContent &&
    (overlayContent.reference ||
      overlayContent.text ||
      overlayContent.title ||
      overlayContent.subtitle ||
      overlayContent.slideNumber ||
      overlayContent.data);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* ─── 1. Header Bar ─────────────────────────────────────────────────── */}
      <View className="px-4 py-2.5 flex-row items-center justify-between border-b border-zinc-900 bg-zinc-950">
        <View className="flex-row items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onPress={() => router.back()}
            className="w-9 h-9 border-zinc-800 bg-zinc-900"
          >
            <CaretLeft size={18} color="#e4e4e7" weight="bold" />
          </Button>
          <View>
            <Text className="text-white font-bold text-sm tracking-tight">
              Stage Teleprompter
            </Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <View
                className={`w-1.5 h-1.5 rounded-full ${
                  isPaired ? "bg-emerald-400" : "bg-red-400"
                }`}
              />
              <Text className="text-zinc-400 text-[11px]">
                {isPaired ? "Synced to Workstation" : "Offline"}
              </Text>
            </View>
          </View>
        </View>

        {overlayTimer != null && (
          <Badge variant="amber" isPill>
            <Clock size={11} color="#f59e0b" weight="fill" />
            <Text className="text-amber-300 font-mono font-bold text-xs">
              {formatTimer(overlayTimer)}
            </Text>
          </Badge>
        )}
      </View>

      {/* ─── 2. Segmented Mode Switcher ────────────────────────────────────── */}
      <View className="px-4 py-2 bg-zinc-950/90 border-b border-zinc-900">
        <TabsList className="bg-zinc-900/90 border-zinc-800">
          <TabsTrigger
            isActive={mode === "live"}
            onPress={() => setMode("live")}
            icon={
              <Broadcast
                size={14}
                color={mode === "live" ? "#ffffff" : "#a1a1aa"}
                weight={mode === "live" ? "fill" : "regular"}
              />
            }
          >
            Live Foldback
          </TabsTrigger>
          <TabsTrigger
            isActive={mode === "notes"}
            onPress={() => setMode("notes")}
            icon={
              <Article
                size={14}
                color={mode === "notes" ? "#ffffff" : "#a1a1aa"}
                weight={mode === "notes" ? "fill" : "regular"}
              />
            }
          >
            Script Reader
          </TabsTrigger>
        </TabsList>
      </View>

      {/* ─── 3. Prompter Tool Belt (Font, Mirror, Camera, Auto-scroll) ─────── */}
      <View className="px-4 py-2 flex-row items-center justify-between border-b border-zinc-900 bg-zinc-950/60">
        {/* Left: Font Size Controls */}
        <View className="flex-row items-center bg-zinc-900 border border-zinc-800 rounded-[12px] p-0.5">
          <TouchableOpacity
            onPress={() => setFontSize((s) => Math.max(18, s - 3))}
            className="w-8 h-8 items-center justify-center rounded-[10px] active:bg-zinc-800"
          >
            <Text className="text-zinc-300 font-bold text-xs">A-</Text>
          </TouchableOpacity>
          <Text className="text-zinc-400 font-mono text-[11px] px-1.5">
            {fontSize}
          </Text>
          <TouchableOpacity
            onPress={() => setFontSize((s) => Math.min(52, s + 3))}
            className="w-8 h-8 items-center justify-center rounded-[10px] active:bg-zinc-800"
          >
            <Text className="text-zinc-300 font-bold text-xs">A+</Text>
          </TouchableOpacity>
        </View>

        {/* Center/Right Actions */}
        <View className="flex-row items-center gap-2">
          {/* Glass Mirror Flip */}
          <Button
            variant={isMirrored ? "accent" : "outline"}
            size="sm"
            onPress={() => setIsMirrored(!isMirrored)}
            className="h-9 px-2.5 border-zinc-800 bg-zinc-900"
          >
            <Text
              className={`text-xs font-bold ${
                isMirrored ? "text-white" : "text-zinc-300"
              }`}
            >
              {isMirrored ? "🪞 Mirrored" : "Mirror"}
            </Text>
          </Button>

          {/* Camera Sync Toggle */}
          <Button
            variant={isCameraActive ? "successOutline" : "outline"}
            size="sm"
            onPress={handleToggleCameraSync}
            className="h-9 px-2.5 border-zinc-800 bg-zinc-900"
          >
            <VideoCamera
              size={14}
              color={isCameraActive ? "#34d399" : "#a1a1aa"}
              weight={isCameraActive ? "fill" : "regular"}
            />
            <Text
              className={`text-xs font-bold ml-1.5 ${
                isCameraActive ? "text-emerald-300" : "text-zinc-300"
              }`}
            >
              {isCameraActive ? "Cam On" : "Camera"}
            </Text>
          </Button>

          {/* Auto-Scroll Toggle */}
          <Button
            variant={isAutoScrolling ? "accent" : "outline"}
            size="sm"
            onPress={() => setIsAutoScrolling(!isAutoScrolling)}
            className="h-9 px-3 border-zinc-800 bg-zinc-900"
          >
            {isAutoScrolling ? (
              <Pause size={13} color="#ffffff" weight="fill" />
            ) : (
              <Play size={13} color="#ffffff" weight="fill" />
            )}
            <Text className="text-white font-bold text-xs ml-1.5">
              {isAutoScrolling ? "Pause" : "Scroll"}
            </Text>
          </Button>
        </View>
      </View>

      {/* Speed Selector Slider Bar (when auto-scrolling) */}
      {isAutoScrolling && (
        <View className="px-4 py-2 flex-row items-center justify-between border-b border-zinc-900 bg-zinc-900/60">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-zinc-400 text-[11px] font-bold uppercase mr-1">Speed:</Text>
            {[1, 1.5, 2, 3].map((spd) => (
              <TouchableOpacity
                key={spd}
                onPress={() => setScrollSpeed(spd)}
                className={`px-2.5 py-1 rounded-[12px] border ${
                  scrollSpeed === spd
                    ? "bg-violet-600 border-violet-500"
                    : "bg-zinc-800 border-zinc-700/60"
                }`}
              >
                <Text
                  className={`font-mono text-xs font-bold ${
                    scrollSpeed === spd ? "text-white" : "text-zinc-300"
                  }`}
                >
                  {spd}x
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              scrollOffset.current = 0;
              scrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
            className="h-7 px-2"
          >
            <ArrowsClockwise size={12} color="#a1a1aa" weight="bold" />
            <Text className="text-zinc-400 text-xs font-bold ml-1">Top</Text>
          </Button>
        </View>
      )}

      {/* Temporary Feedback Banner */}
      {feedback && (
        <View className="mx-4 mt-2 py-2 px-3 rounded-[12px] bg-emerald-950/70 border border-emerald-800/60 flex-row items-center gap-2">
          <CheckCircle size={14} color="#34d399" weight="fill" />
          <Text className="text-emerald-300 text-xs font-bold">{feedback}</Text>
        </View>
      )}

      {/* ─── 4. Main Teleprompter Reader Canvas ─────────────────────────────── */}
      <View
        className="flex-1 relative bg-black"
        style={isMirrored ? { transform: [{ scaleX: -1 }] } : undefined}
      >
        {/* Subtle Reading Guide Line (anchors speaker eye level at 33% screen height) */}
        <View
          pointerEvents="none"
          className="absolute left-0 right-0 top-1/3 h-[1px] border-b border-dashed border-violet-500/25 z-10"
        />

        {/* Background Camera Viewfinder for Camera Sync */}
        {isCameraActive && cameraPermission?.granted && (
          <View className="absolute inset-0" style={{ opacity: cameraOpacity }}>
            <CameraView
              ref={cameraRef}
              className="w-full h-full"
              facing={cameraFacing}
              animateShutter={false}
            />
          </View>
        )}

        {/* Floating Camera Controls (when camera active) */}
        {isCameraActive && (
          <View className="absolute top-3 left-4 right-4 z-20 flex-row items-center justify-between bg-zinc-950/80 p-2 rounded-[12px] border border-zinc-800">
            <View className="flex-row items-center gap-2">
              <View className="w-2 h-2 rounded-full bg-emerald-400" />
              <Text className="text-emerald-400 text-[10px] font-bold font-mono">
                CAMERA STREAMING
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onPress={() => setCameraFacing((f) => (f === "front" ? "back" : "front"))}
                className="h-7 px-2 bg-zinc-900 border-zinc-700"
              >
                <ArrowsClockwise size={11} color="#ffffff" weight="bold" />
                <Text className="text-white text-[11px] font-bold ml-1">
                  {cameraFacing === "front" ? "Front" : "Rear"}
                </Text>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onPress={() => setCameraOpacity((op) => (op >= 0.7 ? 0.2 : op + 0.25))}
                className="h-7 px-2 bg-zinc-900 border-zinc-700"
              >
                <Text className="text-white text-[11px] font-bold">
                  {Math.round(cameraOpacity * 100)}%
                </Text>
              </Button>
            </View>
          </View>
        )}

        <ScrollView
          ref={scrollRef}
          onScroll={(e) => {
            scrollOffset.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 30, paddingBottom: 220 }}
          showsVerticalScrollIndicator={false}
        >
          {mode === "live" ? (
            /* ─── LIVE FORWARD FOLDBACK ─────────────────────────────────────── */
            hasLiveOverlay ? (
              <View className="space-y-4">
                {overlayContent.reference || overlayContent.data?.title ? (
                  <View className="pb-3 border-b border-zinc-900">
                    <Badge variant="purple" className="self-start mb-2">
                      {overlayContent.type === "bible" ? "HOLY SCRIPTURE" : "PRESENTATION"}
                    </Badge>
                    <Text
                      className="text-white font-black tracking-tight"
                      style={{ fontSize: fontSize * 1.05 }}
                    >
                      {overlayContent.reference || overlayContent.data?.title || overlayContent.title}
                    </Text>
                    {overlayContent.version || overlayContent.data?.version ? (
                      <Text className="text-cyan-400 font-mono text-xs font-bold mt-1">
                        {overlayContent.version || overlayContent.data?.version}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {overlayContent.slideNumber != null && (
                  <Badge variant="outline" className="self-start">
                    SLIDE {overlayContent.slideNumber}
                  </Badge>
                )}

                <Text
                  className="text-zinc-100 font-medium tracking-normal"
                  style={{ fontSize, lineHeight: fontSize * 1.5 }}
                >
                  {overlayContent.data?.fullText ||
                    overlayContent.text ||
                    overlayContent.data?.subtitle ||
                    overlayContent.subtitle ||
                    "Live content loaded on stage screen."}
                </Text>
              </View>
            ) : (
              /* STANDBY / IDLE */
              <View className="py-16 items-center justify-center">
                <View className="w-16 h-16 rounded-[12px] bg-purple-500/10 border border-purple-500/30 items-center justify-center mb-4">
                  <Monitor size={32} color="#c084fc" weight="duotone" />
                </View>
                <Text className="text-white font-bold text-lg mb-1 tracking-tight">
                  Stage Standby
                </Text>
                <Text className="text-zinc-400 text-xs text-center leading-relaxed max-w-[280px] mb-6">
                  {isPaired
                    ? "Workstation is connected. Active scriptures, slides, and lyrics will stream to this prompter automatically."
                    : "Connect to your OCS Workstation on the Connect tab to mirror live stage slides."}
                </Text>
                <Button
                  variant="outline"
                  onPress={() => setMode("notes")}
                  className="border-zinc-800 bg-zinc-900"
                >
                  <Article size={14} color="#ffffff" weight="bold" />
                  <Text className="text-white font-bold text-xs ml-1.5">Open Script Reader</Text>
                </Button>
              </View>
            )
          ) : (
            /* ─── SCRIPT / PASTORAL NOTES ─────────────────────────────────── */
            <View className="space-y-4">
              <View className="flex-row items-center justify-between pb-3 border-b border-zinc-900">
                <Text className="text-white font-bold text-base tracking-tight flex-1 mr-2" numberOfLines={1}>
                  {scriptTitle || "Untitled Script"}
                </Text>
                <View className="flex-row items-center gap-2">
                  <Button
                    variant="accent"
                    size="sm"
                    onPress={handleShareToDesktop}
                    className="h-8 px-2.5 bg-violet-600 border-violet-500"
                  >
                    <Broadcast size={12} color="#ffffff" weight="bold" />
                    <Text className="text-white font-bold text-[11px] ml-1">Share</Text>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => setIsEditModalOpen(true)}
                    className="h-8 px-2.5 border-zinc-800 bg-zinc-900"
                  >
                    <NotePencil size={12} color="#c084fc" weight="bold" />
                    <Text className="text-purple-300 font-bold text-[11px] ml-1">Edit</Text>
                  </Button>
                </View>
              </View>

              {customNotes.trim() ? (
                <Text
                  className="text-zinc-100 font-medium tracking-normal"
                  style={{ fontSize, lineHeight: fontSize * 1.5 }}
                >
                  {customNotes}
                </Text>
              ) : (
                <TouchableOpacity
                  onPress={() => setIsEditModalOpen(true)}
                  activeOpacity={0.8}
                  className="py-16 items-center justify-center border border-dashed border-zinc-800 rounded-[12px] p-6 bg-zinc-950/60"
                >
                  <NotePencil size={32} color="#c084fc" weight="duotone" />
                  <Text className="text-white font-bold text-base mt-3 mb-1">
                    No Content Added
                  </Text>
                  <Text className="text-zinc-400 text-xs text-center leading-relaxed max-w-[280px]">
                    Tap here to paste speaking notes, sermon outline, or reading script.
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      </View>

      {/* ─── 5. Bottom Transport Remote Bar ───────────────────────────────── */}
      <View className="px-4 py-3 border-t border-zinc-900 bg-zinc-950">
        <View className="flex-row items-center gap-2.5">
          <Button
            variant="outline"
            size="lg"
            onPress={() => handleStageCmd("prev_verse", "Previous Slide")}
            className="flex-1 h-12 bg-zinc-900 border-zinc-800"
          >
            <ArrowLeft size={18} color="#ffffff" weight="bold" />
            <Text className="text-white font-bold text-xs ml-1.5">Prev</Text>
          </Button>

          <Button
            variant="destructiveOutline"
            size="lg"
            onPress={() => handleStageCmd("black_screen", "Blackout")}
            className="flex-1 h-12 border-red-900/50 bg-red-950/20"
          >
            <Eye size={16} color="#f87171" weight="bold" />
            <Text className="text-red-300 font-bold text-xs ml-1.5">Blackout</Text>
          </Button>

          <Button
            variant="accent"
            size="lg"
            onPress={() => handleStageCmd("next_verse", "Next Slide")}
            className="flex-1 h-12 bg-cyan-600 border-cyan-500"
          >
            <Text className="text-white font-bold text-xs mr-1.5">Next</Text>
            <ArrowRight size={18} color="#ffffff" weight="bold" />
          </Button>
        </View>
      </View>

      {/* ─── 6. Content Editor Modal ───────────────────────────────────────── */}
      <Modal
        visible={isEditModalOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsEditModalOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-zinc-950">
          <View className="px-4 py-3 flex-row items-center justify-between border-b border-zinc-800 bg-zinc-900/90">
            <Button
              variant="outline"
              size="icon"
              onPress={() => setIsEditModalOpen(false)}
              className="w-9 h-9 border-zinc-800 bg-zinc-900"
            >
              <X size={18} color="#ffffff" weight="bold" />
            </Button>
            <Text className="text-white font-bold text-base tracking-tight">
              Content Script Editor
            </Text>
            <Button
              variant="default"
              size="sm"
              onPress={() => setIsEditModalOpen(false)}
              className="h-9 px-4 bg-zinc-100"
            >
              Done
            </Button>
          </View>

          <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
            {/* Template Presets */}
            <Text className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-2">
              Preset Templates
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              <View className="flex-row gap-2">
                {PRESET_TEMPLATES.map((tpl) => (
                  <TouchableOpacity
                    key={tpl.title}
                    onPress={() => {
                      setScriptTitle(tpl.title);
                      setCustomNotes(tpl.content);
                    }}
                    className="bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-[12px] active:bg-zinc-800 flex-row items-center gap-1.5"
                  >
                    <Sparkle size={12} color="#c084fc" weight="fill" />
                    <Text className="text-zinc-200 text-xs font-bold">{tpl.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Title Input */}
            <Text className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
              Script Title
            </Text>
            <TextInput
              value={scriptTitle}
              onChangeText={setScriptTitle}
              placeholder="e.g. Sunday Sermon / Announcements"
              placeholderTextColor="#71717a"
              className="bg-zinc-900/90 border border-zinc-800 text-white p-3 rounded-[12px] text-sm font-medium mb-4"
            />

            {/* Content Text Input */}
            <Text className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
              Prompter Manuscript &amp; Notes
            </Text>
            <TextInput
              value={customNotes}
              onChangeText={setCustomNotes}
              placeholder="Type or paste your sermon outline, speech, or reading notes here..."
              placeholderTextColor="#71717a"
              multiline
              textAlignVertical="top"
              className="bg-zinc-900/90 border border-zinc-800 text-white p-3 rounded-[12px] text-sm font-medium min-h-[300px] mb-6 leading-relaxed"
            />

            {/* Share Action */}
            <Button
              variant="accent"
              size="lg"
              onPress={() => {
                handleShareToDesktop();
                setIsEditModalOpen(false);
              }}
              className="w-full bg-violet-600 border-violet-500 mb-8"
            >
              <Broadcast size={18} color="#ffffff" weight="bold" />
              <Text className="text-white font-bold text-sm ml-2">
                Share Directly to Desktop Workstation
              </Text>
            </Button>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
