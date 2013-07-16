//
// # CommandLoader
//
// The CommandLoader is responsible for loading and validating Command modules
// present at a configurable location in the filesystem.
//
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var path = require('path');
var optimist = require('optimist');
var util = require('util');

//
// ## CommandLoader `CommandLoader(obj)`
//
// Creates a new instance of CommandLoader with the following options:
//  * root - The location of Command modules in the filesystem, represented as a
//    String. Defaults to a sibling 'commands' folder.
//  * strict - If true, CommandLoader will emit 'error' events if its run with a
//    primary argument that doesn't exist as a command. Otherwise, that argument
//    will be included in the fallback command's arguments. Defaults to `false`.
//  * usage - If `--help` or `-h` are passed as options, this command will be
//    used to generate a usage summary. Defaults to 'help'.
//  * fallback - If no command is specified while running, this command is used
//    instead. Defaults to the same as `usage`.
//  * manuals - If set, this location will be used as a repository of named
//    manual files to be used for function-only Command modules.
//
function CommandLoader(obj) {
  if (!(this instanceof CommandLoader)) {
    return new CommandLoader(obj);
  }

  obj = obj || {};

  this.root = obj.root || path.resolve(__dirname, 'commands');
  this.strict = obj.strict || false;
  this.usage = obj.usage || 'help';
  this.fallback = obj.fallback || this.usage;
  this.manuals = obj.manuals || null;
}
util.inherits(CommandLoader, EventEmitter);
CommandLoader.createLoader = CommandLoader;

//
// ## isCommand `CommandLoader.isCommand(module)`
//
// Returns `true` if **module** is a valid Command, `false` otherwise.
//
CommandLoader.isCommand = isCommand;
function isCommand(module) {
  var cls = this;

  return !!module &&
    typeof module.run === 'function' &&
    typeof module.usage === 'string';
}

//
// ## parse `parse(argv, [options])`
//
// Parses **argv** as an Array of Strings, whether command line arguments or
// similar. If **options** is specified, is it used to configure `optimist`
// accordingly.
//
// Returns an Object with `-f` and `--foo` arguments as members and extraneous
// arguments as members of the `_` Array.
//
CommandLoader.prototype.parse = parse;
function parse(argv, options) {
  var self = this;

  return optimist(argv).options(options || {}).argv;
}

//
// ## run `run([argv])`
//
// Synchronously parses **argv**, or `process.argv` otherwise. If a command is
// present, that command is run. If no command is run, the configured `fallback`
// command is run instead.
//
CommandLoader.prototype.run = run;
function run(argv) {
  var self = this;
  var options = self.parse(argv || (argv = process.argv.slice(2)));
  var command = null;

  if (options.help) {
    // If we've provided --help as an option, it takes precedence. Show usage.
    command = self.getRun(self.usage);
  } else if (options._.length) {
    // Otherwise, if we've provided our own command, use that.
    command = self.getRun(options._[0]);

    // Build the new, command-local `argv` and `options`.
    if (command) {
      argv = argv.slice(argv.indexOf(options._[0]) + 1);
      options = self.parse(argv);
    } else if (self.strict) {
      return self.error(util.format('"%s" is not an slnode command. See `slnode help` for more information.', options._[0]));
    }
  }

  if (!command) {
    command = self.getRun(self.fallback);
  }

  command(argv, options, self);

  return self;
}

//
// ## loadCommand `loadCommand(name)`
//
// Synchronously loads the Command module for **name**.
//
// Returns either a Command or null if the command could not be loaded.
//
CommandLoader.prototype.loadCommand = loadCommand;
function loadCommand(name) {
  var self = this;
  var module = null;

  try {
    module = require(path.resolve(this.root, String(name)));
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') {
      console.error('Error while loading "%s": %s', name, e.stack || e.message);
    }
    return null;
  }

  if (typeof module === 'function') {
    module = {
      run: module,
      usage: module.usage || self.loadManual(name)
    };
  }

  if (!CommandLoader.isCommand(module)) {
    return null;
  }

  return module;
}

//
// ## getUsage `getUsage(name)`
//
// Returns the usage information for the **name** Command, represented as a
// String. If **name** cannot be found, returns `null`.
//
CommandLoader.prototype.getUsage = getUsage;
function getUsage(name) {
  var self = this;
  var module = self.loadCommand(name);

  return module ? module.usage : null;
}

//
// ## getRun `getRun(name)`
//
// Returns the run Function for the **name** Command. If **name** cannot be
// found, returns `null`.
//
CommandLoader.prototype.getRun = getRun;
function getRun(name) {
  var self = this;
  var module = self.loadCommand(name);

  return module ? module.run : null;
}

//
// ## error `error(message)`
//
// Emits a new error event with **message** for user handling.
//
CommandLoader.prototype.error = error;
function error(message) {
  var self = this;

  self.emit('error', new Error(message));

  return self;
}

//
// ## loadManual `loadManual(name)`
//
// Synchronously loads the manual file for **name** if it exists within a
// configured `loader.manuals` folder.
//
// Returns the file's contents if it exists, `null` otherwise.
//
// Files are required to be in UTF-8 format.
//
CommandLoader.prototype.loadManual = loadManual;
function loadManual(name) {
  var self = this;
  var filename;

  if (!self.manuals) {
    return null;
  }

  filename = path.resolve(self.manuals, name);

  if (!fs.existsSync(filename)) {
    return null;
  }

  return fs.readFileSync(filename, 'utf8');
}

module.exports = CommandLoader;