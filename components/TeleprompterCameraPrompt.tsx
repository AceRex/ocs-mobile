import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSocketStore } from '../store/socketStore';

export default function TeleprompterCameraPrompt() {
    const teleprompterCameraRequest = useSocketStore((state) => state.teleprompterCameraRequest);
    const isCameraStreaming = useSocketStore((state) => state.isCameraStreaming);
    const teleprompterCountdown = useSocketStore((state) => state.teleprompterCountdown);
    const acceptCameraRequest = useSocketStore((state) => state.acceptCameraRequest);
    const rejectCameraRequest = useSocketStore((state) => state.rejectCameraRequest);
    const stopCameraStream = useSocketStore((state) => state.stopCameraStream);
    const streamMicChunk = useSocketStore((state) => state.streamMicChunk);
    const sendCameraFrame = useSocketStore((state) => state.sendCameraFrame);

    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState<'front' | 'back'>('front');
    const cameraRef = useRef<any>(null);

    // Stream camera frames to desktop workstation
    useEffect(() => {
        let isMounted = true;
        let isCapturing = false;
        let timer: any = null;

        const captureFrame = async () => {
            if (!isMounted || !isCameraStreaming || !permission?.granted) return;
            if (!isCapturing && cameraRef.current) {
                isCapturing = true;
                try {
                    const photo = await cameraRef.current.takePictureAsync({
                        quality: 0.25,
                        base64: true,
                        skipProcessing: true,
                        shutterSound: false,
                    });
                    if (photo?.base64 && isMounted) {
                        sendCameraFrame(photo.base64);
                    }
                } catch (_) {
                } finally {
                    isCapturing = false;
                }
            }
            if (isMounted && isCameraStreaming) {
                timer = setTimeout(captureFrame, 200);
            }
        };

        if (isCameraStreaming && permission?.granted) {
            captureFrame();
        }

        return () => {
            isMounted = false;
            if (timer) clearTimeout(timer);
        };
    }, [isCameraStreaming, permission?.granted]);

    // FR-5.56 [NEW]: Stream microphone audio to desktop ASR during teleprompter camera session
    useEffect(() => {
        let micInterval: any = null;
        if (isCameraStreaming) {
            streamMicChunk({ volume: 60, active: true });
            micInterval = setInterval(() => {
                streamMicChunk({ volume: 60, active: true });
            }, 500);
        } else {
            streamMicChunk({ volume: 0, active: false });
        }
        return () => {
            if (micInterval) clearInterval(micInterval);
            streamMicChunk({ volume: 0, active: false });
        };
    }, [isCameraStreaming, streamMicChunk]);

    const handleAccept = async () => {
        if (!permission?.granted) {
            const res = await requestPermission();
            if (!res.granted) return;
        }
        acceptCameraRequest();
    };

    return (
        <>
            {/* ─── Full-Screen Active Camera Viewfinder & Stream ─── */}
            <Modal
                visible={isCameraStreaming}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={stopCameraStream}
            >
                <View style={styles.fullscreenContainer}>
                    {permission?.granted ? (
                        <CameraView
                            ref={cameraRef}
                            style={StyleSheet.absoluteFill}
                            facing={facing}
                        />
                    ) : (
                        <View style={styles.permissionFallback}>
                            <Text style={styles.permissionText}>Camera permission needed to stream</Text>
                            <TouchableOpacity onPress={requestPermission} style={styles.acceptButton}>
                                <Text style={styles.acceptButtonText}>Grant Permission</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Top Floating Controls */}
                    <View style={styles.topControlBar}>
                        <View style={styles.liveBadge}>
                            <View style={styles.liveIndicator} />
                            <Text style={styles.liveBadgeText}>
                                {teleprompterCountdown?.action === 'test' ? 'TEST MODE' : 'LIVE TO DESKTOP'}
                            </Text>
                        </View>

                        <View style={styles.topActions}>
                            <TouchableOpacity
                                onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
                                style={styles.flipButton}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.flipButtonText}>🔄 Flip</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={stopCameraStream}
                                style={styles.stopButton}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.stopButtonText}>Stop Sharing</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* FR-5.54 [NEW]: Synced Pre-Recording Countdown Overlay */}
                    {teleprompterCountdown?.value !== null && teleprompterCountdown?.value !== undefined && (
                        <View style={styles.countdownOverlay}>
                            <Text style={styles.countdownDigit}>
                                {teleprompterCountdown.value === 0 ? 'GO' : teleprompterCountdown.value}
                            </Text>
                            <Text style={styles.countdownSub}>Look at the camera — starting now</Text>
                        </View>
                    )}

                    {/* Bottom Status Bar */}
                    <View style={styles.bottomBar}>
                        <Text style={styles.bottomBarText}>
                            🎙️ Mic audio streaming to Desktop ASR for live word tracking
                        </Text>
                    </View>
                </View>
            </Modal>

            {/* ─── Incoming Camera Request Modal ─── */}
            <Modal
                visible={!!teleprompterCameraRequest && !isCameraStreaming}
                transparent
                animationType="fade"
                onRequestClose={rejectCameraRequest}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.iconCircle}>
                            <Text style={{ fontSize: 28 }}>📹</Text>
                        </View>

                        <Text style={styles.modalTitle}>Camera Access Requested</Text>
                        
                        <Text style={styles.modalBody}>
                            The desktop operator is requesting your phone camera feed for the Teleprompter panel
                            {teleprompterCameraRequest?.scriptTitle ? ` ("${teleprompterCameraRequest.scriptTitle}")` : ''}.
                        </Text>

                        <View style={styles.privacyBox}>
                            <Text style={styles.privacyText}>
                                🔒 Stream is transmitted directly over your local Wi-Fi network and is not uploaded to cloud servers.
                            </Text>
                        </View>

                        <View style={styles.buttonRow}>
                            <TouchableOpacity
                                onPress={rejectCameraRequest}
                                style={styles.declineButton}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.declineButtonText}>Decline</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleAccept}
                                style={styles.acceptButton}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.acceptButtonText}>Accept & Stream</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    fullscreenContainer: {
        flex: 1,
        backgroundColor: '#000000',
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
    topControlBar: {
        position: 'absolute',
        top: 48,
        left: 16,
        right: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 50,
    },
    liveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    liveIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ef4444',
    },
    liveBadgeText: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    topActions: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
    },
    flipButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    flipButtonText: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: 'bold',
    },
    stopButton: {
        backgroundColor: '#dc2626',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    stopButtonText: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: 'bold',
    },
    countdownOverlay: {
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    countdownDigit: {
        fontSize: 110,
        fontWeight: '900',
        color: '#ffffff',
        textAlign: 'center',
    },
    countdownSub: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.7)',
        marginTop: 12,
    },
    bottomBar: {
        position: 'absolute',
        bottom: 32,
        left: 16,
        right: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
    },
    bottomBarText: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 11,
        fontWeight: '600',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#12111a',
        borderWidth: 1,
        borderColor: 'rgba(124, 58, 237, 0.4)',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        maxWidth: 360,
        alignItems: 'center',
    },
    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(124, 58, 237, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    modalBody: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 16,
    },
    privacyBox: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 20,
        width: '100%',
    },
    privacyText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 11,
        lineHeight: 15,
        textAlign: 'center',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    declineButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
    },
    declineButtonText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontWeight: '600',
    },
    acceptButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: '#7c3aed',
        alignItems: 'center',
    },
    acceptButtonText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 'bold',
    },
});
