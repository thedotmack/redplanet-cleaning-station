/**
 * Interactive REPL for controlling MARS robots.
 *
 * Usage: bun run src/repl.ts <robot-ip> [port]
 */

import { RosbridgeClient } from "./rosbridge-client";
import { Topics, MessageTypes, SkillIds, SPEED_CAPS } from "./mars-topics";
import * as readline from "node:readline";

const robotIp = process.argv[2];
const port = parseInt(process.argv[3] || "9090", 10);

if (!robotIp) {
  console.error("Usage: bun run src/repl.ts <robot-ip> [port]");
  process.exit(1);
}

const client = new RosbridgeClient(robotIp, port);
let lastActionId: string | null = null;

async function main() {
  console.log(`Connecting to ${robotIp}:${port}...`);
  await client.connect();
  console.log("Connected.\n");

  printHelp();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "mars> ",
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    const [command, ...args] = trimmed.split(/\s+/);

    try {
      switch (command) {
        case "help":
          printHelp();
          break;

        case "skill": {
          const skillType = args[0];
          const inputsJson = args.slice(1).join(" ") || "{}";
          if (!skillType) {
            console.log("Usage: skill <skill_type> [json_inputs]");
            break;
          }
          let inputs: Record<string, unknown>;
          try {
            inputs = JSON.parse(inputsJson);
          } catch {
            console.error("Invalid JSON inputs:", inputsJson);
            break;
          }
          console.log(`Executing skill: ${skillType}`);
          console.log(`Inputs: ${JSON.stringify(inputs)}`);
          const result = await client.executeSkill(skillType, inputs, {
            onFeedback: (fb) => {
              console.log("  Feedback:", JSON.stringify(fb.feedback ?? fb));
            },
            timeoutMs: 120_000,
          });
          console.log("Result:", JSON.stringify(result, null, 2));
          break;
        }

        case "goto_js": {
          if (args.length < 7) {
            console.log("Usage: goto_js <j1> <j2> <j3> <j4> <j5> <j6> <duration_seconds>");
            break;
          }
          const joints = args.slice(0, 6).map(Number);
          const duration = parseFloat(args[6]);
          if (joints.some(isNaN) || isNaN(duration)) {
            console.error("All values must be numbers");
            break;
          }
          console.log(`GotoJS: joints=[${joints.join(", ")}], duration=${duration}s`);
          const gotoResult = await client.callGotoJS(joints, duration);
          console.log("Result:", JSON.stringify(gotoResult, null, 2));
          break;
        }

        case "estop": {
          console.log("EMERGENCY STOP — sending zero velocity...");
          // Send zero velocity multiple times to ensure it's received
          for (let i = 0; i < 5; i++) {
            client.publish(Topics.CMD_VEL, MessageTypes.TWIST, {
              linear: { x: 0, y: 0, z: 0 },
              angular: { x: 0, y: 0, z: 0 },
            });
          }
          console.log("Zero velocity sent (5x).");
          // Cancel last action if we have one
          if (lastActionId) {
            console.log(`Cancelling action: ${lastActionId}`);
            client.cancelActionGoal("/execute_skill", lastActionId);
            lastActionId = null;
          }
          break;
        }

        case "cmd_vel": {
          if (args.length < 2) {
            console.log("Usage: cmd_vel <linear_x> <angular_z>");
            break;
          }
          let linearX = parseFloat(args[0]);
          let angularZ = parseFloat(args[1]);
          if (isNaN(linearX) || isNaN(angularZ)) {
            console.error("Values must be numbers");
            break;
          }
          // Clamp to safety caps
          linearX = Math.max(-SPEED_CAPS.MAX_LINEAR_MPS, Math.min(SPEED_CAPS.MAX_LINEAR_MPS, linearX));
          angularZ = Math.max(-SPEED_CAPS.MAX_ANGULAR_RADPS, Math.min(SPEED_CAPS.MAX_ANGULAR_RADPS, angularZ));
          console.log(`Publishing cmd_vel: linear.x=${linearX}, angular.z=${angularZ}`);
          client.publish(Topics.CMD_VEL, MessageTypes.TWIST, {
            linear: { x: linearX, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: angularZ },
          });
          break;
        }

        case "head": {
          if (args.length < 1) {
            console.log("Usage: head <degrees> (-25 to 25)");
            break;
          }
          const degrees = parseInt(args[0], 10);
          if (isNaN(degrees) || degrees < -25 || degrees > 25) {
            console.error("Degrees must be between -25 and 25");
            break;
          }
          console.log(`Setting head position: ${degrees} degrees`);
          client.publish(Topics.HEAD_SET_POSITION, MessageTypes.INT32, { data: degrees });
          break;
        }

        case "tts": {
          const text = args.join(" ");
          if (!text) {
            console.log("Usage: tts <text to speak>");
            break;
          }
          console.log(`TTS: "${text}"`);
          client.publish(Topics.TTS, MessageTypes.STRING, { data: text });
          break;
        }

        case "skills": {
          console.log("Fetching available skills...");
          const skillsMsg = await client.waitForMessage(Topics.AVAILABLE_SKILLS, 10_000);
          const skills = (skillsMsg.msg as Record<string, unknown>)?.skills as Array<Record<string, unknown>> | undefined;
          if (skills) {
            for (const skill of skills) {
              console.log(`  ${skill.id} — ${skill.name} (${skill.type})`);
              if (skill.inputs_json) {
                console.log(`    inputs: ${skill.inputs_json}`);
              }
            }
          } else {
            console.log("No skills found in message:", JSON.stringify(skillsMsg.msg));
          }
          break;
        }

        case "sub": {
          if (args.length < 1) {
            console.log("Usage: sub <topic>");
            break;
          }
          const subTopic = args[0];
          console.log(`Subscribing to ${subTopic}...`);
          client.subscribe(subTopic, (msg) => {
            console.log(`[${subTopic}]`, JSON.stringify(msg.msg).slice(0, 200));
          });
          break;
        }

        case "quit":
        case "exit":
          console.log("Disconnecting...");
          client.close();
          process.exit(0);
          break;

        default:
          console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
      }
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : err);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    client.close();
    process.exit(0);
  });
}

function printHelp() {
  console.log(`
MARS Robot REPL Commands:
  skill <skill_type> [json_inputs]     Execute a skill via /execute_skill
  goto_js <j1-j6> <duration>          Move arm via GotoJS service
  estop                                Emergency stop (zero vel + cancel action)
  cmd_vel <linear_x> <angular_z>      Publish velocity command
  head <degrees>                       Set head tilt (-25 to 25)
  tts <text>                           Text-to-speech
  skills                               List available skills
  sub <topic>                          Subscribe and print messages
  help                                 Show this help
  quit / exit                          Disconnect and exit
`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
