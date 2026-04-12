# Sharp Edges and Debugging

## 1. Wrong Field Names for ExecuteSkill (CRITICAL)

The fields are `skill_type` and `inputs`, NOT `skill_id` and `parameters`.
If you get "Invalid inputs JSON", you used the wrong field names.

## 2. UDP Leader Receiver Overrides Arm Commands (CRITICAL)

The `udp_leader_receiver` node listens on UDP port 9999 and publishes to
`/mars/arm/commands` at up to 100Hz from a physical leader arm. If a leader
arm is connected, your direct publishes to `/mars/arm/commands` are silently
overridden within milliseconds.

Fix: Use the `/mars/arm/goto_js` service instead, which goes through
`arm_utils.py` and publishes its own planned trajectory at 30Hz.

## 3. Topic Name Typos Cause Silent Failure

ROS2 does not validate topic names. `/odom` and `odom` (missing slash) are
two different topics. Use constants, not string literals.

## 4. Velocity Smoother Timeout

The velocity smoother has a 0.2-second timeout. If it doesn't receive a
`/cmd_vel` message within that window, the robot stops. For sustained motion,
republish at ~10Hz.

## 5. Head Position is JSON-in-String

`/mars/head/current_position` publishes a `std_msgs/msg/String` where the
`data` field is a JSON string. You need to double-parse:
`JSON.parse(message.msg.data)` to get the actual position object.

## 6. Servo Overload Warnings

"Servo N high load" or "Servo N hardware error: overload" on `/mars/arm/status`
means the arm is in a pose that stresses the servos. Reduce the load by moving
to a less extended position or using `arm_utils` torque_off.

## 7. rosapi/services May Not Be Available

The `/rosapi/services` endpoint sometimes isn't available. If it times out,
you can still use topics and actions directly — just use `/rosapi/topics`
for discovery, which is more reliable.

## 8. Advertise Before First Publish

Rosbridge requires an `advertise` op before the first `publish` to a topic.
Subsequent publishes reuse the advertisement. If you skip it, the publish
may silently fail.

## 9. Action Feedback vs Result

When using `send_action_goal`, you may receive multiple `action_feedback`
messages before the final `action_result`. Don't resolve your promise on
the first feedback — wait for `action_result`.

## 10. GotoJS Service Args Format

The `GotoJS.srv` args need nested `data`:
```json
{"data": {"data": [j1, j2, j3, j4, j5, j6]}, "time": 2.0}
```
NOT `{"data": [j1, j2, j3, j4, j5, j6], "time": 2.0}`. The outer `data`
is the field name, the inner `data` is the Float64MultiArray's data field.

## 11. Validate New Patterns Incrementally

When using a rosbridge interface for the first time (e.g., a new service call
or action goal format), test with the safest possible command first. For example:
- Test `/execute_skill` with `head_emotion` before `arm_move_to_xyz`
- Test `/mars/arm/goto_js` with current joint positions (no-op move) before a real move
- Read `/mars/arm/state` to get current joints, then send those same values as a goto_js target

This way, if the serialization format is wrong, nothing dangerous happens.

## 12. Arm Camera Is Not the Robot's Eyes (CRITICAL)

The robot has TWO cameras. `/mars/arm/image_raw` is the wrist/gripper camera —
it points wherever the arm is pointing (usually at the floor). The robot's
actual eyes are the head-mounted OAK-D stereo camera at
`/mars/main_camera/left/image_raw/compressed`.

If you want to see what the robot sees, use the main camera. If you want to
see what the gripper is doing, use the arm camera.

Also: the rectified topics (`image_rect_color/compressed`) may not publish
depending on stereo calibration state. Use `image_raw/compressed` — it always works.

## 13. Arm Won't Move If Torque Is Disabled

`arm_move_to_xyz` reports SUCCESS even when torque is off — MoveIt plans the
trajectory, but the servos can't execute it. Check `/mars/arm/status` for
`is_torque_enabled: false`. Fix: run `arm_utils` with `torque_on` first.

## 14. JSON Integer 0 Rejected Where Python Expects Float (CRITICAL)

`JSON.stringify(0.0)` produces `"0"`, not `"0.0"`. Python's `json.loads("0")`
gives `int(0)`, and Innate skill validation rejects it with:
`"The 'y' field must be of type 'float'"`

This affects every skill parameter typed as `float` when the value is a whole number.
`0.2` works fine (serializes as `0.2`), but `0.0` becomes `0` and fails.

Fix: use a custom JSON serializer that forces whole numbers to include a decimal point.
The tripoli codebase includes `jsonStringifyWithFloats()` for this. If writing your own
client, you need equivalent logic — a replacer that outputs `0.0` instead of `0` for
any number value that maps to a float parameter.
