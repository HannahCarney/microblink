'use strict';

var path = require('path');
var fs = require('fs');

var path = require('path');

var Patcher = require('./Patcher');
var browserSyncServer = require('./browserSyncServer');
var deferral;

function parseOptions(opts) {
    var result = {};
    opts = opts || [];
    opts.forEach(function (opt) {
        var parts = opt.split(/=/);
        result[parts[0].replace(/^-+/, '')] = parts[1] || true;
    });
    return result;
}

function Prepare(context) {
    var Q = context.requireCordovaModule('q');
    var deferral = new Q.defer();

    var options = parseOptions(context.opts.options.argv);
    options['index'] = typeof options['index'] !== 'undefined' ? options['index'] : 'index.html';

    // if (typeof options['live-reload'] === 'undefined') {
    //     return;
    // }
    var enableCors = typeof options['enable-cors'] !== 'undefined';

    var ignoreOptions = {};
    if (typeof options['ignore'] !== 'undefined') {
        ignoreOptions = { ignored: options['ignore'] };
    }

    // TODO - Enable live reload servers

    var platforms = context.opts.platforms;
    var patcher = new Patcher(context, platforms, options);
    patcher.prepatch();
    var changesBuffer = [];
    var changesTimeout;
    var serversFromCallback = [];
    if (options['l']) {
    var bs = browserSyncServer(function (defaults) {
        if (enableCors) {
            defaults.middleware = function (req, res, next) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                next();
            }
        }

        defaults.files.push({
            match: ['src/*.*'],
            fn: function (event, file) {
                if (event === 'change') {
                   

                    changesBuffer.push(file);
                    if (changesTimeout) {
                        clearTimeout(changesTimeout);
                    }
                    changesTimeout = setTimeout(function () {
                        context.cordova.prepare().then(function () {
                            patcher.addCSP({
                                index: options.index,
                                servers: serversFromCallback, //need this for building proper CSP
                            });
                              console.info("changesBuffer:" + changesBuffer);
                            bs.reload();
                            //  bs.reloadWindow();
                            //   window.location.reload(true);
                            changesBuffer = [];
                        });
                    }, 200);
                }
            },
            options: ignoreOptions
        });

        //TODO:  needs to be able to run more than one at a time
        console.log(context.opts.platforms[0])
        var www = patcher.getWWWFolder(context.opts.platforms[0]);
        defaults.server = {
            baseDir: path.join(context.opts.projectRoot, www),
            routes: {}
        };

        if (typeof options['host'] !== 'undefined') {
            defaults.host = options['host'];
        }

        if (typeof options['port'] !== 'undefined') {
            defaults.port = options['port'];
        }

        if (typeof options['online'] !== 'undefined') {
            defaults.online = options['online'].toLocaleLowerCase() !== 'false';
        }

        if (typeof options['https'] !== 'undefined') {
            defaults.https = true;
        }

        return defaults;
    }, context, function (err, servers) {
        if (err) {
            console.log(err);
            return deferral.reject()
        }

        patcher.setConfig(servers.external) 
        return deferral.resolve();
    });
  }
  else {
    patcher.setConfig() 
    return deferral.resolve();
  }
}

module.exports = Prepare;


