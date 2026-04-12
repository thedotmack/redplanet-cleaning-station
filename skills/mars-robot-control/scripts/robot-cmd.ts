#!/usr/bin/env bun
/**
 * MARS Robot Remote Controller — single-command interface.
 *
 * Usage: bun run <this-file> <robot-ip> <command> [args...]
 *
 * Commands:
 *   speak <text>                        Say something via TTS
 *   photo [main|arm]                    Capture and save a photo (default: main)
 *   skill <skill_id> <json_inputs>      Execute a skill
 *   head <degrees>                      Tilt head (-25 to 25)
 *   emotion <emotion> [repeat]          Express an emotion
 *   drive <linear_x> <angular_z> <sec>  Drive for N seconds then stop
 *   spin <degrees>                      Spin in place (positive = left)
 *   arm <x> <y> <z> [roll] [pitch] [yaw] [duration]  Move arm to XYZ
 *   arm_home                            Move arm to zero/home position
 *   torque <on|off>                     Enable/disable arm torque
 *   goto_js <j1> <j2> <j3> <j4> <j5> <j6> <duration>  Move arm joints
 *   joints                              Read current arm joint positions
 *   status                              Read battery, arm status, position
 *   skills                              List available skills
 *   stop                                Emergency stop everything
 */

const robotIp = process.argv[2];
const command = process.argv[3];
const args = process.argv.slice(4);

if (!robotIp || !command) {
  console.error("Usage: bun run robot-cmd.ts <robot-ip> <command> [args...]");
  console.error("Commands: speak, photo, skill, head, emotion, drive, spin, arm, arm_home,");
  console.error("          torque, goto_js, joints, status, skills, stop");
  process.exit(1);
}

// --- WebSocket helpers ---

function jsonStringifyWithFloats(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === "number" && Number.isFinite(value) && value === Math.floor(value)) {
      return `__FLOAT__${value.toFixed(1)}`;
    }
    return value;
  }).replace(/"__FLOAT__([^"]+)"/g, "$1");
}

let ws: WebSocket;
let requestCounter = 0;
const advertisedTopics = new Set<string>();
const pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
const activeActions = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();

function nextId(): string {
  return `cmd_${++requestCounter}`;
}

function send(msg: Record<string, unknown>): void {
  ws.send(JSON.stringify(msg));
}

function publish(topic: string, type: string, msg: Record<string, unknown>): void {
  if (!advertisedTopics.has(topic)) {
    send({ op: "advertise", topic, type });
    advertisedTopics.add(topic);
  }
  send({ op: "publish", topic, msg });
}

function callService(service: string, serviceArgs: Record<string, unknown>, timeoutMs = 30000): Promise<any> {
  const id = nextId();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pendingRequests.delete(id); reject(new Error("Service timeout")); }, timeoutMs);
    pendingRequests.set(id, {
      resolve: (v) => { clearTimeout(timeout); resolve(v); },
      reject: (e) => { clearTimeout(timeout); reject(e); },
    });
    send({ op: "call_service", id, service, args: serviceArgs });
  });
}

function executeSkill(skillType: string, inputs: Record<string, unknown>, timeoutMs = 120000): Promise<any> {
  const id = nextId();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { activeActions.delete(id); reject(new Error("Action timeout")); }, timeoutMs);
    activeActions.set(id, {
      resolve: (v) => { clearTimeout(timeout); resolve(v); },
      reject: (e) => { clearTimeout(timeout); reject(e); },
    });
    send({
      op: "send_action_goal", id,
      action: "/execute_skill",
      action_type: "brain_messages/action/ExecuteSkill",
      goal: { skill_type: skillType, inputs: jsonStringifyWithFloats(inputs) },
    });
  });
}

function subscribe(topic: string, opts?: Record<string, unknown>): Promise<any> {
  return new Promise((resolve) => {
    const id = nextId();
    const handler = (msg: any) => {
      if (msg.op === "publish" && msg.topic === topic) {
        resolve(msg);
      }
    };
    messageHandlers.push(handler);
    const subMsg: Record<string, unknown> = { op: "subscribe", id, topic, ...opts };
    send(subMsg);
  });
}

const messageHandlers: ((msg: any) => void)[] = [];

async function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(`ws://${robotIp}:9090`);
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error(`Cannot connect to ${robotIp}:9090`));
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data));

      // Route action results
      if (msg.op === "action_result" && msg.id && activeActions.has(msg.id)) {
        activeActions.get(msg.id)!.resolve(msg);
        activeActions.delete(msg.id);
        return;
      }
      if (msg.op === "action_feedback" && msg.id) {
        const fb = msg.values?.feedback;
        if (fb) console.log("  feedback:", fb);
        return;
      }
      // Route service responses
      if ((msg.op === "service_response") && msg.id && pendingRequests.has(msg.id)) {
        pendingRequests.get(msg.id)!.resolve(msg);
        pendingRequests.delete(msg.id);
        return;
      }
      // Generic handlers
      for (const h of messageHandlers) h(msg);
    };
  });
}

function done(code = 0): never {
  ws?.close();
  process.exit(code);
}

// --- Commands ---

await connect();

switch (command) {
  case "speak": {
    const text = args.join(" ");
    if (!text) { console.error("Usage: speak <text>"); done(1); }
    publish("/brain/tts", "std_msgs/msg/String", { data: text });
    console.log(`Speaking: "${text}"`);
    await new Promise(r => setTimeout(r, 500));
    done();
  }

  case "photo": {
    const cam = args[0] || "main";
    const topic = cam === "arm"
      ? "/mars/arm/image_raw/compressed"
      : "/mars/main_camera/left/image_raw/compressed";
    console.log(`Capturing from ${cam} camera...`);
    const msg = await Promise.race([
      subscribe(topic),
      new Promise((_, reject) => setTimeout(() => reject(new Error("No image received (5s timeout)")), 5000)),
    ]) as any;
    const buf = Buffer.from(msg.msg.data, "base64");
    const path = `/tmp/mars_${cam}_${Date.now()}.jpg`;
    require("fs").writeFileSync(path, buf);
    console.log(`Saved: ${path} (${buf.length} bytes)`);
    done();
  }

  case "skill": {
    const skillType = args[0];
    const inputsJson = args.slice(1).join(" ") || "{}";
    if (!skillType) { console.error("Usage: skill <skill_id> <json_inputs>"); done(1); }
    let inputs: Record<string, unknown>;
    try { inputs = JSON.parse(inputsJson); } catch { console.error("Invalid JSON:", inputsJson); done(1); }
    console.log(`Executing: ${skillType}`);
    const result = await executeSkill(skillType, inputs!);
    const v = result.values;
    console.log(`Result: ${v.success ? "SUCCESS" : "FAILED"} — ${v.message}`);
    done(v.success ? 0 : 1);
  }

  case "head": {
    const degrees = parseInt(args[0], 10);
    if (isNaN(degrees) || degrees < -25 || degrees > 25) { console.error("Usage: head <-25 to 25>"); done(1); }
    publish("/mars/head/set_position", "std_msgs/msg/Int32", { data: degrees });
    console.log(`Head: ${degrees}°`);
    await new Promise(r => setTimeout(r, 500));
    done();
  }

  case "emotion": {
    const emotion = args[0];
    const repeat = parseInt(args[1] || "1", 10);
    if (!emotion) { console.error("Usage: emotion <happy|sad|excited|thinking> [repeat]"); done(1); }
    console.log(`Emotion: ${emotion} (repeat: ${repeat})`);
    const result = await executeSkill("innate-os/head_emotion", { emotion, repeat });
    console.log(`Result: ${result.values.message}`);
    done();
  }

  case "drive": {
    const linearX = parseFloat(args[0]);
    const angularZ = parseFloat(args[1]);
    const seconds = parseFloat(args[2]);
    if (isNaN(linearX) || isNaN(angularZ) || isNaN(seconds)) {
      console.error("Usage: drive <linear_x> <angular_z> <seconds>");
      done(1);
    }
    const clampedLin = Math.max(-0.3, Math.min(0.3, linearX));
    const clampedAng = Math.max(-1.0, Math.min(1.0, angularZ));
    console.log(`Driving: linear=${clampedLin} angular=${clampedAng} for ${seconds}s`);
    const interval = setInterval(() => {
      publish("/cmd_vel", "geometry_msgs/msg/Twist", {
        linear: { x: clampedLin, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: clampedAng },
      });
    }, 100);
    await new Promise(r => setTimeout(r, seconds * 1000));
    clearInterval(interval);
    for (let i = 0; i < 5; i++) {
      publish("/cmd_vel", "geometry_msgs/msg/Twist", {
        linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 },
      });
    }
    console.log("Stopped.");
    done();
  }

  case "spin": {
    const degrees = parseFloat(args[0]);
    if (isNaN(degrees)) { console.error("Usage: spin <degrees>"); done(1); }
    const radians = degrees * Math.PI / 180;
    const speed = 0.4 * Math.sign(radians);
    const durationMs = Math.ceil(Math.abs(radians / speed) * 1000);
    console.log(`Spinning ${degrees}° (${(durationMs/1000).toFixed(1)}s)...`);
    const interval = setInterval(() => {
      publish("/cmd_vel", "geometry_msgs/msg/Twist", {
        linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: speed },
      });
    }, 100);
    await new Promise(r => setTimeout(r, durationMs));
    clearInterval(interval);
    for (let i = 0; i < 5; i++) {
      publish("/cmd_vel", "geometry_msgs/msg/Twist", {
        linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 },
      });
    }
    console.log("Done.");
    done();
  }

  case "arm": {
    if (args.length < 3) {
      console.error("Usage: arm <x> <y> <z> [roll] [pitch] [yaw] [duration]");
      done(1);
    }
    const x = parseFloat(args[0]);
    const y = parseFloat(args[1]);
    const z = parseFloat(args[2]);
    const roll = parseFloat(args[3] || "0");
    const pitch = parseFloat(args[4] || "0");
    const yaw = parseFloat(args[5] || "0");
    const duration = parseInt(args[6] || "3", 10);
    console.log(`Arm: (${x}, ${y}, ${z}) rpy=(${roll}, ${pitch}, ${yaw}) ${duration}s`);
    const result = await executeSkill("innate-os/arm_move_to_xyz", { x, y, z, roll, pitch, yaw, duration });
    console.log(`Result: ${result.values.message}`);
    done(result.values.success ? 0 : 1);
  }

  case "arm_home": {
    console.log("Moving arm to home/zero...");
    const result = await executeSkill("innate-os/arm_zero_position", { duration: 3 });
    console.log(`Result: ${result.values.message}`);
    done(result.values.success ? 0 : 1);
  }

  case "torque": {
    const state = args[0];
    if (state !== "on" && state !== "off") { console.error("Usage: torque <on|off>"); done(1); }
    console.log(`Torque: ${state}`);
    const result = await executeSkill("innate-os/arm_utils", { command: `torque_${state}` });
    console.log(`Result: ${result.values.message}`);
    done();
  }

  case "goto_js": {
    if (args.length < 7) {
      console.error("Usage: goto_js <j1> <j2> <j3> <j4> <j5> <j6> <duration>");
      done(1);
    }
    const joints = args.slice(0, 6).map(Number);
    const duration = parseFloat(args[6]);
    console.log(`GotoJS: [${joints.join(", ")}] ${duration}s`);
    const result = await callService("/mars/arm/goto_js", {
      data: { data: joints }, time: duration,
    });
    console.log(`Result: success=${result.values.success}`);
    done(result.values.success ? 0 : 1);
  }

  case "joints": {
    const msg = await Promise.race([
      subscribe("/mars/arm/state"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000)),
    ]) as any;
    const positions = msg.msg.position;
    console.log(`Joints: [${positions.map((j: number) => j.toFixed(4)).join(", ")}]`);
    done();
  }

  case "status": {
    // Collect multiple topics in parallel
    const results: Record<string, any> = {};
    const promises = [
      subscribe("/battery_state").then(m => { results.battery = m.msg; }),
      subscribe("/mars/arm/status").then(m => { results.arm = m.msg; }),
      subscribe("/odom").then(m => { results.odom = m.msg; }),
      subscribe("/mars/head/current_position").then(m => { results.head = m.msg; }),
    ];
    await Promise.race([
      Promise.all(promises),
      new Promise(r => setTimeout(r, 5000)),
    ]);
    if (results.battery) {
      console.log(`Battery: ${(results.battery.percentage * 100).toFixed(1)}% (${results.battery.voltage.toFixed(2)}V)`);
    }
    if (results.arm) {
      console.log(`Arm: ${results.arm.is_ok ? "OK" : "ERROR: " + results.arm.error} | torque: ${results.arm.is_torque_enabled}`);
    }
    if (results.odom) {
      const p = results.odom.pose.pose.position;
      const o = results.odom.pose.pose.orientation;
      const yaw = 2 * Math.atan2(o.z, o.w) * 180 / Math.PI;
      console.log(`Position: x=${p.x.toFixed(3)} y=${p.y.toFixed(3)} yaw=${yaw.toFixed(1)}°`);
    }
    if (results.head) {
      const h = JSON.parse(results.head.data);
      console.log(`Head: ${h.current_position.toFixed(1)}°`);
    }
    done();
  }

  case "skills": {
    const msg = await Promise.race([
      subscribe("/brain/available_skills"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000)),
    ]) as any;
    const skills = msg.msg.skills;
    for (const s of skills) {
      console.log(`  ${s.id} (${s.type}) — inputs: ${s.inputs_json}`);
    }
    console.log(`\n${skills.length} skills available.`);
    done();
  }

  case "stop": {
    console.log("EMERGENCY STOP");
    for (let i = 0; i < 10; i++) {
      publish("/cmd_vel", "geometry_msgs/msg/Twist", {
        linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 },
      });
    }
    console.log("Zero velocity sent.");
    done();
  }

  default:
    console.error(`Unknown command: ${command}`);
    done(1);
}
