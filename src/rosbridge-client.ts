/**
 * Rosbridge v2.0 WebSocket client for MARS robots.
 *
 * Supports: topics (pub/sub), services, actions (goal/feedback/result),
 * and typed helpers for ExecuteSkill and GotoJS.
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

type MessageHandler = (message: RosbridgeMessage) => void;

/**
 * JSON.stringify that ensures whole numbers serialize as floats (e.g. 0 → "0.0").
 * Python's json.loads distinguishes int vs float, and Innate skill validation
 * rejects int where float is expected. Standard JSON.stringify(0.0) produces "0".
 */
function jsonStringifyWithFloats(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === "number" && Number.isFinite(value) && value === Math.floor(value)) {
      // Return a sentinel that we'll replace after stringify
      return `__FLOAT__${value.toFixed(1)}`;
    }
    return value;
  }).replace(/"__FLOAT__([^"]+)"/g, "$1");
}

export class RosbridgeClient {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
      onFeedback?: (feedback: RosbridgeMessage) => void;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();
  private subscriptions = new Map<string, Set<MessageHandler>>();
  private advertisedTopics = new Set<string>();
  private messageCounter = 0;
  private connectionUrl: string;

  constructor(
    robotIp: string,
    port = 9090,
  ) {
    this.connectionUrl = `ws://${robotIp}:${port}`;
  }

  /** Generate a unique message ID for request correlation. */
  private nextId(prefix = "tripoli"): string {
    return `${prefix}_${++this.messageCounter}_${Date.now()}`;
  }

  /** Connect to the rosbridge server. Resolves when the WebSocket is open. */
  connect(timeoutMs = 10_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Connection to ${this.connectionUrl} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.ws = new WebSocket(this.connectionUrl);

      this.ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };

      this.ws.onerror = (event) => {
        clearTimeout(timer);
        reject(new Error(`WebSocket error connecting to ${this.connectionUrl}: ${event}`));
      };

      this.ws.onclose = (event) => {
        clearTimeout(timer);
        // Reject pending requests
        for (const [id, pending] of this.pendingRequests) {
          pending.reject(new Error(`WebSocket closed (code ${event.code})`));
          if (pending.timer) clearTimeout(pending.timer);
        }
        this.pendingRequests.clear();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: RosbridgeMessage = JSON.parse(
            typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer),
          );
          this.handleMessage(message);
        } catch (err) {
          console.error("Failed to parse rosbridge message:", err);
        }
      };
    });
  }

  /** Close the WebSocket connection. */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Whether the WebSocket is currently open. */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Send a raw rosbridge message. */
  private send(message: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  /** Route incoming messages to the appropriate handler. */
  private handleMessage(message: RosbridgeMessage): void {
    const { op, id, topic } = message;

    // Topic message — dispatch to subscribers
    if (op === "publish" && topic) {
      const handlers = this.subscriptions.get(topic);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(message);
          } catch (err) {
            console.error(`Error in handler for topic ${topic}:`, err);
          }
        }
      }
      return;
    }

    // Service response
    if (op === "service_response" && id) {
      const pending = this.pendingRequests.get(id);
      if (pending) {
        this.pendingRequests.delete(id);
        if (pending.timer) clearTimeout(pending.timer);
        pending.resolve(message);
      }
      return;
    }

    // Action feedback
    if (op === "action_feedback" && id) {
      const pending = this.pendingRequests.get(id);
      if (pending?.onFeedback) {
        pending.onFeedback(message);
      }
      return;
    }

    // Action result
    if (op === "action_result" && id) {
      const pending = this.pendingRequests.get(id);
      if (pending) {
        this.pendingRequests.delete(id);
        if (pending.timer) clearTimeout(pending.timer);
        pending.resolve(message);
      }
      return;
    }
  }

  // ─── Topics ────────────────────────────────────────────────────────

  /** Advertise a topic (required before first publish). Idempotent. */
  advertise(topic: string, type: string): void {
    if (this.advertisedTopics.has(topic)) return;
    this.send({ op: "advertise", topic, type });
    this.advertisedTopics.add(topic);
  }

  /** Publish a message to a topic. Advertises first if needed. */
  publish(topic: string, type: string, msg: Record<string, unknown>): void {
    this.advertise(topic, type);
    this.send({ op: "publish", topic, msg });
  }

  /** Subscribe to a topic with an optional throttle rate. */
  subscribe(
    topic: string,
    handler: MessageHandler,
    options?: { throttleRateMs?: number; queueLength?: number },
  ): void {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
      const subscribeMsg: Record<string, unknown> = {
        op: "subscribe",
        topic,
      };
      if (options?.throttleRateMs) {
        subscribeMsg.throttle_rate = options.throttleRateMs;
      }
      if (options?.queueLength) {
        subscribeMsg.queue_length = options.queueLength;
      }
      this.send(subscribeMsg);
    }
    this.subscriptions.get(topic)!.add(handler);
  }

  /** Unsubscribe a handler from a topic. Sends unsubscribe when last handler removed. */
  unsubscribe(topic: string, handler: MessageHandler): void {
    const handlers = this.subscriptions.get(topic);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) {
      this.subscriptions.delete(topic);
      this.send({ op: "unsubscribe", topic });
    }
  }

  /**
   * Subscribe and wait for the first message on a topic.
   * Useful for latched topics like /brain/available_skills.
   */
  waitForMessage(topic: string, timeoutMs = 10_000): Promise<RosbridgeMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.unsubscribe(topic, handler);
        reject(new Error(`Timed out waiting for message on ${topic} after ${timeoutMs}ms`));
      }, timeoutMs);

      const handler = (message: RosbridgeMessage) => {
        clearTimeout(timer);
        this.unsubscribe(topic, handler);
        resolve(message);
      };

      this.subscribe(topic, handler);
    });
  }

  // ─── Services ──────────────────────────────────────────────────────

  /** Call a ROS2 service and wait for the response. */
  callService(
    service: string,
    args?: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId("svc");
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Service call to ${service} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.send({ op: "call_service", id, service, args });
    });
  }

  // ─── Actions ───────────────────────────────────────────────────────

  /** Send an action goal and wait for the result. */
  sendActionGoal(
    action: string,
    actionType: string,
    goal: Record<string, unknown>,
    options?: {
      onFeedback?: (feedback: RosbridgeMessage) => void;
      timeoutMs?: number;
    },
  ): Promise<unknown> {
    const timeoutMs = options?.timeoutMs ?? 60_000;
    return new Promise((resolve, reject) => {
      const id = this.nextId("action");
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Action goal on ${action} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        onFeedback: options?.onFeedback,
        timer,
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

  /** Cancel a running action goal. */
  cancelActionGoal(action: string, goalId: string): void {
    this.send({
      op: "cancel_action_goal",
      action,
      id: goalId,
    });
  }

  // ─── Typed Helpers ─────────────────────────────────────────────────

  private static readonly ARM_MOVEMENT_SKILLS = new Set([
    "innate-os/arm_move_to_xyz",
    "innate-os/arm_zero_position",
    "innate-os/arm_circle_motion",
  ]);

  /**
   * Check arm torque status and enable it if disabled.
   * Reads /mars/arm/status for is_torque_enabled, then calls
   * arm_utils torque_on if needed.
   */
  async ensureArmTorqueEnabled(): Promise<void> {
    const statusMsg = await this.waitForMessage("/mars/arm/status", 5_000);
    const isTorqueEnabled = (statusMsg.msg as Record<string, unknown>)?.is_torque_enabled;
    if (isTorqueEnabled) return;

    console.log("[tripoli] Arm torque is off — enabling before move...");
    await this.sendActionGoal(
      "/execute_skill",
      "brain_messages/action/ExecuteSkill",
      {
        skill_type: "innate-os/arm_utils",
        inputs: jsonStringifyWithFloats({ command: "torque_on" }),
      },
      { timeoutMs: 10_000 },
    );
    console.log("[tripoli] Arm torque enabled.");
  }

  /**
   * Execute a skill via /execute_skill.
   *
   * Enforces the correct field names (skill_type, inputs) so no one
   * can accidentally use skill_id/parameters.
   */
  async executeSkill(
    skillType: string,
    inputs: Record<string, unknown>,
    options?: {
      onFeedback?: (feedback: RosbridgeMessage) => void;
      timeoutMs?: number;
    },
  ): Promise<unknown> {
    if (RosbridgeClient.ARM_MOVEMENT_SKILLS.has(skillType)) {
      await this.ensureArmTorqueEnabled();
    }
    return this.sendActionGoal(
      "/execute_skill",
      "brain_messages/action/ExecuteSkill",
      {
        skill_type: skillType,
        inputs: jsonStringifyWithFloats(inputs),
      },
      options,
    );
  }

  /**
   * Move the arm to target joint positions via /mars/arm/goto_js service.
   *
   * Uses the correct nested Float64MultiArray format:
   * { data: { data: [...joints] }, time: durationSeconds }
   */
  async callGotoJS(
    jointPositions: number[],
    durationSeconds: number,
    timeoutMs = 30_000,
  ): Promise<unknown> {
    if (jointPositions.length !== 6) {
      throw new Error(`Expected 6 joint positions, got ${jointPositions.length}`);
    }
    await this.ensureArmTorqueEnabled();
    return this.callService(
      "/mars/arm/goto_js",
      { data: { data: jointPositions }, time: durationSeconds },
      timeoutMs,
    );
  }
}
