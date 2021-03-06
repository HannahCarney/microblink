var path = require('path');
var fs = require('fs');
var url = require('url');

var glob = require('glob');
var et = require('elementtree');
var cheerio = require('cheerio');
var Policy = require('csp-parse');
var plist = require('plist');


var WWW_FOLDER = {
    android: 'app/src/main/assets/www',
    ios: 'www',
    browser: 'www'
};

var CONFIG_LOCATION = {
    android: 'app/src/main/res/xml',
    ios: '.',
    browser: '.'
};
var EXTERNAL_URL = '';



function parseXml(filename) {
    return new et.ElementTree(et.XML(fs.readFileSync(filename, "utf-8").replace(/^\uFEFF/, "")));
}

function Patcher(context, platforms, options) {
    this.platform = platforms[0];
    this.options = options;
    this.projectRoot = context.opts.projectRoot|| '.';
}

Patcher.prototype.__forEachFile = function (pattern, location, fn) {
        glob.sync(pattern, {
            cwd: path.join(this.projectRoot, 'platforms', this.platform, location[this.platform]),
            ignore: '*build/**'
        }).forEach(function (filename) {
            filename = path.join(this.projectRoot, 'platforms', this.platform, location[this.platform], filename);
            fn.apply(this, [filename, this.platform]);
        }, this);
};

Patcher.prototype.addCSP = function (opts) {
    this.__forEachFile('**/index.html', WWW_FOLDER, function (filename, platform) {
        var pageContent = fs.readFileSync(filename, 'utf-8');
        var $ = cheerio.load(pageContent, {
            decodeEntities: false
        });
        var cspTag = $('meta[http-equiv=Content-Security-Policy]');
        var policy = new Policy(cspTag.attr('content'));
        policy.add('default-src', 'ws:');
        policy.add('default-src', "'unsafe-inline'");
        for (var key in opts.servers) {
            if (typeof opts.servers[key] !== 'undefined') {
                policy.add('script-src', opts.servers[key]);
            }
        }
        cspTag.attr('content', function () {
            return policy.toString();
        });
        fs.writeFileSync(filename, $.html());
        //  console.log('Added CSP for ', filename);
    });
};

Patcher.prototype.copyStartPage = function (opts) {
    if (!this.options['l']) {
        var html = fs.readFileSync(path.join(__dirname, this.getWWWFolderIndex (this.platform)), 'utf-8');
        this.__forEachFile('**/index.html', WWW_FOLDER, function (filename, platform) {
            var dest = path.join(path.dirname(filename), this.getWWWFolderIndex (platform));
            var data = {};
            for (var key in opts.servers) {
                if (typeof opts.servers[key] !== 'undefined') {
                    data[key] = url.resolve(opts.servers[key], this.getWWWFolder(this.platform) + '/' + opts.index);
                }
            }
            fs.writeFileSync(dest, html.replace(/__SERVERS__/, JSON.stringify(data)));
            //  console.log('Copied start page ', opts.servers);
        });
    }
};

Patcher.prototype.updateConfigXml = function () {
    return this.__forEachFile('**/config.xml', CONFIG_LOCATION, function (filename, platform) {
        configXml = parseXml(filename);
        var contentTag = configXml.find('content[@src]');
        console.log("Start page is: " + this.getWWWFolderIndex (platform));
        if (contentTag) {
            contentTag.attrib.src = this.options['l'] ? EXTERNAL_URL  : this.getWWWFolderIndex (platform);
        }
        // Also add allow nav in case of
        var allowNavTag = et.SubElement(configXml.find('.'), 'allow-navigation');
        allowNavTag.set('href', '*');
        fs.writeFileSync(filename, configXml.write({
            indent: 4
        }), "utf-8");
        //  console.log('Set start page for %s', filename);
    });
};

Patcher.prototype.updateManifestJSON = function () {
     console.log(this.getWWWFolderIndex (this.platform))
    return this.__forEachFile('**/manifest.json', CONFIG_LOCATION, function (filename, platform) {
        var manifest = require(filename);
        if (!this.options['l']) {
            manifest.start_url = this.getWWWFolderIndex (platform);
        }
        fs.writeFileSync(filename, JSON.stringify(manifest, null, 2), "utf-8");
        // console.log('Set start page for %s', filename)
    });
}

Patcher.prototype.updateBrowser = function () {
    return this.__forEachFile('**/manifest.json', CONFIG_LOCATION, function (filename, platform) {
        var manifest = require(filename);
        if (this.options['l']) {
            manifest.start_url = this.getWWWFolderIndex (platform);
        }
        fs.writeFileSync(filename, JSON.stringify(manifest, null, 2), "utf-8");
        // console.log('Set start page for %s', filename)
    });
}

Patcher.prototype.fixATS = function () {
    return this.__forEachFile('**/*Info.plist', CONFIG_LOCATION, function (filename) {
        try {
            var data = plist.parse(fs.readFileSync(filename, 'utf-8'));
            data.NSAppTransportSecurity = {
                NSAllowsArbitraryLoads: true
            };
            fs.writeFileSync(filename, plist.build(data));
            console.log('Fixed ATS in ', filename);
        } catch (err) {
            console.log('Error when parsing', filename, err);
        }
    });
};

Patcher.prototype.prepatch = function () {
    // copy the serverless start page so initial load doesn't throw 404
    this.copyStartPage({});
    this.updateManifestJSON();
}

Patcher.prototype.setConfig = function (externalUrl) {
    EXTERNAL_URL = externalUrl;
    this.updateConfigXml()
}

Patcher.prototype.patch = function (opts) {
    opts = opts || {};
    this.copyStartPage(opts);
    this.fixATS();
    this.addCSP(opts);
};

Patcher.prototype.getWWWFolder = function (platform) {
    return path.join('platforms', platform, WWW_FOLDER[platform]);
};

Patcher.prototype.getWWWFolderIndex = function (platform) {
    return  '../www/index.html';
};

module.exports = Patcher;
