# Mobility Control (Driving the Base)

The MARS robot is a differential-drive platform controlled via Twist messages.

## Direct Velocity Commands

Publish geometry_msgs/msg/Twist to `/cmd_vel`:

```json
{
  "op": "publish",
  "topic": "/cmd_vel",
  "msg": {
    "linear": {"x": 0.1, "y": 0.0, "z": 0.0},
    "angular": {"x": 0.0, "y": 0.0, "z": 0.0}
  }
}
```

Remember to advertise first (once):
```json
{"op": "advertise", "topic": "/cmd_vel", "type": "geometry_msgs/msg/Twist"}
```

## Safety Limits

| Parameter | Conservative | Robot Config Max |
|-----------|-------------|-----------------|
| linear.x  | 0.3 m/s     | 0.4 m/s         |
| angular.z | 1.0 rad/s   | 2.5 rad/s       |

The velocity_smoother node further limits: max accel 0.3 m/s², max angular accel 0.5 rad/s².

## Common Maneuvers

### Drive Forward
```json
{"linear": {"x": 0.15, "y": 0, "z": 0}, "angular": {"x": 0, "y": 0, "z": 0}}
```

### Spin in Place
```json
{"linear": {"x": 0, "y": 0, "z": 0}, "angular": {"x": 0, "y": 0, "z": 0.4}}
```

### Drive in Circle (radius = linear / angular)
For r=0.8m: linear.x=0.16, angular.z=0.2
Full circle time: 2π / angular_z seconds

### Stop
```json
{"linear": {"x": 0, "y": 0, "z": 0}, "angular": {"x": 0, "y": 0, "z": 0}}
```

Publish stop multiple times to ensure the velocity smoother receives it.

## Continuous Publishing

For sustained motion, republish the Twist at ~10Hz. The velocity smoother
has a 0.2s timeout — if it doesn't receive a command in that window, the
robot stops.

## Via Skill Execution

For waypoint navigation:
```json
{
  "op": "send_action_goal",
  "action": "/execute_skill",
  "action_type": "brain_messages/action/ExecuteSkill",
  "goal": {
    "skill_type": "innate-os/navigate_to_position",
    "inputs": "{\"x\": 1.0, \"y\": 0.5, \"theta\": 0.0}"
  }
}
```

## Odometry

Subscribe to `/odom` (nav_msgs/msg/Odometry) for position tracking.
The quaternion orientation (z, w) gives yaw: `yaw = 2 * atan2(z, w)`.

## Topic Pipeline

```
/cmd_vel (your commands)
  → velocity_smoother → /cmd_vel_scaled
    → bringup node → I2C → wheels
```
