import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  MusicNotes,
  Article,
  BookBookmark,
  Plus,
  Trash,
  PaperPlaneTilt,
  CheckCircle,
  Microphone,
  CaretUp,
  CaretDown,
  Sparkle,
  Eye,
  TextT,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
} from "phosphor-react-native";
import { useSocketStore } from "../store/socketStore";

interface ScenePage {
  label: string;
  content: string;
  translation?: string;
  sectionType?: "verse" | "chorus" | "bridge" | "tag" | "ending" | "text";
}

export default function ScenesScreen() {
  const router = useRouter();
  const { isConnected, isPaired, sendScene } = useSocketStore();

  const [name, setName] = useState("");
  const [sceneType, setSceneType] = useState<"song" | "text" | "scripture">("song");
  const [navMode, setNavMode] = useState<"read_along" | "manual">("read_along");
  const [fontSize, setFontSize] = useState<number>(36);
  const [textAlign, setTextAlign] = useState<"center" | "left" | "right">("center");

  const [pages, setPages] = useState<ScenePage[]>([
    {
      label: "Verse 1",
      sectionType: "verse",
      content: "",
      translation: "",
    },
  ]);

  const [isSending, setIsSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [previewPageIndex, setPreviewPageIndex] = useState<number | null>(null);

  // Add Page / Section
  const handleAddPage = (type: "verse" | "chorus" | "bridge" | "tag" | "ending" | "text" = "verse") => {
    let label = "Verse 1";
    if (type === "chorus") label = "Chorus";
    else if (type === "bridge") label = "Bridge";
    else if (type === "tag") label = "Tag";
    else if (type === "ending") label = "Ending";
    else {
      const verseCount = pages.filter((p) => p.sectionType === "verse").length + 1;
      label = `Verse ${verseCount}`;
    }

    setPages([
      ...pages,
      {
        label,
        sectionType: type,
        content: "",
        translation: "",
      },
    ]);
  };

  // Update Page Content
  const handleUpdatePage = (index: number, updates: Partial<ScenePage>) => {
    const next = [...pages];
    next[index] = { ...next[index], ...updates };
    setPages(next);
  };

  // Delete Page
  const handleDeletePage = (index: number) => {
    if (pages.length <= 1) {
      Alert.alert("Required", "A scene must contain at least one section.");
      return;
    }
    setPages(pages.filter((_, i) => i !== index));
    if (previewPageIndex === index) setPreviewPageIndex(null);
  };

  // Reorder Pages
  const handleMovePage = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === pages.length - 1) return;
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const next = [...pages];
    const item = next.splice(index, 1)[0];
    next.splice(targetIdx, 0, item);
    setPages(next);
  };

  // Send Scene to Desktop Controller
  const handleShareToDesktop = async () => {
    if (!name.trim()) {
      Alert.alert("Missing Title", "Please enter a name or title for this song/scene.");
      return;
    }

    const hasAnyContent = pages.some((p) => p.content.trim().length > 0);
    if (!hasAnyContent) {
      Alert.alert("Empty Scene", "Please enter lyrics or text in at least one section.");
      return;
    }

    if (!isConnected || !isPaired) {
      Alert.alert("Not Connected", "Connect and pair with the desktop controller before sharing scenes.");
      return;
    }

    setIsSending(true);
    setSuccessMessage(null);

    const scenePayload = {
      id: `scene-mob-${Date.now()}`,
      name: name.trim(),
      sceneType,
      navMode: sceneType === "song" ? navMode : "manual",
      pages: pages.map((p, idx) => ({
        label: p.label || `Section ${idx + 1}`,
        sectionType: p.sectionType || "verse",
        content: p.content.trim(),
        translation: (p.translation || "").trim(),
      })),
      style: {
        fontSize,
        textAlign,
        fontFamily: "sans",
        color: "#ffffff",
        backgroundColor: "transparent",
      },
      createdAt: Date.now(),
    };

    try {
      const res = await sendScene(scenePayload);
      if (res.ok) {
        setSuccessMessage(`"${name.trim()}" shared to desktop!`);
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        Alert.alert("Error", res.error || "Could not share scene with desktop.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to transmit scene.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={20} color="white" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Scene Creator</Text>
          <Text style={styles.headerSubtitle}>Songs, Liturgy & Lyrics</Text>
        </View>
        <TouchableOpacity
          onPress={handleShareToDesktop}
          disabled={isSending}
          style={[styles.shareButton, isSending ? { opacity: 0.6 } : null]}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <PaperPlaneTilt size={16} color="white" weight="bold" />
              <Text style={styles.shareButtonText}>Share</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Success Banner */}
        {successMessage && (
          <View style={styles.successBanner}>
            <CheckCircle size={20} color="#4ADE80" weight="fill" />
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        )}

        {/* Title Input */}
        <View style={styles.sectionCard}>
          <Text style={styles.fieldLabel}>TITLE / SONG NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Way Maker, Opening Prayer, Sermon"
            placeholderTextColor="#666"
            style={styles.titleInput}
          />
        </View>

        {/* Category Pills */}
        <View style={styles.sectionCard}>
          <Text style={styles.fieldLabel}>CATEGORY & TYPE</Text>
          <View style={styles.pillRow}>
            <TouchableOpacity
              onPress={() => setSceneType("song")}
              style={[styles.typePill, sceneType === "song" ? styles.typePillActiveSong : null]}
            >
              <MusicNotes size={16} color={sceneType === "song" ? "white" : "#999"} weight="bold" />
              <Text style={[styles.typePillText, sceneType === "song" ? styles.typePillTextActive : null]}>
                Song Lyrics
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSceneType("text")}
              style={[styles.typePill, sceneType === "text" ? styles.typePillActiveText : null]}
            >
              <Article size={16} color={sceneType === "text" ? "white" : "#999"} weight="bold" />
              <Text style={[styles.typePillText, sceneType === "text" ? styles.typePillTextActive : null]}>
                Text / Slides
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSceneType("scripture")}
              style={[styles.typePill, sceneType === "scripture" ? styles.typePillActiveScripture : null]}
            >
              <BookBookmark size={16} color={sceneType === "scripture" ? "white" : "#999"} weight="bold" />
              <Text style={[styles.typePillText, sceneType === "scripture" ? styles.typePillTextActive : null]}>
                Scripture
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sing-Along Alignment Mode */}
          {sceneType === "song" && (
            <View style={styles.alignModeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.alignModeTitle}>Sing-Along Voice Sync</Text>
                <Text style={styles.alignModeDesc}>Highlights words live as choir/worship team sings</Text>
              </View>
              <TouchableOpacity
                onPress={() => setNavMode(navMode === "read_along" ? "manual" : "read_along")}
                style={[styles.toggleButton, navMode === "read_along" ? styles.toggleButtonActive : null]}
              >
                <Microphone size={14} color={navMode === "read_along" ? "white" : "#888"} weight="bold" />
                <Text style={[styles.toggleText, navMode === "read_along" ? styles.toggleTextActive : null]}>
                  {navMode === "read_along" ? "Voice Sync" : "Manual"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Style Bar */}
        <View style={styles.styleRow}>
          <View style={styles.styleGroup}>
            <TextT size={14} color="#888" />
            {[28, 36, 44].map((size) => (
              <TouchableOpacity
                key={size}
                onPress={() => setFontSize(size)}
                style={[styles.fontSizePill, fontSize === size ? styles.fontSizePillActive : null]}
              >
                <Text style={[styles.fontSizeText, fontSize === size ? styles.fontSizeTextActive : null]}>
                  {size === 28 ? "S" : size === 36 ? "M" : "L"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.styleGroup}>
            {(["left", "center", "right"] as const).map((align) => {
              const Icon = align === "left" ? TextAlignLeft : align === "center" ? TextAlignCenter : TextAlignRight;
              return (
                <TouchableOpacity
                  key={align}
                  onPress={() => setTextAlign(align)}
                  style={[styles.alignPill, textAlign === align ? styles.alignPillActive : null]}
                >
                  <Icon size={14} color={textAlign === align ? "white" : "#888"} weight="bold" />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Sections / Pages Header */}
        <View style={styles.sectionsHeader}>
          <Text style={styles.fieldLabel}>SECTIONS & LYRICS ({pages.length})</Text>
          <View style={styles.presetButtons}>
            <TouchableOpacity onPress={() => handleAddPage("verse")} style={styles.presetButton}>
              <Text style={styles.presetButtonText}>+ Verse</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleAddPage("chorus")} style={styles.presetButton}>
              <Text style={styles.presetButtonText}>+ Chorus</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleAddPage("bridge")} style={styles.presetButton}>
              <Text style={styles.presetButtonText}>+ Bridge</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section Cards */}
        {pages.map((page, idx) => (
          <View key={idx} style={styles.pageCard}>
            {/* Page Card Header */}
            <View style={styles.pageCardHeader}>
              <TextInput
                value={page.label}
                onChangeText={(text) => handleUpdatePage(idx, { label: text })}
                placeholder="Section Name"
                placeholderTextColor="#666"
                style={styles.pageLabelInput}
              />

              <View style={styles.pageActions}>
                <TouchableOpacity
                  onPress={() => handleMovePage(idx, "up")}
                  disabled={idx === 0}
                  style={[styles.iconBtn, idx === 0 ? { opacity: 0.3 } : null]}
                >
                  <CaretUp size={14} color="white" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleMovePage(idx, "down")}
                  disabled={idx === pages.length - 1}
                  style={[styles.iconBtn, idx === pages.length - 1 ? { opacity: 0.3 } : null]}
                >
                  <CaretDown size={14} color="white" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeletePage(idx)} style={styles.deleteBtn}>
                  <Trash size={14} color="#F87171" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Lyrics / Text Input */}
            <TextInput
              value={page.content}
              onChangeText={(text) => handleUpdatePage(idx, { content: text })}
              placeholder="Enter lyrics or presentation text here..."
              placeholderTextColor="#555"
              multiline
              numberOfLines={4}
              style={[
                styles.contentInput,
                { textAlign, fontSize: Math.max(14, Math.round(fontSize * 0.42)) },
              ]}
            />

            {/* Secondary / Translation Input */}
            <TextInput
              value={page.translation || ""}
              onChangeText={(text) => handleUpdatePage(idx, { translation: text })}
              placeholder="Optional subtitle / translation..."
              placeholderTextColor="#444"
              style={styles.translationInput}
            />
          </View>
        ))}

        {/* Add Another Section Button */}
        <TouchableOpacity onPress={() => handleAddPage("verse")} style={styles.addSectionButton}>
          <Plus size={16} color="#60A5FA" weight="bold" />
          <Text style={styles.addSectionText}>Add Another Section</Text>
        </TouchableOpacity>

        {/* Bottom Spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
  },
  headerSubtitle: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#3B82F6",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  shareButtonText: {
    color: "white",
    fontSize: 13,
    fontWeight: "bold",
  },
  scrollContent: {
    padding: 16,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(74,222,128,0.15)",
    borderColor: "rgba(74,222,128,0.3)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: "#4ADE80",
    fontSize: 13,
    fontWeight: "bold",
  },
  sectionCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 8,
  },
  titleInput: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "white",
    fontSize: 15,
    fontWeight: "bold",
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
  },
  typePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
  },
  typePillActiveSong: {
    backgroundColor: "#EA580C",
  },
  typePillActiveText: {
    backgroundColor: "#2563EB",
  },
  typePillActiveScripture: {
    backgroundColor: "#9333EA",
  },
  typePillText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "rgba(255,255,255,0.6)",
  },
  typePillTextActive: {
    color: "white",
  },
  alignModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  alignModeTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "white",
  },
  alignModeDesc: {
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
  },
  toggleButtonActive: {
    backgroundColor: "rgba(234,88,12,0.8)",
  },
  toggleText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "rgba(255,255,255,0.6)",
  },
  toggleTextActive: {
    color: "white",
  },
  styleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  styleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 10,
    padding: 4,
  },
  fontSizePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  fontSizePillActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  fontSizeText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "rgba(255,255,255,0.5)",
  },
  fontSizeTextActive: {
    color: "white",
  },
  alignPill: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  alignPillActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  sectionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  presetButtons: {
    flexDirection: "row",
    gap: 6,
  },
  presetButton: {
    backgroundColor: "rgba(59,130,246,0.15)",
    borderColor: "rgba(59,130,246,0.3)",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  presetButtonText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#60A5FA",
  },
  pageCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  pageCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  pageLabelInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    color: "#F97316",
    fontSize: 12,
    fontWeight: "bold",
    minWidth: 100,
  },
  pageActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(248,113,113,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  contentInput: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    color: "white",
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 8,
  },
  translationInput: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  addSectionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(59,130,246,0.1)",
    borderColor: "rgba(59,130,246,0.25)",
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
  addSectionText: {
    color: "#60A5FA",
    fontSize: 13,
    fontWeight: "bold",
  },
});
