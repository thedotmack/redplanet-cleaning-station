/**
 * Tripoli — MARS Robot Rosbridge Client
 *
 * Library entrypoint for programmatic use.
 */

export { RosbridgeClient } from "./src/rosbridge-client";
export type { RosbridgeMessage } from "./src/rosbridge-client";

export {
  Topics,
  MessageTypes,
  ActionTypes,
  ActionNames,
  SkillIds,
  ServiceNames,
  SPEED_CAPS,
} from "./src/mars-topics";

export type {
  TwistMessage,
  ArmState,
  SkillInfo,
  AvailableSkillsMessage,
} from "./src/mars-topics";
