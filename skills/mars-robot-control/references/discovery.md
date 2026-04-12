# Discovery via rosapi

The rosapi node provides services for discovering what's available on the robot.

## List Topics
```json
{"op": "call_service", "id": "d1", "service": "/rosapi/topics", "args": {}}
```
Response: `{"values": {"topics": [...], "types": [...]}}`

## List Services
```json
{"op": "call_service", "id": "d2", "service": "/rosapi/services", "args": {}}
```
Response: `{"values": {"services": [...]}}`

Note: rosapi/services may not be available on all deployments. If it times out,
you can still use topics and actions directly if you know the names.

## List Nodes
```json
{"op": "call_service", "id": "d3", "service": "/rosapi/nodes", "args": {}}
```
Response: `{"values": {"nodes": [...]}}`

## Get Topic Type
```json
{"op": "call_service", "id": "d4", "service": "/rosapi/topic_type",
 "args": {"topic": "/odom"}}
```
Response: `{"values": {"type": "nav_msgs/msg/Odometry"}}`

## Available Skills
Subscribe to `/brain/available_skills` (brain_messages/msg/AvailableSkills).
This is a latched (transient_local) topic — you'll get the current list
immediately upon subscribing.

Each skill has:
- `id` — e.g. "innate-os/arm_move_to_xyz"
- `name` — display name
- `type` — "code", "learned", "replay", "poses"
- `guidelines` — when to use this skill
- `inputs_json` — JSON string of parameter names and types
- `in_training` — whether the skill is still being trained
