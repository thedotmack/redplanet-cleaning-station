# Head Control

The MARS robot head has a single tilt servo with range -25° to +25°.

## Set Head Position

Publish std_msgs/msg/Int32 to `/mars/head/set_position`:

```json
{"op": "advertise", "topic": "/mars/head/set_position", "type": "std_msgs/msg/Int32"}
{"op": "publish", "topic": "/mars/head/set_position", "msg": {"data": 5}}
```

The value is in degrees. Positive = tilt up, negative = tilt down.

## Read Current Position

Subscribe to `/mars/head/current_position` (std_msgs/msg/String).
The data is a JSON string:

```json
{
  "current_position": 10.37,
  "default_angle": 0.0,
  "max_angle": 24.99,
  "min_angle": -24.99
}
```

Parse it: `JSON.parse(msg.data)`.

## Head Emotion Skill

The robot has a built-in skill for expressive head movements:

```json
{
  "op": "send_action_goal",
  "action": "/execute_skill",
  "action_type": "brain_messages/action/ExecuteSkill",
  "goal": {
    "skill_type": "innate-os/head_emotion",
    "inputs": "{\"emotion\": \"happy\"}"
  }
}
```

Available emotions: `happy`, `sad`, `excited`, `thinking`, and more.
Check the skill source for the full list.
