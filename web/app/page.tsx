"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRobot, type LogEntry, type ConnectionStatus } from "./hooks/useRobot";
import { SkillIds, SPEED_CAPS, type SkillInfo } from "./lib/rosbridge";

// ─── Connection Bar ────────────────────────────────────────────────────────────

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

  const statusColor = {
    disconnected: "bg-gray-500",
    connecting: "bg-yellow-500 animate-pulse",
    connected: "bg-green-500",
    error: "bg-red-500",
  }[connectionStatus];

  return (
    <div className="flex items-center gap-3 p-4 bg-gray-900 border-b border-gray-800">
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${statusColor}`} />
        <span className="text-sm font-mono text-gray-400 uppercase">{connectionStatus}</span>
      </div>
      <div className="flex-1" />
      <input
        type="text"
        value={robotIp}
        onChange={(e) => setRobotIp(e.target.value)}
        placeholder="Robot IP"
        disabled={connectionStatus === "connected" || connectionStatus === "connecting"}
        className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm font-mono w-40 focus:outline-none focus:border-blue-500 disabled:opacity-50"
      />
      <input
        type="number"
        value={port}
        onChange={(e) => setPort(parseInt(e.target.value) || 9090)}
        disabled={connectionStatus === "connected" || connectionStatus === "connecting"}
        className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm font-mono w-20 focus:outline-none focus:border-blue-500 disabled:opacity-50"
      />
      {connectionStatus === "connected" ? (
        <button onClick={onDisconnect} className="px-4 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition-colors">
          Disconnect
        </button>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connectionStatus === "connecting"}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          {connectionStatus === "connecting" ? "Connecting..." : "Connect"}
        </button>
      )}
    </div>
  );
}

// ─── Drive Controls ────────────────────────────────────────────────────────────

function DriveControls({
  onDrive,
  onStop,
  activeKeys,
  disabled,
}: {
  onDrive: (linearX: number, angularZ: number) => void;
  onStop: () => void;
  activeKeys: Set<string>;
  disabled: boolean;
}) {
  const [speed, setSpeed] = useState(0.15);

  const handleDriveButton = (linearX: number, angularZ: number) => {
    onDrive(linearX * speed, angularZ * speed * (SPEED_CAPS.MAX_ANGULAR_RADPS / SPEED_CAPS.MAX_LINEAR_MPS));
  };

  const btnClass = (key: string) =>
    `w-14 h-14 rounded-lg font-bold text-lg transition-all ${
      activeKeys.has(key)
        ? "bg-blue-500 text-white scale-95 shadow-lg shadow-blue-500/30"
        : "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
    } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer active:scale-95"}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Drive</h3>
        <span className="text-xs text-gray-500 font-mono">WASD</span>
      </div>

      <div className="flex flex-col items-center gap-1">
        <button
          className={btnClass("w")}
          onPointerDown={() => handleDriveButton(1, 0)}
          onPointerUp={onStop}
          onPointerLeave={onStop}
          disabled={disabled}
        >
          W
        </button>
        <div className="flex gap-1">
          <button
            className={btnClass("a")}
            onPointerDown={() => handleDriveButton(0, 1)}
            onPointerUp={onStop}
            onPointerLeave={onStop}
            disabled={disabled}
          >
            A
          </button>
          <button
            className="w-14 h-14 rounded-lg bg-gray-800/50 border border-gray-800 flex items-center justify-center"
            onClick={onStop}
            disabled={disabled}
          >
            <div className="w-3 h-3 rounded-full bg-gray-600" />
          </button>
          <button
            className={btnClass("d")}
            onPointerDown={() => handleDriveButton(0, -1)}
            onPointerUp={onStop}
            onPointerLeave={onStop}
            disabled={disabled}
          >
            D
          </button>
        </div>
        <button
          className={btnClass("s")}
          onPointerDown={() => handleDriveButton(-1, 0)}
          onPointerUp={onStop}
          onPointerLeave={onStop}
          disabled={disabled}
        >
          S
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Speed</span>
          <span className="font-mono">{speed.toFixed(2)} m/s</span>
        </div>
        <input
          type="range"
          min={0.05}
          max={SPEED_CAPS.MAX_LINEAR_MPS}
          step={0.01}
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="w-full accent-blue-500"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// ─── Head Tilt ─────────────────────────────────────────────────────────────────

function HeadTilt({
  onSetTilt,
  disabled,
}: {
  onSetTilt: (degrees: number) => void;
  disabled: boolean;
}) {
  const [tilt, setTilt] = useState(0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Head Tilt</h3>
        <span className="text-xs font-mono text-gray-500">{tilt}°</span>
      </div>
      <input
        type="range"
        min={-25}
        max={25}
        step={1}
        value={tilt}
        onChange={(e) => {
          const val = parseInt(e.target.value);
          setTilt(val);
          onSetTilt(val);
        }}
        className="w-full accent-blue-500"
        disabled={disabled}
      />
      <div className="flex justify-between text-xs text-gray-600">
        <span>-25°</span>
        <span>0°</span>
        <span>25°</span>
      </div>
    </div>
  );
}

// ─── Quick Actions ─────────────────────────────────────────────────────────────

function QuickActions({
  onEmotion,
  onSpeak,
  executingSkill,
  disabled,
}: {
  onEmotion: (emotion: string) => void;
  onSpeak: (text: string) => void;
  executingSkill: boolean;
  disabled: boolean;
}) {
  const [ttsText, setTtsText] = useState("");
  const emotions = [
    { id: "happy", label: "Happy" },
    { id: "sad", label: "Sad" },
    { id: "excited", label: "Excited" },
    { id: "surprised", label: "Surprised" },
    { id: "angry", label: "Angry" },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Quick Actions</h3>

      <div className="space-y-2">
        <span className="text-xs text-gray-500">Emotions</span>
        <div className="flex flex-wrap gap-1.5">
          {emotions.map((e) => (
            <button
              key={e.id}
              onClick={() => onEmotion(e.id)}
              disabled={disabled || executingSkill}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs font-medium transition-colors disabled:opacity-40"
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs text-gray-500">Text-to-Speech</span>
        <div className="flex gap-2">
          <input
            type="text"
            value={ttsText}
            onChange={(e) => setTtsText(e.target.value)}
            placeholder="Say something..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && ttsText.trim()) {
                onSpeak(ttsText.trim());
                setTtsText("");
              }
            }}
            disabled={disabled}
            className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            onClick={() => {
              if (ttsText.trim()) {
                onSpeak(ttsText.trim());
                setTtsText("");
              }
            }}
            disabled={disabled || !ttsText.trim()}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium transition-colors disabled:opacity-40"
          >
            Speak
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Camera View ──────────────────────────────────────────────────────────────

function CameraView({
  label,
  cameraFrame,
  cameraStreaming,
  onCapturePhoto,
  onToggleStream,
  disabled,
}: {
  label: string;
  cameraFrame: string | null;
  cameraStreaming: boolean;
  onCapturePhoto: () => void;
  onToggleStream: () => void;
  disabled: boolean;
}) {
  const downloadPhoto = () => {
    if (!cameraFrame) return;
    const link = document.createElement("a");
    link.href = cameraFrame;
    link.download = `${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">{label}</h3>
        {cameraStreaming && (
          <span className="text-xs text-red-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </span>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden aspect-[4/3] flex items-center justify-center">
        {cameraFrame ? (
          <img src={cameraFrame} alt={label} className="w-full h-full object-contain" />
        ) : (
          <span className="text-gray-700 text-sm">No image</span>
        )}
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={cameraStreaming ? downloadPhoto : onCapturePhoto}
          disabled={disabled || (cameraStreaming && !cameraFrame)}
          className="flex-1 px-2 py-1.5 bg-cyan-600 hover:bg-cyan-700 rounded text-xs font-medium transition-colors disabled:opacity-40"
        >
          {cameraStreaming ? "Save" : "Photo"}
        </button>
        {cameraFrame && (
          <button
            onClick={downloadPhoto}
            disabled={disabled}
            className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium transition-colors disabled:opacity-40"
            title="Download"
          >
            DL
          </button>
        )}
        <button
          onClick={onToggleStream}
          disabled={disabled}
          className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40 ${
            cameraStreaming
              ? "bg-red-600 hover:bg-red-700"
              : "bg-cyan-600 hover:bg-cyan-700"
          }`}
        >
          {cameraStreaming ? "Stop" : "Stream"}
        </button>
      </div>
    </div>
  );
}

// ─── Arm Joint Control ────────────────────────────────────────────────────────

const JOINT_NAMES = ["Base", "Shoulder", "Elbow", "Wrist 1", "Wrist 2", "Wrist 3"];
const JOINT_LIMITS = [
  { min: -3.14, max: 3.14 },
  { min: -3.14, max: 3.14 },
  { min: -3.14, max: 3.14 },
  { min: -3.14, max: 3.14 },
  { min: -3.14, max: 3.14 },
  { min: -3.14, max: 3.14 },
];

function ArmControl({
  armJoints,
  movingArm,
  onReadState,
  onMoveJoints,
  disabled,
}: {
  armJoints: number[];
  movingArm: boolean;
  onReadState: () => void;
  onMoveJoints: (joints: number[], duration: number) => void;
  disabled: boolean;
}) {
  const [targetJoints, setTargetJoints] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [duration, setDuration] = useState(2.0);
  const [synced, setSynced] = useState(false);

  const handleSyncFromRobot = () => {
    onReadState();
    setSynced(true);
  };

  // Sync target joints when arm state updates (after read)
  useEffect(() => {
    if (synced) {
      setTargetJoints([...armJoints]);
      setSynced(false);
    }
  }, [armJoints, synced]);

  const updateJoint = (index: number, value: number) => {
    setTargetJoints((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Arm Joints</h3>
        <button
          onClick={handleSyncFromRobot}
          disabled={disabled}
          className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded transition-colors disabled:opacity-40"
        >
          Read Current
        </button>
      </div>

      <div className="space-y-2">
        {JOINT_NAMES.map((name, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">J{i} — {name}</span>
              <span className="text-gray-400 font-mono">{targetJoints[i]?.toFixed(3)} rad</span>
            </div>
            <input
              type="range"
              min={JOINT_LIMITS[i].min}
              max={JOINT_LIMITS[i].max}
              step={0.01}
              value={targetJoints[i] ?? 0}
              onChange={(e) => updateJoint(i, parseFloat(e.target.value))}
              disabled={disabled || movingArm}
              className="w-full accent-amber-500"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>Duration</span>
          <input
            type="number"
            min={0.5}
            max={10}
            step={0.5}
            value={duration}
            onChange={(e) => setDuration(parseFloat(e.target.value) || 2)}
            disabled={disabled || movingArm}
            className="w-14 px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-xs font-mono focus:outline-none focus:border-amber-500 disabled:opacity-50"
          />
          <span>s</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => onMoveJoints(targetJoints, duration)}
          disabled={disabled || movingArm}
          className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 rounded text-sm font-medium transition-colors disabled:opacity-40"
        >
          {movingArm ? (
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
  );
}

// ─── Skill Executor ────────────────────────────────────────────────────────────

function SkillExecutor({
  availableSkills,
  onExecute,
  onCancel,
  executingSkill,
  disabled,
}: {
  availableSkills: SkillInfo[];
  onExecute: (skillType: string, inputs: Record<string, unknown>) => void;
  onCancel: () => void;
  executingSkill: boolean;
  disabled: boolean;
}) {
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [inputsJson, setInputsJson] = useState("{}");
  const [jsonError, setJsonError] = useState("");

  const selectedSkill = availableSkills.find((s) => s.id === selectedSkillId);

  // When skill selection changes, pre-fill input template
  useEffect(() => {
    if (selectedSkill?.inputs_json) {
      try {
        const schema = JSON.parse(selectedSkill.inputs_json);
        // Build template from schema properties
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
        setInputsJson(JSON.stringify(template, null, 2));
        setJsonError("");
      } catch {
        setInputsJson("{}");
      }
    } else {
      setInputsJson("{}");
    }
  }, [selectedSkillId, selectedSkill]);

  const handleExecute = () => {
    try {
      const inputs = JSON.parse(inputsJson);
      setJsonError("");
      onExecute(selectedSkillId, inputs);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Skill Executor</h3>

      <select
        value={selectedSkillId}
        onChange={(e) => setSelectedSkillId(e.target.value)}
        disabled={disabled || executingSkill}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
      >
        <option value="">Select a skill...</option>
        {availableSkills.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name || s.id}
          </option>
        ))}
      </select>

      {selectedSkill && (
        <>
          {selectedSkill.description && (
            <p className="text-xs text-gray-500">{selectedSkill.description}</p>
          )}
          <div className="relative">
            <textarea
              value={inputsJson}
              onChange={(e) => {
                setInputsJson(e.target.value);
                setJsonError("");
              }}
              rows={5}
              disabled={disabled || executingSkill}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm font-mono focus:outline-none focus:border-blue-500 disabled:opacity-50 resize-y"
              placeholder='{"param": "value"}'
            />
            {jsonError && <p className="text-xs text-red-400 mt-1">{jsonError}</p>}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleExecute}
              disabled={disabled || executingSkill || !selectedSkillId}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium transition-colors disabled:opacity-40"
            >
              {executingSkill ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Executing...
                </span>
              ) : (
                "Execute"
              )}
            </button>
            {executingSkill && (
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── E-Stop ────────────────────────────────────────────────────────────────────

function EStopButton({ onEstop, disabled }: { onEstop: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onEstop}
      disabled={disabled}
      className="w-full py-4 bg-red-700 hover:bg-red-600 active:bg-red-800 border-2 border-red-500 rounded-lg text-xl font-black uppercase tracking-widest transition-all disabled:opacity-40 active:scale-[0.98] shadow-lg shadow-red-900/50"
    >
      E-STOP (Space)
    </button>
  );
}

// ─── Log Panel ─────────────────────────────────────────────────────────────────

function LogPanel({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const typeStyles: Record<LogEntry["type"], string> = {
    info: "text-gray-400",
    error: "text-red-400",
    feedback: "text-yellow-400",
    result: "text-green-400",
  };

  const typePrefix: Record<LogEntry["type"], string> = {
    info: "INFO",
    error: "ERR ",
    feedback: "FEED",
    result: "RSLT",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Log</h3>
        <button onClick={onClear} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
          Clear
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-gray-950 border border-gray-800 rounded-lg p-2 font-mono text-xs space-y-0.5 min-h-[120px] max-h-[300px]"
      >
        {logs.length === 0 ? (
          <p className="text-gray-700 italic">No logs yet. Connect to the robot to begin.</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`${typeStyles[log.type]} break-all`}>
              <span className="text-gray-600">{new Date(log.timestamp).toLocaleTimeString()}</span>{" "}
              <span className="text-gray-500">[{typePrefix[log.type]}]</span>{" "}
              {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const robot = useRobot();
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const activeKeysRef = useRef<Set<string>>(new Set());
  const driveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDisabled = robot.connectionStatus !== "connected";

  // Extract stable function refs to avoid effect re-runs
  const { publishCmdVel, stopDriving, estop } = robot;

  // Keyboard drive controls
  const updateDriveFromKeys = useCallback(() => {
    const keys = activeKeysRef.current;
    let linearX = 0;
    let angularZ = 0;
    const speed = 0.15;

    if (keys.has("w")) linearX += speed;
    if (keys.has("s")) linearX -= speed;
    if (keys.has("a")) angularZ += speed * (SPEED_CAPS.MAX_ANGULAR_RADPS / SPEED_CAPS.MAX_LINEAR_MPS);
    if (keys.has("d")) angularZ -= speed * (SPEED_CAPS.MAX_ANGULAR_RADPS / SPEED_CAPS.MAX_LINEAR_MPS);

    if (linearX !== 0 || angularZ !== 0) {
      publishCmdVel(linearX, angularZ);
    }
  }, [publishCmdVel]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === " ") {
        e.preventDefault();
        estop();
        return;
      }

      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key) && !activeKeysRef.current.has(key)) {
        activeKeysRef.current.add(key);
        setActiveKeys(new Set(activeKeysRef.current));

        // Start drive loop if not running
        if (!driveIntervalRef.current) {
          driveIntervalRef.current = setInterval(updateDriveFromKeys, 100); // 10Hz
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key)) {
        activeKeysRef.current.delete(key);
        setActiveKeys(new Set(activeKeysRef.current));

        // Stop drive loop if no keys pressed
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

  const handleEmotion = (emotion: string) => {
    robot.executeSkill(SkillIds.HEAD_EMOTION, { emotion });
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Connection Bar */}
      <ConnectionBar
        connectionStatus={robot.connectionStatus}
        onConnect={robot.connect}
        onDisconnect={robot.disconnect}
      />

      {/* Main Content */}
      <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-[240px_1fr_280px] gap-4 max-w-7xl mx-auto w-full">
        {/* Left Column — Drive + Head + Quick Actions */}
        <div className="space-y-6">
          <DriveControls
            onDrive={robot.publishCmdVel}
            onStop={robot.stopDriving}
            activeKeys={activeKeys}
            disabled={isDisabled}
          />

          <HeadTilt onSetTilt={robot.setHeadTilt} disabled={isDisabled} />

          <QuickActions
            onEmotion={handleEmotion}
            onSpeak={robot.speak}
            executingSkill={robot.executingSkill}
            disabled={isDisabled}
          />
        </div>

        {/* Middle Column — Cameras + Arm */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <CameraView
              label="Main Camera"
              cameraFrame={robot.mainCameraFrame}
              cameraStreaming={robot.mainCameraStreaming}
              onCapturePhoto={robot.captureMainPhoto}
              onToggleStream={robot.toggleMainCameraStream}
              disabled={isDisabled}
            />
            <CameraView
              label="Arm Camera"
              cameraFrame={robot.armCameraFrame}
              cameraStreaming={robot.armCameraStreaming}
              onCapturePhoto={robot.captureArmPhoto}
              onToggleStream={robot.toggleArmCameraStream}
              disabled={isDisabled}
            />
          </div>

          <ArmControl
            armJoints={robot.armJoints}
            movingArm={robot.movingArm}
            onReadState={robot.readArmState}
            onMoveJoints={robot.moveArmToJoints}
            disabled={isDisabled}
          />
        </div>

        {/* Right Column — Skills + E-Stop + Log */}
        <div className="space-y-4">
          <SkillExecutor
            availableSkills={robot.availableSkills}
            onExecute={robot.executeSkill}
            onCancel={robot.cancelSkill}
            executingSkill={robot.executingSkill}
            disabled={isDisabled}
          />

          {/* E-Stop */}
          <EStopButton onEstop={robot.estop} disabled={isDisabled} />

          {/* Log */}
          <LogPanel logs={robot.logs} onClear={robot.clearLogs} />
        </div>
      </div>

      {/* Footer */}
      <div className="p-2 text-center text-xs text-gray-700 border-t border-gray-900">
        MARS Robot Control — Tripoli Rosbridge Client
      </div>
    </div>
  );
}
