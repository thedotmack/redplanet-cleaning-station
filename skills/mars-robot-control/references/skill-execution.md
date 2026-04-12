# Skill Execution via /execute_skill

Execute any registered skill (code or learned) through the ExecuteSkill action.

## Action Definition

Read the actual definition from the cloned repo:
`innate-os/ros2_ws/src/brain/brain_messages/action/ExecuteSkill.action`

```
# Goal
string skill_type    # Skill ID, e.g. "innate-os/arm_move_to_xyz"
string inputs        # JSON string of kwargs

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

## How to Call

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

The `inputs` field MUST be a JSON string (not a JSON object). The server calls
`json.loads(inputs)` and then `skill.execute(**parsed_inputs)`.

## How to Find the Right inputs

The skill's `inputs_json` field in `/brain/available_skills` tells you the
parameter names and types. Subscribe to that topic and inspect the `inputs_json`
for the skill you want to call.

For code skills, the parameter names come from the `execute()` method signature
in the skill's Python class. Read the actual skill files:
`innate-os/ros2_ws/src/brain/brain_client/brain_client/skills_action_server.py`

## Monitoring Execution

Subscribe to these for status updates:
- `/execute_skill/_action/status` — action status changes
- `/execute_skill/_action/feedback` — progress feedback from the skill
- `/brain/skill_status_update` — human-readable status string

## Cancellation

```json
{
  "op": "cancel_action_goal",
  "action": "/execute_skill",
  "id": "the_original_goal_id"
}
```

The skills_action_server calls `skill.cancel()` on the running skill instance.

## Naming Trap: `id` vs `skill_type`

The `/brain/available_skills` topic lists skills with an `id` field (e.g. `"innate-os/arm_move_to_xyz"`).
The `/execute_skill` action goal uses `skill_type` for the same value.
These are the same string — but the field names are different. Use `id` when reading
the skill list, `skill_type` when sending the goal.

## Always Check inputs_json

Always subscribe to `/brain/available_skills` and read the `inputs_json` field
for the specific skill before calling it. Do not assume parameter names from
documentation or guidelines — the Python `execute()` signature is the source of truth,
and `inputs_json` reflects it exactly.
