#!/bin/bash
# Clone or update the innate-os repo so the skill always has fresh source files.
# Run this once per workspace, or anytime you want the latest definitions.

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="$SKILL_DIR/innate-os"

if [ -d "$REPO_DIR/.git" ]; then
  echo "Updating innate-os repo..."
  cd "$REPO_DIR" && git pull --ff-only 2>/dev/null || echo "Pull failed (offline or diverged), using existing checkout"
else
  echo "Cloning innate-os repo..."
  git clone --depth 1 https://github.com/innate-inc/innate-os.git "$REPO_DIR"
fi

echo "innate-os source available at: $REPO_DIR"
echo "Key paths:"
echo "  Messages:     $REPO_DIR/ros2_ws/src/brain/brain_messages/"
echo "  Brain client: $REPO_DIR/ros2_ws/src/brain/brain_client/brain_client/"
echo "  Arm:          $REPO_DIR/ros2_ws/src/maurice_bot/maurice_arm/"
echo "  Navigation:   $REPO_DIR/ros2_ws/src/maurice_bot/maurice_nav/"
