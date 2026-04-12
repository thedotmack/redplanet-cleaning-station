---
name: mars-robot-control
description: >
  Control MARS/Innate robots over rosbridge WebSocket. Covers connecting to the robot,
  executing skills, moving the arm, driving the base, tilting the head, and reading
  sensors — all via JSON-over-WebSocket to rosbridge_server on port 9090.
  Use this skill whenever working with MARS robots, Innate OS, rosbridge, ROS2 robot
  control, maurice_arm, brain_client, or any project that talks to a robot over WebSocket.
  Also trigger when seeing imports from brain_client, brain_messages, maurice_msgs, or
  references to topics like /cmd_vel, /mars/arm, /brain/chat_in, /execute_skill.
---

# MARS Robot Control via Rosbridge

Control MARS robots by sending commands through rosbridge WebSocket to the
`skills_action_server` running on the Jetson. This leverages Innate's own
skill execution pipeline — the same code skills their team writes, tests,
and improves in the innate-os repo.

## How It Works

```
Claude Code (decides what to do)
    ↓ JSON-over-WebSocket (port 9090)
rosbridge_server (on Jetson)
    ↓
skills_action_server ← runs Innate's Python skills
    ↓ injects interfaces, sensors, cameras
ManipulationInterface / MobilityInterface / HeadInterface
    ↓
MoveIt, Nav2, servo drivers, hardware
```

The robot's `skills_action_server` loads Python skills from `~/innate-os/skills/`
and `~/skills/`, hot-reloads them on file changes, and exposes them via the
`/execute_skill` ROS2 action. When Innate's team improves a skill upstream,
those improvements flow through automatically.

**Primary interface**: Send action goals to `/execute_skill` — this is the
designed API. Use raw topic publishing only for real-time control loops
(velocity commands) or sensor streaming where skills don't apply.

## First-Time Setup

Clone the innate-os repo so you have the actual message definitions and skill
source code as reference:

```bash
bash <skill-path>/scripts/setup.sh
```

The source of truth lives at `<skill-path>/innate-os/ros2_ws/`. When you need
exact field names for a message type, read the actual `.action`/`.srv`/`.msg`
file — never guess.

## Connection

```typescript
const ws = new WebSocket("ws://<ROBOT_IP>:9090");
```

No auth, no handshake. SSH: `ssh jetson1@<ROBOT_IP>` (password: `goodbot`).

## Emergency Stop

To stop all robot motion immediately:

1. **Stop driving**: Publish zero Twist to `/cmd_vel` (multiple times)
2. **Cancel running skill**: Send `cancel_action_goal` with the active goal ID
3. **Stop arm if dangerous**: Execute `arm_utils` with `torque_off`:
   ```json
   {"op": "send_action_goal", "action": "/execute_skill",
    "action_type": "brain_messages/action/ExecuteSkill",
    "goal": {"skill_type": "innate-os/arm_utils", "inputs": "{\"command\": \"torque_off\"}"}}
   ```
   WARNING: torque_off lets the arm fall under gravity. Only use if servos are overloaded
   and the arm is in a dangerous position. Use `torque_on` to re-enable.

## Executing Skills (Primary Interface)

This is how you should control the robot for most tasks. The `skills_action_server`
handles all the complexity — sensor subscriptions, interface injection, trajectory
planning, camera management, state updates at 50Hz.

### Action Definition

From `innate-os/ros2_ws/src/brain/brain_messages/action/ExecuteSkill.action`:

```
# Goal
string skill_type    # Skill ID, e.g. "innate-os/arm_move_to_xyz"
string inputs        # JSON string of kwargs, e.g. '{"x": 0.2}'

# Result
bool success
string message
string skill_type
string success_type  # "success", "cancelled", "failure"

# Feedback
string skill_type
string feedback
string image_b64
```

The field names are `skill_type` and `inputs` — NOT `skill_id`, NOT `parameters`.
The server does `json.loads(inputs)` then `skill.execute(**parsed)`.

### How to Call

```json
{
  "op": "send_action_goal",
  "id": "unique_id",
  "action": "/execute_skill",
  "action_type": "brain_messages/action/ExecuteSkill",
  "goal": {
    "skill_type": "innate-os/arm_move_to_xyz",
    "inputs": "{\"x\": 0.2, \"y\": 0.0, \"z\": 0.3, \"roll\": 0, \"pitch\": 0, \"yaw\": 0}"
  }
}
```

### Finding Available Skills and Their Inputs

Subscribe to `/brain/available_skills` (latched topic — delivers immediately).
Each skill has an `inputs_json` field showing the parameter names and types,
which map to the `execute()` method's Python signature.

For the full skill source, read the Python files:
- Built-in skills: `innate-os/ros2_ws/src/brain/brain_client/brain_client/skills_action_server.py`
- Skill base class: `innate-os/ros2_ws/src/brain/brain_client/brain_client/skill_types.py`
- Actual skill implementations: on the Jetson at `~/innate-os/skills/*.py` and `~/skills/*.py`

Read `references/skill-execution.md` for monitoring, cancellation, and physical skill details.

## Direct Control (Secondary Interface)

For real-time control loops or things that don't have a skill, use raw topics/services.

### Velocity Commands (Driving)

Publish `geometry_msgs/msg/Twist` to `/cmd_vel`:

```json
{"op": "advertise", "topic": "/cmd_vel", "type": "geometry_msgs/msg/Twist"}
{"op": "publish", "topic": "/cmd_vel", "msg": {
  "linear": {"x": 0.15, "y": 0, "z": 0}, "angular": {"x": 0, "y": 0, "z": 0}
}}
```

Republish at ~10Hz for sustained motion (velocity smoother has 0.2s timeout).
Safety caps: 0.3 m/s linear, 1.0 rad/s angular.

Read `references/mobility-control.md` for circles, spins, and Nav2 waypoints.

### Arm (via Service)

Call `/mars/arm/goto_js` for smooth MoveIt-planned trajectories:

```json
{"op": "call_service", "id": "arm_1", "service": "/mars/arm/goto_js",
 "args": {"data": {"data": [0, -0.5, 1.5, -1.0, 0, 0]}, "time": 2.0}}
```

Do NOT publish raw to `/mars/arm/commands` — the UDP leader receiver may
override at 100Hz. Read `references/arm-control.md` for details.

### Head Tilt

Publish `std_msgs/msg/Int32` to `/mars/head/set_position` (degrees, -25 to +25):

```json
{"op": "advertise", "topic": "/mars/head/set_position", "type": "std_msgs/msg/Int32"}
{"op": "publish", "topic": "/mars/head/set_position", "msg": {"data": 5}}
```

Read `references/head-control.md` for the emotion skill and position reading.

### Sensors

Subscribe with throttle to avoid flooding:

```json
{"op": "subscribe", "topic": "/odom", "throttle_rate": 200, "queue_length": 1}
{"op": "subscribe", "topic": "/battery_state", "throttle_rate": 5000, "queue_length": 1}
{"op": "subscribe", "topic": "/mars/arm/status", "throttle_rate": 3000, "queue_length": 1}
```

Read `references/sensors.md` for all available sensor topics.

## Rosbridge Protocol

Every message is `{"op": "<operation>", ...}` with optional `id` for correlation.
Read `references/rosbridge-protocol.md` for the full opcode reference.

Advertise a topic once before the first publish. Subsequent publishes reuse it.

## Topic Name Constants

Use these exact strings — a typo creates a silent failure with no error:

| Topic | Type | Purpose |
|-------|------|---------|
| `/cmd_vel` | Twist | Velocity commands |
| `/odom` | Odometry | Position/orientation |
| `/brain/available_skills` | AvailableSkills | Skill list (latched) |
| `/brain/chat_in` | String | Send text to BASIC agent (see note below) |
| `/brain/chat_out` | String | Agent responses |
| `/brain/tts` | String | Text-to-speech |
| `/mars/arm/state` | JointState | Current arm joints |
| `/mars/arm/status` | ArmStatus | Servo health |
| `/mars/main_camera/left/image_raw/compressed` | CompressedImage | Main camera — the robot's eyes |
| `/mars/arm/image_raw/compressed` | CompressedImage | Wrist camera — for manipulation only |
| `/mars/head/set_position` | Int32 | Head tilt target (degrees) |
| `/mars/head/current_position` | String | Head position (JSON string) |
| `/joint_states` | JointState | All joints + head |
| `/battery_state` | BatteryState | Battery level |
| `/scan` | LaserScan | LiDAR |
| `/ws_messages` | String | Inbound from external backend |
| `/ws_outgoing` | String | Outbound to external backend |

Note: `/brain/chat_in` only works when a BASIC agent with an active directive is
loaded on the robot. If no agent is running, messages are silently dropped.
Check `/brain/available_skills` — if it publishes, the skills_action_server is up.

## When to Read Source Files

When you need exact field names, read the actual file from the cloned repo:

- **Action definitions**: `innate-os/ros2_ws/src/brain/brain_messages/action/*.action`
- **Service definitions**: `innate-os/ros2_ws/src/brain/brain_messages/srv/*.srv`
  and `innate-os/ros2_ws/src/maurice_bot/maurice_msgs/srv/*.srv`
- **Message definitions**: `innate-os/ros2_ws/src/brain/brain_messages/msg/*.msg`
- **Skill execution**: `innate-os/ros2_ws/src/brain/brain_client/brain_client/skills_action_server.py`
- **Skill base class**: `innate-os/ros2_ws/src/brain/brain_client/brain_client/skill_types.py`
- **Manipulation interface**: `innate-os/ros2_ws/src/brain/brain_client/brain_client/manipulation_interface.py`
- **Mobility interface**: `innate-os/ros2_ws/src/brain/brain_client/brain_client/mobility_interface.py`
- **Head interface**: `innate-os/ros2_ws/src/brain/brain_client/brain_client/head_interface.py`
- **Arm commander (GotoJS)**: `innate-os/ros2_ws/src/maurice_bot/maurice_arm/maurice_arm/arm_utils.py`
- **Arm config (joint limits, PID)**: `innate-os/ros2_ws/src/maurice_bot/maurice_arm/config/arm_config.yaml`
- **Nav config**: `innate-os/ros2_ws/src/maurice_bot/maurice_nav/config/`

## Remote Control (Fastest Way to Control the Robot)

Instead of writing code, use the `robot-cmd.ts` script for direct commands:

```bash
bun run <skill-path>/scripts/robot-cmd.ts <robot-ip> <command> [args...]
```

| Command | Example | What it does |
|---------|---------|-------------|
| `speak` | `speak Hello world` | Text-to-speech |
| `photo` | `photo main` or `photo arm` | Capture and save a JPEG |
| `skill` | `skill innate-os/head_emotion {"emotion":"happy"}` | Execute any skill |
| `head` | `head 15` | Tilt head (-25 to 25 degrees) |
| `emotion` | `emotion excited 2` | Head emotion with repeat |
| `drive` | `drive 0.15 0 3` | Drive for N seconds then stop |
| `spin` | `spin 90` | Spin N degrees (positive = left) |
| `arm` | `arm 0.25 0 0.3` | Move arm to XYZ position |
| `arm_home` | `arm_home` | Arm to zero/home |
| `torque` | `torque on` | Enable/disable arm servos |
| `goto_js` | `goto_js 0 -0.5 1.5 -1 0 0 2` | Move arm to joint positions |
| `joints` | `joints` | Read current arm joints |
| `status` | `status` | Battery, arm, position, head |
| `skills` | `skills` | List all available skills |
| `stop` | `stop` | Emergency stop |

This is the preferred interface — it handles WebSocket connection, float
serialization, safety caps, and cleanup automatically.

## Reference Files

| Task | File |
|------|------|
| Full rosbridge opcodes | `references/rosbridge-protocol.md` |
| Skill execution details | `references/skill-execution.md` |
| Arm control (GotoJS, trajectories) | `references/arm-control.md` |
| Driving and navigation | `references/mobility-control.md` |
| Head tilt and emotions | `references/head-control.md` |
| Sensor topics and throttling | `references/sensors.md` |
| Topic/service discovery | `references/discovery.md` |
| Gotchas from live debugging | `references/sharp-edges.md` |
