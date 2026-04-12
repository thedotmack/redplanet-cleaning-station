"use client";

import { useState, useRef, useCallback } from "react";
import {
  BrowserRosbridgeClient,
  Topics,
  MessageTypes,
  SPEED_CAPS,
  type SkillInfo,
  type RosbridgeMessage,
} from "../lib/rosbridge";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface LogEntry {
  timestamp: number;
  type: "info" | "error" | "feedback" | "result";
  message: string;
}

export function useRobot() {
  const clientRef = useRef<BrowserRosbridgeClient | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [executingSkill, setExecutingSkill] = useState(false);
  const [mainCameraFrame, setMainCameraFrame] = useState<string | null>(null);
  const [armCameraFrame, setArmCameraFrame] = useState<string | null>(null);
  const [mainCameraStreaming, setMainCameraStreaming] = useState(false);
  const [armCameraStreaming, setArmCameraStreaming] = useState(false);
  const mainCameraHandlerRef = useRef<((msg: RosbridgeMessage) => void) | null>(null);
  const armCameraHandlerRef = useRef<((msg: RosbridgeMessage) => void) | null>(null);
  const [armJoints, setArmJoints] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [movingArm, setMovingArm] = useState(false);

  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    setLogs((prev) => [...prev.slice(-200), { timestamp: Date.now(), type, message }]);
  }, []);

  const connect = useCallback(async (robotIp: string, port: number) => {
    // Disconnect existing
    if (clientRef.current) {
      clientRef.current.close();
    }

    const client = new BrowserRosbridgeClient(robotIp, port);
    clientRef.current = client;
    setConnectionStatus("connecting");
    addLog("info", `Connecting to ${robotIp}:${port}...`);

    try {
      await client.connect(10_000);
      setConnectionStatus("connected");
      addLog("info", `Connected to ${robotIp}:${port}`);

      // Discover available skills
      try {
        const skillsMsg = await client.waitForMessage(Topics.AVAILABLE_SKILLS, 15_000);
        const skills = (skillsMsg.msg as { skills: SkillInfo[] })?.skills || [];
        setAvailableSkills(skills);
        addLog("info", `Discovered ${skills.length} skills`);
      } catch {
        addLog("error", "Could not fetch available skills (timeout)");
      }
    } catch (err) {
      setConnectionStatus("error");
      addLog("error", `Connection failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }, [addLog]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
    }
    setConnectionStatus("disconnected");
    setAvailableSkills([]);
    setMainCameraStreaming(false);
    setArmCameraStreaming(false);
    mainCameraHandlerRef.current = null;
    armCameraHandlerRef.current = null;
    setMainCameraFrame((prev) => { if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev); return null; });
    setArmCameraFrame((prev) => { if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev); return null; });
    addLog("info", "Disconnected");
  }, [addLog]);

  const executeSkill = useCallback(async (skillType: string, inputs: Record<string, unknown>) => {
    const client = clientRef.current;
    if (!client?.isConnected) throw new Error("Not connected");

    setExecutingSkill(true);
    addLog("info", `Executing skill: ${skillType}`);

    try {
      const result = await client.executeSkill(skillType, inputs, {
        onFeedback: (fb: RosbridgeMessage) => {
          const feedbackData = fb.feedback ?? fb.msg;
          addLog("feedback", JSON.stringify(feedbackData, null, 0));
        },
        timeoutMs: 120_000,
      });

      const resultMsg = result as RosbridgeMessage;
      const success = (resultMsg.values as Record<string, unknown>)?.success;
      addLog("result", `Skill result: ${success ? "SUCCESS" : "FAILED"} — ${JSON.stringify(resultMsg.values ?? resultMsg.result)}`);
      return result;
    } catch (err) {
      addLog("error", `Skill error: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    } finally {
      setExecutingSkill(false);
    }
  }, [addLog]);

  const cancelSkill = useCallback(() => {
    clientRef.current?.cancelCurrentSkill();
    setExecutingSkill(false);
    addLog("info", "Cancelled current skill");
  }, [addLog]);

  const publishCmdVel = useCallback((linearX: number, angularZ: number) => {
    const client = clientRef.current;
    if (!client?.isConnected) return;

    // Clamp to safety caps
    const clampedLinear = Math.max(-SPEED_CAPS.MAX_LINEAR_MPS, Math.min(SPEED_CAPS.MAX_LINEAR_MPS, linearX));
    const clampedAngular = Math.max(-SPEED_CAPS.MAX_ANGULAR_RADPS, Math.min(SPEED_CAPS.MAX_ANGULAR_RADPS, angularZ));

    client.publish(Topics.CMD_VEL, MessageTypes.TWIST, {
      linear: { x: clampedLinear, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: clampedAngular },
    });
  }, []);

  const stopDriving = useCallback(() => {
    publishCmdVel(0, 0);
  }, [publishCmdVel]);

  const speak = useCallback((text: string) => {
    const client = clientRef.current;
    if (!client?.isConnected) return;

    client.publish(Topics.TTS, MessageTypes.STRING, { data: text });
    addLog("info", `TTS: "${text}"`);
  }, [addLog]);

  const setHeadTilt = useCallback((degrees: number) => {
    const client = clientRef.current;
    if (!client?.isConnected) return;

    const clamped = Math.max(-25, Math.min(25, Math.round(degrees)));
    client.publish(Topics.HEAD_SET_POSITION, MessageTypes.INT32, { data: clamped });
    addLog("info", `Head tilt: ${clamped}°`);
  }, [addLog]);

  /** Emergency stop: 5x zero velocity + cancel running action */
  const estop = useCallback(() => {
    const client = clientRef.current;
    if (!client?.isConnected) return;

    // Send zero velocity 5 times to ensure receipt
    for (let i = 0; i < 5; i++) {
      client.publish(Topics.CMD_VEL, MessageTypes.TWIST, {
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      });
    }

    // Cancel any running action
    client.cancelCurrentSkill();
    setExecutingSkill(false);

    addLog("error", "E-STOP ACTIVATED");
  }, [addLog]);

  /** Parse image data from a CompressedImage ros message.
   *  Handles both base64 string (normal) and integer array (fallback) encodings. */
  const parseImageFrame = (msg: RosbridgeMessage): string | null => {
    const msgData = msg.msg as Record<string, unknown>;
    if (!msgData) return null;
    const format = (msgData.format as string) || "jpeg";
    const rawData = msgData.data;

    if (typeof rawData === "string" && rawData.length > 0) {
      // Base64 encoded — create Blob + Object URL (much faster than data: URLs for streaming)
      try {
        const binary = atob(rawData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: `image/${format}` });
        return URL.createObjectURL(blob);
      } catch {
        // Fallback to data URL if atob fails
        return `data:image/${format};base64,${rawData}`;
      }
    } else if (Array.isArray(rawData) && rawData.length > 0) {
      // Integer byte array — convert to Blob
      const bytes = new Uint8Array(rawData);
      const blob = new Blob([bytes], { type: `image/${format}` });
      return URL.createObjectURL(blob);
    }
    return null;
  };

  /** Revoke old Object URL if needed, set new frame */
  const setFrameAndCleanup = (
    setter: React.Dispatch<React.SetStateAction<string | null>>,
    newFrame: string,
  ) => {
    setter((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return newFrame;
    });
  };

  /** Capture a single photo from main camera */
  const captureMainPhoto = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.isConnected) return;
    addLog("info", "Capturing main camera photo...");
    try {
      const msg = await client.waitForMessage(Topics.MAIN_CAMERA, 10_000, { type: MessageTypes.COMPRESSED_IMAGE });
      const frame = parseImageFrame(msg);
      if (frame) {
        setFrameAndCleanup(setMainCameraFrame, frame);
        addLog("info", "Main camera photo captured");
      } else {
        addLog("error", "Main camera returned empty frame");
      }
    } catch {
      addLog("error", "Main camera photo capture timed out");
    }
  }, [addLog]);

  /** Capture a single photo from arm camera */
  const captureArmPhoto = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.isConnected) return;
    addLog("info", "Capturing arm camera photo...");
    try {
      const msg = await client.waitForMessage(Topics.ARM_CAMERA, 10_000, { type: MessageTypes.COMPRESSED_IMAGE });
      const frame = parseImageFrame(msg);
      if (frame) {
        setFrameAndCleanup(setArmCameraFrame, frame);
        addLog("info", "Arm camera photo captured");
      } else {
        addLog("error", "Arm camera returned empty frame");
      }
    } catch {
      addLog("error", "Arm camera photo capture timed out");
    }
  }, [addLog]);

  /** Toggle main camera live stream */
  const toggleMainCameraStream = useCallback(() => {
    const client = clientRef.current;
    if (!client?.isConnected) return;

    if (mainCameraStreaming && mainCameraHandlerRef.current) {
      client.unsubscribe(Topics.MAIN_CAMERA, mainCameraHandlerRef.current);
      mainCameraHandlerRef.current = null;
      setMainCameraStreaming(false);
      addLog("info", "Main camera stream stopped");
    } else {
      const handler = (msg: RosbridgeMessage) => {
        const frame = parseImageFrame(msg);
        if (frame) setFrameAndCleanup(setMainCameraFrame, frame);
      };
      mainCameraHandlerRef.current = handler;
      client.subscribe(Topics.MAIN_CAMERA, handler, {
        throttleRateMs: 200,
        queueLength: 1,
        type: MessageTypes.COMPRESSED_IMAGE,
      });
      setMainCameraStreaming(true);
      addLog("info", "Main camera stream started");
    }
  }, [mainCameraStreaming, addLog]);

  /** Toggle arm camera live stream */
  const toggleArmCameraStream = useCallback(() => {
    const client = clientRef.current;
    if (!client?.isConnected) return;

    if (armCameraStreaming && armCameraHandlerRef.current) {
      client.unsubscribe(Topics.ARM_CAMERA, armCameraHandlerRef.current);
      armCameraHandlerRef.current = null;
      setArmCameraStreaming(false);
      addLog("info", "Arm camera stream stopped");
    } else {
      const handler = (msg: RosbridgeMessage) => {
        const frame = parseImageFrame(msg);
        if (frame) setFrameAndCleanup(setArmCameraFrame, frame);
      };
      armCameraHandlerRef.current = handler;
      client.subscribe(Topics.ARM_CAMERA, handler, {
        throttleRateMs: 200,
        queueLength: 1,
        type: MessageTypes.COMPRESSED_IMAGE,
      });
      setArmCameraStreaming(true);
      addLog("info", "Arm camera stream started");
    }
  }, [armCameraStreaming, addLog]);

  /** Read current arm joint positions */
  const readArmState = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.isConnected) return;

    try {
      const msg = await client.waitForMessage(Topics.ARM_STATE, 10_000);
      const positions = (msg.msg as Record<string, unknown>)?.position as number[];
      if (positions && positions.length >= 6) {
        setArmJoints(positions.slice(0, 6));
        addLog("info", `Arm state: [${positions.slice(0, 6).map(p => p.toFixed(3)).join(", ")}]`);
      }
    } catch {
      addLog("error", "Could not read arm state");
    }
  }, [addLog]);

  /** Move arm to target joint positions */
  const moveArmToJoints = useCallback(async (joints: number[], durationSeconds = 2.0) => {
    const client = clientRef.current;
    if (!client?.isConnected) return;

    setMovingArm(true);
    addLog("info", `Moving arm to [${joints.map(j => j.toFixed(3)).join(", ")}]`);
    try {
      await client.callGotoJS(joints, durationSeconds);
      addLog("result", "Arm move complete");
    } catch (err) {
      addLog("error", `Arm move failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMovingArm(false);
    }
  }, [addLog]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    // State
    connectionStatus,
    availableSkills,
    logs,
    executingSkill,
    // Connection
    connect,
    disconnect,
    // Skills
    executeSkill,
    cancelSkill,
    // Drive
    publishCmdVel,
    stopDriving,
    // Actions
    speak,
    setHeadTilt,
    estop,
    // Cameras
    mainCameraFrame,
    armCameraFrame,
    mainCameraStreaming,
    armCameraStreaming,
    captureMainPhoto,
    captureArmPhoto,
    toggleMainCameraStream,
    toggleArmCameraStream,
    // Arm
    armJoints,
    movingArm,
    readArmState,
    moveArmToJoints,
    // Logs
    addLog,
    clearLogs,
  };
}
