"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRobot, type LogEntry, type ConnectionStatus } from "./hooks/useRobot";
import { SkillIds, SPEED_CAPS, type SkillInfo } from "./lib/rosbridge";

// ─── Constants ────────────────────────────────────────────────────────────────

const HEAD_TILT_MIN_DEGREES = -25;
const HEAD_TILT_MAX_DEGREES = 25;
const HEAD_TILT_STEP_DEGREES = 5;

const ARM_JOINTS = [
  { name: "Base",     min: -1.5708, max: 1.5708 },
  { name: "Shoulder", min: -1.5708, max: 1.22   },
  { name: "Elbow",    min: -1.5708, max: 1.7453 },
  { name: "Wrist 1",  min: -1.9199, max: 1.7453 },
  { name: "Wrist 2",  min: -1.5708, max: 1.5708 },
  { name: "Wrist 3",  min: -0.8727, max: 0.3491 },
];

const ARM_STEP_OPTIONS = [0.01, 0.05, 0.1, 0.5];

const EMOTIONS = [
  { id: "happy", label: "Happy" },
  { id: "sad", label: "Sad" },
  { id: "excited", label: "Excited" },
  { id: "surprised", label: "Surprised" },
  { id: "angry", label: "Angry" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  disconnected: "bg-gray-500",
  connecting: "bg-yellow-500 animate-pulse",
  connected: "bg-green-500",
  error: "bg-red-500",
};

const LOG_TYPE_COLORS: Record<LogEntry["type"], string> = {
  info: "text-gray-400",
  error: "text-red-400",
  feedback: "text-yellow-400",
  result: "text-green-400",
};

const LOG_TYPE_LABELS: Record<LogEntry["type"], string> = {
  info: "INFO",
  error: "ERR",
  feedback: "FEED",
  result: "RSLT",
};

/** Detect TTS log entries from useRobot's speak() which logs as: TTS: "text" */
function isTtsLog(log: LogEntry): boolean {
  return log.type === "info" && log.message.startsWith('TTS: "');
}

function extractTtsText(log: LogEntry): string {
  const match = log.message.match(/^TTS: "(.+)"$/);
  return match ? match[1] : log.message;
}

function downloadImageFrame(frame: string, label: string) {
  const link = document.createElement("a");
  link.href = frame;
  link.download = `${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const robot = useRobot();

  // ── Lifted state ──
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [showArmPanel, setShowArmPanel] = useState(false);
  const [showSkillPanel, setShowSkillPanel] = useState(false);
  const [speed, setSpeed] = useState(0.15);
  const [tilt, setTilt] = useState(0);
  const [ttsText, setTtsText] = useState("");

  // ── Refs ──
  const activeKeysRef = useRef<Set<string>>(new Set());
  const driveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logScrollRef = useRef<HTMLDivElement>(null);

  // ── Arm panel state ──
  const [targetJoints, setTargetJoints] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [armDuration, setArmDuration] = useState(2.0);
  const [armSynced, setArmSynced] = useState(false);
  const [armStepRadians, setArmStepRadians] = useState(0.1);

  // ── Skill panel state ──
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [skillInputsJson, setSkillInputsJson] = useState("{}");
  const [skillJsonError, setSkillJsonError] = useState("");

  // ── Visualizer animation state ──
  const [visualizerTick, setVisualizerTick] = useState(0);

  const isDisabled = robot.connectionStatus !== "connected";

  // Stable refs to avoid effect re-runs
  const { publishCmdVel, stopDriving, estop } = robot;
  const speedRef = useRef(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // ── Keyboard drive controls ──

  const updateDriveFromKeys = useCallback(() => {
    const keys = activeKeysRef.current;
    let linearX = 0;
    let angularZ = 0;
    const currentSpeed = speedRef.current;

    if (keys.has("w")) linearX += currentSpeed;
    if (keys.has("s")) linearX -= currentSpeed;
    if (keys.has("a")) angularZ += currentSpeed * (SPEED_CAPS.MAX_ANGULAR_RADPS / SPEED_CAPS.MAX_LINEAR_MPS);
    if (keys.has("d")) angularZ -= currentSpeed * (SPEED_CAPS.MAX_ANGULAR_RADPS / SPEED_CAPS.MAX_LINEAR_MPS);

    if (linearX !== 0 || angularZ !== 0) {
      publishCmdVel(linearX, angularZ);
    }
  }, [publishCmdVel]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === " ") {
        e.preventDefault();
        estop();
        return;
      }

      const key = e.key.toLowerCase();
      const keyMap: Record<string, string> = {
        arrowup: "w", arrowdown: "s", arrowleft: "a", arrowright: "d",
      };
      const mappedKey = keyMap[key] || key;
      if (["w", "a", "s", "d"].includes(mappedKey) && !activeKeysRef.current.has(mappedKey)) {
        e.preventDefault();
        activeKeysRef.current.add(mappedKey);
        setActiveKeys(new Set(activeKeysRef.current));

        if (!driveIntervalRef.current) {
          driveIntervalRef.current = setInterval(updateDriveFromKeys, 100);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const keyMap: Record<string, string> = {
        arrowup: "w", arrowdown: "s", arrowleft: "a", arrowright: "d",
      };
      const mappedKey = keyMap[key] || key;
      if (["w", "a", "s", "d"].includes(mappedKey)) {
        activeKeysRef.current.delete(mappedKey);
        setActiveKeys(new Set(activeKeysRef.current));

        if (activeKeysRef.current.size === 0) {
          if (driveIntervalRef.current) {
            clearInterval(driveIntervalRef.current);
            driveIntervalRef.current = null;
          }
          stopDriving();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (driveIntervalRef.current) {
        clearInterval(driveIntervalRef.current);
      }
    };
  }, [estop, stopDriving, updateDriveFromKeys]);

  // ── Auto-scroll logs ──
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [robot.logs]);

  // ── Visualizer animation tick ──
  useEffect(() => {
    const interval = setInterval(() => {
      setVisualizerTick((t) => t + 1);
    }, 300);
    return () => clearInterval(interval);
  }, []);

  // ── Arm sync effect ──
  useEffect(() => {
    if (armSynced) {
      setTargetJoints([...robot.armJoints]);
      setArmSynced(false);
    }
  }, [robot.armJoints, armSynced]);

  // ── Skill template pre-fill ──
  const selectedSkill = robot.availableSkills.find((s) => s.id === selectedSkillId);

  useEffect(() => {
    if (selectedSkill?.inputs_json) {
      try {
        const schema = JSON.parse(selectedSkill.inputs_json);
        const template: Record<string, unknown> = {};
        if (schema.properties) {
          for (const [key, prop] of Object.entries(schema.properties)) {
            const p = prop as Record<string, unknown>;
            if (p.default !== undefined) {
              template[key] = p.default;
            } else if (p.type === "number") {
              template[key] = 0.0;
            } else if (p.type === "string") {
              template[key] = "";
            } else if (p.type === "boolean") {
              template[key] = false;
            }
          }
        }
        setSkillInputsJson(JSON.stringify(template, null, 2));
        setSkillJsonError("");
      } catch {
        setSkillInputsJson("{}");
      }
    } else {
      setSkillInputsJson("{}");
    }
  }, [selectedSkillId, selectedSkill]);

  // ── Handlers ──

  const handleEmotion = (emotion: string) => {
    robot.executeSkill(SkillIds.HEAD_EMOTION, { emotion });
  };

  const handleDriveButton = (linearX: number, angularZ: number) => {
    robot.publishCmdVel(linearX * speed, angularZ * speed * (SPEED_CAPS.MAX_ANGULAR_RADPS / SPEED_CAPS.MAX_LINEAR_MPS));
  };

  const handleTiltAdjust = (delta: number) => {
    const next = Math.max(HEAD_TILT_MIN_DEGREES, Math.min(HEAD_TILT_MAX_DEGREES, tilt + delta));
    setTilt(next);
    robot.setHeadTilt(next);
  };

  const handleSpeak = () => {
    if (ttsText.trim()) {
      robot.speak(ttsText.trim());
      setTtsText("");
    }
  };

  const adjustJoint = (index: number, delta: number) => {
    setTargetJoints((prev) => {
      const next = [...prev];
      const clamped = Math.max(ARM_JOINTS[index].min, Math.min(ARM_JOINTS[index].max, prev[index] + delta));
      next[index] = Math.round(clamped * 10000) / 10000;
      return next;
    });
  };

  const handleArmSyncFromRobot = () => {
    robot.readArmState();
    setArmSynced(true);
  };

  const handleSkillExecute = () => {
    try {
      const inputs = JSON.parse(skillInputsJson);
      setSkillJsonError("");
      robot.executeSkill(selectedSkillId, inputs);
    } catch (err) {
      setSkillJsonError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  // ── WASD button styling ──
  const wasdBtnClass = (key: string) =>
    `w-9 h-9 rounded-lg font-bold text-xs transition-all ${
      activeKeys.has(key)
        ? "bg-cyan-500 text-white scale-95"
        : "bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700/50"
    } ${isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer active:scale-95"}`;

  // ── Visualizer state derivation ──
  type RobotState = "disconnected" | "connecting" | "connected" | "executingSkill";
  const robotState: RobotState =
    robot.executingSkill ? "executingSkill" :
    robot.connectionStatus === "connected" ? "connected" :
    robot.connectionStatus === "connecting" ? "connecting" :
    "disconnected";

  const getBarStyle = (barIndex: number): { height: string; backgroundColor: string } => {
    switch (robotState) {
      case "disconnected":
        return { height: "12px", backgroundColor: "rgba(55,65,81,0.2)" };
      case "connecting": {
        const active = visualizerTick % 5;
        const isActive = barIndex === active;
        return {
          height: isActive ? "32px" : "12px",
          backgroundColor: isActive ? "rgb(6,182,212)" : "rgba(6,182,212,0.15)",
        };
      }
      case "connected": {
        // Gentle idle pulse — varying heights based on tick
        const baseHeights = [14, 20, 24, 20, 14];
        const offset = (visualizerTick + barIndex) % 4;
        const h = baseHeights[barIndex] + (offset < 2 ? 4 : 0);
        return {
          height: `${h}px`,
          backgroundColor: "rgba(6,182,212,0.3)",
        };
      }
      case "executingSkill": {
        // Fast sequential highlight
        const active = visualizerTick % 5;
        const dist = Math.abs(barIndex - active);
        const isActive = dist === 0;
        const isNear = dist === 1;
        return {
          height: isActive ? "40px" : isNear ? "28px" : "16px",
          backgroundColor: isActive ? "rgb(6,182,212)" : isNear ? "rgba(6,182,212,0.5)" : "rgba(6,182,212,0.15)",
        };
      }
    }
  };

  // ── Render ──

  return (
    <div className="h-svh dot-grid-bg flex flex-col overflow-hidden">

      {/* ── ConnectionBar ── */}
      <ConnectionBar
        connectionStatus={robot.connectionStatus}
        onConnect={robot.connect}
        onDisconnect={robot.disconnect}
      />

      {/* ── Main scrollable content ── */}
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto px-4 pb-[320px] space-y-4 pt-4">

          {/* ── CameraHero ── */}
          <div className="relative w-full aspect-video bg-gray-900 rounded-xl overflow-hidden border border-gray-800/50">
            {robot.mainCameraFrame ? (
              <img src={robot.mainCameraFrame} alt="Main Camera" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-gray-700 text-sm font-mono">No camera feed</span>
              </div>
            )}

            {/* Arm camera PiP */}
            <div className="absolute bottom-3 right-3 w-1/4 aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-700/50 shadow-lg">
              {robot.armCameraFrame ? (
                <img src={robot.armCameraFrame} alt="Arm Camera" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-gray-700 text-[10px] font-mono">Arm cam</span>
                </div>
              )}
            </div>

            {/* Floating camera controls — top-right */}
            <div className="absolute top-3 right-3 flex gap-1.5">
              <button
                onClick={robot.toggleMainCameraStream}
                disabled={isDisabled}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium backdrop-blur transition-colors disabled:opacity-40 ${
                  robot.mainCameraStreaming
                    ? "bg-red-600/80 text-white"
                    : "bg-gray-900/80 text-gray-300 hover:bg-gray-800/80"
                }`}
              >
                {robot.mainCameraStreaming ? "Stop" : "Stream"}
              </button>
              <button
                onClick={robot.toggleArmCameraStream}
                disabled={isDisabled}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium backdrop-blur transition-colors disabled:opacity-40 ${
                  robot.armCameraStreaming
                    ? "bg-red-600/80 text-white"
                    : "bg-gray-900/80 text-gray-300 hover:bg-gray-800/80"
                }`}
              >
                {robot.armCameraStreaming ? "Stop Arm" : "Arm"}
              </button>
              {robot.mainCameraFrame && (
                <button
                  onClick={() => downloadImageFrame(robot.mainCameraFrame!, "main-camera")}
                  className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-gray-900/80 text-gray-300 hover:bg-gray-800/80 backdrop-blur transition-colors"
                >
                  Save
                </button>
              )}
              {!robot.mainCameraStreaming && (
                <button
                  onClick={robot.captureMainPhoto}
                  disabled={isDisabled}
                  className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-gray-900/80 text-gray-300 hover:bg-gray-800/80 backdrop-blur transition-colors disabled:opacity-40"
                >
                  Photo
                </button>
              )}
            </div>

            {/* Live indicator — top-left */}
            {(robot.mainCameraStreaming || robot.armCameraStreaming) && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 text-xs text-red-400">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </div>
            )}
          </div>

          {/* ── StateVisualizer ── */}
          <div className="flex items-end justify-center h-12 gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-1.5 rounded-full transition-all duration-200 origin-bottom"
                style={getBarStyle(i)}
              />
            ))}
          </div>

          {/* ── ChatTranscript ── */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[#030712] to-transparent z-10" />

            <div
              ref={logScrollRef}
              className="max-h-[240px] overflow-y-auto custom-scrollbar space-y-2 px-1"
            >
              {robot.logs.length === 0 ? (
                <p className="text-gray-700 italic text-sm pt-8 text-center">
                  Connect to the robot to begin.
                </p>
              ) : (
                robot.logs.map((log, i) => (
                  <div key={i} className={isTtsLog(log) ? "flex justify-end" : ""}>
                    {isTtsLog(log) ? (
                      <div className="bg-gray-800 text-gray-200 rounded-[22px] px-4 py-2.5 text-sm max-w-[85%]">
                        {extractTtsText(log)}
                      </div>
                    ) : (
                      <div>
                        <span className="text-[10px] text-gray-600 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()} [{LOG_TYPE_LABELS[log.type]}]
                        </span>
                        <div className={`text-sm ${LOG_TYPE_COLORS[log.type]}`}>{log.message}</div>
                      </div>
                    )}
                  </div>
                ))
              )}

              {robot.executingSkill && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span
                    className="w-2 h-2 rounded-full bg-cyan-500"
                    style={{ animation: "dot-pulse 1.5s ease-in-out infinite" }}
                  />
                  Processing...
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* ── ControlBar (bottom-anchored pill) ── */}
      <div className="fixed inset-x-3 bottom-3 z-50 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl">
        <div className="bg-gray-950/95 backdrop-blur-xl border border-gray-800/50 rounded-[24px] p-3 shadow-2xl shadow-black/50 space-y-2.5">

          {/* Row 1: Speech input — most prominent */}
          <div className="flex gap-2">
            <input
              type="text"
              value={ttsText}
              onChange={(e) => setTtsText(e.target.value)}
              placeholder="Say something..."
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSpeak();
              }}
              disabled={isDisabled}
              className="flex-1 h-10 px-4 bg-gray-900/80 border border-gray-800/50 rounded-full text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-colors disabled:opacity-40"
            />
            <button
              onClick={handleSpeak}
              disabled={isDisabled || !ttsText.trim()}
              className="h-10 px-5 bg-cyan-600 hover:bg-cyan-700 rounded-full text-sm font-medium transition-colors disabled:opacity-40"
            >
              Speak
            </button>
          </div>

          {/* Row 2: Drive + Speed + Head */}
          <div className="flex items-center gap-3">
            {/* Compact WASD */}
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <button
                className={wasdBtnClass("w")}
                onPointerDown={() => handleDriveButton(1, 0)}
                onPointerUp={robot.stopDriving}
                onPointerLeave={robot.stopDriving}
                disabled={isDisabled}
              >
                W
              </button>
              <div className="flex gap-0.5">
                <button
                  className={wasdBtnClass("a")}
                  onPointerDown={() => handleDriveButton(0, 1)}
                  onPointerUp={robot.stopDriving}
                  onPointerLeave={robot.stopDriving}
                  disabled={isDisabled}
                >
                  A
                </button>
                <button
                  className="w-9 h-9 rounded-lg bg-gray-800/50 border border-gray-800 flex items-center justify-center"
                  onClick={robot.stopDriving}
                  disabled={isDisabled}
                >
                  <div className="w-2 h-2 rounded-full bg-gray-600" />
                </button>
                <button
                  className={wasdBtnClass("d")}
                  onPointerDown={() => handleDriveButton(0, -1)}
                  onPointerUp={robot.stopDriving}
                  onPointerLeave={robot.stopDriving}
                  disabled={isDisabled}
                >
                  D
                </button>
              </div>
              <button
                className={wasdBtnClass("s")}
                onPointerDown={() => handleDriveButton(-1, 0)}
                onPointerUp={robot.stopDriving}
                onPointerLeave={robot.stopDriving}
                disabled={isDisabled}
              >
                S
              </button>
            </div>

            {/* Speed slider */}
            <div className="flex-1 space-y-1 min-w-0">
              <div className="flex justify-between text-[10px] text-gray-600">
                <span className="uppercase tracking-wider">Speed</span>
                <span className="font-mono text-gray-400">{speed.toFixed(2)} m/s</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={SPEED_CAPS.MAX_LINEAR_MPS}
                step={0.01}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-cyan-500 h-1.5"
                disabled={isDisabled}
              />
            </div>

            {/* Head tilt */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleTiltAdjust(HEAD_TILT_STEP_DEGREES)}
                disabled={isDisabled || tilt >= HEAD_TILT_MAX_DEGREES}
                className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700/50 text-gray-400 font-bold text-sm transition-all disabled:opacity-30 active:scale-95"
              >
                ▲
              </button>
              <span className="text-xs font-mono text-gray-400 w-8 text-center">{tilt}&deg;</span>
              <button
                onClick={() => handleTiltAdjust(-HEAD_TILT_STEP_DEGREES)}
                disabled={isDisabled || tilt <= HEAD_TILT_MIN_DEGREES}
                className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700/50 text-gray-400 font-bold text-sm transition-all disabled:opacity-30 active:scale-95"
              >
                ▼
              </button>
            </div>

            {/* Separator */}
            <div className="w-px h-10 bg-gray-800 shrink-0" />

            {/* Panel toggles */}
            <div className="flex flex-col gap-1 shrink-0">
              <button
                onClick={() => setShowArmPanel(true)}
                disabled={isDisabled}
                className="px-3 h-8 rounded-lg text-[11px] font-medium bg-amber-600/15 text-amber-400 border border-amber-500/20 transition-colors disabled:opacity-40 hover:bg-amber-600/25"
              >
                Arm
              </button>
              <button
                onClick={() => setShowSkillPanel(true)}
                disabled={isDisabled}
                className="px-3 h-8 rounded-lg text-[11px] font-medium bg-green-600/15 text-green-400 border border-green-500/20 transition-colors disabled:opacity-40 hover:bg-green-600/25"
              >
                Skills
              </button>
            </div>
          </div>

          {/* Row 3: Emotions */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {EMOTIONS.map((e) => (
              <button
                key={e.id}
                onClick={() => handleEmotion(e.id)}
                disabled={isDisabled || robot.executingSkill}
                className="px-3 h-8 rounded-full text-[11px] font-medium bg-gray-800/50 text-gray-400 hover:bg-gray-700/60 border border-gray-700/20 transition-colors disabled:opacity-40 shrink-0"
              >
                {e.label}
              </button>
            ))}
          </div>

          {/* Row 4: E-Stop — always full width */}
          <button
            onClick={robot.estop}
            disabled={isDisabled}
            className="w-full h-11 bg-red-700 hover:bg-red-600 active:bg-red-800 border border-red-500/50 rounded-xl text-sm font-black uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg shadow-red-900/30 disabled:opacity-40"
          >
            E-STOP
          </button>

        </div>
      </div>

      {/* ── ArmPanel (slide-up overlay) ── */}
      {showArmPanel && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowArmPanel(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
            <div className="max-w-2xl mx-auto bg-gray-950 border-t border-gray-800 rounded-t-2xl p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Arm Control</h3>
                <button
                  onClick={() => setShowArmPanel(false)}
                  className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 flex items-center justify-center transition-colors"
                >
                  &times;
                </button>
              </div>

              {/* Sync + step selector */}
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={handleArmSyncFromRobot}
                  disabled={isDisabled}
                  className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors disabled:opacity-40"
                >
                  Read Current
                </button>
                <div className="flex-1" />
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">Step</span>
                {ARM_STEP_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setArmStepRadians(s)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      armStepRadians === s
                        ? "bg-amber-600 text-white"
                        : "bg-gray-800 text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {s}
                  </button>
                ))}
                <span className="text-[10px] text-gray-600">rad</span>
              </div>

              {/* Joint rows */}
              <div className="space-y-1 mb-4">
                {ARM_JOINTS.map((joint, i) => {
                  const value = targetJoints[i] ?? 0;
                  const atMin = value <= joint.min;
                  const atMax = value >= joint.max;
                  const positionRatio = (value - joint.min) / (joint.max - joint.min);
                  const jointBtnDisabled = isDisabled || robot.movingArm;

                  return (
                    <div key={i} className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-gray-500 w-[52px] shrink-0">J{i} {joint.name}</span>
                        <button
                          onClick={() => adjustJoint(i, -armStepRadians)}
                          disabled={jointBtnDisabled || atMin}
                          className="w-9 h-9 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-bold text-base transition-all disabled:opacity-25 disabled:cursor-not-allowed active:scale-90 shrink-0"
                        >
                          &minus;
                        </button>
                        <div className="flex-1 text-center font-mono text-xs text-gray-300 tabular-nums">
                          {value.toFixed(armStepRadians < 0.05 ? 3 : 2)}
                        </div>
                        <button
                          onClick={() => adjustJoint(i, armStepRadians)}
                          disabled={jointBtnDisabled || atMax}
                          className="w-9 h-9 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-bold text-base transition-all disabled:opacity-25 disabled:cursor-not-allowed active:scale-90 shrink-0"
                        >
                          +
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-[52px] shrink-0" />
                        <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden mx-[18px]">
                          <div
                            className="h-full bg-amber-600/60 rounded-full transition-all duration-100"
                            style={{ width: `${Math.max(1, positionRatio * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Duration + Move */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span>Duration</span>
                  <input
                    type="number"
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={armDuration}
                    onChange={(e) => setArmDuration(parseFloat(e.target.value) || 2)}
                    disabled={isDisabled || robot.movingArm}
                    className="w-14 px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-xs font-mono focus:outline-none focus:border-amber-500 disabled:opacity-50"
                  />
                  <span>s</span>
                </div>
                <div className="flex-1" />
                <button
                  onClick={() => robot.moveArmToJoints(targetJoints, armDuration)}
                  disabled={isDisabled || robot.movingArm}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {robot.movingArm ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Moving...
                    </span>
                  ) : (
                    "Move Arm"
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── SkillPanel (slide-up overlay) ── */}
      {showSkillPanel && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowSkillPanel(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
            <div className="max-w-2xl mx-auto bg-gray-950 border-t border-gray-800 rounded-t-2xl p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Skill Executor</h3>
                <button
                  onClick={() => setShowSkillPanel(false)}
                  className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 flex items-center justify-center transition-colors"
                >
                  &times;
                </button>
              </div>

              <select
                value={selectedSkillId}
                onChange={(e) => setSelectedSkillId(e.target.value)}
                disabled={isDisabled || robot.executingSkill}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500 disabled:opacity-50 mb-3"
              >
                <option value="">Select a skill...</option>
                {robot.availableSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.id}
                  </option>
                ))}
              </select>

              {selectedSkill && (
                <>
                  {selectedSkill.description && (
                    <p className="text-xs text-gray-500 mb-3">{selectedSkill.description}</p>
                  )}
                  <div className="relative mb-3">
                    <textarea
                      value={skillInputsJson}
                      onChange={(e) => {
                        setSkillInputsJson(e.target.value);
                        setSkillJsonError("");
                      }}
                      rows={5}
                      disabled={isDisabled || robot.executingSkill}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm font-mono focus:outline-none focus:border-cyan-500 disabled:opacity-50 resize-y"
                      placeholder='{"param": "value"}'
                    />
                    {skillJsonError && <p className="text-xs text-red-400 mt-1">{skillJsonError}</p>}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleSkillExecute}
                      disabled={isDisabled || robot.executingSkill || !selectedSkillId}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                    >
                      {robot.executingSkill ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Executing...
                        </span>
                      ) : (
                        "Execute"
                      )}
                    </button>
                    {robot.executingSkill && (
                      <button
                        onClick={robot.cancelSkill}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// ─── ConnectionBar ────────────────────────────────────────────────────────────

function ConnectionBar({
  connectionStatus,
  onConnect,
  onDisconnect,
}: {
  connectionStatus: ConnectionStatus;
  onConnect: (ip: string, port: number) => void;
  onDisconnect: () => void;
}) {
  const [robotIp, setRobotIp] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("mars_robot_ip") || "172.17.30.145" : "172.17.30.145"
  );
  const [port, setPort] = useState(() =>
    typeof window !== "undefined" ? parseInt(localStorage.getItem("mars_robot_port") || "9090") : 9090
  );

  const handleConnect = () => {
    localStorage.setItem("mars_robot_ip", robotIp);
    localStorage.setItem("mars_robot_port", String(port));
    onConnect(robotIp, port);
  };

  return (
    <div className="h-12 flex items-center gap-3 px-4 bg-gray-950/80 backdrop-blur border-b border-gray-800/50 shrink-0">
      <div className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[connectionStatus]}`} />
      <span className="text-xs font-mono text-gray-500">{connectionStatus}</span>
      <div className="flex-1" />
      <input
        type="text"
        value={robotIp}
        onChange={(e) => setRobotIp(e.target.value)}
        placeholder="Robot IP"
        disabled={connectionStatus === "connected" || connectionStatus === "connecting"}
        className="px-2.5 py-1 bg-gray-900 border border-gray-800/50 rounded-lg text-xs font-mono text-gray-300 w-36 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50 transition-colors"
      />
      <input
        type="number"
        value={port}
        onChange={(e) => setPort(parseInt(e.target.value) || 9090)}
        disabled={connectionStatus === "connected" || connectionStatus === "connecting"}
        className="px-2.5 py-1 bg-gray-900 border border-gray-800/50 rounded-lg text-xs font-mono text-gray-300 w-16 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50 transition-colors"
      />
      {connectionStatus === "connected" ? (
        <button
          onClick={onDisconnect}
          className="px-3 py-1 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 rounded-full text-xs font-medium transition-colors"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connectionStatus === "connecting"}
          className="px-3 py-1 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/30 rounded-full text-xs font-medium transition-colors disabled:opacity-50"
        >
          {connectionStatus === "connecting" ? "Connecting..." : "Connect"}
        </button>
      )}
    </div>
  );
}
