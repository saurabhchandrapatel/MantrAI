const robot = require("robotjs");

console.log("Moving mouse...");
robot.moveMouse(500, 500);
robot.mouseClick();
console.log("Mouse moved and clicked!");




// Function to draw a circle
function drawCircle(radius = 100) {
  const center = robot.getMousePos(); // Start from current mouse pos
  console.log("Starting at:", center);

  robot.mouseToggle("down");
  for (let angle = 0; angle <= 360; angle += 5) {
    const x = center.x + radius * Math.cos((angle * Math.PI) / 180);
    const y = center.y + radius * Math.sin((angle * Math.PI) / 180);
    robot.moveMouse(x, y);
  }
  robot.mouseToggle("up");
}

drawCircle(100);
