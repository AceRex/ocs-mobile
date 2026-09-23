import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  Keyboard,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Plus,
  Trash,
  X,
  Image as ImageIcon,
  FilmSlate,
  SpeakerHigh,
  PaperPlaneRight,
  Copy,
  ArrowCounterClockwise,
  ArrowClockwise,
  WarningCircle,
  PencilSimple,
  DotsThreeVertical,
  CaretRight,
  CheckCircle,
  XCircle,
  Clock,
} from "phosphor-react-native";
import * as DocumentPicker from "expo-document-picker";
import { useAgendaStore, TimelineItem } from "../store/agendaStore";
import { useSocketStore } from "../store/socketStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSecToHMS(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function formatSecToMinSec(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec > 0 ? `${m}m ${sec}s` : `${m} min`;
}

function formatTimestamp(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getCueType(cue: TimelineItem): "audio" | "video" | "image" {
  if (cue.track === "audio" || cue.mediaType === "audio") return "audio";
  if (
    cue.mediaType === "video" ||
    cue.track === "video" ||
    (cue.name && /\.(mp4|mov|webm|mkv|avi)$/i.test(cue.name))
  )
    return "video";
  return "image";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AgendaView = "overview" | "session" | "cues" | "cue_editor";
type SendState = "disconnected" | "ready" | "sending" | "waiting" | "accepted" | "declined" | "error";

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MobileAgendaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    agendas,
    activeAgendaId,
    transfer,
    init,
    createAgenda,
    duplicateAgenda,
    deleteAgenda,
    setActiveAgendaId,
    addSession,
    updateSession,
    deleteSession,
    addTimelineItem,
    updateTimelineItem,
    deleteTimelineItem,
    duplicateTimelineItem,
    importMediaAsset,
    undo,
    redo,
    sendToDesktop,
    cancelTransfer,
    resetTransfer,
  } = useAgendaStore();

  const { isConnected, isPaired } = useSocketStore();

  // ── Navigation ──────────────────────────────────────────────────────────────
  const [viewStack, setViewStack] = useState<AgendaView[]>(["overview"]);
  const currentView = viewStack[viewStack.length - 1];
  const pushView = (v: AgendaView) => setViewStack((s) => [...s, v]);
  const popView = () => setViewStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  // ── Selection ───────────────────────────────────────────────────────────────
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [editingCue, setEditingCue] = useState<TimelineItem | null>(null);
  const [cueSessionId, setCueSessionId] = useState<string | null>(null);

  // ── Modals ──────────────────────────────────────────────────────────────────
  const [cueActionMenu, setCueActionMenu] = useState<{ cue: TimelineItem; sessionId: string } | null>(null);
  const [renamingCue, setRenamingCue] = useState<{ cueId: string; name: string; sessionId: string } | null>(null);
  const [deletedCueUndo, setDeletedCueUndo] = useState<{ cue: TimelineItem; sessionId: string; timeoutId?: any } | null>(null);
  const [isAgendaPickerOpen, setIsAgendaPickerOpen] = useState(false);
  const [newAgendaName, setNewAgendaName] = useState("");
  const [isAddingAgenda, setIsAddingAgenda] = useState(false);
  const [addCueSheetOpen, setAddCueSheetOpen] = useState(false);
  const [sessionActionMenu, setSessionActionMenu] = useState<any | null>(null);
  const [editingField, setEditingField] = useState<{
    field: "name" | "durationSec" | "intervalSec" | "person" | "notes";
    value: string;
  } | null>(null);

  // ── Send state ──────────────────────────────────────────────────────────────
  const [sendSuccess, setSendSuccess] = useState(false);
  const sendSuccessTimer = useRef<any>(null);

  useEffect(() => { init(); }, []);

  const currentAgenda = useMemo(
    () => agendas.find((a) => a.id === activeAgendaId) || agendas[0] || null,
    [agendas, activeAgendaId]
  );

  const currentSession = useMemo(() => {
    if (!currentAgenda || !selectedSessionId) return null;
    return currentAgenda.sessions.find((s) => s.id === selectedSessionId) || null;
  }, [currentAgenda, selectedSessionId]);

  const totalStats = useMemo(() => {
    if (!currentAgenda) return { totalSec: 0, cueCount: 0, conflicts: 0 };
    let totalSec = 0, cueCount = 0, conflicts = 0;
    currentAgenda.sessions.forEach((s) => {
      totalSec += (s.durationSec || 0) + (s.intervalSec || 0);
      cueCount += (s.timelineItems || []).length;
      const vids = (s.timelineItems || []).filter((i) => i.track === "video").sort((a, b) => a.startSec - b.startSec);
      for (let i = 0; i < vids.length - 1; i++) {
        if (vids[i].startSec + vids[i].durationSec > vids[i + 1].startSec) conflicts++;
      }
    });
    return { totalSec, cueCount, conflicts };
  }, [currentAgenda]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleDeleteCueWithUndo = (cue: TimelineItem, sessionId: string) => {
    if (!currentAgenda) return;
    deleteTimelineItem(currentAgenda.id, sessionId, cue.id);
    if (deletedCueUndo?.timeoutId) clearTimeout(deletedCueUndo.timeoutId);
    const timeoutId = setTimeout(() => setDeletedCueUndo(null), 6000);
    setDeletedCueUndo({ cue, sessionId, timeoutId });
  };

  const handleUndoDeleteCue = () => {
    if (!deletedCueUndo || !currentAgenda) return;
    if (deletedCueUndo.timeoutId) clearTimeout(deletedCueUndo.timeoutId);
    addTimelineItem(currentAgenda.id, deletedCueUndo.sessionId, deletedCueUndo.cue);
    setDeletedCueUndo(null);
  };

  const handlePickMedia = async (
    track: "visual" | "background" | "video" | "audio",
    mediaTypeHint?: "image" | "video",
    targetSessionId?: string
  ) => {
    try {
      const isAudio = track === "audio";
      const isVideo = !isAudio && (mediaTypeHint === "video" || track === "video");
      const typeStr = isAudio ? "audio/*" : isVideo ? "video/*" : "image/*";
      const res = await DocumentPicker.getDocumentAsync({ type: [typeStr], copyToCacheDirectory: true });
      if (res.canceled || !res.assets || !res.assets.length) return;
      const file = res.assets[0];
      const asset = await importMediaAsset(
        file.uri, file.name, file.mimeType || "application/octet-stream",
        isAudio ? "audio" : isVideo ? "video" : "image", file.size
      );
      const sessId = targetSessionId || selectedSessionId;
      if (asset && currentAgenda && sessId) {
        addTimelineItem(currentAgenda.id, sessId, {
          track: isAudio ? "audio" : "visual",
          mediaType: isAudio ? "audio" : isVideo ? "video" : "image",
          presentationMode: isVideo ? "foreground" : "background",
          actionType: "range", startSec: 0,
          durationSec: isAudio ? 180 : 60,
          assetId: asset.id, name: asset.originalName,
          destination: "all", endBehavior: "hold",
        });
      }
    } catch (err: any) { Alert.alert("Media Error", err.message); }
  };

  const getSendState = (): SendState => {
    if (!isConnected || !isPaired) return "disconnected";
    if (transfer.waitingApproval) return "waiting";
    if (transfer.transferring) return "sending";
    if (sendSuccess || transfer.status === "Agenda accepted ✓") return "accepted";
    if (transfer.status === "Agenda declined") return "declined";
    if (transfer.error) return "error";
    return "ready";
  };

  const handleSendToDesktop = async () => {
    if (!currentAgenda) return;
    const state = getSendState();
    if (state === "disconnected") {
      Alert.alert("Not Paired", "Connect to the desktop controller on the same Wi-Fi first.", [
        { text: "Go to Connect", onPress: () => router.push("/connect") },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    if (state === "sending" || state === "waiting") {
      return;
    }
    if (state === "accepted") {
      Alert.alert("Already Accepted", "This agenda has already been accepted by the desktop controller. You can send updates again if desired.", [
        { text: "Cancel", style: "cancel" },
        { text: "Send Again", onPress: () => sendToDesktop(currentAgenda.id) },
      ]);
      return;
    }

    const res = await sendToDesktop(currentAgenda.id);
    if (res.ok) {
      setSendSuccess(true);
      if (sendSuccessTimer.current) clearTimeout(sendSuccessTimer.current);
      sendSuccessTimer.current = setTimeout(() => setSendSuccess(false), 6000);
    } else if (res.error && !res.error.toLowerCase().includes("declined")) {
      Alert.alert(
        "Couldn't send Agenda",
        `Debug:\n${res.error}`,
        [{ text: "OK" }]
      );
    }
  };

  const handleDeleteAgendaMobile = (agenda: { id: string; name?: string }) => {
    Alert.alert(
      "Delete Agenda",
      `Are you sure you want to delete "${agenda.name || "Untitled Agenda"}"? This action cannot be undone.\n\nNote: Reusable media files will remain safely in your Media Library.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Agenda",
          style: "destructive",
          onPress: async () => {
            await deleteAgenda(agenda.id);
          },
        },
      ]
    );
  };

  const commitFieldEdit = () => {
    if (!editingField || !currentAgenda || !currentSession) return;
    const { field, value } = editingField;
    if (field === "durationSec" || field === "intervalSec") {
      updateSession(currentAgenda.id, currentSession.id, {
        [field]: Math.max(field === "durationSec" ? 1 : 0, parseInt(value, 10) || 0),
      });
    } else {
      updateSession(currentAgenda.id, currentSession.id, { [field]: value });
    }
    setEditingField(null);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SCREEN 1 — SERVICE OVERVIEW
  // ─────────────────────────────────────────────────────────────────────────────

  const renderOverview = () => {
    const sendState = getSendState();
    const sendLabel = 
      sendState === "sending" ? "Sending…"
      : sendState === "waiting" ? "Waiting…"
      : sendState === "accepted" ? "Accepted ✓"
      : sendState === "declined" ? "Declined"
      : sendState === "error" ? "Error"
      : "Send";

    const sendBg = 
      sendState === "disconnected" ? "rgba(255,255,255,0.07)"
      : sendState === "waiting" ? "#D97706"
      : sendState === "accepted" ? "#16A34A"
      : sendState === "declined" ? "#EA580C"
      : sendState === "error" ? "#DC2626"
      : "#5B5EFF";

    return (
      <>
        <View style={S.header}>
          <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
            <ArrowLeft size={18} color="#FFF" weight="bold" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsAgendaPickerOpen(true)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={S.headerTitle} numberOfLines={1}>{currentAgenda?.name || "Agenda"}</Text>
            <CaretRight size={13} color="rgba(255,255,255,0.35)" weight="bold" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSendToDesktop}
            disabled={sendState === "sending" || sendState === "waiting"}
            style={[S.sendBtn, { backgroundColor: sendBg, opacity: sendState === "disconnected" ? 0.55 : 1 }]}
          >
            {sendState === "sending" ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : sendState === "waiting" ? (
              <Clock size={13} color="#FFF" weight="bold" />
            ) : sendState === "accepted" ? (
              <CheckCircle size={13} color="#FFF" weight="fill" />
            ) : sendState === "declined" ? (
              <XCircle size={13} color="#FFF" weight="fill" />
            ) : sendState === "error" ? (
              <XCircle size={13} color="#FFF" weight="fill" />
            ) : (
              <PaperPlaneRight size={13} color="#FFF" weight="bold" />
            )}
            <Text style={S.sendBtnText}>{sendLabel}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={[S.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
          {/* Transfer Status Banner */}
          {(transfer.transferring || transfer.waitingApproval || transfer.status || transfer.error) ? (
            <View style={{
              backgroundColor: transfer.error ? "rgba(220,38,38,0.15)"
                : transfer.waitingApproval ? "rgba(217,119,6,0.15)"
                : transfer.status === "Agenda declined" ? "rgba(234,88,12,0.15)"
                : transfer.status === "Agenda accepted ✓" ? "rgba(22,163,74,0.15)"
                : "rgba(124,58,237,0.15)",
              borderColor: transfer.error ? "rgba(220,38,38,0.3)"
                : transfer.waitingApproval ? "rgba(217,119,6,0.3)"
                : transfer.status === "Agenda declined" ? "rgba(234,88,12,0.3)"
                : transfer.status === "Agenda accepted ✓" ? "rgba(22,163,74,0.3)"
                : "rgba(124,58,237,0.3)",
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}>
              {transfer.waitingApproval ? (
                <Clock size={16} color="#F59E0B" weight="fill" />
              ) : transfer.transferring ? (
                <ActivityIndicator size="small" color="#A78BFA" />
              ) : transfer.error || transfer.status === "Agenda declined" ? (
                <XCircle size={16} color="#EF4444" weight="fill" />
              ) : (
                <CheckCircle size={16} color="#10B981" weight="fill" />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#FFF" }}>
                  {transfer.status || (transfer.error ? "Couldn't send Agenda" : "Transferring...")}
                </Text>
                {transfer.error && (
                  <Text style={{ fontSize: 11, color: "#FCA5A5", fontWeight: "600", marginTop: 2 }}>
                    Debug: {transfer.error}
                  </Text>
                )}
              </View>
              {(transfer.status || transfer.error) && !transfer.transferring && !transfer.waitingApproval && (
                <TouchableOpacity
                  onPress={() => useAgendaStore.setState({ transfer: { transferring: false, waitingApproval: false, progress: 0, status: "", error: null } })}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={14} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {/* Runtime card */}
          <View style={S.runtimeCard}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={S.runtimeLabel}>PLANNED RUNTIME</Text>
              {totalStats.conflicts > 0 && (
                <View style={S.conflictBadge}>
                  <WarningCircle size={11} color="#F59E0B" weight="fill" />
                  <Text style={S.conflictText}>{totalStats.conflicts} Overlap{totalStats.conflicts !== 1 ? "s" : ""}</Text>
                </View>
              )}
            </View>
            <Text style={S.runtimeValue}>{formatSecToHMS(totalStats.totalSec)}</Text>
            <View style={S.runtimeMeta}>
              <Text style={S.runtimeMetaItem}>{currentAgenda?.sessions.length || 0} Sessions</Text>
              <Text style={S.runtimeMetaDot}>·</Text>
              <Text style={S.runtimeMetaItem}>{totalStats.cueCount} Cues</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => currentAgenda && undo(currentAgenda.id)} style={S.iconSmallBtn}>
                <ArrowCounterClockwise size={13} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => currentAgenda && redo(currentAgenda.id)} style={S.iconSmallBtn}>
                <ArrowClockwise size={13} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Sessions */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={S.sectionTitle}>Sessions</Text>
            <TouchableOpacity
              onPress={() => currentAgenda && addSession(currentAgenda.id, "New Session", 300)}
              style={S.addBtn}
            >
              <Plus size={12} color="#A78BFA" weight="bold" />
              <Text style={S.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {(!currentAgenda?.sessions || currentAgenda.sessions.length === 0) ? (
            <View style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              borderColor: "rgba(255,255,255,0.07)",
              borderWidth: 1,
              borderRadius: 12,
              padding: 24,
              alignItems: "center",
              justifyContent: "center",
              marginTop: 8,
            }}>
              <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginBottom: 12, textAlign: "center" }}>
                This agenda is empty. Add a session to get started.
              </Text>
              <TouchableOpacity
                onPress={() => currentAgenda && addSession(currentAgenda.id, "Session 1", 300)}
                style={{
                  backgroundColor: "rgba(124,58,237,0.25)",
                  borderColor: "rgba(124,58,237,0.5)",
                  borderWidth: 1,
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 12,
                }}
              >
                <Text style={{ color: "#C4B5FD", fontWeight: "bold", fontSize: 12 }}>+ Add Session</Text>
              </TouchableOpacity>
            </View>
          ) : (
            (currentAgenda?.sessions || []).map((session, idx) => {
            const cCount = session.timelineItems?.length || 0;
            return (
              <TouchableOpacity
                key={session.id}
                onPress={() => { setSelectedSessionId(session.id); pushView("session"); }}
                style={S.sessionRow}
                activeOpacity={0.75}
              >
                <View style={S.sessionIndex}>
                  <Text style={S.sessionIndexText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.sessionName} numberOfLines={1}>{session.name}</Text>
                  <Text style={S.sessionMeta}>
                    {formatSecToMinSec(session.durationSec)} · {session.transitionMode === "auto" ? "Auto" : "Manual"}
                    {cCount > 0 ? ` · ${cCount} Cue${cCount !== 1 ? "s" : ""}` : ""}
                  </Text>
                  {session.person ? <Text style={S.sessionPerson} numberOfLines={1}>{session.person}</Text> : null}
                </View>
                <CaretRight size={16} color="rgba(255,255,255,0.25)" weight="bold" />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
      </>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SCREEN 2 — SESSION EDITOR
  // ─────────────────────────────────────────────────────────────────────────────

  const renderSessionEditor = () => {
    if (!currentSession) return null;
    const cCount = currentSession.timelineItems?.length || 0;

    const row = (label: string, val: string, onPress: () => void, right?: React.ReactNode) => (
      <TouchableOpacity onPress={onPress} style={S.settingRow} activeOpacity={0.7}>
        <Text style={S.settingLabel}>{label}</Text>
        {right ?? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={S.settingVal} numberOfLines={1}>{val}</Text>
            <CaretRight size={14} color="rgba(255,255,255,0.25)" weight="bold" />
          </View>
        )}
      </TouchableOpacity>
    );

    return (
      <>
        <View style={S.header}>
          <TouchableOpacity onPress={popView} style={S.backBtn}>
            <ArrowLeft size={18} color="#FFF" weight="bold" />
          </TouchableOpacity>
          <Text style={[S.headerTitle, { flex: 1 }]} numberOfLines={1}>{currentSession.name}</Text>
          <TouchableOpacity onPress={() => setSessionActionMenu(currentSession)} style={S.iconBtn}>
            <DotsThreeVertical size={20} color="#FFF" weight="bold" />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={[S.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
          <Text style={S.sessionEditorMeta}>
            {formatSecToMinSec(currentSession.durationSec)} · {currentSession.transitionMode === "auto" ? "Auto advance" : "Manual"} · {cCount} Cue{cCount !== 1 ? "s" : ""}
          </Text>

          <Text style={S.sectionTitle}>SESSION DETAILS</Text>
          <View style={S.card}>
            {row("Duration", formatSecToMinSec(currentSession.durationSec), () => setEditingField({ field: "durationSec", value: String(currentSession.durationSec) }))}
            <View style={S.divider} />
            {row("Interval", currentSession.intervalSec > 0 ? `${currentSession.intervalSec}s` : "None", () => setEditingField({ field: "intervalSec", value: String(currentSession.intervalSec || 0) }))}
            <View style={S.divider} />
            {row(
              "Advance",
              currentSession.transitionMode === "auto" ? "Auto" : "Manual",
              () => currentAgenda && updateSession(currentAgenda.id, currentSession.id, {
                transitionMode: currentSession.transitionMode === "auto" ? "manual" : "auto",
              }),
              <View style={[S.pill, currentSession.transitionMode === "auto" && S.pillActive]}>
                <Text style={[S.pillText, currentSession.transitionMode === "auto" && S.pillTextActive]}>
                  {currentSession.transitionMode === "auto" ? "Auto" : "Manual"}
                </Text>
              </View>
            )}
            <View style={S.divider} />
            {row("Presenter", currentSession.person || "Not set", () => setEditingField({ field: "person", value: currentSession.person || "" }))}
            <View style={S.divider} />
            {row(
              "Recording",
              "",
              () => currentAgenda && updateSession(currentAgenda.id, currentSession.id, { recordSession: !currentSession.recordSession }),
              <View style={[S.toggle, currentSession.recordSession && S.toggleOn]}>
                <View style={[S.toggleThumb, currentSession.recordSession && S.toggleThumbOn]} />
              </View>
            )}
            <View style={S.divider} />
            {row(
              "Notes",
              currentSession.notes ? currentSession.notes.slice(0, 32) + (currentSession.notes.length > 32 ? "…" : "") : "Add notes…",
              () => setEditingField({ field: "notes", value: currentSession.notes || "" })
            )}
          </View>

          <Text style={[S.sectionTitle, { marginTop: 22 }]}>MEDIA</Text>
          <View style={S.card}>
            <TouchableOpacity onPress={() => pushView("cues")} style={S.settingRow} activeOpacity={0.75}>
              <Text style={S.settingLabel}>Media Cues</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={S.badge}><Text style={S.badgeText}>{cCount}</Text></View>
                <CaretRight size={14} color="rgba(255,255,255,0.25)" weight="bold" />
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SCREEN 3 — MEDIA CUES
  // ─────────────────────────────────────────────────────────────────────────────

  const renderMediaCues = () => {
    if (!currentSession) return null;
    const sorted = [...(currentSession.timelineItems || [])].sort((a, b) => a.startSec - b.startSec);

    return (
      <>
        <View style={S.header}>
          <TouchableOpacity onPress={popView} style={S.backBtn}>
            <ArrowLeft size={18} color="#FFF" weight="bold" />
          </TouchableOpacity>
          <Text style={[S.headerTitle, { flex: 1 }]}>Media Cues</Text>
          <TouchableOpacity onPress={() => setAddCueSheetOpen(true)} style={S.iconBtn}>
            <Plus size={18} color="#A78BFA" weight="bold" />
          </TouchableOpacity>
        </View>
        <View style={S.subheader}>
          <Text style={S.subheaderText}>{currentSession.name}</Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={[S.scroll, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
          {!sorted.length && (
            <View style={S.empty}>
              <ImageIcon size={32} color="rgba(255,255,255,0.18)" />
              <Text style={S.emptyTitle}>No cues yet</Text>
              <Text style={S.emptySub}>Tap + to add image, video, or audio</Text>
              <TouchableOpacity onPress={() => setAddCueSheetOpen(true)} style={S.emptyAddBtn}>
                <Plus size={14} color="#FFF" weight="bold" />
                <Text style={S.emptyAddBtnText}>Add Cue</Text>
              </TouchableOpacity>
            </View>
          )}
          {sorted.map((cue) => {
            const type = getCueType(cue);
            const color = type === "audio" ? "#FBBF24" : type === "video" ? "#60A5FA" : "#C084FC";
            const bg = type === "audio" ? "rgba(251,191,36,0.1)" : type === "video" ? "rgba(96,165,250,0.1)" : "rgba(192,132,252,0.1)";
            const border = type === "audio" ? "rgba(251,191,36,0.18)" : type === "video" ? "rgba(96,165,250,0.18)" : "rgba(192,132,252,0.18)";
            const cueDur = cue.durationSec || 60;
            const cueEnd = cue.startSec + cueDur;

            return (
              <View key={cue.id}>
                <Text style={S.cueTimestamp}>{formatTimestamp(cue.startSec)}</Text>
                <TouchableOpacity
                  style={[S.cueCard, { borderColor: border }]}
                  onPress={() => { setEditingCue(cue); setCueSessionId(currentSession.id); pushView("cue_editor"); }}
                  activeOpacity={0.75}
                >
                  <View style={[S.cueIconBox, { backgroundColor: bg }]}>
                    {type === "audio" ? <SpeakerHigh size={18} color={color} weight="fill" />
                      : type === "video" ? <FilmSlate size={18} color={color} weight="fill" />
                      : <ImageIcon size={18} color={color} weight="fill" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.cueName} numberOfLines={1}>{cue.name}</Text>
                    <Text style={S.cueMeta}>{type === "audio" ? "Audio" : type === "video" ? "Video" : "Image"} · {formatTimestamp(cue.startSec)} → {formatTimestamp(cueEnd)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setCueActionMenu({ cue, sessionId: currentSession.id })}
                    style={{ padding: 6 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <DotsThreeVertical size={16} color="rgba(255,255,255,0.45)" weight="bold" />
                  </TouchableOpacity>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SCREEN 4 — CUE EDITOR (bottom sheet Modal over Screen 3)
  // ─────────────────────────────────────────────────────────────────────────────

  const renderCueEditor = () => {
    if (!editingCue || !currentAgenda) return null;
    const sessId = cueSessionId || selectedSessionId;
    if (!sessId) return null;
    const session = currentAgenda.sessions.find((s) => s.id === sessId);
    if (!session) return null;
    const cueDur = editingCue.durationSec || 60;
    const cueEnd = editingCue.startSec + cueDur;

    const nudgeStart = (d: number) => {
      const ns = Math.max(0, Math.min(cueEnd - 1, editingCue.startSec + d));
      const nd = Math.max(1, cueEnd - ns);
      const u = { ...editingCue, startSec: ns, durationSec: nd };
      setEditingCue(u);
      updateTimelineItem(currentAgenda.id, sessId, editingCue.id, { startSec: ns, durationSec: nd });
    };
    const nudgeEnd = (d: number) => {
      const ne = Math.max(editingCue.startSec + 1, Math.min(session.durationSec, cueEnd + d));
      const nd = ne - editingCue.startSec;
      setEditingCue({ ...editingCue, durationSec: nd });
      updateTimelineItem(currentAgenda.id, sessId, editingCue.id, { durationSec: nd });
    };

    return (
      <>
        {renderMediaCues()}
        <Modal visible animationType="slide" transparent onRequestClose={popView}>
          <View style={S.sheetOverlay}>
            <View style={S.editorSheet}>
              <View style={S.sheetHandle} />
              <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={S.editorTitle}>Edit Cue</Text>
                  <Text style={S.editorSub} numberOfLines={1}>{editingCue.name}</Text>
                </View>
                <TouchableOpacity onPress={popView} style={S.closeBtn}>
                  <X size={16} color="#FFF" weight="bold" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={S.fieldLabel}>Cue Title</Text>
                <TextInput
                  value={editingCue.name}
                  onChangeText={(v) => { const u = { ...editingCue, name: v }; setEditingCue(u); updateTimelineItem(currentAgenda.id, sessId, editingCue.id, { name: v }); }}
                  style={S.fieldInput}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.fieldLabel}>Start (sec)</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={String(editingCue.startSec)}
                      onChangeText={(v) => {
                        const end2 = editingCue.startSec + (editingCue.durationSec || 60);
                        const s2 = Math.max(0, Math.min(end2 - 1, parseInt(v, 10) || 0));
                        const d2 = Math.max(1, end2 - s2);
                        setEditingCue({ ...editingCue, startSec: s2, durationSec: d2 });
                        updateTimelineItem(currentAgenda.id, sessId, editingCue.id, { startSec: s2, durationSec: d2 });
                      }}
                      style={S.fieldInput}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.fieldLabel}>End (sec)</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={String(cueEnd)}
                      onChangeText={(v) => {
                        const te = parseInt(v, 10) || (editingCue.startSec + 1);
                        const ce = Math.max(editingCue.startSec + 1, Math.min(session.durationSec || 3600, te));
                        const d2 = ce - editingCue.startSec;
                        setEditingCue({ ...editingCue, durationSec: d2 });
                        updateTimelineItem(currentAgenda.id, sessId, editingCue.id, { durationSec: d2 });
                      }}
                      style={S.fieldInput}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2, marginTop: 8, marginBottom: 2 }}>
                  <Text style={S.durationLabel}>Duration</Text>
                  <Text style={S.durationValue}>{formatSecToHMS(cueDur)}</Text>
                </View>

                <Text style={S.fieldLabel}>Adjust Timing</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.nudgeLabel}>Start boundary</Text>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <TouchableOpacity onPress={() => nudgeStart(-5)} style={S.nudgeBtn}><Text style={S.nudgeText}>-5s</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => nudgeStart(5)} style={S.nudgeBtn}><Text style={S.nudgeText}>+5s</Text></TouchableOpacity>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.nudgeLabel}>End boundary</Text>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <TouchableOpacity onPress={() => nudgeEnd(-5)} style={S.nudgeBtn}><Text style={S.nudgeText}>-5s</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => nudgeEnd(5)} style={S.nudgeBtn}><Text style={S.nudgeText}>+5s</Text></TouchableOpacity>
                    </View>
                  </View>
                </View>

                <Text style={S.fieldLabel}>Output Destination</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {(["all", "general", "speaker"] as const).map((d) => (
                    <TouchableOpacity
                      key={d}
                      onPress={() => { setEditingCue({ ...editingCue, destination: d }); updateTimelineItem(currentAgenda.id, sessId, editingCue.id, { destination: d }); }}
                      style={[(editingCue.destination || "all") === d ? S.segActive : S.segInactive]}
                    >
                      <Text style={(editingCue.destination || "all") === d ? S.segTextActive : S.segTextInactive}>
                        {d === "all" ? "All" : d === "general" ? "General" : "Speaker"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={S.fieldLabel}>When Media Ends</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {(["hold", "restore", "continue"] as const).map((b) => (
                    <TouchableOpacity
                      key={b}
                      onPress={() => { setEditingCue({ ...editingCue, endBehavior: b }); updateTimelineItem(currentAgenda.id, sessId, editingCue.id, { endBehavior: b }); }}
                      style={[(editingCue.endBehavior || "hold") === b ? S.segActive : S.segInactive]}
                    >
                      <Text style={(editingCue.endBehavior || "hold") === b ? S.segTextActive : S.segTextInactive}>
                        {b === "hold" ? "Hold" : b === "restore" ? "Restore" : "Continue"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={() => { const t = getCueType(editingCue); handlePickMedia(t === "audio" ? "audio" : t === "video" ? "video" : "visual", t === "video" ? "video" : undefined, sessId); }}
                  style={S.secondaryBtn}
                >
                  <Text style={S.secondaryBtnText}>Replace Media</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => Alert.alert("Delete Cue", `Delete "${editingCue.name}"?`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => { handleDeleteCueWithUndo(editingCue, sessId); popView(); } },
                  ])}
                  style={S.deleteBtn}
                >
                  <Trash size={15} color="#EF4444" weight="bold" />
                  <Text style={S.deleteBtnText}>Delete Cue</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // ROOT RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={S.root} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {currentView === "overview" && renderOverview()}
      {currentView === "session" && renderSessionEditor()}
      {currentView === "cues" && renderMediaCues()}
      {currentView === "cue_editor" && renderCueEditor()}

      {/* ── Session field edit modal ──────────────────────────────────────────── */}
      <Modal visible={!!editingField} transparent animationType="fade" onRequestClose={() => setEditingField(null)}>
        <Pressable style={S.modalBg} onPress={Keyboard.dismiss}>
          <View style={S.modalCard}>
            <Text style={S.modalTitle}>
              {editingField?.field === "durationSec" ? "Duration (seconds)"
                : editingField?.field === "intervalSec" ? "Interval (seconds)"
                : editingField?.field === "person" ? "Presenter"
                : editingField?.field === "notes" ? "Session Notes"
                : "Rename Session"}
            </Text>
            <TextInput
              value={editingField?.value || ""}
              onChangeText={(v) => editingField && setEditingField({ ...editingField, value: v })}
              style={[S.fieldInput, editingField?.field === "notes" && { height: 80, textAlignVertical: "top" }, { marginBottom: 14 }]}
              keyboardType={editingField?.field === "durationSec" || editingField?.field === "intervalSec" ? "numeric" : "default"}
              multiline={editingField?.field === "notes"}
              autoFocus
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => setEditingField(null)} style={S.cancelBtn}>
                <Text style={S.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={commitFieldEdit} style={S.saveBtn}>
                <Text style={S.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ── Add Cue sheet ───────────────────────────────────────────────────── */}
      <Modal visible={addCueSheetOpen} transparent animationType="slide" onRequestClose={() => setAddCueSheetOpen(false)}>
        <TouchableOpacity activeOpacity={1} style={S.sheetOverlay} onPress={() => setAddCueSheetOpen(false)}>
          <View style={S.sheet} onStartShouldSetResponder={() => true}>
            <View style={S.sheetHandle} />
            <Text style={S.sheetTitle}>Add Media Cue</Text>
            <Text style={S.sheetSub}>Choose type of media for this session</Text>
            {[
              { label: "Image", sub: "PNG, JPG, WebP", icon: <ImageIcon size={20} color="#C084FC" weight="fill" />, bg: "rgba(192,132,252,0.1)", onPress: () => { setAddCueSheetOpen(false); handlePickMedia("visual", "image"); } },
              { label: "Video", sub: "MP4, MOV, WebM", icon: <FilmSlate size={20} color="#60A5FA" weight="fill" />, bg: "rgba(96,165,250,0.1)", onPress: () => { setAddCueSheetOpen(false); handlePickMedia("video", "video"); } },
              { label: "Audio", sub: "MP3, AAC, WAV", icon: <SpeakerHigh size={20} color="#FBBF24" weight="fill" />, bg: "rgba(251,191,36,0.1)", onPress: () => { setAddCueSheetOpen(false); handlePickMedia("audio"); } },
            ].map((item) => (
              <TouchableOpacity key={item.label} onPress={item.onPress} style={S.sheetOption} activeOpacity={0.75}>
                <View style={[S.sheetOptionIcon, { backgroundColor: item.bg }]}>{item.icon}</View>
                <View style={{ flex: 1 }}>
                  <Text style={S.sheetOptionLabel}>{item.label}</Text>
                  <Text style={S.sheetOptionSub}>{item.sub}</Text>
                </View>
                <CaretRight size={14} color="rgba(255,255,255,0.22)" weight="bold" />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Cue action sheet ────────────────────────────────────────────────── */}
      <Modal visible={!!cueActionMenu} transparent animationType="fade" onRequestClose={() => setCueActionMenu(null)}>
        <TouchableOpacity activeOpacity={1} style={S.sheetOverlay} onPress={() => setCueActionMenu(null)}>
          <View style={S.sheet} onStartShouldSetResponder={() => true}>
            <View style={S.sheetHandle} />
            <Text style={S.sheetTitle} numberOfLines={1}>{cueActionMenu?.cue.name || "Cue"}</Text>
            <Text style={S.sheetSub}>At {formatTimestamp(cueActionMenu?.cue.startSec || 0)} · {cueActionMenu?.cue.track}</Text>

            {[
              { label: "Edit Cue", sub: "Open cue inspector", icon: <PencilSimple size={18} color="#A78BFA" />, bg: "rgba(167,139,250,0.1)", onPress: () => { if (!cueActionMenu) return; const t = cueActionMenu; setCueActionMenu(null); setEditingCue(t.cue); setCueSessionId(t.sessionId); pushView("cue_editor"); } },
              { label: "Rename", sub: "Change display name", icon: <PencilSimple size={18} color="#60A5FA" />, bg: "rgba(96,165,250,0.1)", onPress: () => { if (!cueActionMenu) return; const t = cueActionMenu; setCueActionMenu(null); setRenamingCue({ cueId: t.cue.id, name: t.cue.name, sessionId: t.sessionId }); } },
              { label: "Duplicate", sub: "Add a copy", icon: <Copy size={18} color="#FFF" />, bg: "rgba(255,255,255,0.05)", onPress: () => { if (!cueActionMenu || !currentAgenda) return; duplicateTimelineItem(currentAgenda.id, cueActionMenu.sessionId, cueActionMenu.cue.id); setCueActionMenu(null); } },
            ].map((item) => (
              <TouchableOpacity key={item.label} onPress={item.onPress} style={S.sheetOption} activeOpacity={0.75}>
                <View style={[S.sheetOptionIcon, { backgroundColor: item.bg }]}>{item.icon}</View>
                <View style={{ flex: 1 }}>
                  <Text style={S.sheetOptionLabel}>{item.label}</Text>
                  <Text style={S.sheetOptionSub}>{item.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              onPress={() => { if (!cueActionMenu) return; const { cue, sessionId } = cueActionMenu; setCueActionMenu(null); handleDeleteCueWithUndo(cue, sessionId); }}
              style={[S.sheetOption, { borderTopColor: "rgba(239,68,68,0.1)" }]}
            >
              <View style={[S.sheetOptionIcon, { backgroundColor: "rgba(239,68,68,0.1)" }]}><Trash size={18} color="#EF4444" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[S.sheetOptionLabel, { color: "#F87171" }]}>Delete Cue</Text>
                <Text style={S.sheetOptionSub}>Remove with undo</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Session action sheet ────────────────────────────────────────────── */}
      <Modal visible={!!sessionActionMenu} transparent animationType="fade" onRequestClose={() => setSessionActionMenu(null)}>
        <TouchableOpacity activeOpacity={1} style={S.sheetOverlay} onPress={() => setSessionActionMenu(null)}>
          <View style={S.sheet} onStartShouldSetResponder={() => true}>
            <View style={S.sheetHandle} />
            <Text style={S.sheetTitle} numberOfLines={1}>{sessionActionMenu?.name || "Session"}</Text>
            <TouchableOpacity onPress={() => { if (!sessionActionMenu) return; setSessionActionMenu(null); setEditingField({ field: "name", value: sessionActionMenu.name }); }} style={S.sheetOption} activeOpacity={0.75}>
              <View style={[S.sheetOptionIcon, { backgroundColor: "rgba(167,139,250,0.1)" }]}><PencilSimple size={18} color="#A78BFA" /></View>
              <Text style={S.sheetOptionLabel}>Rename Session</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              if (!sessionActionMenu || !currentAgenda) return;
              const t = sessionActionMenu;
              setSessionActionMenu(null);
              Alert.alert("Delete Session", `Delete "${t.name}"?`, [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => { deleteSession(currentAgenda.id, t.id); popView(); } },
              ]);
            }} style={S.sheetOption} activeOpacity={0.75}>
              <View style={[S.sheetOptionIcon, { backgroundColor: "rgba(239,68,68,0.1)" }]}><Trash size={18} color="#EF4444" /></View>
              <Text style={[S.sheetOptionLabel, { color: "#F87171" }]}>Delete Session</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Rename Cue modal ────────────────────────────────────────────────── */}
      <Modal visible={!!renamingCue} transparent animationType="fade" onRequestClose={() => setRenamingCue(null)}>
        <View style={S.modalBg}>
          <View style={S.modalCard}>
            <Text style={S.modalTitle}>Rename Cue</Text>
            <TextInput
              value={renamingCue?.name || ""}
              onChangeText={(v) => renamingCue && setRenamingCue({ ...renamingCue, name: v })}
              style={[S.fieldInput, { marginBottom: 14 }]}
              placeholder="Cue Name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity onPress={() => setRenamingCue(null)} style={S.cancelBtn}>
                <Text style={S.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                if (renamingCue?.name.trim() && currentAgenda) {
                  updateTimelineItem(currentAgenda.id, renamingCue.sessionId, renamingCue.cueId, { name: renamingCue.name.trim() });
                }
                setRenamingCue(null);
              }} style={S.saveBtn}>
                <Text style={S.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Undo delete banner ──────────────────────────────────────────────── */}
      {deletedCueUndo && (
        <View style={[S.undoBanner, { bottom: insets.bottom + 12 }]}>
          <Text style={S.undoBannerText} numberOfLines={1}>
            Cue <Text style={{ fontWeight: "700" }}>"{deletedCueUndo.cue.name}"</Text> deleted
          </Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TouchableOpacity onPress={handleUndoDeleteCue} style={S.undoBtn2}>
              <Text style={S.undoBtnText}>Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { if (deletedCueUndo.timeoutId) clearTimeout(deletedCueUndo.timeoutId); setDeletedCueUndo(null); }} style={S.undoDismiss}>
              <X size={11} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Transfer progress overlay ────────────────────────────────────────── */}
      <Modal visible={transfer.transferring} transparent animationType="fade">
        <View style={S.overlay}>
          <View style={S.overlayCard}>
            <ActivityIndicator size="large" color="#A78BFA" style={{ marginBottom: 16 }} />
            <Text style={S.overlayTitle}>Sending to Desktop</Text>
            <Text style={S.overlaySub}>{transfer.status}</Text>
            <View style={S.progressBar}><View style={[S.progressFill, { width: `${transfer.progress}%` as any }]} /></View>
            <Text style={S.progressPct}>{transfer.progress}%</Text>
            <TouchableOpacity onPress={cancelTransfer} style={S.cancelTransferBtn}>
              <Text style={S.cancelTransferText}>Cancel Transfer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Agenda switcher modal ─────────────────────────────────────────────── */}
      <Modal visible={isAgendaPickerOpen} transparent animationType="fade" onRequestClose={() => setIsAgendaPickerOpen(false)}>
        <View style={S.overlay}>
          <View style={[S.modalCard, { maxHeight: "78%" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={S.modalTitle}>Select Agenda</Text>
              <TouchableOpacity onPress={() => { setIsAgendaPickerOpen(false); setIsAddingAgenda(false); }} style={S.closeBtn}>
                <X size={16} color="#FFF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 260, marginBottom: 12 }}>
              {agendas.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => { setActiveAgendaId(a.id); resetTransfer(); setIsAgendaPickerOpen(false); }}
                  style={[S.agendaRow, a.id === currentAgenda?.id && S.agendaRowActive]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={S.agendaRowName} numberOfLines={1}>{a.name}</Text>
                    <Text style={S.agendaRowMeta}>{a.sessions.length} sessions</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity onPress={() => duplicateAgenda(a.id)} style={S.agendaAction}>
                      <Copy size={12} color="#FFF" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteAgendaMobile(a)} style={S.agendaAction}>
                      <Trash size={12} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {isAddingAgenda ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={newAgendaName}
                  onChangeText={setNewAgendaName}
                  placeholder="Agenda Name"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={[S.fieldInput, { flex: 1, marginBottom: 0 }]}
                  autoFocus
                />
                <TouchableOpacity onPress={async () => { if (newAgendaName.trim()) { await createAgenda(newAgendaName.trim()); setNewAgendaName(""); setIsAddingAgenda(false); setIsAgendaPickerOpen(false); } }} style={S.saveBtn}>
                  <Text style={S.saveBtnText}>Create</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setIsAddingAgenda(true)} style={S.cancelBtn}>
                <Text style={S.cancelBtnText}>+ Create New Agenda</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────

const R = 12;

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0D0F1A" },

  // Header
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)", gap: 10 },
  backBtn: { width: 34, height: 34, borderRadius: R, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 34, height: 34, borderRadius: R, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFF", fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  sendBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: R },
  sendBtnText: { color: "#FFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
  subheader: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  subheaderText: { color: "rgba(255,255,255,0.4)", fontSize: 12 },

  // Scroll
  scroll: { paddingHorizontal: 16, paddingTop: 16, flexGrow: 1 },

  // Runtime
  runtimeCard: { backgroundColor: "#13172A", borderRadius: R, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: 16, marginBottom: 20 },
  runtimeLabel: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2 },
  runtimeValue: { color: "#FFF", fontSize: 34, fontWeight: "900", letterSpacing: -1 },
  runtimeMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" },
  runtimeMetaItem: { color: "rgba(255,255,255,0.4)", fontSize: 11 },
  runtimeMetaDot: { color: "rgba(255,255,255,0.18)", fontSize: 11 },
  iconSmallBtn: { width: 26, height: 26, borderRadius: R, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  conflictBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(245,158,11,0.1)", borderWidth: 1, borderColor: "rgba(245,158,11,0.25)", borderRadius: R, paddingHorizontal: 8, paddingVertical: 3 },
  conflictText: { color: "#FCD34D", fontSize: 10, fontWeight: "700" },

  // Section
  sectionTitle: { color: "rgba(255,255,255,0.38)", fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 10 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(167,139,250,0.08)", borderRadius: R, borderWidth: 1, borderColor: "rgba(167,139,250,0.22)" },
  addBtnText: { color: "#A78BFA", fontSize: 12, fontWeight: "700" },

  // Sessions
  sessionRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#13172A", borderRadius: R, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 14, marginBottom: 8, gap: 12 },
  sessionIndex: { width: 28, height: 28, borderRadius: R, backgroundColor: "rgba(91,94,255,0.12)", borderWidth: 1, borderColor: "rgba(91,94,255,0.25)", alignItems: "center", justifyContent: "center" },
  sessionIndexText: { color: "#A78BFA", fontSize: 12, fontWeight: "800" },
  sessionName: { color: "#FFF", fontSize: 14, fontWeight: "700", marginBottom: 2 },
  sessionMeta: { color: "rgba(255,255,255,0.42)", fontSize: 12 },
  sessionPerson: { color: "rgba(167,139,250,0.75)", fontSize: 11, marginTop: 2 },

  // Empty
  empty: { alignItems: "center", paddingVertical: 52, gap: 8 },
  emptyTitle: { color: "rgba(255,255,255,0.42)", fontSize: 15, fontWeight: "700" },
  emptySub: { color: "rgba(255,255,255,0.22)", fontSize: 12, textAlign: "center" },
  emptyAddBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#5B5EFF", borderRadius: R, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8 },
  emptyAddBtnText: { color: "#FFF", fontSize: 13, fontWeight: "700" },

  // Session editor
  sessionEditorMeta: { color: "rgba(255,255,255,0.42)", fontSize: 13, marginBottom: 20 },
  card: { backgroundColor: "#13172A", borderRadius: R, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", overflow: "hidden", marginBottom: 4 },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  settingLabel: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "500" },
  settingVal: { color: "rgba(255,255,255,0.45)", fontSize: 13, maxWidth: 180, textAlign: "right" },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginHorizontal: 16 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: R, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  pillActive: { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.35)" },
  pillText: { color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: "700" },
  pillTextActive: { color: "#4ADE80" },
  toggle: { width: 38, height: 22, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", paddingHorizontal: 2 },
  toggleOn: { backgroundColor: "#5B5EFF" },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.45)" },
  toggleThumbOn: { backgroundColor: "#FFF", alignSelf: "flex-end" },
  badge: { minWidth: 22, height: 22, borderRadius: R, backgroundColor: "rgba(91,94,255,0.12)", borderWidth: 1, borderColor: "rgba(91,94,255,0.25)", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: "#A78BFA", fontSize: 11, fontWeight: "800" },

  // Cues
  cueTimestamp: { color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: "700", letterSpacing: 0.5, marginTop: 10, marginBottom: 5 },
  cueCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#13172A", borderRadius: R, borderWidth: 1, padding: 12, marginBottom: 4, gap: 12 },
  cueIconBox: { width: 40, height: 40, borderRadius: R, alignItems: "center", justifyContent: "center" },
  cueName: { color: "#FFF", fontSize: 13, fontWeight: "700", marginBottom: 2 },
  cueMeta: { color: "rgba(255,255,255,0.38)", fontSize: 11 },

  // Cue editor sheet
  sheetOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.65)" },
  editorSheet: { backgroundColor: "#13172A", borderTopLeftRadius: R, borderTopRightRadius: R, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.12)", padding: 20, maxHeight: "86%" },
  editorTitle: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  editorSub: { color: "rgba(255,255,255,0.42)", fontSize: 12, marginTop: 2 },
  closeBtn: { width: 30, height: 30, borderRadius: R, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  fieldLabel: { color: "rgba(255,255,255,0.42)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 6, marginTop: 14 },
  fieldInput: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: R, paddingHorizontal: 12, paddingVertical: 10, color: "#FFF", fontSize: 14, fontWeight: "600" },
  durationLabel: { color: "rgba(255,255,255,0.38)", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 },
  durationValue: { color: "#A78BFA", fontSize: 13, fontWeight: "800" },
  nudgeLabel: { color: "rgba(255,255,255,0.32)", fontSize: 10, fontWeight: "600", marginBottom: 6 },
  nudgeBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: R, paddingVertical: 8, alignItems: "center" },
  nudgeText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "700" },
  segActive: { flex: 1, backgroundColor: "#5B5EFF", borderRadius: R, paddingVertical: 9, alignItems: "center" },
  segInactive: { flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: R, paddingVertical: 9, alignItems: "center" },
  segTextActive: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  segTextInactive: { color: "rgba(255,255,255,0.48)", fontSize: 12, fontWeight: "600" },
  secondaryBtn: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: R, paddingVertical: 12, alignItems: "center", marginTop: 16 },
  secondaryBtnText: { color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: "700" },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(239,68,68,0.07)", borderWidth: 1, borderColor: "rgba(239,68,68,0.18)", borderRadius: R, paddingVertical: 12, marginTop: 8, marginBottom: 20 },
  deleteBtnText: { color: "#EF4444", fontSize: 13, fontWeight: "700" },

  // Modal / field editor
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  modalCard: { width: "100%", backgroundColor: "#13172A", borderRadius: R, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", padding: 20 },
  modalTitle: { color: "#FFF", fontSize: 15, fontWeight: "800", marginBottom: 12 },
  cancelBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: R, paddingVertical: 11, alignItems: "center" },
  cancelBtnText: { color: "rgba(255,255,255,0.58)", fontSize: 13, fontWeight: "700" },
  saveBtn: { flex: 1, backgroundColor: "#5B5EFF", borderRadius: R, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#FFF", fontSize: 13, fontWeight: "800" },

  // Sheet
  sheet: { backgroundColor: "#13172A", borderTopLeftRadius: R, borderTopRightRadius: R, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.12)", padding: 20, paddingBottom: 36 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 16 },
  sheetTitle: { color: "#FFF", fontSize: 15, fontWeight: "800", marginBottom: 2 },
  sheetSub: { color: "rgba(255,255,255,0.38)", fontSize: 12, marginBottom: 16 },
  sheetOption: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" },
  sheetOptionIcon: { width: 40, height: 40, borderRadius: R, alignItems: "center", justifyContent: "center" },
  sheetOptionLabel: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  sheetOptionSub: { color: "rgba(255,255,255,0.38)", fontSize: 11, marginTop: 1 },

  // Undo banner
  undoBanner: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#1E1B4B", borderWidth: 1, borderColor: "rgba(91,94,255,0.28)", borderRadius: R, padding: 12, paddingHorizontal: 14 },
  undoBannerText: { color: "#FFF", fontSize: 12, flex: 1, marginRight: 10 },
  undoBtn2: { backgroundColor: "#5B5EFF", borderRadius: R, paddingHorizontal: 12, paddingVertical: 6 },
  undoBtnText: { color: "#FFF", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  undoDismiss: { width: 22, height: 22, borderRadius: R, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },

  // Transfer overlay
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  overlayCard: { width: "100%", backgroundColor: "#13172A", borderRadius: R, borderWidth: 1, borderColor: "rgba(91,94,255,0.28)", padding: 24, alignItems: "center" },
  overlayTitle: { color: "#FFF", fontSize: 16, fontWeight: "800", marginBottom: 4 },
  overlaySub: { color: "rgba(255,255,255,0.5)", fontSize: 12, textAlign: "center", marginBottom: 16 },
  progressBar: { width: "100%", height: 6, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  progressFill: { height: "100%", backgroundColor: "#5B5EFF", borderRadius: 3 },
  progressPct: { color: "rgba(255,255,255,0.38)", fontSize: 11, fontWeight: "700", marginBottom: 16 },
  cancelTransferBtn: { backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", borderRadius: R, paddingHorizontal: 20, paddingVertical: 8 },
  cancelTransferText: { color: "#F87171", fontSize: 12, fontWeight: "700" },

  // Agenda picker
  agendaRow: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: R, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginBottom: 6 },
  agendaRowActive: { backgroundColor: "rgba(91,94,255,0.1)", borderColor: "rgba(91,94,255,0.3)" },
  agendaRowName: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  agendaRowMeta: { color: "rgba(255,255,255,0.38)", fontSize: 11, marginTop: 1 },
  agendaAction: { width: 28, height: 28, borderRadius: R, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
});
