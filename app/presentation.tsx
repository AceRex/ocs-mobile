import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  StyleSheet,
  Alert,
  Modal,
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
  TextT,
  ArrowsClockwise,
  Clock,
  Broadcast,
  Eye,
  VideoCamera,
  NotePencil,
  BookOpen,
  Article,
  Sliders,
  CheckCircle,
  X,
  Sparkle,
} from "phosphor-react-native";
import { useSocketStore } from "../store/socketStore";

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
    isCameraStreaming,
    stopCameraStream,
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

  // Camera Frame Streaming to Desktop Loop (Adaptive non-blocking cadence)
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
            const photo = await cameraRef.current.takePictureAsync({
              quality: 0.28,
              base64: true,
              skipProcessing: true,
              shutterSound: false,
              fastMode: true,
              maxDownsampling: 2,
            });
            if (photo?.base64 && isMounted) {
              sendCameraFrame(photo.base64);
            }
          } catch (_) {
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
      showFeedback(next ? "Camera Sync Active — Streaming" : "Camera Sync Stopped");
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
    setTimeout(() => setFeedback(null), 1800);
  };

  const hasLiveOverlay =
    overlayContent &&
    (overlayContent.reference ||
      overlayContent.text ||
      overlayContent.title ||
      overlayContent.subtitle ||
      overlayContent.slideNumber);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* ─── Top Header Bar ─── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <CaretLeft size={22} color="#FFFFFF" weight="bold" />
        </TouchableOpacity>

        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>Stage Teleprompter</Text>
          <View style={styles.headerBadgeRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isPaired ? "#34D399" : "#F87171" },
              ]}
            />
            <Text style={styles.headerSubtext}>
              {isPaired ? "Synced to Workstation" : "Offline Mode"}
            </Text>
          </View>
        </View>

        {/* Live Timer Pill */}
        {overlayTimer != null && (
          <View style={styles.timerPill}>
            <Clock size={12} color="#FBBF24" weight="fill" />
            <Text style={styles.timerPillText}>{formatTimer(overlayTimer)}</Text>
          </View>
        )}
      </View>

      {/* ─── Stage Toolbar: Mode, Font Size, Mirror, Auto-Scroll ─── */}
      <View style={styles.toolbar}>
        {/* Mode Switcher */}
        <View style={styles.modeTabs}>
          <TouchableOpacity
            onPress={() => setMode("live")}
            style={[styles.modeTab, mode === "live" && styles.modeTabActive]}
            activeOpacity={0.8}
          >
            <Broadcast
              size={14}
              color={mode === "live" ? "#FFFFFF" : "rgba(255,255,255,0.5)"}
              weight={mode === "live" ? "fill" : "regular"}
            />
            <Text
              style={[styles.modeTabText, mode === "live" && styles.modeTabTextActive]}
            >
              Live Foldback
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMode("notes")}
            style={[styles.modeTab, mode === "notes" && styles.modeTabActive]}
            activeOpacity={0.8}
          >
            <Article
              size={14}
              color={mode === "notes" ? "#FFFFFF" : "rgba(255,255,255,0.5)"}
              weight={mode === "notes" ? "fill" : "regular"}
            />
            <Text
              style={[styles.modeTabText, mode === "notes" && styles.modeTabTextActive]}
            >
              Content
            </Text>
          </TouchableOpacity>
        </View>

        {/* Right Controls */}
        <View style={styles.toolControls}>
          {/* Camera Sync Toggle (Streams phone camera to desktop) */}
          <TouchableOpacity
            onPress={handleToggleCameraSync}
            style={[styles.iconButton, isCameraActive && styles.cameraActiveBtn]}
            activeOpacity={0.7}
          >
            <VideoCamera
              size={13}
              color={isCameraActive ? "#34D399" : "rgba(255,255,255,0.7)"}
              weight={isCameraActive ? "fill" : "regular"}
            />
            <Text
              style={[
                styles.toolLabel,
                { color: isCameraActive ? "#34D399" : "rgba(255,255,255,0.7)" },
              ]}
            >
              {isCameraActive ? "Cam Sync" : "Camera"}
            </Text>
          </TouchableOpacity>

          {/* Mirror Toggle for Glass Prompters */}
          <TouchableOpacity
            onPress={() => setIsMirrored(!isMirrored)}
            style={[styles.iconButton, isMirrored && styles.iconButtonActive]}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.toolLabel,
                { color: isMirrored ? "#A855F7" : "rgba(255,255,255,0.7)" },
              ]}
            >
              {isMirrored ? "🪞 Mirrored" : "Mirror"}
            </Text>
          </TouchableOpacity>

          {/* Font Size A- / A+ */}
          <View style={styles.fontControls}>
            <TouchableOpacity
              onPress={() => setFontSize((s) => Math.max(18, s - 3))}
              style={styles.fontBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.fontBtnText}>A-</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFontSize((s) => Math.min(52, s + 3))}
              style={styles.fontBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.fontBtnText}>A+</Text>
            </TouchableOpacity>
          </View>

          {/* Auto-Scroll Toggle */}
          <TouchableOpacity
            onPress={() => setIsAutoScrolling(!isAutoScrolling)}
            style={[
              styles.scrollToggleBtn,
              isAutoScrolling && styles.scrollToggleBtnActive,
            ]}
            activeOpacity={0.8}
          >
            {isAutoScrolling ? (
              <Pause size={14} color="#FFFFFF" weight="fill" />
            ) : (
              <Play size={14} color="#FFFFFF" weight="fill" />
            )}
            <Text style={styles.scrollToggleText}>
              {isAutoScrolling ? "Pause" : "Scroll"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Speed Selector bar when auto-scrolling is active */}
      {isAutoScrolling && (
        <View style={styles.speedBar}>
          <Text style={styles.speedLabel}>Speed:</Text>
          {[1, 1.5, 2, 3, 4].map((spd) => (
            <TouchableOpacity
              key={spd}
              onPress={() => setScrollSpeed(spd)}
              style={[
                styles.speedPill,
                scrollSpeed === spd && styles.speedPillActive,
              ]}
            >
              <Text
                style={[
                  styles.speedPillText,
                  scrollSpeed === spd && styles.speedPillTextActive,
                ]}
              >
                {spd}x
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => {
              scrollOffset.current = 0;
              scrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
            style={styles.rewindBtn}
          >
            <ArrowsClockwise size={12} color="rgba(255,255,255,0.7)" weight="bold" />
            <Text style={styles.rewindText}>Top</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Temporary Feedback Pill */}
      {feedback && (
        <View style={styles.feedbackBanner}>
          <CheckCircle size={14} color="#34D399" weight="fill" />
          <Text style={styles.feedbackText}>{feedback}</Text>
        </View>
      )}

      {/* ─── Main Teleprompter Reader View ─── */}
      <View
        style={[
          styles.prompterContainer,
          isMirrored && { transform: [{ scaleX: -1 }] },
        ]}
      >
        {/* Background Camera Viewfinder for Camera Sync */}
        {isCameraActive && cameraPermission?.granted && (
          <View style={[StyleSheet.absoluteFill, { opacity: cameraOpacity }]}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={cameraFacing}
              animateShutter={false}
            />
          </View>
        )}

        {/* Floating Camera Sync Status & Control Deck */}
        {isCameraActive && (
          <View style={styles.floatingCameraBar}>
            <View style={styles.camLiveBadge}>
              <View style={styles.camPulseDot} />
              <Text style={styles.camLiveText}>DESKTOP SYNC STREAMING</Text>
            </View>

            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => setCameraFacing((f) => (f === "front" ? "back" : "front"))}
                style={styles.camControlBtn}
                activeOpacity={0.8}
              >
                <ArrowsClockwise size={12} color="#FFFFFF" weight="bold" />
                <Text style={styles.camControlBtnText}>{cameraFacing === "front" ? "Front" : "Rear"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setCameraOpacity((op) => (op >= 0.7 ? 0.2 : op + 0.25))}
                style={styles.camControlBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.camControlBtnText}>{Math.round(cameraOpacity * 100)}%</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <ScrollView
          ref={scrollRef}
          onScroll={(e) => {
            scrollOffset.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {mode === "live" ? (
            /* LIVE FORWARD STAGE CONTENT */
            hasLiveOverlay ? (
              <View style={styles.liveContentBox}>
                {overlayContent.reference ? (
                  <View style={styles.referenceHeader}>
                    <Text style={styles.scriptureBadge}>HOLY SCRIPTURE</Text>
                    <Text style={[styles.referenceTitle, { fontSize: fontSize * 1.1 }]}>
                      {overlayContent.reference}
                    </Text>
                    {overlayContent.version && (
                      <Text style={styles.versionTag}>{overlayContent.version}</Text>
                    )}
                  </View>
                ) : null}

                {overlayContent.title ? (
                  <Text style={[styles.slideTitle, { fontSize: fontSize * 1.05 }]}>
                    {overlayContent.title}
                  </Text>
                ) : null}

                {overlayContent.slideNumber != null && (
                  <Text style={styles.slideIndexTag}>
                    SLIDE {overlayContent.slideNumber}
                  </Text>
                )}

                <Text style={[styles.prompterText, { fontSize, lineHeight: fontSize * 1.45 }]}>
                  {overlayContent.text ||
                    overlayContent.subtitle ||
                    "Live slide content loaded."}
                </Text>
              </View>
            ) : (
              /* IDLE / STANDBY */
              <View style={styles.standbyBox}>
                <View style={styles.standbyIconCircle}>
                  <Monitor size={44} color="#A855F7" weight="duotone" />
                </View>
                <Text style={styles.standbyTitle}>Stage Standby</Text>
                <Text style={styles.standbySubtitle}>
                  {isPaired
                    ? "Workstation is connected. When scriptures, lyrics, or slides are presented live on the sanctuary screen, they will stream here automatically."
                    : "Connect to your OCS Workstation on the Connect tab to sync live presentation slides."}
                </Text>

                <TouchableOpacity
                  onPress={() => setMode("notes")}
                  style={styles.switchNotesBtn}
                  activeOpacity={0.8}
                >
                  <Article size={16} color="#FFFFFF" weight="bold" />
                  <Text style={styles.switchNotesText}>Open Content Editor</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            /* CONTENT SCRIPT & SHARING MODE */
            <View style={styles.notesBox}>
              <View style={styles.notesHeaderRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.notesScriptTitle}>{scriptTitle || "Untitled Content"}</Text>
                </View>
                
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  {/* Share to Desktop Workstation Button */}
                  <TouchableOpacity
                    onPress={handleShareToDesktop}
                    style={styles.shareDesktopBtn}
                    activeOpacity={0.8}
                  >
                    <Broadcast size={13} color="#FFFFFF" weight="bold" />
                    <Text style={styles.shareDesktopBtnText}>Share to Desktop</Text>
                  </TouchableOpacity>

                  {/* Edit Script Pill */}
                  <TouchableOpacity
                    onPress={() => setIsEditModalOpen(true)}
                    style={styles.editNotesPill}
                    activeOpacity={0.8}
                  >
                    <NotePencil size={13} color="#C084FC" weight="bold" />
                    <Text style={styles.editNotesPillText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {customNotes.trim() ? (
                <Text style={[styles.prompterText, { fontSize, lineHeight: fontSize * 1.5 }]}>
                  {customNotes}
                </Text>
              ) : (
                <TouchableOpacity
                  onPress={() => setIsEditModalOpen(true)}
                  style={styles.emptyContentBox}
                  activeOpacity={0.8}
                >
                  <View style={styles.emptyContentIconWrap}>
                    <NotePencil size={32} color="#C084FC" weight="duotone" />
                  </View>
                  <Text style={styles.emptyContentTitle}>No Content Added</Text>
                  <Text style={styles.emptyContentSub}>
                    Tap here or click "Edit" above to create or paste your content script. Once created, tap "Share to Desktop" to send it live to your workstation.
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Padding at bottom so prompter can scroll past end */}
          <View style={{ height: 260 }} />
        </ScrollView>
      </View>

      {/* ─── Bottom Slide Control & Stage Remote Bar ─── */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomBarControls}>
          <TouchableOpacity
            onPress={() => handleStageCmd("slide_prev", "Previous Slide")}
            style={styles.stageActionBtn}
            activeOpacity={0.7}
          >
            <ArrowLeft size={18} color="#FFFFFF" weight="bold" />
            <Text style={styles.stageActionText}>Prev Slide</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleStageCmd("screen_off", "Blackout")}
            style={[styles.stageActionBtn, styles.blackoutBtn]}
            activeOpacity={0.7}
          >
            <Eye size={16} color="#F87171" weight="bold" />
            <Text style={[styles.stageActionText, { color: "#FCA5A5" }]}>Blackout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleStageCmd("slide_next", "Next Slide")}
            style={[styles.stageActionBtn, styles.nextBtn]}
            activeOpacity={0.7}
          >
            <Text style={styles.stageActionText}>Next Slide</Text>
            <ArrowRight size={18} color="#FFFFFF" weight="bold" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Content Editor Modal ─── */}
      <Modal
        visible={isEditModalOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsEditModalOpen(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setIsEditModalOpen(false)}
              style={styles.modalCloseBtn}
            >
              <X size={22} color="#FFFFFF" weight="bold" />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>Content Editor</Text>
            <TouchableOpacity
              onPress={() => setIsEditModalOpen(false)}
              style={styles.modalDoneBtn}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, padding: 16 }}>
            {/* Title Input */}
            <Text style={styles.modalSectionLabel}>CONTENT TITLE</Text>
            <TextInput
              style={styles.titleInput}
              value={scriptTitle}
              onChangeText={setScriptTitle}
              placeholder="e.g. Opening Remarks / Keynote / Announcements"
              placeholderTextColor="#555566"
            />

            {/* Content Text Input */}
            <Text style={[styles.modalSectionLabel, { marginTop: 18 }]}>
              CONTENT SCRIPT / TEXT
            </Text>
            <TextInput
              style={styles.notesTextInput}
              value={customNotes}
              onChangeText={setCustomNotes}
              placeholder="Type or paste your content, talking points, or reading script here..."
              placeholderTextColor="#555566"
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#0B0814",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  headerTitleGroup: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  headerBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  headerSubtext: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11,
    fontWeight: "600",
  },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(251, 191, 36, 0.15)",
    borderColor: "rgba(251, 191, 36, 0.4)",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  timerPillText: {
    color: "#FBBF24",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: "monospace",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#110D1D",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  modeTabs: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  modeTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  modeTabActive: {
    backgroundColor: "#7C3AED",
  },
  modeTabText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11,
    fontWeight: "700",
  },
  modeTabTextActive: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  toolControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  iconButtonActive: {
    backgroundColor: "rgba(168, 85, 247, 0.2)",
    borderWidth: 1,
    borderColor: "#A855F7",
  },
  cameraActiveBtn: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderWidth: 1,
    borderColor: "#10B981",
  },
  floatingCameraBar: {
    position: "absolute",
    top: 10,
    left: 12,
    right: 12,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(15, 10, 25, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  camLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  camPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#34D399",
  },
  camLiveText: {
    color: "#34D399",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  camControlBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  camControlBtnText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  shareDesktopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#7C3AED",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  shareDesktopBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  emptyContentBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderStyle: "dashed",
    marginTop: 20,
  },
  emptyContentIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(168, 85, 247, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyContentTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },
  emptyContentSub: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    maxWidth: 280,
  },
  toolLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  fontControls: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 8,
    overflow: "hidden",
  },
  fontBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  fontBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  scrollToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#2563EB",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  scrollToggleBtnActive: {
    backgroundColor: "#059669",
  },
  scrollToggleText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  speedBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#181329",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  speedLabel: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 10,
    fontWeight: "700",
  },
  speedPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  speedPillActive: {
    backgroundColor: "#7C3AED",
  },
  speedPillText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 10,
    fontWeight: "700",
  },
  speedPillTextActive: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  rewindBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  rewindText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 10,
    fontWeight: "700",
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(52, 211, 153, 0.18)",
    borderColor: "rgba(52, 211, 153, 0.4)",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 10,
  },
  feedbackText: {
    color: "#34D399",
    fontSize: 11,
    fontWeight: "800",
  },
  prompterContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  liveContentBox: {
    gap: 16,
  },
  referenceHeader: {
    flexDirection: "column",
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    paddingBottom: 12,
  },
  scriptureBadge: {
    color: "#FBBF24",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  referenceTitle: {
    color: "#FDE047",
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  versionTag: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 11,
    fontWeight: "700",
  },
  slideTitle: {
    color: "#C084FC",
    fontWeight: "900",
  },
  slideIndexTag: {
    color: "#60A5FA",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  prompterText: {
    color: "#FFFFFF",
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  standbyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 20,
    gap: 14,
  },
  standbyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(168, 85, 247, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.3)",
  },
  standbyTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  standbySubtitle: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  switchNotesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    backgroundColor: "#7C3AED",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  switchNotesText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  notesBox: {
    gap: 16,
  },
  notesHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    paddingBottom: 10,
  },
  notesScriptTitle: {
    color: "#A855F7",
    fontSize: 18,
    fontWeight: "900",
    flex: 1,
    marginRight: 8,
  },
  editNotesPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(168, 85, 247, 0.18)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.3)",
  },
  editNotesPillText: {
    color: "#C084FC",
    fontSize: 11,
    fontWeight: "800",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(11, 8, 20, 0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bottomBarControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stageActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#1F1B2E",
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
    paddingVertical: 13,
    borderRadius: 14,
  },
  blackoutBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  nextBtn: {
    backgroundColor: "#7C3AED",
    borderColor: "#8B5CF6",
  },
  stageActionText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: "#0B0814",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  modalDoneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#7C3AED",
  },
  modalDoneText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  modalSectionLabel: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
  },
  presetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  presetCardActive: {
    backgroundColor: "rgba(168, 85, 247, 0.2)",
    borderColor: "#A855F7",
  },
  presetCardText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 11,
    fontWeight: "700",
  },
  presetCardTextActive: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  titleInput: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    color: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    fontSize: 15,
    fontWeight: "700",
  },
  notesTextInput: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    color: "#FFFFFF",
    padding: 14,
    borderRadius: 14,
    fontSize: 14,
    lineHeight: 22,
    minHeight: 280,
  },
});
