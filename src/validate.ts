/**
 * Incremental validation tests for MARS robot control.
 *
 * Usage: bun run src/validate.ts <robot-ip> <test-number>
 *
 * Tests must be run in order — each builds on the previous.
 * Do not proceed to the next test if the current one fails.
 */

import { RosbridgeClient, type RosbridgeMessage } from "./rosbridge-client";
import { Topics, SkillIds, SPEED_CAPS } from "./mars-topics";

const robotIp = process.argv[2];
const testNumber = parseInt(process.argv[3] || "0", 10);

if (!robotIp || !testNumber) {
  console.error("Usage: bun run src/validate.ts <robot-ip> <test-number>");
  console.error("Tests: 1=Connection, 2=head_emotion, 3=GotoJS no-op, 4=Small arm move,");
  console.error("       5=arm_move_to_xyz, 6=Drive+skill, 7=Navigate");
  process.exit(1);
}

const client = new RosbridgeClient(robotIp);

async function connectOrDie(): Promise<void> {
  console.log(`Connecting to ${robotIp}:9090...`);
  await client.connect(10_000);
  console.log("Connected to rosbridge.\n");
}

// ─── Test 1: Connection + Skill Discovery ────────────────────────────

async function test1_connectionAndDiscovery(): Promise<void> {
  console.log("=== Test 1: Connection + Skill Discovery ===\n");
  await connectOrDie();

  console.log("Subscribing to /brain/available_skills...");
  const skillsMsg = await client.waitForMessage(Topics.AVAILABLE_SKILLS, 15_000);
  const skills = (skillsMsg.msg as Record<string, unknown>)?.skills as Array<Record<string, unknown>> | undefined;

  if (!skills || skills.length === 0) {
    throw new Error("No skills found — skills_action_server may not be running");
  }

  console.log(`Found ${skills.length} skills:\n`);
  for (const skill of skills) {
    console.log(`  ID: ${skill.id}`);
    console.log(`  Name: ${skill.name}`);
    console.log(`  Type: ${skill.type}`);
    console.log(`  inputs_json: ${skill.inputs_json || "(none)"}`);
    console.log();
  }

  console.log("PASS: skills_action_server is running, skills discovered.");
}

// ─── Test 2: Safe Skill Execution (head_emotion) ────────────────────

async function test2_headEmotion(): Promise<void> {
  console.log("=== Test 2: head_emotion Skill (safest skill) ===\n");
  await connectOrDie();

  console.log(`Executing: ${SkillIds.HEAD_EMOTION} with { emotion: "happy" }`);
  const result = await client.executeSkill(
    SkillIds.HEAD_EMOTION,
    { emotion: "happy" },
    {
      onFeedback: (fb) => {
        console.log("  Feedback:", JSON.stringify(fb.feedback ?? fb));
      },
      timeoutMs: 30_000,
    },
  ) as RosbridgeMessage;

  console.log("\nResult:", JSON.stringify(result, null, 2));

  const resultValues = result.values as Record<string, unknown> | undefined;
  if (resultValues?.success === true) {
    console.log("\nPASS: head_emotion executed successfully.");
  } else {
    throw new Error(
      `head_emotion failed: ${resultValues?.message ?? JSON.stringify(result)}`,
    );
  }
}

// ─── Test 3: GotoJS No-Op (current joints as target) ────────────────

async function test3_gotoJsNoOp(): Promise<void> {
  console.log("=== Test 3: GotoJS No-Op (send current joints as target) ===\n");
  await connectOrDie();

  // Read current arm state
  console.log("Reading current arm state from /mars/arm/state...");
  const armMsg = await client.waitForMessage(Topics.ARM_STATE, 10_000);
  const armState = armMsg.msg as Record<string, unknown>;
  const positions = armState?.position as number[];

  if (!positions || positions.length < 6) {
    throw new Error(`Expected 6+ joint positions, got: ${JSON.stringify(positions)}`);
  }

  const currentJoints = positions.slice(0, 6);
  console.log(`Current joints: [${currentJoints.map((j) => j.toFixed(4)).join(", ")}]`);
  console.log(`\nCalling GotoJS with these same joints (no-op move), duration=2.0s...`);

  const result = await client.callGotoJS(currentJoints, 2.0) as RosbridgeMessage;
  console.log("\nResult:", JSON.stringify(result, null, 2));

  const resultValues = (result.values ?? result.result ?? result) as Record<string, unknown>;
  if (resultValues?.success === true || (result as Record<string, unknown>).result === true) {
    console.log("\nPASS: GotoJS no-op succeeded — serialization format is correct.");
  } else {
    console.log("\nNote: Checking if result indicates success in any form...");
    console.log("Full response:", JSON.stringify(result));
    // Some services return success differently
    throw new Error(`GotoJS no-op may have failed: ${JSON.stringify(result)}`);
  }
}

// ─── Test 4: Small Arm Move via GotoJS ───────────────────────────────

async function test4_smallArmMove(): Promise<void> {
  console.log("=== Test 4: Small Arm Move via GotoJS ===\n");
  await connectOrDie();

  // Read current arm state
  console.log("Reading current arm state...");
  const armMsg = await client.waitForMessage(Topics.ARM_STATE, 10_000);
  const armState = armMsg.msg as Record<string, unknown>;
  const positions = armState?.position as number[];

  if (!positions || positions.length < 6) {
    throw new Error(`Expected 6+ joint positions, got: ${JSON.stringify(positions)}`);
  }

  const currentJoints = positions.slice(0, 6);
  console.log(`Current joints: [${currentJoints.map((j) => j.toFixed(4)).join(", ")}]`);

  // Modify joint 1 (base rotation) by +0.2 radians
  const targetJoints = [...currentJoints];
  targetJoints[0] += 0.2;
  console.log(`Target joints:  [${targetJoints.map((j) => j.toFixed(4)).join(", ")}]`);
  console.log(`  (joint 0 moved by +0.2 rad)`);

  console.log(`\nCalling GotoJS with modified joints, duration=2.0s...`);
  const result = await client.callGotoJS(targetJoints, 2.0) as RosbridgeMessage;
  console.log("\nResult:", JSON.stringify(result, null, 2));

  // Wait a moment then read arm state to confirm movement
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const afterMsg = await client.waitForMessage(Topics.ARM_STATE, 10_000);
  const afterState = afterMsg.msg as Record<string, unknown>;
  const afterPositions = (afterState?.position as number[])?.slice(0, 6);
  console.log(`After joints:   [${afterPositions?.map((j) => j.toFixed(4)).join(", ")}]`);

  const delta = Math.abs((afterPositions?.[0] ?? 0) - currentJoints[0]);
  if (delta > 0.1) {
    console.log(`\nPASS: Joint 0 moved by ${delta.toFixed(4)} rad (expected ~0.2).`);
  } else {
    console.log(`\nWARN: Joint 0 only moved ${delta.toFixed(4)} rad — may not have completed.`);
  }
}

// ─── Test 5: arm_move_to_xyz via ExecuteSkill ────────────────────────

async function test5_armMoveToXyz(): Promise<void> {
  console.log("=== Test 5: arm_move_to_xyz via ExecuteSkill ===\n");
  await connectOrDie();

  // First discover the skill to get its inputs_json
  console.log("Discovering skill inputs from /brain/available_skills...");
  const skillsMsg = await client.waitForMessage(Topics.AVAILABLE_SKILLS, 15_000);
  const skills = (skillsMsg.msg as Record<string, unknown>)?.skills as Array<Record<string, unknown>> | undefined;
  const armSkill = skills?.find((s) => s.id === SkillIds.ARM_MOVE_TO_XYZ);

  if (!armSkill) {
    throw new Error(`Skill ${SkillIds.ARM_MOVE_TO_XYZ} not found in available skills`);
  }

  console.log(`Found skill: ${armSkill.id}`);
  console.log(`inputs_json: ${armSkill.inputs_json}`);

  // Safe position: roughly in front of robot, slightly elevated
  const inputs = { x: 0.2, y: 0.0, z: 0.3, roll: 0.0, pitch: 0.0, yaw: 0.0 };
  console.log(`\nExecuting with inputs: ${JSON.stringify(inputs)}`);

  const result = await client.executeSkill(
    SkillIds.ARM_MOVE_TO_XYZ,
    inputs,
    {
      onFeedback: (fb) => {
        console.log("  Feedback:", JSON.stringify(fb.feedback ?? fb));
      },
      timeoutMs: 60_000,
    },
  ) as RosbridgeMessage;

  console.log("\nResult:", JSON.stringify(result, null, 2));

  const resultValues = result.values as Record<string, unknown> | undefined;
  if (resultValues?.success === true) {
    console.log("\nPASS: arm_move_to_xyz executed successfully.");
  } else {
    throw new Error(
      `arm_move_to_xyz failed: ${resultValues?.message ?? JSON.stringify(result)}`,
    );
  }
}

// ─── Test 6: Drive + Skill Combined ──────────────────────────────────

async function test6_driveAndSkill(): Promise<void> {
  console.log("=== Test 6: Drive (spin) + head_emotion Combined ===\n");
  await connectOrDie();

  // Start a slow spin via cmd_vel (0.4 rad/s for ~15.7s = 360 degrees)
  const angularSpeed = 0.4;
  const spinDurationMs = Math.ceil((2 * Math.PI / angularSpeed) * 1000);
  console.log(`Spinning at ${angularSpeed} rad/s for ${(spinDurationMs / 1000).toFixed(1)}s (360 degrees)`);
  console.log(`Simultaneously executing head_emotion "excited"`);

  // Start skill execution (non-blocking)
  const skillPromise = client.executeSkill(
    SkillIds.HEAD_EMOTION,
    { emotion: "excited" },
    {
      onFeedback: (fb) => {
        console.log("  Skill feedback:", JSON.stringify(fb.feedback ?? fb));
      },
      timeoutMs: 60_000,
    },
  );

  // Drive in a circle by publishing cmd_vel at 10Hz
  const publishIntervalMs = 100;
  let elapsed = 0;
  const driveInterval = setInterval(() => {
    if (elapsed >= spinDurationMs) {
      clearInterval(driveInterval);
      // Send zero velocity to stop
      client.publish(Topics.CMD_VEL, "geometry_msgs/msg/Twist", {
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      });
      console.log("Spin complete, stopped.");
      return;
    }
    client.publish(Topics.CMD_VEL, "geometry_msgs/msg/Twist", {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: angularSpeed },
    });
    elapsed += publishIntervalMs;
  }, publishIntervalMs);

  // Wait for skill to complete
  const result = await skillPromise;
  console.log("\nSkill result:", JSON.stringify(result, null, 2));

  // Wait for spin to finish if skill finished first
  if (elapsed < spinDurationMs) {
    console.log("Waiting for spin to complete...");
    await new Promise((resolve) => setTimeout(resolve, spinDurationMs - elapsed + 500));
    clearInterval(driveInterval);
    // Final stop
    client.publish(Topics.CMD_VEL, "geometry_msgs/msg/Twist", {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    });
  }

  console.log("\nPASS: Drive + skill combined test complete.");
}

// ─── Test 7: Navigate via Skill ──────────────────────────────────────

async function test7_navigate(): Promise<void> {
  console.log("=== Test 7: navigate_to_position via ExecuteSkill ===\n");
  await connectOrDie();

  // First discover the skill to get its inputs_json
  console.log("Discovering skill inputs from /brain/available_skills...");
  const skillsMsg = await client.waitForMessage(Topics.AVAILABLE_SKILLS, 15_000);
  const skills = (skillsMsg.msg as Record<string, unknown>)?.skills as Array<Record<string, unknown>> | undefined;
  const navSkill = skills?.find((s) => s.id === SkillIds.NAVIGATE_TO_POSITION);

  if (!navSkill) {
    throw new Error(`Skill ${SkillIds.NAVIGATE_TO_POSITION} not found in available skills`);
  }

  console.log(`Found skill: ${navSkill.id}`);
  console.log(`inputs_json: ${navSkill.inputs_json}`);

  // Read current position from odom
  console.log("\nReading current position from /odom...");
  const odomMsg = await client.waitForMessage(Topics.ODOM, 10_000);
  const odomPose = (odomMsg.msg as Record<string, unknown>)?.pose as Record<string, unknown>;
  const position = (odomPose?.pose as Record<string, unknown>)?.position as Record<string, number>;

  if (!position) {
    console.log("Could not read odom position, using relative movement of 0.5m forward");
  } else {
    console.log(`Current position: x=${position.x?.toFixed(3)}, y=${position.y?.toFixed(3)}`);
  }

  // Navigate 0.5m forward from current position
  const targetX = (position?.x ?? 0) + 0.5;
  const targetY = position?.y ?? 0;
  const inputs = { x: targetX, y: targetY, theta: 0.0, local_frame: true };
  console.log(`\nNavigating to: x=${targetX.toFixed(3)}, y=${targetY.toFixed(3)}, theta=0`);

  const result = await client.executeSkill(
    SkillIds.NAVIGATE_TO_POSITION,
    inputs,
    {
      onFeedback: (fb) => {
        console.log("  Feedback:", JSON.stringify(fb.feedback ?? fb));
      },
      timeoutMs: 120_000,
    },
  ) as RosbridgeMessage;

  console.log("\nResult:", JSON.stringify(result, null, 2));

  const resultValues = result.values as Record<string, unknown> | undefined;
  if (resultValues?.success === true) {
    console.log("\nPASS: navigate_to_position executed successfully.");
  } else {
    throw new Error(
      `navigate_to_position failed: ${resultValues?.message ?? JSON.stringify(result)}`,
    );
  }
}

// ─── Main ────────────────────────────────────────────────────────────

const tests: Record<number, () => Promise<void>> = {
  1: test1_connectionAndDiscovery,
  2: test2_headEmotion,
  3: test3_gotoJsNoOp,
  4: test4_smallArmMove,
  5: test5_armMoveToXyz,
  6: test6_driveAndSkill,
  7: test7_navigate,
};

const testFn = tests[testNumber];
if (!testFn) {
  console.error(`Unknown test number: ${testNumber}. Valid: 1-7`);
  process.exit(1);
}

testFn()
  .then(() => {
    console.log("\n--- Test complete ---");
    client.close();
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nFAIL:", err instanceof Error ? err.message : err);
    client.close();
    process.exit(1);
  });
