(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/web/app/lib/rosbridge.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Browser-compatible Rosbridge v2.0 WebSocket client.
 * Mirrors the API from tripoli/src/rosbridge-client.ts but uses browser WebSocket.
 *
 * Key patterns (from rosbridge-client.ts):
 * - executeSkill uses skill_type/inputs (NOT skill_id/parameters)
 * - jsonStringifyWithFloats ensures 0 → 0.0 for Python compatibility
 * - GotoJS uses nested {data: {data: [...]}} format
 */ __turbopack_context__.s([
    "BrowserRosbridgeClient",
    ()=>BrowserRosbridgeClient,
    "MessageTypes",
    ()=>MessageTypes,
    "SPEED_CAPS",
    ()=>SPEED_CAPS,
    "SkillIds",
    ()=>SkillIds,
    "Topics",
    ()=>Topics
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f40$swc$2f$helpers$2f$esm$2f$_define_property$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/node_modules/@swc/helpers/esm/_define_property.js [app-client] (ecmascript)");
;
/** Ensure whole numbers serialize as floats (0 → 0.0) for Python compatibility */ function jsonStringifyWithFloats(obj) {
    return JSON.stringify(obj, (_key, value)=>{
        if (typeof value === "number" && Number.isFinite(value) && value === Math.floor(value)) {
            return parseFloat(value.toFixed(1));
        }
        return value;
    });
}
const Topics = {
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
    MAIN_CAMERA: "/mars/main_camera/left/image_raw/compressed"
};
const MessageTypes = {
    TWIST: "geometry_msgs/msg/Twist",
    ODOMETRY: "nav_msgs/msg/Odometry",
    STRING: "std_msgs/msg/String",
    INT32: "std_msgs/msg/Int32",
    JOINT_STATE: "sensor_msgs/msg/JointState",
    BATTERY_STATE: "sensor_msgs/msg/BatteryState",
    LASER_SCAN: "sensor_msgs/msg/LaserScan",
    COMPRESSED_IMAGE: "sensor_msgs/msg/CompressedImage"
};
const SkillIds = {
    ARM_MOVE_TO_XYZ: "innate-os/arm_move_to_xyz",
    NAVIGATE_TO_POSITION: "innate-os/navigate_to_position",
    ARM_UTILS: "innate-os/arm_utils",
    ARM_ZERO_POSITION: "innate-os/arm_zero_position",
    NAVIGATE_WITH_VISION: "innate-os/navigate_with_vision",
    ARM_CIRCLE_MOTION: "innate-os/arm_circle_motion",
    HEAD_EMOTION: "innate-os/head_emotion",
    ORBITAL_SHOT: "innate-os/orbital_shot"
};
const SPEED_CAPS = {
    MAX_LINEAR_MPS: 0.3,
    MAX_ANGULAR_RADPS: 1.0
};
class BrowserRosbridgeClient {
    connect() {
        let timeoutMs = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : 10_000;
        return new Promise((resolve, reject)=>{
            const timer = setTimeout(()=>{
                reject(new Error("Connection timed out after ".concat(timeoutMs, "ms")));
            }, timeoutMs);
            try {
                this.ws = new WebSocket(this.connectionUrl);
            } catch (err) {
                clearTimeout(timer);
                reject(err);
                return;
            }
            this.ws.onopen = ()=>{
                clearTimeout(timer);
                resolve();
            };
            this.ws.onerror = (event)=>{
                clearTimeout(timer);
                reject(new Error("WebSocket error: ".concat(event)));
            };
            this.ws.onclose = ()=>{
                clearTimeout(timer);
                for (const [, req] of this.pendingRequests){
                    clearTimeout(req.timer);
                    req.reject(new Error("WebSocket closed"));
                }
                this.pendingRequests.clear();
            };
            this.ws.onmessage = (event)=>{
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (e) {
                // ignore parse errors
                }
            };
        });
    }
    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.advertisedTopics.clear();
        this.subscriptions.clear();
    }
    get isConnected() {
        var _this_ws;
        return ((_this_ws = this.ws) === null || _this_ws === void 0 ? void 0 : _this_ws.readyState) === WebSocket.OPEN;
    }
    nextId() {
        let prefix = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : "mars-control";
        return "".concat(prefix, "_").concat(++this.messageCounter, "_").concat(Date.now());
    }
    send(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket not connected");
        }
        this.ws.send(JSON.stringify(message));
    }
    handleMessage(message) {
        if (message.op === "publish" && message.topic) {
            const handlers = this.subscriptions.get(message.topic);
            if (handlers) {
                for (const handler of handlers){
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
            if (req === null || req === void 0 ? void 0 : req.onFeedback) {
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
    advertise(topic, type) {
        if (this.advertisedTopics.has(topic)) return;
        this.send({
            op: "advertise",
            topic,
            type
        });
        this.advertisedTopics.add(topic);
    }
    publish(topic, type, msg) {
        this.advertise(topic, type);
        this.send({
            op: "publish",
            topic,
            msg
        });
    }
    subscribe(topic, handler, options) {
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, new Set());
            this.send({
                op: "subscribe",
                topic,
                ...(options === null || options === void 0 ? void 0 : options.type) && {
                    type: options.type
                },
                ...(options === null || options === void 0 ? void 0 : options.throttleRateMs) && {
                    throttle_rate: options.throttleRateMs
                },
                ...(options === null || options === void 0 ? void 0 : options.queueLength) && {
                    queue_length: options.queueLength
                }
            });
        }
        this.subscriptions.get(topic).add(handler);
    }
    unsubscribe(topic, handler) {
        const handlers = this.subscriptions.get(topic);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.subscriptions.delete(topic);
                this.send({
                    op: "unsubscribe",
                    topic
                });
            }
        }
    }
    waitForMessage(topic) {
        let timeoutMs = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 10_000, subscribeOptions = arguments.length > 2 ? arguments[2] : void 0;
        return new Promise((resolve, reject)=>{
            const timer = setTimeout(()=>{
                this.unsubscribe(topic, handler);
                reject(new Error("Timed out waiting for message on ".concat(topic, " after ").concat(timeoutMs, "ms")));
            }, timeoutMs);
            const handler = (message)=>{
                clearTimeout(timer);
                this.unsubscribe(topic, handler);
                resolve(message);
            };
            this.subscribe(topic, handler, subscribeOptions);
        });
    }
    callService(service, args) {
        let timeoutMs = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : 30_000;
        return new Promise((resolve, reject)=>{
            const id = this.nextId("service");
            const timer = setTimeout(()=>{
                this.pendingRequests.delete(id);
                reject(new Error("Service call ".concat(service, " timed out after ").concat(timeoutMs, "ms")));
            }, timeoutMs);
            this.pendingRequests.set(id, {
                resolve,
                reject,
                timer
            });
            this.send({
                op: "call_service",
                id,
                service,
                args: args || {}
            });
        });
    }
    sendActionGoal(action, actionType, goal, options) {
        return new Promise((resolve, reject)=>{
            const id = this.nextId("action");
            this.lastActionId = id;
            var _options_timeoutMs;
            const timeoutMs = (_options_timeoutMs = options === null || options === void 0 ? void 0 : options.timeoutMs) !== null && _options_timeoutMs !== void 0 ? _options_timeoutMs : 60_000;
            const timer = setTimeout(()=>{
                this.pendingRequests.delete(id);
                reject(new Error("Action ".concat(action, " timed out after ").concat(timeoutMs, "ms")));
            }, timeoutMs);
            this.pendingRequests.set(id, {
                resolve,
                reject,
                timer,
                onFeedback: options === null || options === void 0 ? void 0 : options.onFeedback
            });
            this.send({
                op: "send_action_goal",
                id,
                action,
                action_type: actionType,
                goal
            });
        });
    }
    cancelActionGoal(action, goalId) {
        try {
            this.send({
                op: "cancel_action_goal",
                action,
                id: goalId
            });
        } catch (e) {
        // ignore if not connected
        }
    }
    executeSkill(skillType, inputs, options) {
        return this.sendActionGoal("/execute_skill", "brain_messages/action/ExecuteSkill", {
            skill_type: skillType,
            inputs: jsonStringifyWithFloats(inputs)
        }, options);
    }
    cancelCurrentSkill() {
        if (this.lastActionId) {
            this.cancelActionGoal("/execute_skill", this.lastActionId);
            this.lastActionId = null;
        }
    }
    /** Move arm to joint positions via /mars/arm/goto_js service.
   *  Uses nested Float64MultiArray format: {data: {data: [...]}} */ callGotoJS(jointPositions, durationSeconds) {
        let timeoutMs = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : 30_000;
        if (jointPositions.length !== 6) {
            throw new Error("Expected 6 joint positions, got ".concat(jointPositions.length));
        }
        return this.callService("/mars/arm/goto_js", {
            data: {
                data: jointPositions
            },
            time: durationSeconds
        }, timeoutMs);
    }
    constructor(robotIp, port = 9090){
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f40$swc$2f$helpers$2f$esm$2f$_define_property$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["_"])(this, "ws", null);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f40$swc$2f$helpers$2f$esm$2f$_define_property$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["_"])(this, "pendingRequests", new Map());
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f40$swc$2f$helpers$2f$esm$2f$_define_property$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["_"])(this, "subscriptions", new Map());
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f40$swc$2f$helpers$2f$esm$2f$_define_property$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["_"])(this, "advertisedTopics", new Set());
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f40$swc$2f$helpers$2f$esm$2f$_define_property$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["_"])(this, "messageCounter", 0);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f40$swc$2f$helpers$2f$esm$2f$_define_property$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["_"])(this, "connectionUrl", void 0);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f40$swc$2f$helpers$2f$esm$2f$_define_property$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["_"])(this, "lastActionId", null);
        this.connectionUrl = "ws://".concat(robotIp, ":").concat(port);
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/web/app/hooks/useRobot.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useRobot",
    ()=>useRobot
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/app/lib/rosbridge.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function useRobot() {
    _s();
    const clientRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [connectionStatus, setConnectionStatus] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("disconnected");
    const [availableSkills, setAvailableSkills] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [logs, setLogs] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [executingSkill, setExecutingSkill] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [mainCameraFrame, setMainCameraFrame] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [armCameraFrame, setArmCameraFrame] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [mainCameraStreaming, setMainCameraStreaming] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [armCameraStreaming, setArmCameraStreaming] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const mainCameraHandlerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const armCameraHandlerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [armJoints, setArmJoints] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([
        0,
        0,
        0,
        0,
        0,
        0
    ]);
    const [movingArm, setMovingArm] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const addLog = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[addLog]": (type, message)=>{
            setLogs({
                "useRobot.useCallback[addLog]": (prev)=>[
                        ...prev.slice(-200),
                        {
                            timestamp: Date.now(),
                            type,
                            message
                        }
                    ]
            }["useRobot.useCallback[addLog]"]);
        }
    }["useRobot.useCallback[addLog]"], []);
    const connect = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[connect]": async (robotIp, port)=>{
            // Disconnect existing
            if (clientRef.current) {
                clientRef.current.close();
            }
            const client = new __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BrowserRosbridgeClient"](robotIp, port);
            clientRef.current = client;
            setConnectionStatus("connecting");
            addLog("info", "Connecting to ".concat(robotIp, ":").concat(port, "..."));
            try {
                await client.connect(10_000);
                setConnectionStatus("connected");
                addLog("info", "Connected to ".concat(robotIp, ":").concat(port));
                // Discover available skills
                try {
                    var _this;
                    const skillsMsg = await client.waitForMessage(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Topics"].AVAILABLE_SKILLS, 15_000);
                    const skills = ((_this = skillsMsg.msg) === null || _this === void 0 ? void 0 : _this.skills) || [];
                    setAvailableSkills(skills);
                    addLog("info", "Discovered ".concat(skills.length, " skills"));
                } catch (e) {
                    addLog("error", "Could not fetch available skills (timeout)");
                }
            } catch (err) {
                setConnectionStatus("error");
                addLog("error", "Connection failed: ".concat(err instanceof Error ? err.message : String(err)));
                throw err;
            }
        }
    }["useRobot.useCallback[connect]"], [
        addLog
    ]);
    const disconnect = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[disconnect]": ()=>{
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
            setMainCameraFrame({
                "useRobot.useCallback[disconnect]": (prev)=>{
                    if (prev === null || prev === void 0 ? void 0 : prev.startsWith("blob:")) URL.revokeObjectURL(prev);
                    return null;
                }
            }["useRobot.useCallback[disconnect]"]);
            setArmCameraFrame({
                "useRobot.useCallback[disconnect]": (prev)=>{
                    if (prev === null || prev === void 0 ? void 0 : prev.startsWith("blob:")) URL.revokeObjectURL(prev);
                    return null;
                }
            }["useRobot.useCallback[disconnect]"]);
            addLog("info", "Disconnected");
        }
    }["useRobot.useCallback[disconnect]"], [
        addLog
    ]);
    const executeSkill = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[executeSkill]": async (skillType, inputs)=>{
            const client = clientRef.current;
            if (!(client === null || client === void 0 ? void 0 : client.isConnected)) throw new Error("Not connected");
            setExecutingSkill(true);
            addLog("info", "Executing skill: ".concat(skillType));
            try {
                var _this;
                const result = await client.executeSkill(skillType, inputs, {
                    onFeedback: {
                        "useRobot.useCallback[executeSkill]": (fb)=>{
                            var _fb_feedback;
                            const feedbackData = (_fb_feedback = fb.feedback) !== null && _fb_feedback !== void 0 ? _fb_feedback : fb.msg;
                            addLog("feedback", JSON.stringify(feedbackData, null, 0));
                        }
                    }["useRobot.useCallback[executeSkill]"],
                    timeoutMs: 120_000
                });
                const resultMsg = result;
                const success = (_this = resultMsg.values) === null || _this === void 0 ? void 0 : _this.success;
                var _resultMsg_values;
                addLog("result", "Skill result: ".concat(success ? "SUCCESS" : "FAILED", " — ").concat(JSON.stringify((_resultMsg_values = resultMsg.values) !== null && _resultMsg_values !== void 0 ? _resultMsg_values : resultMsg.result)));
                return result;
            } catch (err) {
                addLog("error", "Skill error: ".concat(err instanceof Error ? err.message : String(err)));
                throw err;
            } finally{
                setExecutingSkill(false);
            }
        }
    }["useRobot.useCallback[executeSkill]"], [
        addLog
    ]);
    const cancelSkill = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[cancelSkill]": ()=>{
            var _clientRef_current;
            (_clientRef_current = clientRef.current) === null || _clientRef_current === void 0 ? void 0 : _clientRef_current.cancelCurrentSkill();
            setExecutingSkill(false);
            addLog("info", "Cancelled current skill");
        }
    }["useRobot.useCallback[cancelSkill]"], [
        addLog
    ]);
    const publishCmdVel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[publishCmdVel]": (linearX, angularZ)=>{
            const client = clientRef.current;
            if (!(client === null || client === void 0 ? void 0 : client.isConnected)) return;
            // Clamp to safety caps
            const clampedLinear = Math.max(-__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SPEED_CAPS"].MAX_LINEAR_MPS, Math.min(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SPEED_CAPS"].MAX_LINEAR_MPS, linearX));
            const clampedAngular = Math.max(-__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SPEED_CAPS"].MAX_ANGULAR_RADPS, Math.min(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SPEED_CAPS"].MAX_ANGULAR_RADPS, angularZ));
            client.publish(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Topics"].CMD_VEL, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MessageTypes"].TWIST, {
                linear: {
                    x: clampedLinear,
                    y: 0,
                    z: 0
                },
                angular: {
                    x: 0,
                    y: 0,
                    z: clampedAngular
                }
            });
        }
    }["useRobot.useCallback[publishCmdVel]"], []);
    const stopDriving = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[stopDriving]": ()=>{
            publishCmdVel(0, 0);
        }
    }["useRobot.useCallback[stopDriving]"], [
        publishCmdVel
    ]);
    const speak = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[speak]": (text)=>{
            const client = clientRef.current;
            if (!(client === null || client === void 0 ? void 0 : client.isConnected)) return;
            client.publish(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Topics"].TTS, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MessageTypes"].STRING, {
                data: text
            });
            addLog("info", 'TTS: "'.concat(text, '"'));
        }
    }["useRobot.useCallback[speak]"], [
        addLog
    ]);
    const setHeadTilt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[setHeadTilt]": (degrees)=>{
            const client = clientRef.current;
            if (!(client === null || client === void 0 ? void 0 : client.isConnected)) return;
            const clamped = Math.max(-25, Math.min(25, Math.round(degrees)));
            client.publish(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Topics"].HEAD_SET_POSITION, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MessageTypes"].INT32, {
                data: clamped
            });
            addLog("info", "Head tilt: ".concat(clamped, "°"));
        }
    }["useRobot.useCallback[setHeadTilt]"], [
        addLog
    ]);
    /** Emergency stop: 5x zero velocity + cancel running action */ const estop = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[estop]": ()=>{
            const client = clientRef.current;
            if (!(client === null || client === void 0 ? void 0 : client.isConnected)) return;
            // Send zero velocity 5 times to ensure receipt
            for(let i = 0; i < 5; i++){
                client.publish(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Topics"].CMD_VEL, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MessageTypes"].TWIST, {
                    linear: {
                        x: 0,
                        y: 0,
                        z: 0
                    },
                    angular: {
                        x: 0,
                        y: 0,
                        z: 0
                    }
                });
            }
            // Cancel any running action
            client.cancelCurrentSkill();
            setExecutingSkill(false);
            addLog("error", "E-STOP ACTIVATED");
        }
    }["useRobot.useCallback[estop]"], [
        addLog
    ]);
    /** Parse image data from a CompressedImage ros message.
   *  Handles both base64 string (normal) and integer array (fallback) encodings. */ const parseImageFrame = (msg)=>{
        const msgData = msg.msg;
        if (!msgData) return null;
        const format = msgData.format || "jpeg";
        const rawData = msgData.data;
        if (typeof rawData === "string" && rawData.length > 0) {
            // Base64 encoded — create Blob + Object URL (much faster than data: URLs for streaming)
            try {
                const binary = atob(rawData);
                const bytes = new Uint8Array(binary.length);
                for(let i = 0; i < binary.length; i++)bytes[i] = binary.charCodeAt(i);
                const blob = new Blob([
                    bytes
                ], {
                    type: "image/".concat(format)
                });
                return URL.createObjectURL(blob);
            } catch (e) {
                // Fallback to data URL if atob fails
                return "data:image/".concat(format, ";base64,").concat(rawData);
            }
        } else if (Array.isArray(rawData) && rawData.length > 0) {
            // Integer byte array — convert to Blob
            const bytes = new Uint8Array(rawData);
            const blob = new Blob([
                bytes
            ], {
                type: "image/".concat(format)
            });
            return URL.createObjectURL(blob);
        }
        return null;
    };
    /** Revoke old Object URL if needed, set new frame */ const setFrameAndCleanup = (setter, newFrame)=>{
        setter((prev)=>{
            if (prev === null || prev === void 0 ? void 0 : prev.startsWith("blob:")) URL.revokeObjectURL(prev);
            return newFrame;
        });
    };
    /** Capture a single photo from main camera */ const captureMainPhoto = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[captureMainPhoto]": async ()=>{
            const client = clientRef.current;
            if (!(client === null || client === void 0 ? void 0 : client.isConnected)) return;
            addLog("info", "Capturing main camera photo...");
            try {
                const msg = await client.waitForMessage(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Topics"].MAIN_CAMERA, 10_000, {
                    type: __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MessageTypes"].COMPRESSED_IMAGE
                });
                const frame = parseImageFrame(msg);
                if (frame) {
                    setFrameAndCleanup(setMainCameraFrame, frame);
                    addLog("info", "Main camera photo captured");
                } else {
                    addLog("error", "Main camera returned empty frame");
                }
            } catch (e) {
                addLog("error", "Main camera photo capture timed out");
            }
        }
    }["useRobot.useCallback[captureMainPhoto]"], [
        addLog
    ]);
    /** Capture a single photo from arm camera */ const captureArmPhoto = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[captureArmPhoto]": async ()=>{
            const client = clientRef.current;
            if (!(client === null || client === void 0 ? void 0 : client.isConnected)) return;
            addLog("info", "Capturing arm camera photo...");
            try {
                const msg = await client.waitForMessage(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Topics"].ARM_CAMERA, 10_000, {
                    type: __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MessageTypes"].COMPRESSED_IMAGE
                });
                const frame = parseImageFrame(msg);
                if (frame) {
                    setFrameAndCleanup(setArmCameraFrame, frame);
                    addLog("info", "Arm camera photo captured");
                } else {
                    addLog("error", "Arm camera returned empty frame");
                }
            } catch (e) {
                addLog("error", "Arm camera photo capture timed out");
            }
        }
    }["useRobot.useCallback[captureArmPhoto]"], [
        addLog
    ]);
    /** Toggle main camera live stream */ const toggleMainCameraStream = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[toggleMainCameraStream]": ()=>{
            const client = clientRef.current;
            if (!(client === null || client === void 0 ? void 0 : client.isConnected)) return;
            if (mainCameraStreaming && mainCameraHandlerRef.current) {
                client.unsubscribe(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Topics"].MAIN_CAMERA, mainCameraHandlerRef.current);
                mainCameraHandlerRef.current = null;
                setMainCameraStreaming(false);
                addLog("info", "Main camera stream stopped");
            } else {
                const handler = {
                    "useRobot.useCallback[toggleMainCameraStream].handler": (msg)=>{
                        const frame = parseImageFrame(msg);
                        if (frame) setFrameAndCleanup(setMainCameraFrame, frame);
                    }
                }["useRobot.useCallback[toggleMainCameraStream].handler"];
                mainCameraHandlerRef.current = handler;
                client.subscribe(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Topics"].MAIN_CAMERA, handler, {
                    throttleRateMs: 200,
                    queueLength: 1,
                    type: __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MessageTypes"].COMPRESSED_IMAGE
                });
                setMainCameraStreaming(true);
                addLog("info", "Main camera stream started");
            }
        }
    }["useRobot.useCallback[toggleMainCameraStream]"], [
        mainCameraStreaming,
        addLog
    ]);
    /** Toggle arm camera live stream */ const toggleArmCameraStream = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[toggleArmCameraStream]": ()=>{
            const client = clientRef.current;
            if (!(client === null || client === void 0 ? void 0 : client.isConnected)) return;
            if (armCameraStreaming && armCameraHandlerRef.current) {
                client.unsubscribe(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Topics"].ARM_CAMERA, armCameraHandlerRef.current);
                armCameraHandlerRef.current = null;
                setArmCameraStreaming(false);
                addLog("info", "Arm camera stream stopped");
            } else {
                const handler = {
                    "useRobot.useCallback[toggleArmCameraStream].handler": (msg)=>{
                        const frame = parseImageFrame(msg);
                        if (frame) setFrameAndCleanup(setArmCameraFrame, frame);
                    }
                }["useRobot.useCallback[toggleArmCameraStream].handler"];
                armCameraHandlerRef.current = handler;
                client.subscribe(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Topics"].ARM_CAMERA, handler, {
                    throttleRateMs: 200,
                    queueLength: 1,
                    type: __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MessageTypes"].COMPRESSED_IMAGE
                });
                setArmCameraStreaming(true);
                addLog("info", "Arm camera stream started");
            }
        }
    }["useRobot.useCallback[toggleArmCameraStream]"], [
        armCameraStreaming,
        addLog
    ]);
    /** Read current arm joint positions */ const readArmState = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[readArmState]": async ()=>{
            const client = clientRef.current;
            if (!(client === null || client === void 0 ? void 0 : client.isConnected)) return;
            try {
                var _this;
                const msg = await client.waitForMessage(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Topics"].ARM_STATE, 10_000);
                const positions = (_this = msg.msg) === null || _this === void 0 ? void 0 : _this.position;
                if (positions && positions.length >= 6) {
                    setArmJoints(positions.slice(0, 6));
                    addLog("info", "Arm state: [".concat(positions.slice(0, 6).map({
                        "useRobot.useCallback[readArmState]": (p)=>p.toFixed(3)
                    }["useRobot.useCallback[readArmState]"]).join(", "), "]"));
                }
            } catch (e) {
                addLog("error", "Could not read arm state");
            }
        }
    }["useRobot.useCallback[readArmState]"], [
        addLog
    ]);
    /** Move arm to target joint positions */ const moveArmToJoints = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[moveArmToJoints]": async function(joints) {
            let durationSeconds = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 2.0;
            const client = clientRef.current;
            if (!(client === null || client === void 0 ? void 0 : client.isConnected)) return;
            setMovingArm(true);
            addLog("info", "Moving arm to [".concat(joints.map({
                "useRobot.useCallback[moveArmToJoints]": (j)=>j.toFixed(3)
            }["useRobot.useCallback[moveArmToJoints]"]).join(", "), "]"));
            try {
                await client.callGotoJS(joints, durationSeconds);
                addLog("result", "Arm move complete");
            } catch (err) {
                addLog("error", "Arm move failed: ".concat(err instanceof Error ? err.message : String(err)));
            } finally{
                setMovingArm(false);
            }
        }
    }["useRobot.useCallback[moveArmToJoints]"], [
        addLog
    ]);
    const clearLogs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useRobot.useCallback[clearLogs]": ()=>{
            setLogs([]);
        }
    }["useRobot.useCallback[clearLogs]"], []);
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
        clearLogs
    };
}
_s(useRobot, "0/CJNUjVLmNwiOD9SlQLOE1EkTo=");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/web/app/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Home
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$hooks$2f$useRobot$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/app/hooks/useRobot.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/app/lib/rosbridge.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature(), _s2 = __turbopack_context__.k.signature(), _s3 = __turbopack_context__.k.signature(), _s4 = __turbopack_context__.k.signature(), _s5 = __turbopack_context__.k.signature(), _s6 = __turbopack_context__.k.signature(), _s7 = __turbopack_context__.k.signature();
"use client";
;
;
;
// ─── Connection Bar ────────────────────────────────────────────────────────────
function ConnectionBar(param) {
    let { connectionStatus, onConnect, onDisconnect } = param;
    _s();
    const [robotIp, setRobotIp] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "ConnectionBar.useState": ()=>("TURBOPACK compile-time truthy", 1) ? localStorage.getItem("mars_robot_ip") || "172.17.30.145" : "TURBOPACK unreachable"
    }["ConnectionBar.useState"]);
    const [port, setPort] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "ConnectionBar.useState": ()=>("TURBOPACK compile-time truthy", 1) ? parseInt(localStorage.getItem("mars_robot_port") || "9090") : "TURBOPACK unreachable"
    }["ConnectionBar.useState"]);
    const handleConnect = ()=>{
        localStorage.setItem("mars_robot_ip", robotIp);
        localStorage.setItem("mars_robot_port", String(port));
        onConnect(robotIp, port);
    };
    const statusColor = {
        disconnected: "bg-gray-500",
        connecting: "bg-yellow-500 animate-pulse",
        connected: "bg-green-500",
        error: "bg-red-500"
    }[connectionStatus];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center gap-3 p-4 bg-gray-900 border-b border-gray-800",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "w-3 h-3 rounded-full ".concat(statusColor)
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 41,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-sm font-mono text-gray-400 uppercase",
                        children: connectionStatus
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 42,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 40,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1"
            }, void 0, false, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 44,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                type: "text",
                value: robotIp,
                onChange: (e)=>setRobotIp(e.target.value),
                placeholder: "Robot IP",
                disabled: connectionStatus === "connected" || connectionStatus === "connecting",
                className: "px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm font-mono w-40 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            }, void 0, false, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 45,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                type: "number",
                value: port,
                onChange: (e)=>setPort(parseInt(e.target.value) || 9090),
                disabled: connectionStatus === "connected" || connectionStatus === "connecting",
                className: "px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm font-mono w-20 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            }, void 0, false, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 53,
                columnNumber: 7
            }, this),
            connectionStatus === "connected" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: onDisconnect,
                className: "px-4 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition-colors",
                children: "Disconnect"
            }, void 0, false, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 61,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: handleConnect,
                disabled: connectionStatus === "connecting",
                className: "px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors disabled:opacity-50",
                children: connectionStatus === "connecting" ? "Connecting..." : "Connect"
            }, void 0, false, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 65,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/web/app/page.tsx",
        lineNumber: 39,
        columnNumber: 5
    }, this);
}
_s(ConnectionBar, "ykgjLiG5RlrTczyCJQ0o2bOB5ok=");
_c = ConnectionBar;
// ─── Drive Controls ────────────────────────────────────────────────────────────
function DriveControls(param) {
    let { onDrive, onStop, activeKeys, disabled } = param;
    _s1();
    const [speed, setSpeed] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0.15);
    const handleDriveButton = (linearX, angularZ)=>{
        onDrive(linearX * speed, angularZ * speed * (__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SPEED_CAPS"].MAX_ANGULAR_RADPS / __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SPEED_CAPS"].MAX_LINEAR_MPS));
    };
    const btnClass = (key)=>"w-14 h-14 rounded-lg font-bold text-lg transition-all ".concat(activeKeys.has(key) ? "bg-blue-500 text-white scale-95 shadow-lg shadow-blue-500/30" : "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700", " ").concat(disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer active:scale-95");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-sm font-semibold text-gray-400 uppercase tracking-wide",
                        children: "Drive"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 106,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-gray-500 font-mono",
                        children: "WASD"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 107,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 105,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-col items-center gap-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        className: btnClass("w"),
                        onPointerDown: ()=>handleDriveButton(1, 0),
                        onPointerUp: onStop,
                        onPointerLeave: onStop,
                        disabled: disabled,
                        children: "W"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 111,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex gap-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: btnClass("a"),
                                onPointerDown: ()=>handleDriveButton(0, 1),
                                onPointerUp: onStop,
                                onPointerLeave: onStop,
                                disabled: disabled,
                                children: "A"
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 121,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "w-14 h-14 rounded-lg bg-gray-800/50 border border-gray-800 flex items-center justify-center",
                                onClick: onStop,
                                disabled: disabled,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "w-3 h-3 rounded-full bg-gray-600"
                                }, void 0, false, {
                                    fileName: "[project]/web/app/page.tsx",
                                    lineNumber: 135,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 130,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: btnClass("d"),
                                onPointerDown: ()=>handleDriveButton(0, -1),
                                onPointerUp: onStop,
                                onPointerLeave: onStop,
                                disabled: disabled,
                                children: "D"
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 137,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 120,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        className: btnClass("s"),
                        onPointerDown: ()=>handleDriveButton(-1, 0),
                        onPointerUp: onStop,
                        onPointerLeave: onStop,
                        disabled: disabled,
                        children: "S"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 147,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 110,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex justify-between text-xs text-gray-500",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "Speed"
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 160,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-mono",
                                children: [
                                    speed.toFixed(2),
                                    " m/s"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 161,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 159,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        type: "range",
                        min: 0.05,
                        max: __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SPEED_CAPS"].MAX_LINEAR_MPS,
                        step: 0.01,
                        value: speed,
                        onChange: (e)=>setSpeed(parseFloat(e.target.value)),
                        className: "w-full accent-blue-500",
                        disabled: disabled
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 163,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 158,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/web/app/page.tsx",
        lineNumber: 104,
        columnNumber: 5
    }, this);
}
_s1(DriveControls, "hHTOGtqf2L8+sG2UCTCkEffWSzg=");
_c1 = DriveControls;
// ─── Head Tilt ─────────────────────────────────────────────────────────────────
function HeadTilt(param) {
    let { onSetTilt, disabled } = param;
    _s2();
    const [tilt, setTilt] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-2",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-sm font-semibold text-gray-400 uppercase tracking-wide",
                        children: "Head Tilt"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 192,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs font-mono text-gray-500",
                        children: [
                            tilt,
                            "°"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 193,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 191,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                type: "range",
                min: -25,
                max: 25,
                step: 1,
                value: tilt,
                onChange: (e)=>{
                    const val = parseInt(e.target.value);
                    setTilt(val);
                    onSetTilt(val);
                },
                className: "w-full accent-blue-500",
                disabled: disabled
            }, void 0, false, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 195,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex justify-between text-xs text-gray-600",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: "-25°"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 210,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: "0°"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 211,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: "25°"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 212,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 209,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/web/app/page.tsx",
        lineNumber: 190,
        columnNumber: 5
    }, this);
}
_s2(HeadTilt, "MNNSMr+T9UqX6T2MKoAU7oB/Mow=");
_c2 = HeadTilt;
// ─── Quick Actions ─────────────────────────────────────────────────────────────
function QuickActions(param) {
    let { onEmotion, onSpeak, executingSkill, disabled } = param;
    _s3();
    const [ttsText, setTtsText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const emotions = [
        {
            id: "happy",
            label: "Happy"
        },
        {
            id: "sad",
            label: "Sad"
        },
        {
            id: "excited",
            label: "Excited"
        },
        {
            id: "surprised",
            label: "Surprised"
        },
        {
            id: "angry",
            label: "Angry"
        }
    ];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "text-sm font-semibold text-gray-400 uppercase tracking-wide",
                children: "Quick Actions"
            }, void 0, false, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 242,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-gray-500",
                        children: "Emotions"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 245,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-wrap gap-1.5",
                        children: emotions.map((e)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>onEmotion(e.id),
                                disabled: disabled || executingSkill,
                                className: "px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs font-medium transition-colors disabled:opacity-40",
                                children: e.label
                            }, e.id, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 248,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 246,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 244,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-gray-500",
                        children: "Text-to-Speech"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 261,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "text",
                                value: ttsText,
                                onChange: (e)=>setTtsText(e.target.value),
                                placeholder: "Say something...",
                                onKeyDown: (e)=>{
                                    if (e.key === "Enter" && ttsText.trim()) {
                                        onSpeak(ttsText.trim());
                                        setTtsText("");
                                    }
                                },
                                disabled: disabled,
                                className: "flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 263,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>{
                                    if (ttsText.trim()) {
                                        onSpeak(ttsText.trim());
                                        setTtsText("");
                                    }
                                },
                                disabled: disabled || !ttsText.trim(),
                                className: "px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium transition-colors disabled:opacity-40",
                                children: "Speak"
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 277,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 262,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 260,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/web/app/page.tsx",
        lineNumber: 241,
        columnNumber: 5
    }, this);
}
_s3(QuickActions, "qReIIsGJ40JlmBSjMFCGg9SJih8=");
_c3 = QuickActions;
// ─── Camera View ──────────────────────────────────────────────────────────────
function CameraView(param) {
    let { label, cameraFrame, cameraStreaming, onCapturePhoto, onToggleStream, disabled } = param;
    const downloadPhoto = ()=>{
        if (!cameraFrame) return;
        const link = document.createElement("a");
        link.href = cameraFrame;
        link.download = "".concat(label.toLowerCase().replace(/\s+/g, "-"), "-").concat(Date.now(), ".jpg");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-2",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-sm font-semibold text-gray-400 uppercase tracking-wide",
                        children: label
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 325,
                        columnNumber: 9
                    }, this),
                    cameraStreaming && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-red-400 flex items-center gap-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "w-2 h-2 rounded-full bg-red-500 animate-pulse"
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 328,
                                columnNumber: 13
                            }, this),
                            "LIVE"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 327,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 324,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "bg-gray-900 border border-gray-800 rounded-lg overflow-hidden aspect-[4/3] flex items-center justify-center",
                children: cameraFrame ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: cameraFrame,
                    alt: label,
                    className: "w-full h-full object-contain"
                }, void 0, false, {
                    fileName: "[project]/web/app/page.tsx",
                    lineNumber: 336,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "text-gray-700 text-sm",
                    children: "No image"
                }, void 0, false, {
                    fileName: "[project]/web/app/page.tsx",
                    lineNumber: 338,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 334,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex gap-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: cameraStreaming ? downloadPhoto : onCapturePhoto,
                        disabled: disabled || cameraStreaming && !cameraFrame,
                        className: "flex-1 px-2 py-1.5 bg-cyan-600 hover:bg-cyan-700 rounded text-xs font-medium transition-colors disabled:opacity-40",
                        children: cameraStreaming ? "Save" : "Photo"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 343,
                        columnNumber: 9
                    }, this),
                    cameraFrame && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: downloadPhoto,
                        disabled: disabled,
                        className: "px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium transition-colors disabled:opacity-40",
                        title: "Download",
                        children: "DL"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 351,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: onToggleStream,
                        disabled: disabled,
                        className: "flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40 ".concat(cameraStreaming ? "bg-red-600 hover:bg-red-700" : "bg-cyan-600 hover:bg-cyan-700"),
                        children: cameraStreaming ? "Stop" : "Stream"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 360,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 342,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/web/app/page.tsx",
        lineNumber: 323,
        columnNumber: 5
    }, this);
}
_c4 = CameraView;
// ─── Arm Joint Control ────────────────────────────────────────────────────────
const JOINT_NAMES = [
    "Base",
    "Shoulder",
    "Elbow",
    "Wrist 1",
    "Wrist 2",
    "Wrist 3"
];
const JOINT_LIMITS = [
    {
        min: -3.14,
        max: 3.14
    },
    {
        min: -3.14,
        max: 3.14
    },
    {
        min: -3.14,
        max: 3.14
    },
    {
        min: -3.14,
        max: 3.14
    },
    {
        min: -3.14,
        max: 3.14
    },
    {
        min: -3.14,
        max: 3.14
    }
];
function ArmControl(param) {
    let { armJoints, movingArm, onReadState, onMoveJoints, disabled } = param;
    _s4();
    const [targetJoints, setTargetJoints] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([
        0,
        0,
        0,
        0,
        0,
        0
    ]);
    const [duration, setDuration] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(2.0);
    const [synced, setSynced] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const handleSyncFromRobot = ()=>{
        onReadState();
        setSynced(true);
    };
    // Sync target joints when arm state updates (after read)
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ArmControl.useEffect": ()=>{
            if (synced) {
                setTargetJoints([
                    ...armJoints
                ]);
                setSynced(false);
            }
        }
    }["ArmControl.useEffect"], [
        armJoints,
        synced
    ]);
    const updateJoint = (index, value)=>{
        setTargetJoints((prev)=>{
            const next = [
                ...prev
            ];
            next[index] = value;
            return next;
        });
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-sm font-semibold text-gray-400 uppercase tracking-wide",
                        children: "Arm Joints"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 429,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: handleSyncFromRobot,
                        disabled: disabled,
                        className: "text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded transition-colors disabled:opacity-40",
                        children: "Read Current"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 430,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 428,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-2",
                children: JOINT_NAMES.map((name, i)=>{
                    var _targetJoints_i;
                    var _targetJoints_i1;
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-0.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex justify-between text-xs",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-gray-500",
                                        children: [
                                            "J",
                                            i,
                                            " — ",
                                            name
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/web/app/page.tsx",
                                        lineNumber: 443,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-gray-400 font-mono",
                                        children: [
                                            (_targetJoints_i = targetJoints[i]) === null || _targetJoints_i === void 0 ? void 0 : _targetJoints_i.toFixed(3),
                                            " rad"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/web/app/page.tsx",
                                        lineNumber: 444,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 442,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "range",
                                min: JOINT_LIMITS[i].min,
                                max: JOINT_LIMITS[i].max,
                                step: 0.01,
                                value: (_targetJoints_i1 = targetJoints[i]) !== null && _targetJoints_i1 !== void 0 ? _targetJoints_i1 : 0,
                                onChange: (e)=>updateJoint(i, parseFloat(e.target.value)),
                                disabled: disabled || movingArm,
                                className: "w-full accent-amber-500"
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 446,
                                columnNumber: 13
                            }, this)
                        ]
                    }, i, true, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 441,
                        columnNumber: 11
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 439,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-1.5 text-xs text-gray-500",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "Duration"
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 462,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "number",
                                min: 0.5,
                                max: 10,
                                step: 0.5,
                                value: duration,
                                onChange: (e)=>setDuration(parseFloat(e.target.value) || 2),
                                disabled: disabled || movingArm,
                                className: "w-14 px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-xs font-mono focus:outline-none focus:border-amber-500 disabled:opacity-50"
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 463,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "s"
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 473,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 461,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex-1"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 475,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>onMoveJoints(targetJoints, duration),
                        disabled: disabled || movingArm,
                        className: "px-4 py-1.5 bg-amber-600 hover:bg-amber-700 rounded text-sm font-medium transition-colors disabled:opacity-40",
                        children: movingArm ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "flex items-center gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"
                                }, void 0, false, {
                                    fileName: "[project]/web/app/page.tsx",
                                    lineNumber: 483,
                                    columnNumber: 15
                                }, this),
                                "Moving..."
                            ]
                        }, void 0, true, {
                            fileName: "[project]/web/app/page.tsx",
                            lineNumber: 482,
                            columnNumber: 13
                        }, this) : "Move Arm"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 476,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 460,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/web/app/page.tsx",
        lineNumber: 427,
        columnNumber: 5
    }, this);
}
_s4(ArmControl, "2Cg0/lWxhpkHZH7+pMXroLLoou8=");
_c5 = ArmControl;
// ─── Skill Executor ────────────────────────────────────────────────────────────
function SkillExecutor(param) {
    let { availableSkills, onExecute, onCancel, executingSkill, disabled } = param;
    _s5();
    const [selectedSkillId, setSelectedSkillId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [inputsJson, setInputsJson] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("{}");
    const [jsonError, setJsonError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const selectedSkill = availableSkills.find((s)=>s.id === selectedSkillId);
    // When skill selection changes, pre-fill input template
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "SkillExecutor.useEffect": ()=>{
            if (selectedSkill === null || selectedSkill === void 0 ? void 0 : selectedSkill.inputs_json) {
                try {
                    const schema = JSON.parse(selectedSkill.inputs_json);
                    // Build template from schema properties
                    const template = {};
                    if (schema.properties) {
                        for (const [key, prop] of Object.entries(schema.properties)){
                            const p = prop;
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
                } catch (e) {
                    setInputsJson("{}");
                }
            } else {
                setInputsJson("{}");
            }
        }
    }["SkillExecutor.useEffect"], [
        selectedSkillId,
        selectedSkill
    ]);
    const handleExecute = ()=>{
        try {
            const inputs = JSON.parse(inputsJson);
            setJsonError("");
            onExecute(selectedSkillId, inputs);
        } catch (err) {
            setJsonError(err instanceof Error ? err.message : "Invalid JSON");
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "text-sm font-semibold text-gray-400 uppercase tracking-wide",
                children: "Skill Executor"
            }, void 0, false, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 559,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                value: selectedSkillId,
                onChange: (e)=>setSelectedSkillId(e.target.value),
                disabled: disabled || executingSkill,
                className: "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                        value: "",
                        children: "Select a skill..."
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 567,
                        columnNumber: 9
                    }, this),
                    availableSkills.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                            value: s.id,
                            children: s.name || s.id
                        }, s.id, false, {
                            fileName: "[project]/web/app/page.tsx",
                            lineNumber: 569,
                            columnNumber: 11
                        }, this))
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 561,
                columnNumber: 7
            }, this),
            selectedSkill && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    selectedSkill.description && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs text-gray-500",
                        children: selectedSkill.description
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 578,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "relative",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                value: inputsJson,
                                onChange: (e)=>{
                                    setInputsJson(e.target.value);
                                    setJsonError("");
                                },
                                rows: 5,
                                disabled: disabled || executingSkill,
                                className: "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm font-mono focus:outline-none focus:border-blue-500 disabled:opacity-50 resize-y",
                                placeholder: '{"param": "value"}'
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 581,
                                columnNumber: 13
                            }, this),
                            jsonError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs text-red-400 mt-1",
                                children: jsonError
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 592,
                                columnNumber: 27
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 580,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: handleExecute,
                                disabled: disabled || executingSkill || !selectedSkillId,
                                className: "flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium transition-colors disabled:opacity-40",
                                children: executingSkill ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "flex items-center justify-center gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                                        }, void 0, false, {
                                            fileName: "[project]/web/app/page.tsx",
                                            lineNumber: 603,
                                            columnNumber: 19
                                        }, this),
                                        "Executing..."
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/web/app/page.tsx",
                                    lineNumber: 602,
                                    columnNumber: 17
                                }, this) : "Execute"
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 596,
                                columnNumber: 13
                            }, this),
                            executingSkill && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: onCancel,
                                className: "px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded text-sm font-medium transition-colors",
                                children: "Cancel"
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 611,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 595,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true)
        ]
    }, void 0, true, {
        fileName: "[project]/web/app/page.tsx",
        lineNumber: 558,
        columnNumber: 5
    }, this);
}
_s5(SkillExecutor, "ClmjF0JCJj2S2fEoaEogdmMQ8JM=");
_c6 = SkillExecutor;
// ─── E-Stop ────────────────────────────────────────────────────────────────────
function EStopButton(param) {
    let { onEstop, disabled } = param;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        onClick: onEstop,
        disabled: disabled,
        className: "w-full py-4 bg-red-700 hover:bg-red-600 active:bg-red-800 border-2 border-red-500 rounded-lg text-xl font-black uppercase tracking-widest transition-all disabled:opacity-40 active:scale-[0.98] shadow-lg shadow-red-900/50",
        children: "E-STOP (Space)"
    }, void 0, false, {
        fileName: "[project]/web/app/page.tsx",
        lineNumber: 629,
        columnNumber: 5
    }, this);
}
_c7 = EStopButton;
// ─── Log Panel ─────────────────────────────────────────────────────────────────
function LogPanel(param) {
    let { logs, onClear } = param;
    _s6();
    const scrollRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "LogPanel.useEffect": ()=>{
            if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        }
    }["LogPanel.useEffect"], [
        logs
    ]);
    const typeStyles = {
        info: "text-gray-400",
        error: "text-red-400",
        feedback: "text-yellow-400",
        result: "text-green-400"
    };
    const typePrefix = {
        info: "INFO",
        error: "ERR ",
        feedback: "FEED",
        result: "RSLT"
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col h-full",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between mb-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-sm font-semibold text-gray-400 uppercase tracking-wide",
                        children: "Log"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 667,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: onClear,
                        className: "text-xs text-gray-600 hover:text-gray-400 transition-colors",
                        children: "Clear"
                    }, void 0, false, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 668,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 666,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: scrollRef,
                className: "flex-1 overflow-y-auto bg-gray-950 border border-gray-800 rounded-lg p-2 font-mono text-xs space-y-0.5 min-h-[120px] max-h-[300px]",
                children: logs.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-gray-700 italic",
                    children: "No logs yet. Connect to the robot to begin."
                }, void 0, false, {
                    fileName: "[project]/web/app/page.tsx",
                    lineNumber: 677,
                    columnNumber: 11
                }, this) : logs.map((log, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "".concat(typeStyles[log.type], " break-all"),
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-gray-600",
                                children: new Date(log.timestamp).toLocaleTimeString()
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 681,
                                columnNumber: 15
                            }, this),
                            " ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-gray-500",
                                children: [
                                    "[",
                                    typePrefix[log.type],
                                    "]"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 682,
                                columnNumber: 15
                            }, this),
                            " ",
                            log.message
                        ]
                    }, i, true, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 680,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 672,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/web/app/page.tsx",
        lineNumber: 665,
        columnNumber: 5
    }, this);
}
_s6(LogPanel, "P14GFulhWAl/Oec4Pk4QeBwKyr0=");
_c8 = LogPanel;
function Home() {
    _s7();
    const robot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$hooks$2f$useRobot$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRobot"])();
    const [activeKeys, setActiveKeys] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(new Set());
    const activeKeysRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(new Set());
    const driveIntervalRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const isDisabled = robot.connectionStatus !== "connected";
    // Extract stable function refs to avoid effect re-runs
    const { publishCmdVel, stopDriving, estop } = robot;
    // Keyboard drive controls
    const updateDriveFromKeys = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "Home.useCallback[updateDriveFromKeys]": ()=>{
            const keys = activeKeysRef.current;
            let linearX = 0;
            let angularZ = 0;
            const speed = 0.15;
            if (keys.has("w")) linearX += speed;
            if (keys.has("s")) linearX -= speed;
            if (keys.has("a")) angularZ += speed * (__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SPEED_CAPS"].MAX_ANGULAR_RADPS / __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SPEED_CAPS"].MAX_LINEAR_MPS);
            if (keys.has("d")) angularZ -= speed * (__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SPEED_CAPS"].MAX_ANGULAR_RADPS / __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SPEED_CAPS"].MAX_LINEAR_MPS);
            if (linearX !== 0 || angularZ !== 0) {
                publishCmdVel(linearX, angularZ);
            }
        }
    }["Home.useCallback[updateDriveFromKeys]"], [
        publishCmdVel
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Home.useEffect": ()=>{
            const handleKeyDown = {
                "Home.useEffect.handleKeyDown": (e)=>{
                    var _this;
                    // Don't capture when typing in inputs
                    const tag = (_this = e.target) === null || _this === void 0 ? void 0 : _this.tagName;
                    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
                    if (e.key === " ") {
                        e.preventDefault();
                        estop();
                        return;
                    }
                    const key = e.key.toLowerCase();
                    if ([
                        "w",
                        "a",
                        "s",
                        "d"
                    ].includes(key) && !activeKeysRef.current.has(key)) {
                        activeKeysRef.current.add(key);
                        setActiveKeys(new Set(activeKeysRef.current));
                        // Start drive loop if not running
                        if (!driveIntervalRef.current) {
                            driveIntervalRef.current = setInterval(updateDriveFromKeys, 100); // 10Hz
                        }
                    }
                }
            }["Home.useEffect.handleKeyDown"];
            const handleKeyUp = {
                "Home.useEffect.handleKeyUp": (e)=>{
                    const key = e.key.toLowerCase();
                    if ([
                        "w",
                        "a",
                        "s",
                        "d"
                    ].includes(key)) {
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
                }
            }["Home.useEffect.handleKeyUp"];
            window.addEventListener("keydown", handleKeyDown);
            window.addEventListener("keyup", handleKeyUp);
            return ({
                "Home.useEffect": ()=>{
                    window.removeEventListener("keydown", handleKeyDown);
                    window.removeEventListener("keyup", handleKeyUp);
                    if (driveIntervalRef.current) {
                        clearInterval(driveIntervalRef.current);
                    }
                }
            })["Home.useEffect"];
        }
    }["Home.useEffect"], [
        estop,
        stopDriving,
        updateDriveFromKeys
    ]);
    const handleEmotion = (emotion)=>{
        robot.executeSkill(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$lib$2f$rosbridge$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SkillIds"].HEAD_EMOTION, {
            emotion
        });
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "min-h-screen flex flex-col",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ConnectionBar, {
                connectionStatus: robot.connectionStatus,
                onConnect: robot.connect,
                onDisconnect: robot.disconnect
            }, void 0, false, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 782,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 p-4 grid grid-cols-1 md:grid-cols-[240px_1fr_280px] gap-4 max-w-7xl mx-auto w-full",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-6",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DriveControls, {
                                onDrive: robot.publishCmdVel,
                                onStop: robot.stopDriving,
                                activeKeys: activeKeys,
                                disabled: isDisabled
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 792,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(HeadTilt, {
                                onSetTilt: robot.setHeadTilt,
                                disabled: isDisabled
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 799,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(QuickActions, {
                                onEmotion: handleEmotion,
                                onSpeak: robot.speak,
                                executingSkill: robot.executingSkill,
                                disabled: isDisabled
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 801,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 791,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-6",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid grid-cols-2 gap-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(CameraView, {
                                        label: "Main Camera",
                                        cameraFrame: robot.mainCameraFrame,
                                        cameraStreaming: robot.mainCameraStreaming,
                                        onCapturePhoto: robot.captureMainPhoto,
                                        onToggleStream: robot.toggleMainCameraStream,
                                        disabled: isDisabled
                                    }, void 0, false, {
                                        fileName: "[project]/web/app/page.tsx",
                                        lineNumber: 812,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(CameraView, {
                                        label: "Arm Camera",
                                        cameraFrame: robot.armCameraFrame,
                                        cameraStreaming: robot.armCameraStreaming,
                                        onCapturePhoto: robot.captureArmPhoto,
                                        onToggleStream: robot.toggleArmCameraStream,
                                        disabled: isDisabled
                                    }, void 0, false, {
                                        fileName: "[project]/web/app/page.tsx",
                                        lineNumber: 820,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 811,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ArmControl, {
                                armJoints: robot.armJoints,
                                movingArm: robot.movingArm,
                                onReadState: robot.readArmState,
                                onMoveJoints: robot.moveArmToJoints,
                                disabled: isDisabled
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 830,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 810,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SkillExecutor, {
                                availableSkills: robot.availableSkills,
                                onExecute: robot.executeSkill,
                                onCancel: robot.cancelSkill,
                                executingSkill: robot.executingSkill,
                                disabled: isDisabled
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 841,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(EStopButton, {
                                onEstop: robot.estop,
                                disabled: isDisabled
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 850,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(LogPanel, {
                                logs: robot.logs,
                                onClear: robot.clearLogs
                            }, void 0, false, {
                                fileName: "[project]/web/app/page.tsx",
                                lineNumber: 853,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/web/app/page.tsx",
                        lineNumber: 840,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 789,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "p-2 text-center text-xs text-gray-700 border-t border-gray-900",
                children: "MARS Robot Control — Tripoli Rosbridge Client"
            }, void 0, false, {
                fileName: "[project]/web/app/page.tsx",
                lineNumber: 858,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/web/app/page.tsx",
        lineNumber: 780,
        columnNumber: 5
    }, this);
}
_s7(Home, "IVw9I0tn09WdFIm9fIROFz4Ub64=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$app$2f$hooks$2f$useRobot$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRobot"]
    ];
});
_c9 = Home;
var _c, _c1, _c2, _c3, _c4, _c5, _c6, _c7, _c8, _c9;
__turbopack_context__.k.register(_c, "ConnectionBar");
__turbopack_context__.k.register(_c1, "DriveControls");
__turbopack_context__.k.register(_c2, "HeadTilt");
__turbopack_context__.k.register(_c3, "QuickActions");
__turbopack_context__.k.register(_c4, "CameraView");
__turbopack_context__.k.register(_c5, "ArmControl");
__turbopack_context__.k.register(_c6, "SkillExecutor");
__turbopack_context__.k.register(_c7, "EStopButton");
__turbopack_context__.k.register(_c8, "LogPanel");
__turbopack_context__.k.register(_c9, "Home");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=web_app_21a7af7f._.js.map