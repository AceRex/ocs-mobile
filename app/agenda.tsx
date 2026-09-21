import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CaretLeft,
  Plus,
  Trash,
  Play,
  Check,
  X,
  Clock,
  Image as ImageIcon,
  FilmSlate,
  SpeakerHigh,
  PaperPlaneRight,
  ArrowsClockwise,
  Copy,
  ArrowCounterClockwise,
  ArrowClockwise,
  WarningCircle,
  PencilSimple,
  DotsThreeVertical,
} from "phosphor-react-native";
import * as DocumentPicker from "expo-document-picker";
import { useAgendaStore, AgendaSession, TimelineItem, AgendaDocument } from "../store/agendaStore";
import { useSocketStore } from "../store/socketStore";

function formatSecToHMS(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export default function MobileAgendaScreen() {
  const router = useRouter();
  const {
    agendas,
    activeAgendaId,
    transfer,
    init,
    createAgenda,
    duplicateAgenda,
    deleteAgenda,
    setActiveAgendaId,
    updateAgenda,
    addSession,
    updateSession,
    deleteSession,
    reorderSessions,
    addTimelineItem,
    updateTimelineItem,
    deleteTimelineItem,
    duplicateTimelineItem,
    importMediaAsset,
    undo,
    redo,
    sendToDesktop,
    cancelTransfer,
  } = useAgendaStore();

  const { isConnected, isPaired } = useSocketStore();

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [editingCue, setEditingCue] = useState<TimelineItem | null>(null);
  const [timelineZoom, setTimelineZoom] = useState<number>(1);
  const [isAgendaPickerOpen, setIsAgendaPickerOpen] = useState<boolean>(false);
  const [newAgendaName, setNewAgendaName] = useState("");
  const [isAddingAgenda, setIsAddingAgenda] = useState(false);

  // Mobile Context Menu, Rename, & Delete-with-Undo
  const [cueActionMenu, setCueActionMenu] = useState<{ cue: TimelineItem; sessionId: string } | null>(null);
  const [renamingCue, setRenamingCue] = useState<{ cueId: string; name: string; sessionId: string } | null>(null);
  const [deletedCueUndo, setDeletedCueUndo] = useState<{ cue: TimelineItem; sessionId: string; timeoutId?: any } | null>(null);

  const handleDeleteCueWithUndo = (cue: TimelineItem, sessionId: string) => {
    if (!currentAgenda) return;
    deleteTimelineItem(currentAgenda.id, sessionId, cue.id);
    if (deletedCueUndo?.timeoutId) clearTimeout(deletedCueUndo.timeoutId);
    const timeoutId = setTimeout(() => {
      setDeletedCueUndo(null);
    }, 6000);
    setDeletedCueUndo({ cue, sessionId, timeoutId });
  };

  const handleUndoDeleteCue = () => {
    if (!deletedCueUndo || !currentAgenda) return;
    if (deletedCueUndo.timeoutId) clearTimeout(deletedCueUndo.timeoutId);
    addTimelineItem(currentAgenda.id, deletedCueUndo.sessionId, deletedCueUndo.cue);
    setDeletedCueUndo(null);
  };

  useEffect(() => {
    init();
  }, []);

  const currentAgenda = useMemo(() => {
    return agendas.find((a) => a.id === activeAgendaId) || agendas[0] || null;
  }, [agendas, activeAgendaId]);

  useEffect(() => {
    if (currentAgenda && !selectedSessionId && currentAgenda.sessions.length > 0) {
      setSelectedSessionId(currentAgenda.sessions[0].id);
    }
  }, [currentAgenda, selectedSessionId]);

  const currentSession = useMemo(() => {
    if (!currentAgenda) return null;
    return (
      currentAgenda.sessions.find((s) => s.id === selectedSessionId) ||
      currentAgenda.sessions[0] ||
      null
    );
  }, [currentAgenda, selectedSessionId]);

  // Total runtime calculations
  const totalStats = useMemo(() => {
    if (!currentAgenda) return { totalSec: 0, mediaCount: 0, conflicts: 0 };
    let totalSec = 0;
    let mediaCount = 0;
    let conflicts = 0;

    currentAgenda.sessions.forEach((s) => {
      totalSec += (s.durationSec || 0) + (s.intervalSec || 0);
      mediaCount += (s.timelineItems || []).length;

      // check conflicts
      const videoItems = (s.timelineItems || [])
        .filter((i) => i.track === "video")
        .sort((a, b) => a.startSec - b.startSec);
      for (let i = 0; i < videoItems.length - 1; i++) {
        if (videoItems[i].startSec + videoItems[i].durationSec > videoItems[i + 1].startSec) {
          conflicts++;
        }
      }
    });

    return { totalSec, mediaCount, conflicts };
  }, [currentAgenda]);

  const handlePickMedia = async (track: "visual" | "background" | "video" | "audio", mediaTypeHint?: "image" | "video") => {
    try {
      const isAudio = track === "audio";
      const isVideo = !isAudio && (mediaTypeHint === "video" || track === "video");
      const typeStr = isAudio ? "audio/*" : isVideo ? "video/*" : "image/*";

      const res = await DocumentPicker.getDocumentAsync({
        type: [typeStr],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const file = res.assets[0];

      const asset = await importMediaAsset(
        file.uri,
        file.name,
        file.mimeType || "application/octet-stream",
        isAudio ? "audio" : isVideo ? "video" : "image",
        file.size
      );

      if (asset && currentAgenda && currentSession) {
        addTimelineItem(currentAgenda.id, currentSession.id, {
          track: isAudio ? "audio" : "visual",
          mediaType: isAudio ? "audio" : isVideo ? "video" : "image",
          presentationMode: isVideo ? "foreground" : "background",
          actionType: "range",
          startSec: 0,
          durationSec: isAudio ? 180 : 60,
          assetId: asset.id,
          name: asset.originalName,
          destination: "all",
          endBehavior: "hold",
        });
      }
    } catch (err: any) {
      Alert.alert("Media Error", err.message);
    }
  };

  const handleSendToDesktop = async () => {
    if (!currentAgenda) return;
    if (!isConnected || !isPaired) {
      Alert.alert(
        "Pairing Required",
        "Please connect and pair with the desktop controller on the LAN first."
      );
      return;
    }

    const res = await sendToDesktop(currentAgenda.id);
    if (res.ok) {
      Alert.alert(
        "Transfer Complete",
        `"${currentAgenda.name}" was received and validated on the desktop controller.`
      );
    } else {
      Alert.alert("Transfer Failed", res.error || "Could not transfer agenda.");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#0A0713]">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Header Navigation */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-white/10 bg-[#120D22]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-2 bg-white/5 rounded-[12px] border border-white/10"
        >
          <CaretLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setIsAgendaPickerOpen(true)}
          className="flex-row items-center gap-2 px-3 py-1.5 bg-white/5 rounded-[12px] border border-white/10"
        >
          <Clock size={16} color="#A78BFA" />
          <Text className="text-white font-bold text-sm max-w-[160px]" numberOfLines={1}>
            {currentAgenda ? currentAgenda.name : "Select Agenda"}
          </Text>
          <PencilSimple size={12} color="#A78BFA" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSendToDesktop}
          className="flex-row items-center gap-1.5 px-3 py-2 bg-[#7C3AED] rounded-[12px] shadow-md shadow-[#7C3AED]/30"
        >
          <PaperPlaneRight size={14} color="#FFFFFF" weight="bold" />
          <Text className="text-white font-bold text-xs uppercase tracking-wider">
            Send
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4 py-3" showsVerticalScrollIndicator={false}>
        {/* Runtime & Summary Card */}
        <View className="bg-[#17112B] p-4 rounded-[12px] border border-white/10 mb-4 shadow-lg">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-white/60 text-xs font-semibold uppercase tracking-wider">
              Total Planned Service Runtime
            </Text>
            {totalStats.conflicts > 0 && (
              <View className="flex-row items-center gap-1 px-2 py-0.5 bg-amber-500/20 rounded-[12px] border border-amber-500/40">
                <WarningCircle size={12} color="#F59E0B" weight="fill" />
                <Text className="text-amber-300 text-[10px] font-bold">
                  {totalStats.conflicts} Overlaps
                </Text>
              </View>
            )}
          </View>
          <Text className="text-3xl font-black text-white tracking-tight">
            {formatSecToHMS(totalStats.totalSec)}
          </Text>
          <View className="flex-row items-center gap-4 mt-2 pt-2 border-t border-white/5">
            <Text className="text-white/50 text-xs">
              {currentAgenda?.sessions.length || 0} Sessions
            </Text>
            <Text className="text-white/30">•</Text>
            <Text className="text-white/50 text-xs">
              {totalStats.mediaCount} Scheduled Cues
            </Text>
            <Text className="text-white/30">•</Text>
            <View className="flex-row gap-2 ml-auto">
              <TouchableOpacity
                onPress={() => currentAgenda && undo(currentAgenda.id)}
                className="p-1.5 bg-white/5 rounded-[12px]"
              >
                <ArrowCounterClockwise size={14} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => currentAgenda && redo(currentAgenda.id)}
                className="p-1.5 bg-white/5 rounded-[12px]"
              >
                <ArrowClockwise size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Sessions Tab Scroll */}
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-white font-bold text-sm uppercase tracking-wider">
            Sessions
          </Text>
          <TouchableOpacity
            onPress={() => currentAgenda && addSession(currentAgenda.id, "New Session", 300)}
            className="flex-row items-center gap-1 px-2.5 py-1 bg-white/5 rounded-[12px] border border-white/10"
          >
            <Plus size={12} color="#A78BFA" weight="bold" />
            <Text className="text-white text-xs font-semibold">Add Session</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-row gap-2 mb-4"
        >
          {(currentAgenda?.sessions || []).map((s, idx) => {
            const isSelected = s.id === currentSession?.id;
            return (
              <TouchableOpacity
                key={s.id}
                onPress={() => setSelectedSessionId(s.id)}
                className={`px-3 py-2 rounded-[12px] border min-w-[120px] ${
                  isSelected
                    ? "bg-[#7C3AED]/20 border-[#7C3AED]"
                    : "bg-[#17112B] border-white/10"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isSelected ? "text-white" : "text-white/60"
                  }`}
                  numberOfLines={1}
                >
                  {idx + 1}. {s.name}
                </Text>
                <Text className="text-[10px] text-white/40 mt-1">
                  {formatSecToHMS(s.durationSec)}
                  {s.intervalSec > 0 ? ` (+${s.intervalSec}s)` : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Active Session Editor Card */}
        {currentSession && (
          <View className="bg-[#17112B] p-4 rounded-[12px] border border-white/10 mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <TextInput
                value={currentSession.name}
                onChangeText={(val) =>
                  currentAgenda && updateSession(currentAgenda.id, currentSession.id, { name: val })
                }
                placeholder="Session Name"
                placeholderTextColor="rgba(255,255,255,0.3)"
                className="text-white font-bold text-base flex-1 mr-2 p-0"
              />
              <TouchableOpacity
                onPress={() => {
                  Alert.alert("Delete Session", `Delete "${currentSession.name}"?`, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () =>
                        currentAgenda && deleteSession(currentAgenda.id, currentSession.id),
                    },
                  ]);
                }}
                className="p-1.5 bg-red-500/10 rounded-[12px]"
              >
                <Trash size={14} color="#EF4444" />
              </TouchableOpacity>
            </View>

            {/* Session Settings Row */}
            <View className="flex-row items-center gap-2 mb-3">
              <View className="flex-1 bg-white/5 p-2 rounded-[12px] border border-white/5">
                <Text className="text-white/40 text-[10px] uppercase font-bold mb-1">
                  Duration (Sec)
                </Text>
                <TextInput
                  keyboardType="numeric"
                  value={String(currentSession.durationSec)}
                  onChangeText={(val) =>
                    currentAgenda &&
                    updateSession(currentAgenda.id, currentSession.id, {
                      durationSec: Math.max(1, parseInt(val, 10) || 1),
                    })
                  }
                  className="text-white font-bold text-sm p-0"
                />
              </View>

              <View className="flex-1 bg-white/5 p-2 rounded-[12px] border border-white/5">
                <Text className="text-white/40 text-[10px] uppercase font-bold mb-1">
                  Interval (Sec)
                </Text>
                <TextInput
                  keyboardType="numeric"
                  value={String(currentSession.intervalSec || 0)}
                  onChangeText={(val) =>
                    currentAgenda &&
                    updateSession(currentAgenda.id, currentSession.id, {
                      intervalSec: Math.max(0, parseInt(val, 10) || 0),
                    })
                  }
                  className="text-white font-bold text-sm p-0"
                />
              </View>

              <TouchableOpacity
                onPress={() =>
                  currentAgenda &&
                  updateSession(currentAgenda.id, currentSession.id, {
                    transitionMode:
                      currentSession.transitionMode === "auto" ? "manual" : "auto",
                  })
                }
                className={`px-3 py-2 rounded-[12px] border self-stretch justify-center ${
                  currentSession.transitionMode === "auto"
                    ? "bg-emerald-500/20 border-emerald-500/50"
                    : "bg-white/5 border-white/10"
                }`}
              >
                <Text className="text-white/40 text-[9px] uppercase font-bold">
                  Advance
                </Text>
                <Text className="text-white text-xs font-bold capitalize">
                  {currentSession.transitionMode}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Record Session Toggle */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() =>
                currentAgenda &&
                updateSession(currentAgenda.id, currentSession.id, {
                  recordSession: !currentSession.recordSession,
                })
              }
              className="flex-row items-center gap-2 p-2.5 bg-black/20 rounded-[12px] border border-white/5"
            >
              <View
                className={`w-4 h-4 rounded-[4px] border items-center justify-center ${
                  currentSession.recordSession ? "bg-red-600 border-red-500" : "border-white/30"
                }`}
              >
                {currentSession.recordSession && <Check size={10} color="#FFFFFF" weight="bold" />}
              </View>
              <Text
                className={`text-xs font-semibold ${
                  currentSession.recordSession ? "text-red-300" : "text-white/60"
                }`}
              >
                Record this session (Playout capture)
              </Text>
            </TouchableOpacity>

            {/* Session Notes */}
            <TextInput
              value={currentSession.notes || ""}
              onChangeText={(val) =>
                currentAgenda && updateSession(currentAgenda.id, currentSession.id, { notes: val })
              }
              placeholder="Session notes, scripture passages, or speaker remarks..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              multiline
              className="text-white/70 text-xs bg-black/20 p-2.5 rounded-[12px] border border-white/5 min-h-[44px]"
            />
          </View>
        )}

        {/* Timeline Header & Tracks */}
        {currentSession && (
          <View className="bg-[#17112B] p-4 rounded-[12px] border border-white/10 mb-8">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-white font-bold text-sm uppercase tracking-wider">
                Session Media Timeline
              </Text>
              <View className="flex-row items-center gap-1.5">
                {[1, 2, 5].map((z) => (
                  <TouchableOpacity
                    key={z}
                    onPress={() => setTimelineZoom(z)}
                    className={`px-2 py-0.5 rounded-[12px] ${
                      timelineZoom === z ? "bg-[#7C3AED]" : "bg-white/5"
                    }`}
                  >
                    <Text className="text-white text-[10px] font-bold">{z}x</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Action Cues List by Track with Interactive Range & Edge Handles */}
            {(() => {
              const renderCueItem = (cue: TimelineItem, trackType: "background" | "video" | "audio") => {
                const sessionDur = currentSession?.durationSec || 300;
                const cueDur = cue.durationSec || (trackType === "background" ? 300 : 60);
                const cueEnd = cue.startSec + cueDur;

                const handleNudgeStart = (deltaSec: number) => {
                  if (!currentAgenda || !currentSession) return;
                  const newStart = Math.max(0, Math.min(cueEnd - 1, cue.startSec + deltaSec));
                  const newDur = Math.max(1, cueEnd - newStart);
                  updateTimelineItem(currentAgenda.id, currentSession.id, cue.id, {
                    startSec: newStart,
                    durationSec: newDur,
                  });
                };

                const handleNudgeEnd = (deltaSec: number) => {
                  if (!currentAgenda || !currentSession) return;
                  const newEnd = Math.max(cue.startSec + 1, Math.min(sessionDur, cueEnd + deltaSec));
                  const newDur = newEnd - cue.startSec;
                  updateTimelineItem(currentAgenda.id, currentSession.id, cue.id, {
                    durationSec: newDur,
                  });
                };

                const handleMoveRange = (deltaSec: number) => {
                  if (!currentAgenda || !currentSession) return;
                  const dur = cueDur;
                  const newStart = Math.max(0, Math.min(sessionDur - dur, cue.startSec + deltaSec));
                  updateTimelineItem(currentAgenda.id, currentSession.id, cue.id, {
                    startSec: newStart,
                  });
                };

                const isAudio = cue.track === "audio" || trackType === "audio";
                const isVideo = !isAudio && (cue.mediaType === "video" || cue.track === "video" || (cue.name && /\.(mp4|mov|webm|mkv|avi)$/i.test(cue.name)));
                const bgBorder = isAudio
                  ? "bg-[#3D2D14] border-amber-400/30"
                  : isVideo
                  ? "bg-[#162744] border-blue-400/30"
                  : "bg-[#241A3E] border-purple-400/30";

                return (
                  <View key={cue.id} className={`${bgBorder} p-2.5 rounded-[12px] border mb-2`}>
                    {/* Top row: Name, Time, Menu button */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setEditingCue(cue)}
                      onLongPress={() =>
                        currentSession && setCueActionMenu({ cue, sessionId: currentSession.id })
                      }
                      className="flex-row items-center justify-between mb-2"
                    >
                      <View className="flex-1 mr-2">
                        <Text className="text-white text-xs font-bold" numberOfLines={1}>
                          {cue.name}
                        </Text>
                        <Text className="text-white/50 text-[10px] font-mono mt-0.5">
                          {formatSecToHMS(cue.startSec)} → {formatSecToHMS(cueEnd)} ({cueDur}s)
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() =>
                          currentSession && setCueActionMenu({ cue, sessionId: currentSession.id })
                        }
                        className="p-1.5 bg-white/10 rounded-[12px]"
                      >
                        <DotsThreeVertical size={14} color="#FFFFFF" weight="bold" />
                      </TouchableOpacity>
                    </TouchableOpacity>

                    {/* Interactive Timeline Range & Edge Handles */}
                    <View className="bg-black/30 p-1 rounded-[12px] flex-row items-center justify-between border border-white/5">
                      {/* Left Edge Handle (Start Boundary) */}
                      <View className="flex-row items-center gap-1">
                        <TouchableOpacity
                          onPress={() => handleNudgeStart(-5)}
                          className="px-1.5 py-1 bg-white/10 rounded-[12px]"
                        >
                          <Text className="text-white/70 text-[9px] font-bold">◀-5s</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleNudgeStart(5)}
                          className="px-1.5 py-1 bg-white/10 rounded-[12px]"
                        >
                          <Text className="text-white/70 text-[9px] font-bold">+5s▶</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Move Body (Shift Range) */}
                      <View className="flex-row items-center gap-1">
                        <TouchableOpacity
                          onPress={() => handleMoveRange(-5)}
                          className="px-2 py-1 bg-purple-500/20 rounded-[12px] border border-purple-500/30"
                        >
                          <Text className="text-purple-300 text-[9px] font-bold">◄ Move</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleMoveRange(5)}
                          className="px-2 py-1 bg-purple-500/20 rounded-[12px] border border-purple-500/30"
                        >
                          <Text className="text-purple-300 text-[9px] font-bold">Move ►</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Right Edge Handle (End Boundary) */}
                      <View className="flex-row items-center gap-1">
                        <TouchableOpacity
                          onPress={() => handleNudgeEnd(-5)}
                          className="px-1.5 py-1 bg-white/10 rounded-[12px]"
                        >
                          <Text className="text-white/70 text-[9px] font-bold">◀-5s</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleNudgeEnd(5)}
                          className="px-1.5 py-1 bg-white/10 rounded-[12px]"
                        >
                          <Text className="text-white/70 text-[9px] font-bold">+5s▶</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              };

              return (
                <View className="space-y-3">
                  {/* Visual Track (Images & Videos) */}
                  <View className="bg-white/5 p-3 rounded-[12px] border border-purple-500/20">
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center gap-1.5">
                        <ImageIcon size={14} color="#C084FC" />
                        <FilmSlate size={14} color="#60A5FA" />
                        <Text className="text-purple-300 font-bold text-xs uppercase">
                          Visual Track (Images & Videos)
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        <TouchableOpacity
                          onPress={() => handlePickMedia("visual", "image")}
                          className="px-2 py-0.5 bg-purple-500/20 rounded-[12px] border border-purple-500/40"
                        >
                          <Text className="text-purple-200 text-[10px] font-bold">+ Image</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handlePickMedia("visual", "video")}
                          className="px-2 py-0.5 bg-blue-500/20 rounded-[12px] border border-blue-500/40"
                        >
                          <Text className="text-blue-200 text-[10px] font-bold">+ Video</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {(currentSession.timelineItems || [])
                      .filter((i) => i.track === "visual" || i.track === "background" || i.track === "video" || i.track === "image")
                      .map((cue) => renderCueItem(cue, "visual"))}
                  </View>

                  {/* Audio Track */}
                  <View className="bg-white/5 p-3 rounded-[12px] border border-amber-500/20">
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center gap-1.5">
                        <SpeakerHigh size={14} color="#FBBF24" />
                        <Text className="text-amber-300 font-bold text-xs uppercase">
                          Audio Track
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handlePickMedia("audio")}
                        className="px-2 py-0.5 bg-amber-500/20 rounded-[12px] border border-amber-500/40"
                      >
                        <Text className="text-amber-200 text-[10px] font-bold">+ Audio</Text>
                      </TouchableOpacity>
                    </View>
                    {(currentSession.timelineItems || [])
                      .filter((i) => i.track === "audio")
                      .map((cue) => renderCueItem(cue, "audio"))}
                  </View>
                </View>
              );
            })()}
          </View>
        )}
      </ScrollView>

      {/* Cue Inspector Modal Drawer */}
      <Modal visible={!!editingCue} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/70">
          <View className="bg-[#1A132E] p-5 rounded-t-[12px] border-t border-white/20">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white font-bold text-base">Edit Timeline Cue</Text>
              <TouchableOpacity
                onPress={() => setEditingCue(null)}
                className="p-1.5 bg-white/10 rounded-[12px]"
              >
                <X size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {editingCue && currentAgenda && currentSession && (
              <View className="space-y-3">
                <View>
                  <Text className="text-white/40 text-[10px] uppercase font-bold mb-1">
                    Cue Title
                  </Text>
                  <TextInput
                    value={editingCue.name}
                    onChangeText={(val) => {
                      setEditingCue({ ...editingCue, name: val });
                      updateTimelineItem(currentAgenda.id, currentSession.id, editingCue.id, {
                        name: val,
                      });
                    }}
                    className="text-white font-semibold text-sm bg-white/5 p-2 rounded-[12px] border border-white/10"
                  />
                </View>

                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="text-white/40 text-[10px] uppercase font-bold mb-1">
                      Start Time (Sec)
                    </Text>
                    <TextInput
                      keyboardType="numeric"
                      value={String(editingCue.startSec)}
                      onChangeText={(val) => {
                        const currentEnd = editingCue.startSec + (editingCue.durationSec || 60);
                        const s = Math.max(0, Math.min(currentEnd - 1, parseInt(val, 10) || 0));
                        const d = Math.max(1, currentEnd - s);
                        setEditingCue({ ...editingCue, startSec: s, durationSec: d });
                        updateTimelineItem(
                          currentAgenda.id,
                          currentSession.id,
                          editingCue.id,
                          { startSec: s, durationSec: d }
                        );
                      }}
                      className="text-white font-semibold text-sm bg-white/5 p-2 rounded-[12px] border border-white/10"
                    />
                  </View>

                  <View className="flex-1">
                    <Text className="text-white/40 text-[10px] uppercase font-bold mb-1">
                      End Time (Sec)
                    </Text>
                    <TextInput
                      keyboardType="numeric"
                      value={String(editingCue.startSec + (editingCue.durationSec || 60))}
                      onChangeText={(val) => {
                        const targetEnd = parseInt(val, 10) || (editingCue.startSec + 1);
                        const maxSessSec = currentSession.durationSec || 3600;
                        const clampedEnd = Math.max(editingCue.startSec + 1, Math.min(maxSessSec, targetEnd));
                        const d = clampedEnd - editingCue.startSec;
                        setEditingCue({ ...editingCue, durationSec: d });
                        updateTimelineItem(
                          currentAgenda.id,
                          currentSession.id,
                          editingCue.id,
                          { durationSec: d }
                        );
                      }}
                      className="text-white font-semibold text-sm bg-white/5 p-2 rounded-[12px] border border-white/10"
                    />
                  </View>
                </View>

                <View className="flex-row justify-between items-center px-1">
                  <Text className="text-white/40 text-[10px] uppercase font-bold">
                    Derived Duration
                  </Text>
                  <Text className="text-[#A788FA] text-xs font-mono font-bold">
                    {formatSecToHMS(editingCue.durationSec || 60)} ({editingCue.durationSec || 60}s)
                  </Text>
                </View>

                {/* Destination Selector */}
                <View>
                  <Text className="text-white/40 text-[10px] uppercase font-bold mb-1">
                    Output Destination
                  </Text>
                  <View className="flex-row gap-2">
                    {(["all", "general", "speaker"] as const).map((dest) => (
                      <TouchableOpacity
                        key={dest}
                        onPress={() => {
                          setEditingCue({ ...editingCue, destination: dest });
                          updateTimelineItem(
                            currentAgenda.id,
                            currentSession.id,
                            editingCue.id,
                            { destination: dest }
                          );
                        }}
                        className={`flex-1 py-2 rounded-[12px] border items-center ${
                          (editingCue.destination || "all") === dest
                            ? "bg-[#7C3AED] border-[#7C3AED]"
                            : "bg-white/5 border-white/10"
                        }`}
                      >
                        <Text className="text-white text-xs font-bold capitalize">
                          {dest === "all" ? "All Screens" : dest}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* End Behavior */}
                <View>
                  <Text className="text-white/40 text-[10px] uppercase font-bold mb-1">
                    When Media Ends
                  </Text>
                  <View className="flex-row gap-2">
                    {(["hold", "restore", "continue"] as const).map((beh) => (
                      <TouchableOpacity
                        key={beh}
                        onPress={() => {
                          setEditingCue({ ...editingCue, endBehavior: beh });
                          updateTimelineItem(
                            currentAgenda.id,
                            currentSession.id,
                            editingCue.id,
                            { endBehavior: beh }
                          );
                        }}
                        className={`flex-1 py-2 rounded-[12px] border items-center ${
                          (editingCue.endBehavior || "hold") === beh
                            ? "bg-purple-600 border-purple-600"
                            : "bg-white/5 border-white/10"
                        }`}
                      >
                        <Text className="text-white text-xs font-bold capitalize">
                          {beh}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setEditingCue(null)}
                  className="w-full py-2.5 bg-[#7C3AED] rounded-[12px] items-center mt-2"
                >
                  <Text className="text-white font-bold text-xs uppercase tracking-wider">Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Mobile Cue Action Modal Sheet ─────────────────────────────────── */}
      <Modal visible={!!cueActionMenu} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setCueActionMenu(null)}
          className="flex-1 justify-end bg-black/70"
        >
          <View
            className="bg-[#1A132E] p-5 rounded-t-[12px] border-t border-white/20"
            onStartShouldSetResponder={() => true}
          >
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-1 mr-2">
                <Text className="text-white font-bold text-base" numberOfLines={1}>
                  {cueActionMenu?.cue.name || "Cue Actions"}
                </Text>
                <Text className="text-white/40 text-xs">
                  At {formatSecToHMS(cueActionMenu?.cue.startSec || 0)} • {cueActionMenu?.cue.track}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCueActionMenu(null)}
                className="p-1.5 bg-white/10 rounded-[12px]"
              >
                <X size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View className="space-y-2">
              <TouchableOpacity
                onPress={() => {
                  if (!cueActionMenu) return;
                  const target = cueActionMenu.cue;
                  setCueActionMenu(null);
                  setEditingCue(target);
                }}
                className="flex-row items-center gap-3 p-3 bg-white/5 rounded-[12px] border border-white/10"
              >
                <PencilSimple size={18} color="#A78BFA" />
                <View>
                  <Text className="text-white font-bold text-sm">Edit Cue</Text>
                  <Text className="text-white/40 text-[10px]">Open full scheduling & destination inspector</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (!cueActionMenu) return;
                  const target = cueActionMenu;
                  setCueActionMenu(null);
                  setRenamingCue({
                    cueId: target.cue.id,
                    name: target.cue.name,
                    sessionId: target.sessionId,
                  });
                }}
                className="flex-row items-center gap-3 p-3 bg-white/5 rounded-[12px] border border-white/10"
              >
                <PencilSimple size={18} color="#60A5FA" />
                <View>
                  <Text className="text-white font-bold text-sm">Rename Cue</Text>
                  <Text className="text-white/40 text-[10px]">Change display name without modifying media</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (!cueActionMenu) return;
                  const { cue, sessionId } = cueActionMenu;
                  setCueActionMenu(null);
                  handleDeleteCueWithUndo(cue, sessionId);
                }}
                className="flex-row items-center gap-3 p-3 bg-red-500/10 rounded-[12px] border border-red-500/20"
              >
                <Trash size={18} color="#EF4444" />
                <View>
                  <Text className="text-red-400 font-bold text-sm">Delete Cue</Text>
                  <Text className="text-red-400/60 text-[10px]">Remove cue from schedule with undo</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Cue Rename Modal ──────────────────────────────────────────────── */}
      <Modal visible={!!renamingCue} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/80 px-6">
          <View className="w-full bg-[#17112B] p-5 rounded-[12px] border border-white/20">
            <Text className="text-white font-bold text-base mb-1">Rename Cue</Text>
            <Text className="text-white/50 text-xs mb-3">
              Update cue display name for this agenda.
            </Text>
            <TextInput
              value={renamingCue?.name || ""}
              onChangeText={(val) => renamingCue && setRenamingCue({ ...renamingCue, name: val })}
              placeholder="Cue Name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              className="bg-white/5 px-3 py-2.5 rounded-[12px] border border-white/10 text-white font-bold text-sm mb-4"
              autoFocus
            />
            <View className="flex-row justify-end gap-2">
              <TouchableOpacity
                onPress={() => setRenamingCue(null)}
                className="px-4 py-2 bg-white/5 rounded-[12px]"
              >
                <Text className="text-white font-bold text-xs">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (renamingCue && renamingCue.name.trim() && currentAgenda) {
                    updateTimelineItem(currentAgenda.id, renamingCue.sessionId, renamingCue.cueId, {
                      name: renamingCue.name.trim(),
                    });
                  }
                  setRenamingCue(null);
                }}
                className="px-4 py-2 bg-[#7C3AED] rounded-[12px]"
              >
                <Text className="text-white font-bold text-xs">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Mobile Deleted Cue Undo Banner ─────────────────────────────────── */}
      {deletedCueUndo && (
        <View className="absolute bottom-6 left-4 right-4 z-50 flex-row items-center justify-between bg-[#1E1538] p-3.5 rounded-[12px] border border-white/20 shadow-2xl">
          <Text className="text-white text-xs flex-1 mr-2" numberOfLines={1}>
            Cue <Text className="font-bold">&ldquo;{deletedCueUndo.cue.name}&rdquo;</Text> deleted
          </Text>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={handleUndoDeleteCue}
              className="px-3 py-1.5 bg-[#7C3AED] rounded-[12px]"
            >
              <Text className="text-white text-xs font-bold uppercase tracking-wider">Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (deletedCueUndo.timeoutId) clearTimeout(deletedCueUndo.timeoutId);
                setDeletedCueUndo(null);
              }}
              className="p-1.5 bg-white/5 rounded-[12px]"
            >
              <X size={12} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Transfer Progress Overlay */}
      <Modal visible={transfer.transferring} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/80 px-6">
          <View className="w-full bg-[#1A132E] p-6 rounded-[12px] border border-purple-500/40 items-center">
            <ActivityIndicator size="large" color="#A78BFA" className="mb-4" />
            <Text className="text-white font-bold text-base mb-1">
              Sending to Desktop Controller
            </Text>
            <Text className="text-white/60 text-xs text-center mb-4">
              {transfer.status}
            </Text>

            <View className="w-full bg-white/10 h-2 rounded-[12px] overflow-hidden mb-3">
              <View
                className="bg-[#7C3AED] h-full"
                style={{ width: `${transfer.progress}%` }}
              />
            </View>
            <Text className="text-white/40 text-xs font-bold mb-4">
              {transfer.progress}%
            </Text>

            <TouchableOpacity
              onPress={cancelTransfer}
              className="px-4 py-2 bg-red-500/20 rounded-[12px] border border-red-500/40"
            >
              <Text className="text-red-300 font-bold text-xs">Cancel Transfer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Agenda Switcher / Picker Modal */}
      <Modal visible={isAgendaPickerOpen} transparent animationType="fade">
        <View className="flex-1 justify-center items-center bg-black/80 px-6">
          <View className="w-full bg-[#17112B] p-5 rounded-[12px] border border-white/20 max-h-[80%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white font-bold text-base">Select Agenda</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsAgendaPickerOpen(false);
                  setIsAddingAgenda(false);
                }}
                className="p-1.5 bg-white/5 rounded-[12px]"
              >
                <X size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView className="max-h-[280px] mb-4">
              {agendas.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => {
                    setActiveAgendaId(a.id);
                    setIsAgendaPickerOpen(false);
                  }}
                  className={`p-3 rounded-[12px] border mb-2 flex-row items-center justify-between ${
                    a.id === currentAgenda?.id
                      ? "bg-[#7C3AED]/20 border-[#7C3AED]"
                      : "bg-white/5 border-white/5"
                  }`}
                >
                  <View className="flex-1 mr-2">
                    <Text className="text-white font-bold text-sm" numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Text className="text-white/40 text-xs mt-0.5">
                      {a.sessions.length} sessions
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity
                      onPress={() => duplicateAgenda(a.id)}
                      className="p-1.5 bg-white/5 rounded-[12px]"
                    >
                      <Copy size={12} color="#FFFFFF" />
                    </TouchableOpacity>
                    {agendas.length > 1 && (
                      <TouchableOpacity
                        onPress={() => deleteAgenda(a.id)}
                        className="p-1.5 bg-red-500/10 rounded-[12px]"
                      >
                        <Trash size={12} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {isAddingAgenda ? (
              <View className="flex-row gap-2">
                <TextInput
                  value={newAgendaName}
                  onChangeText={setNewAgendaName}
                  placeholder="Agenda Name"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  className="flex-1 bg-white/5 px-3 py-2 rounded-[12px] border border-white/10 text-white font-bold text-sm"
                />
                <TouchableOpacity
                  onPress={async () => {
                    if (newAgendaName.trim()) {
                      await createAgenda(newAgendaName.trim());
                      setNewAgendaName("");
                      setIsAddingAgenda(false);
                      setIsAgendaPickerOpen(false);
                    }
                  }}
                  className="px-4 py-2 bg-[#7C3AED] rounded-[12px] justify-center"
                >
                  <Text className="text-white font-bold text-xs">Create</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setIsAddingAgenda(true)}
                className="w-full py-2.5 bg-white/5 rounded-[12px] border border-white/10 items-center"
              >
                <Text className="text-white font-bold text-xs">+ Create New Agenda</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
