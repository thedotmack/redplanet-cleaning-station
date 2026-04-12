/**
 * Browser-compatible Rosbridge v2.0 WebSocket client.
 * Mirrors the API from tripoli/src/rosbridge-client.ts but uses browser WebSocket.
 *
 * Key patterns (from rosbridge-client.ts):
 * - executeSkill uses skill_type/inputs (NOT skill_id/parameters)
 * - jsonStringifyWithFloats ensures 0 → 0.0 for Python compatibility
 * - GotoJS uses nested {data: {data: [...]}} format
 */

export interface RosbridgeMessage {
  op: string;
  id?: string;
  topic?: string;
  msg?: Record<string, unknown>;
  service?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  values?: unknown;
  action?: string;
  action_type?: string;
  goal?: Record<string, unknown>;
  feedback?: unknown;
  [key: string]: unknown;
}

export interface SkillInfo {
  id: string;
  name: string;
  type: string;
  inputs_json: string;
  description?: string;
}

type MessageHandler = (message: RosbridgeMessage) => void;

/** Ensure whole numbers serialize as floats (0 → 0.0) for Python compatibility */
function jsonStringifyWithFloats(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === "number" && Number.isFinite(value) && value === Math.floor(value)) {
      return parseFloat(value.toFixed(1));
    }
    return value;
  });
}

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
  ARM_CAMERA: "/mars/arm/image_raw/compressed",
  MAIN_CAMERA: "/mars/main_camera/left/image_raw/compressed",
} as const;

export const MessageTypes = {
  TWIST: "geometry_msgs/msg/Twist",
  ODOMETRY: "nav_msgs/msg/Odometry",
  STRING: "std_msgs/msg/String",
  INT32: "std_msgs/msg/Int32",
  JOINT_STATE: "sensor_msgs/msg/JointState",
  BATTERY_STATE: "sensor_msgs/msg/BatteryState",
  LASER_SCAN: "sensor_msgs/msg/LaserScan",
  COMPRESSED_IMAGE: "sensor_msgs/msg/CompressedImage",
} as const;

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

export const SPEED_CAPS = {
  MAX_LINEAR_MPS: 0.3,
  MAX_ANGULAR_RADPS: 1.0,
} as const;

export class BrowserRosbridgeClient {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    onFeedback?: (feedback: RosbridgeMessage) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private subscriptions = new Map<string, Set<MessageHandler>>();
  private advertisedTopics = new Set<string>();
  private messageCounter = 0;
  private connectionUrl: string;

  public lastActionId: string | null = null;

  constructor(robotIp: string, port = 9090) {
    this.connectionUrl = `ws://${robotIp}:${port}`;
  }

  connect(timeoutMs = 10_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Connection timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        this.ws = new WebSocket(this.connectionUrl);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
        return;
      }

      this.ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };

      this.ws.onerror = (event) => {
        clearTimeout(timer);
        reject(new Error(`WebSocket error: ${event}`));
      };

      this.ws.onclose = () => {
        clearTimeout(timer);
        for (const [, req] of this.pendingRequests) {
          clearTimeout(req.timer);
          req.reject(new Error("WebSocket closed"));
        }
        this.pendingRequests.clear();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: RosbridgeMessage = JSON.parse(event.data as string);
          this.handleMessage(message);
        } catch {
          // ignore parse errors
        }
      };
    });
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.advertisedTopics.clear();
    this.subscriptions.clear();
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private nextId(prefix = "mars-control"): string {
    return `${prefix}_${++this.messageCounter}_${Date.now()}`;
  }

  private send(message: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(message: RosbridgeMessage): void {
    if (message.op === "publish" && message.topic) {
      const handlers = this.subscriptions.get(message.topic);
      if (handlers) {
        for (const handler of handlers) {
          handler(message);
        }
      }
    } else if (message.op === "service_response" && message.id) {
      const req = this.pendingRequests.get(message.id);
      if (req) {
        clearTimeout(req.timer);
        this.pendingRequests.delete(message.id);
        req.resolve(message);
      }
    } else if (message.op === "action_feedback" && message.id) {
      const req = this.pendingRequests.get(message.id);
      if (req?.onFeedback) {
        req.onFeedback(message);
      }
    } else if (message.op === "action_result" && message.id) {
      const req = this.pendingRequests.get(message.id);
      if (req) {
        clearTimeout(req.timer);
        this.pendingRequests.delete(message.id);
        req.resolve(message);
      }
    }
  }

  advertise(topic: string, type: string): void {
    if (this.advertisedTopics.has(topic)) return;
    this.send({ op: "advertise", topic, type });
    this.advertisedTopics.add(topic);
  }

  publish(topic: string, type: string, msg: Record<string, unknown>): void {
    this.advertise(topic, type);
    this.send({ op: "publish", topic, msg });
  }

  subscribe(topic: string, handler: MessageHandler, options?: { throttleRateMs?: number; queueLength?: number; type?: string }): void {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
      this.send({
        op: "subscribe",
        topic,
        ...(options?.type && { type: options.type }),
        ...(options?.throttleRateMs && { throttle_rate: options.throttleRateMs }),
        ...(options?.queueLength && { queue_length: options.queueLength }),
      });
    }
    this.subscriptions.get(topic)!.add(handler);
  }

  unsubscribe(topic: string, handler: MessageHandler): void {
    const handlers = this.subscriptions.get(topic);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscriptions.delete(topic);
        this.send({ op: "unsubscribe", topic });
      }
    }
  }

  waitForMessage(topic: string, timeoutMs = 10_000, subscribeOptions?: { type?: string }): Promise<RosbridgeMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.unsubscribe(topic, handler);
        reject(new Error(`Timed out waiting for message on ${topic} after ${timeoutMs}ms`));
      }, timeoutMs);

      const handler: MessageHandler = (message) => {
        clearTimeout(timer);
        this.unsubscribe(topic, handler);
        resolve(message);
      };

      this.subscribe(topic, handler, subscribeOptions);
    });
  }

  callService(service: string, args?: Record<string, unknown>, timeoutMs = 30_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId("service");
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Service call ${service} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.send({ op: "call_service", id, service, args: args || {} });
    });
  }

  sendActionGoal(
    action: string,
    actionType: string,
    goal: Record<string, unknown>,
    options?: { onFeedback?: (feedback: RosbridgeMessage) => void; timeoutMs?: number }
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId("action");
      this.lastActionId = id;
      const timeoutMs = options?.timeoutMs ?? 60_000;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Action ${action} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timer,
        onFeedback: options?.onFeedback,
      });

      this.send({
        op: "send_action_goal",
        id,
        action,
        action_type: actionType,
        goal,
      });
    });
  }

  cancelActionGoal(action: string, goalId: string): void {
    try {
      this.send({ op: "cancel_action_goal", action, id: goalId });
    } catch {
      // ignore if not connected
    }
  }

  executeSkill(
    skillType: string,
    inputs: Record<string, unknown>,
    options?: { onFeedback?: (feedback: RosbridgeMessage) => void; timeoutMs?: number }
  ): Promise<unknown> {
    return this.sendActionGoal(
      "/execute_skill",
      "brain_messages/action/ExecuteSkill",
      {
        skill_type: skillType,
        inputs: jsonStringifyWithFloats(inputs),
      },
      options
    );
  }

  cancelCurrentSkill(): void {
    if (this.lastActionId) {
      this.cancelActionGoal("/execute_skill", this.lastActionId);
      this.lastActionId = null;
    }
  }

  /** Move arm to joint positions via /mars/arm/goto_js service.
   *  Uses nested Float64MultiArray format: {data: {data: [...]}} */
  callGotoJS(jointPositions: number[], durationSeconds: number, timeoutMs = 30_000): Promise<unknown> {
    if (jointPositions.length !== 6) {
      throw new Error(`Expected 6 joint positions, got ${jointPositions.length}`);
    }
    return this.callService("/mars/arm/goto_js", {
      data: { data: jointPositions },
      time: durationSeconds,
    }, timeoutMs);
  }
}
