# Minecraft Control

A simple Minecraft process runner

## Example Usage

```js
var minecraft = require('minecraft-control');
var game = new minecraft.Game({
  server: "./servers/minecraft_server.1.7.10.jar",
  world: "./worlds/example",
});

game.start(function(loadtime){
  console.log("Server started");

  setTimeout(function(){
    game.stop();
  }, 10000);
});

game.on("stop", function(){
  console.log("server stopped");
});

game.on("joined", function(player){
  console.log(player + " has joined the game!");
});

game.on("error", function(err){
  console.log(err);
});
```
## License

MIT
