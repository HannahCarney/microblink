var path = require('path');
var fs = require('fs');

var BrowserSync = require('browser-sync');

/**
 * Private function that adds the code snippet to deal with reloading
 * files when they are served from platform folders
 */
function monkeyPatch() {
    var script = function() {
        window.__karma__ = true;
        (function patch() {
            if (typeof window.__bs === 'undefined') {
                window.setTimeout(patch, 500);
            } else {
                var oldCanSync = window.__bs.prototype.canSync;
                window.__bs.prototype.canSync = function(data, optPath) {
                var index = window.location.pathname.indexOf('/www');
                if (index!==-1) {
                    data.url = window.location.pathname.substr(0, index) + data.url.substr(data.url.indexOf('/www'));
                }
                return oldCanSync.apply(this, [data, optPath]);
                };
            }
        }());
    };
    return '<script>(' + script.toString() + '());</script>';
}

/**
 * Starts the browser sync server, and when files are changed, does the reload
 * @param {Object} opts - Options Object to be passed to browserSync. If this is a function, the function is called with default values and should return the final options to be passed to browser-sync
 * @param {Function} cb - A callback when server is ready, calls with (err, servr_hostname)
 */
module.exports = function(opts, platform, number, cb) {
    opts = opts || {};
    var port = 4000 + number;
    if (BrowserSync.has(platform)) {
        return  BrowserSync.get(platform);
    }
    else {
        var bs = BrowserSync.create(platform);
        var defaults = {
            notify: false,
            logFileChanges: true,
            logConnections: true,
            port: port,
            open: true,
            snippetOptions: {
                rule: {
                    match: /<\/body>/i,
                    fn: function(snippet, match) {
                        return monkeyPatch() + snippet + match;
                    }
                }
            },
            minify: false,
            watchOptions: {},
            files: [],
            cors: true,
            https: false,
        
            
        };
        console.log(platform)
        if (platform === "browser") {
            defaults.proxy = "localhost:8000";
        }
    
    
        if (typeof opts === 'function') {
            opts = opts(defaults);
        } else {
            for (var key in defaults) {
                if (typeof opts[key] === 'undefined') {
                    opts[key] = defaults[key];
                }
            }
        }
    
        bs.init(opts, function(err, bs) {
            console.log(err)
            var urls = bs.options.getIn(['urls']);
            var servers = {};
            ['local', 'external', 'tunnel'].forEach(function(type) {
                servers[type] = urls.get(type);
            });
            cb(err, servers);
        });
        return bs;
    }
  
};
