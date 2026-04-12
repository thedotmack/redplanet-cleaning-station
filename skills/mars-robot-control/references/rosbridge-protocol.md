# Rosbridge v2.0 Protocol Reference

Every message is a JSON object with an `op` field. The optional `id` field
enables request/response correlation.

## Topic Operations

### Subscribe
```json
{"op": "subscribe", "id": "sub_1", "topic": "/odom",
 "throttle_rate": 100, "queue_length": 1}
```
- `throttle_rate`: minimum ms between messages (0 = no throttle)
- `queue_length`: max queued messages when throttled

### Unsubscribe
```json
{"op": "unsubscribe", "id": "sub_1", "topic": "/odom"}
```

### Advertise (once per topic, before first publish)
```json
{"op": "advertise", "topic": "/cmd_vel", "type": "geometry_msgs/msg/Twist"}
```

### Publish
```json
{"op": "publish", "topic": "/cmd_vel",
 "msg": {"linear": {"x": 0.1, "y": 0, "z": 0}, "angular": {"x": 0, "y": 0, "z": 0}}}
```

### Unadvertise (when done publishing)
```json
{"op": "unadvertise", "topic": "/cmd_vel"}
```

## Service Operations

### Call Service
```json
{"op": "call_service", "id": "svc_1", "service": "/mars/arm/goto_js",
 "args": {"data": {"data": [0, -0.5, 1.5, -1.0, 0, 0]}, "time": 2.0}}
```

### Service Response (from server)
```json
{"op": "service_response", "id": "svc_1", "service": "/mars/arm/goto_js",
 "values": {"success": true}, "result": true}
```

## Action Operations

### Send Action Goal
```json
{"op": "send_action_goal", "id": "act_1",
 "action": "/execute_skill",
 "action_type": "brain_messages/action/ExecuteSkill",
 "goal": {"skill_type": "innate-os/arm_move_to_xyz", "inputs": "{\"x\": 0.2}"}}
```

### Action Feedback (from server, may arrive multiple times)
```json
{"op": "action_feedback", "id": "act_1", "action": "/execute_skill",
 "values": {"feedback": "Moving arm...", "image_b64": ""}}
```

### Action Result (from server, once)
```json
{"op": "action_result", "id": "act_1", "action": "/execute_skill",
 "values": {"success": true, "message": "Done", "skill_type": "innate-os/arm_move_to_xyz",
            "success_type": "success"}}
```

### Cancel Action Goal
```json
{"op": "cancel_action_goal", "action": "/execute_skill", "id": "act_1"}
```

## Encoding

- Default: JSON
- `uint8[]` and `char[]` fields are automatically base64-encoded
- Optional CBOR encoding for high-frequency sensor data
