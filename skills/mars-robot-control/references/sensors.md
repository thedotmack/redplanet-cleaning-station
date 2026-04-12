# Sensors and Robot State

## Odometry
Topic: `/odom` (nav_msgs/msg/Odometry)
Rate: ~30Hz
Contains: position (x, y, z), orientation (quaternion), velocity

## Battery
Topic: `/battery_state` (sensor_msgs/msg/BatteryState)
Rate: ~0.2Hz
Key fields: `voltage`, `percentage` (0.0-1.0), `power_supply_status` (2=charging)

## Joint States
Topic: `/joint_states` (sensor_msgs/msg/JointState)
Rate: ~50Hz
Contains: all joint names, positions, velocities, efforts
Names: [joint1, joint2, joint3, joint4, joint5, joint6, joint_head]

## LiDAR
Topic: `/scan` (sensor_msgs/msg/LaserScan)
Rate: ~10Hz

## Arm Status
Topic: `/mars/arm/status` (maurice_msgs/msg/ArmStatus)
Fields: `is_ok` (bool), `error` (string), `is_torque_enabled` (bool)
Watch for: "Servo N high load" or "Servo N hardware error: overload"

## Arm Joint State
Topic: `/mars/arm/state` (sensor_msgs/msg/JointState)
6 joint positions in radians

## Head Position
Topic: `/mars/head/current_position` (std_msgs/msg/String)
JSON string with `current_position`, `default_angle`, `max_angle`, `min_angle`

## Cameras

The robot has two cameras. Use the **main camera** (head-mounted OAK-D stereo)
for seeing the world — it's the robot's eyes. The arm camera is only for
close-up manipulation tasks.

### Main Camera (the robot's eyes — use this one)
- `/mars/main_camera/left/image_raw/compressed` — **USE THIS** — confirmed working, delivers JPEG frames
- `/mars/main_camera/left/image_raw` — uncompressed (high bandwidth, avoid over WebSocket)
- `/mars/main_camera/depth/image_rect_raw` — depth image

Note: `/mars/main_camera/left/image_rect_color/compressed` and other rectified
variants may not publish depending on calibration state. The raw compressed
topic is the reliable one.

### Arm/Wrist Camera (for manipulation only)
- `/mars/arm/image_raw/compressed` — compressed wrist camera
- `/mars/arm/image_raw` — uncompressed wrist camera

## Transform Tree
- `/tf` — dynamic transforms (tf2_msgs/msg/TFMessage)
- `/tf_static` — static transforms

## Throttling for WebSocket

High-frequency topics (odom, joints, scan) will flood a WebSocket connection.
Use the `throttle_rate` field in the subscribe message:

```json
{"op": "subscribe", "topic": "/odom", "throttle_rate": 200, "queue_length": 1}
```

This limits to one message every 200ms (5Hz) instead of 30Hz.
