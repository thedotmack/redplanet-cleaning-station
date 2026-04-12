#!/usr/bin/env bun
/**
 * Self-Reflective Correction Demo
 *
 * Sequence:
 *   1. Spin right 90° → face mirror
 *   2. Tilt head down slightly → look in mirror
 *   3. Speak: "Oh my, look at how dirty I am! My vision is a little blocked. Let me clean up."
 *   4. Head back to center
 *   5. Spin 180° → face the chair/brush station
 *   6. Drive forward through the chair legs (brush car-wash)
 *   7. Stop
 *
 * Usage: bun run src/demo-self-clean.ts <robot-ip>
 */

const robotIp = process.argv[2] || "172.17.30.145";

// --- WebSocket helpers (same pattern as robot-cmd.ts) ---

let ws: WebSocket;
let requestCounter = 0;
const advertisedTopics = new Set<string>();

function nextId(): string {
  return `demo_${++requestCounter}`;
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(`ws://${robotIp}:9090`);
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error(`Cannot connect to ${robotIp}:9090`));
    ws.onmessage = () => {}; // not needed for this script
  });
}

function stopWheels(): void {
  for (let i = 0; i < 5; i++) {
    publish("/cmd_vel", "geometry_msgs/msg/Twist", {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    });
  }
}

async function spin(degrees: number): Promise<void> {
  const radians = degrees * (Math.PI / 180);
  const speed = 0.4 * Math.sign(radians); // rad/s, positive = left
  const durationMs = Math.ceil(Math.abs(radians / speed) * 1000);
  console.log(`  Spinning ${degrees}° (${(durationMs / 1000).toFixed(1)}s)...`);
  const interval = setInterval(() => {
    publish("/cmd_vel", "geometry_msgs/msg/Twist", {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: speed },
    });
  }, 100);
  await sleep(durationMs);
  clearInterval(interval);
  stopWheels();
  await sleep(400); // settle
}

async function drive(linearX: number, durationMs: number): Promise<void> {
  const clamped = Math.max(-0.3, Math.min(0.3, linearX));
  console.log(`  Driving at ${clamped} m/s for ${(durationMs / 1000).toFixed(1)}s...`);
  const interval = setInterval(() => {
    publish("/cmd_vel", "geometry_msgs/msg/Twist", {
      linear: { x: clamped, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    });
  }, 100);
  await sleep(durationMs);
  clearInterval(interval);
  stopWheels();
}

function setHead(degrees: number): void {
  publish("/mars/head/set_position", "std_msgs/msg/Int32", { data: degrees });
}

function speak(text: string): void {
  publish("/brain/tts", "std_msgs/msg/String", { data: text });
}

// --- Main sequence ---

console.log("=== Self-Reflective Correction Demo ===");
console.log(`Robot: ${robotIp}\n`);

await connect();
console.log("Connected.\n");

// Step 1: Spin right 90°
console.log("Step 1: Spinning right 90° to face mirror...");
await spin(-90);

// Step 2: Tilt head down to look in the mirror
console.log("Step 2: Looking in the mirror...");
setHead(-15);
await sleep(1000);

// Step 3: Speak the self-reflection line
const line = "Oh my, look at how dirty I am! My vision is a little blocked. Let me clean up.";
console.log(`Step 3: Speaking: "${line}"`);
speak(line);
await sleep(7000); // wait for TTS to finish (~7s for this line)

// Step 4: Head back to center
console.log("Step 4: Head center.");
setHead(0);
await sleep(800);

// Step 5: Spin 180° to face the brush station
console.log("Step 5: Spinning 180° to face the brush station...");
await spin(180);

// Step 6: Drive through the chair legs (brush car-wash)
// Tune DRIVE_DURATION_MS to match the depth of the chair
const DRIVE_DURATION_MS = 5000; // 5s at 0.15 m/s ≈ 75cm
console.log("Step 6: Driving through the brush station...");
await drive(0.15, DRIVE_DURATION_MS);

console.log("\nDone! Self-cleaning sequence complete.");
ws.close();
process.exit(0);
