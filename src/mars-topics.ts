/**
 * MARS robot topic names, message types, and typed constants.
 *
 * Use these instead of string literals to avoid silent failures
 * from topic name typos (sharp edge #3).
 */

// ─── Topic Names ─────────────────────────────────────────────────────

export const Topics = {
  CMD_VEL: "/cmd_vel",
  ODOM: "/odom",
  AVAILABLE_SKILLS: "/brain/available_skills",
  CHAT_IN: "/brain/chat_in",
  CHAT_OUT: "/brain/chat_out",
  TTS: "/brain/tts",
  SKILL_STATUS_UPDATE: "/brain/skill_status_update",
  ARM_STATE: "/mars/arm/state",
  ARM_STATUS: "/mars/arm/status",
  HEAD_SET_POSITION: "/mars/head/set_position",
  HEAD_CURRENT_POSITION: "/mars/head/current_position",
  JOINT_STATES: "/joint_states",
  BATTERY_STATE: "/battery_state",
  SCAN: "/scan",
  WS_MESSAGES: "/ws_messages",
  WS_OUTGOING: "/ws_outgoing",
} as const;

// ─── Message Types ───────────────────────────────────────────────────

export const MessageTypes = {
  TWIST: "geometry_msgs/msg/Twist",
  ODOMETRY: "nav_msgs/msg/Odometry",
  STRING: "std_msgs/msg/String",
  INT32: "std_msgs/msg/Int32",
  JOINT_STATE: "sensor_msgs/msg/JointState",
  BATTERY_STATE: "sensor_msgs/msg/BatteryState",
  LASER_SCAN: "sensor_msgs/msg/LaserScan",
} as const;

// ─── Action Types ────────────────────────────────────────────────────

export const ActionTypes = {
  EXECUTE_SKILL: "brain_messages/action/ExecuteSkill",
} as const;

export const ActionNames = {
  EXECUTE_SKILL: "/execute_skill",
} as const;

// ─── Skill IDs ───────────────────────────────────────────────────────

export const SkillIds = {
  ARM_MOVE_TO_XYZ: "innate-os/arm_move_to_xyz",
  NAVIGATE_TO_POSITION: "innate-os/navigate_to_position",
  ARM_UTILS: "innate-os/arm_utils",
  ARM_ZERO_POSITION: "innate-os/arm_zero_position",
  NAVIGATE_WITH_VISION: "innate-os/navigate_with_vision",
  ARM_CIRCLE_MOTION: "innate-os/arm_circle_motion",
  HEAD_EMOTION: "innate-os/head_emotion",
  ORBITAL_SHOT: "innate-os/orbital_shot",
} as const;

// ─── Service Names ───────────────────────────────────────────────────

export const ServiceNames = {
  GOTO_JS: "/mars/arm/goto_js",
  GOTO_JS_TRAJECTORY: "/mars/arm/goto_js_trajectory",
} as const;

// ─── Typed Shapes ────────────────────────────────────────────────────

export interface TwistMessage {
  linear: { x: number; y: number; z: number };
  angular: { x: number; y: number; z: number };
}

export interface ArmState {
  name: string[];
  position: number[];
  velocity: number[];
  effort: number[];
}

export interface SkillInfo {
  id: string;
  name: string;
  type: string;
  inputs_json: string;
  description?: string;
}

export interface AvailableSkillsMessage {
  skills: SkillInfo[];
}

/** Speed safety caps per CLAUDE.md */
export const SPEED_CAPS = {
  MAX_LINEAR_MPS: 0.3,
  MAX_ANGULAR_RADPS: 1.0,
} as const;
