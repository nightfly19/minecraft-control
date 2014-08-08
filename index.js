var events = require('events');
var path = require('path');
var _ = require('underscore');
var child_process = require('child_process');
var devnull = require('dev-null');
var readline = require('readline');

var Game = function(options, callback){
  this.options = _.extend({}, this.defaultOptions, options);
  this.players = [];
  this.running = false;
  this.starting = false;
  events.EventEmitter.call(this);
};

Game.prototype.defaultOptions = {
  java: "/usr/bin/java",
  javaOpts: ["-Xmx1024M","-Xms1024M"],
  extraOpts: [],
};

Game.prototype.start = function(callback){
  var self = this;
  if(self.running){
    self.emit("error", new Error("Server is already running"));
  }
  if(self.starting){
    self.emit("error", new Error("Server is already starting"));
  };

  var command = self.options.java;
  var commandArgs = []
    .concat([
      "-jar",
      path.resolve(process.cwd(), self.options.server)
    ])
    .concat(self.options.javaOpts)
    .concat(self.options.extraOpts);
  var processOptions = {cwd: self.options.world};
  self.starting = true;
  var child = child_process.spawn(command, commandArgs, processOptions);
  var lineReader = readline.createInterface(child.stdout, devnull());
  self.child = child;

  child.on('error', function(err){
    self.starting = false;
    self.running = false;
    self.emit('error', err);
  });

  child.on('close', function(code, signal){
    if(self.running){
      self.emit("stop", code, signal);
    }
    else{
      self.emit("error", new Error("failed to start"));
    }

    self.running = false;
    self.starting = false;
  });

  lineReader.on('line', function(line){
    self.handleLine(line)
  });

  if(callback){
    self.once('start', callback);
  }
};

var messageParser = /^\[(\d+):(\d+):(\d+)\]\s+\[([^\/\]]+)\/([^\]]+)\]:\s(.*)$/;
var specialMessageHandlers = {
  start: {
    regex: /^Done \(([\d\.]+)s\)\! For help, type "help" or "\?"/,
    callback: function(game, message, match){
      game.running = true;
      game.players = [];
      game.emit('start',parseFloat(match[1]));
    }
  },
  joined: {
    regex: /^(\S+) joined the game/,
    callback: function(game, message, match){
      var player = match[1];
      game.players = game.players.concat([player]);
      game.emit('joined', player);
    }
  },
  left: {
    regex: /^(\S+) left the game/,
    callback: function(game, message, match){
      var player = match[1];
      game.players = _.without(game.players, player);
      game.emit('left', player);
    }
  },
  lostConnection: {
    regex: /^(\S+) lost connection/,
    callback: function(game, message, match){
      var player = match[1];
      game.players = _.without(game.players, player);
      game.emit('lostConnection', player);
    }
  },
  said: {
    regex: /^<([^>]+)> (.*)$/,
    callback: function(game, message, match){
      var player = match[1];
      var said = match[2];
      game.emit('said', player, said);
    }
  },
  action: {
    regex: /^\* (\S+) (.*)$/,
    callback: function(game, message, match){
      var player = match[1];
      var action = match[2];
      game.emit('action', player, action);
    }
  },
  earnedAchievement: {
    regex: /^(\S+) has just earned the achievement \[([^\]]+)\]/,
    callback: function(game, message, match){
      var player = match[1];
      var achievement = match[2];
      game.players = game.players.concat([player]);
      game.emit('earnedAchievement', player, achievement);
    }
  },
  died: {
    regex: /^(\S+) (.*)$/,
    callback: function(game, message, match){
      var player = match[1];
      var cause = match[2];
      if(_.indexOf(game.players, player) != -1){
        if(!specialMessageHandlers.joined.regex.exec(message.rawBody) &&
           !specialMessageHandlers.lostConnection.regex.exec(message.rawBody) &&
           !specialMessageHandlers.left.regex.exec(message.rawBody) &&
           !specialMessageHandlers.earnedAchievement.regex.exec(message.rawBody)
          ){
          game.emit('died', player, cause);
        }
        return true;
      }
      else{
        return false;
      }
    }
  },
};

Game.prototype.handleLine = function(line){
  var self = this;
  var match = messageParser.exec(line);
  var message;
  var knownMessage = false;
  if(match){
    message = {
      time: {
        hours: match[1],
        minutes: match[2],
        seconds: match[3],
      },
      source: match[4],
      level: match[5],
      rawBody: match[6],
      rawMessage: line
    };
    self.emit('message', message);
    _.values(specialMessageHandlers).forEach(function(handler){
      var match = handler.regex.exec(message.rawBody);
      var handled;
      if(match){
        handled = handler.callback(self, message, match);
        if(!(handled == false)){
          knownMessage = true;
        }
      }
    });
    if(!knownMessage){
      self.emit("unknownMessage", message);
    }
  }
  else{
    self.emit("unknownLine", line);
  }

  self.emit('raw', line);
};

Game.prototype.sendCommand = function(command, callback){
  var self = this;
  if((!self.running || ! self.child) && callback){
    return setTimeout(callback(new Error("not running")), 0);
  }

  self.child.stdin.write(command + "\n", "UTF8", callback);
};

Game.prototype.stop = function(callback){
  var self = this;
  if(callback){
    self.once('stop', callback);
  }
  self.sendCommand("stop");
};

Game.prototype.__proto__ = events.EventEmitter.prototype;

module.exports.Game = Game;
