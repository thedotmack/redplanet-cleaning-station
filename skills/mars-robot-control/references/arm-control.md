# Arm Control

The MARS robot has a 6-DOF Dynamixel arm (joint1-joint6) plus a head servo.

## Preferred: GotoJS Service

Call the `/mars/arm/goto_js` service for smooth, MoveIt-planned trajectories.

```json
{
  "op": "call_service",
  "id": "arm_move_1",
  "service": "/mars/arm/goto_js",
  "args": {
    "data": {
      "data": [0.0, -0.5, 1.5, -1.0, 0.0, 0.0]
    },
    "time": 2.0
  }
}
```

The `data.data` array is 6 joint positions in radians. `time` is the duration in seconds.

Service definition: `innate-os/ros2_ws/src/maurice_bot/maurice_msgs/srv/GotoJS.srv`
Implementation: `innate-os/ros2_ws/src/maurice_bot/maurice_arm/maurice_arm/arm_utils.py`

## Multi-Waypoint: GotoJSTrajectory Service

For smooth multi-point trajectories:

```json
{
  "op": "call_service",
  "id": "arm_traj_1",
  "service": "/mars/arm/goto_js_trajectory",
  "args": {
    "waypoints": {
      "data": [0,0,0,0,0,0,  0.5,-0.3,1.0,-0.8,0,0,  0,0,0,0,0,0]
    },
    "num_joints": 6,
    "segment_durations": [2.0, 2.0]
  }
}
```

## Via Skill Execution

```json
{
  "op": "send_action_goal",
  "action": "/execute_skill",
  "action_type": "brain_messages/action/ExecuteSkill",
  "goal": {
    "skill_type": "innate-os/arm_move_to_xyz",
    "inputs": "{\"x\": 0.2, \"y\": 0.0, \"z\": 0.3, \"roll\": 0, \"pitch\": 0, \"yaw\": 0}"
  }
}
```

## Reading Arm State

Subscribe to these topics:
- `/mars/arm/state` — current joint positions (JointState)
- `/mars/arm/status` — servo health: `{is_ok, error, is_torque_enabled}`
- `/mars/arm/command_state` — commanded joint positions
- `/joint_states` — all joints including head

## Arm Utilities Skill

`innate-os/arm_utils` provides torque control:

```json
{"goal": {"skill_type": "innate-os/arm_utils", "inputs": "{\"command\": \"torque_off\"}"}}
{"goal": {"skill_type": "innate-os/arm_utils", "inputs": "{\"command\": \"torque_on\"}"}}
{"goal": {"skill_type": "innate-os/arm_utils", "inputs": "{\"command\": \"reboot_arm\"}"}}
```

## Zero/Home Position

```json
{"goal": {"skill_type": "innate-os/arm_zero_position", "inputs": "{}"}}
```

## WARNING: /mars/arm/commands Topic

Do NOT publish directly to `/mars/arm/commands` unless you are certain the UDP
leader receiver is not running. The UDP leader at port 9999 publishes at up to
100Hz from a physical leader arm and will silently override your commands.

If you must use raw commands, publish at >= 30Hz.
