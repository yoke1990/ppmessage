var fs = require("fs");
var gulp = require("gulp");
var gutil = require("gulp-util");
var bower = require("bower");
var concat = require("gulp-concat");
var sass = require("gulp-sass");
var minifyCss = require("gulp-minify-css");
var rename = require("gulp-rename");
var uglify = require("gulp-uglify");
var replace = require("gulp-replace");
var templateCache = require("gulp-angular-templatecache");
var sh = require("shelljs");
var buildConfig = require("./build.config.js");
var jslint = require("gulp-jslint");
var path = require("path");
var args = require("get-gulp-args")();
var os = require("os");
var xmlParser = require("xml2json");

function get_ppkefu_version () {
    var xml = fs.readFileSync("./config.xml", "utf-8");
    var json = xmlParser.toJson(xml);
    var object = JSON.parse(json);
    return object.widget.version;
}

function get_bootstrap_data () {
    var data = fs.readFileSync("../../bootstrap/data.py", "utf8");
    data = data.slice(data.search("BOOTSTRAP_DATA"));
    data = eval(data);
    return data;
}

function create_app_config(target, bootstrap_data) {
    var protocol = "http://";
    if (bootstrap_data.nginx.ssl == "on") {
        protocol = "https://";
    }
    var app_config = {
        "developer_mode": true,
        "api_key": bootstrap_data.PPKEFU.api_key,
        "sender_id": bootstrap_data.gcm.sender_id,
        "server": {
            "port": bootstrap_data.nginx.listen,
            "protocol": protocol,
            "name": bootstrap_data.server.name,
            "host": bootstrap_data.server.name
        }
    };
    var json = JSON.stringify(app_config, null, 4);
    fs.writeFile(target, json + "\n", function (err) {
        if (err) console.error(err);
    });
    return app_config;
}

function load_app_config() {
    var target = "./app.config.json";
    var bootstrap_data = get_bootstrap_data();

    try {
        fs.accessSync(target, fs.F_OK);
    } catch (err) {
        if (err.code == "ENOENT") {
            return create_app_config(target, bootstrap_data);
        }
        throw err;
    }
    
    var data = fs.readFileSync(target, "utf-8");
    var app_config = JSON.parse(data);
    if (app_config.api_key != bootstrap_data.PPKEFU.api_key) {
        console.log(gutil.colors.yellow("Notice: api key is different from bootstrap.PPKEFU.api_key. If you are using custom app.config.json, ignore this message. Otherwise, remove app.config.json and run gulp again"));
    }
    return app_config;
}

var paths = {
    sass: ["./www/scss/*.scss"],
    css: ["./www/css/*.css"],
    scripts: [
        "./www/js/*.js",
        "./www/js/**/*.js"
    ],
    templates: ["./www/templates/*/*.html"],
    config: ["./build.config.js"],
};

var version = get_ppkefu_version();
var appConfig = load_app_config();

console.log("------------- app config --------------")
console.log("name    \t", gutil.colors.green(appConfig.server.name));
console.log("protocol\t", gutil.colors.green(appConfig.server.protocol));
console.log("host    \t", gutil.colors.green(appConfig.server.host));
console.log("port    \t", gutil.colors.green(appConfig.server.port));
console.log("developer mode \t", gutil.colors.green(appConfig.developer_mode));
console.log("version \t", gutil.colors.green(version));
console.log("api key \t", gutil.colors.green(appConfig.api_key));
console.log("sender id \t", gutil.colors.green(appConfig.sender_id));
console.log("------------- app config --------------")

gulp.task("sass", generate_sass);
gulp.task("lib-css", generate_lib_css);
gulp.task("scripts", generate_scripts);
gulp.task("lib-scripts", generate_lib_scripts);
gulp.task("templatecache", generate_template_cache);
gulp.task("scripts-with-templatecache", ["templatecache"], generate_scripts);
gulp.task("refresh-config", refresh_config);
gulp.task("copy-jcrop-gif", copy_jcrop_gif);
gulp.task("copy-ionic-fonts", copy_ionic_fonts);

gulp.task("default", [
    "sass",
    "lib-css",
    "lib-scripts",
    "copy-jcrop-gif",
    "copy-ionic-fonts",
    "scripts-with-templatecache"
]);

gulp.task("watch", ["lib-css", "sass", "scripts-with-templatecache"], function() {
    gulp.watch(paths.sass, ["sass"]);
    gulp.watch(paths.css, ["lib-css"]);
    gulp.watch(paths.scripts, ["scripts"]);
    gulp.watch(paths.templates, ["scripts-with-templatecache"]);
    gulp.watch(paths.config, ["refresh-config", "scripts"]);
});

function generate_scripts (done) {
    var src = buildConfig.ppmessageScripts;
    var dest = buildConfig.buildScriptPath;
    
    gulp.src(src)
        .pipe(replace('"{developer_mode}"', appConfig.developer_mode))
        .pipe(replace("{server_name}", appConfig.server.name))
        .pipe(replace("{server_protocol}", appConfig.server.protocol))
        .pipe(replace("{server_host}", appConfig.server.host))
        .pipe(replace("{server_port}", appConfig.server.port))
        .pipe(replace("{api_key}", appConfig.api_key))    
        .pipe(replace("{sender_id}", appConfig.sender_id))    
        .pipe(replace("{version}", version))
        .pipe(concat("ppmessage.js"))
        .pipe(gulp.dest(dest))
        .pipe(uglify())
        .on("error", function(e) {
            console.log(e);
            done();
        })
        .pipe(rename({ extname: ".min.js" }))
        .pipe(gulp.dest(dest))
        .on("end", done);
}

function generate_template_cache (done) {
    var src = buildConfig.ppmessageTemplates;
    var dest = buildConfig.buildScriptPath;

    gulp.src(src)
        .pipe(templateCache({module: "ppmessage"}))
        .pipe(gulp.dest(dest))
        .on("end", done);
}

function generate_sass (done) {
    var src = "www/scss/ionic.ppmessage.scss";
    var dest = buildConfig.buildCssPath;

    gulp.src(src)
        .pipe(sass({errLogToConsole: true}))
        .pipe(gulp.dest(dest))
        .pipe(minifyCss({ keepSpecialComments: 0 }))
        .pipe(rename({ extname: ".min.css" }))
        .pipe(gulp.dest(dest))
        .on("end", done);
}

function generate_lib_scripts (done) {
    var src = buildConfig.libScripts;
    var dest = buildConfig.buildScriptPath;

    gulp.src(src)
        .pipe(concat("lib.js"))
        .pipe(gulp.dest(dest))
        .pipe(uglify())
        .on("error", function(e) { console.log(e); })
        .pipe(rename({ extname: ".min.js" }))
        .pipe(gulp.dest(dest))
        .on("end", done);
}

function generate_lib_css (done) {
    var src = buildConfig.libCss;
    var dest = buildConfig.buildCssPath;

    gulp.src(src)
        .pipe(concat("lib.css"))
        .pipe(gulp.dest(dest))
        .pipe(minifyCss({ keepSpecialComments: 0 }))
        .pipe(rename({ extname: ".min.css" }))
        .pipe(gulp.dest(dest))
        .on("end", done);
}

function refresh_config (done) {
    var pwd = path.resolve() + "/build.config.js";
    delete require.cache[pwd];
    buildConfig = require("./build.config.js");
    done();
}

function copy_ionic_fonts (done) {
    gulp.src("bower_components/ionic/fonts/*")
        .pipe(gulp.dest("www/build/fonts/"))
        .on("end", done);
}

function copy_jcrop_gif (done) {
    gulp.src("bower_components/Jcrop/css/Jcrop.gif")
        .pipe(gulp.dest("www/build/css/"))
        .on("end", done);
}


gulp.task("jslint", function (done) {
    gulp.src(buildConfig.ppmessageScripts)
        .pipe(jslint())
        .on("end", done);
});

gulp.task("lint", function (done) {
    gulp.src("www/js/services/db.js")
        .pipe(jslint({
            node: true,
            nomen: true,
            sloppy: true,
            plusplus: true,
            unparam: true,
            stupid: true
        }))
        .on("end", done);
});

gulp.task("install", ["git-check"], function() {
    return bower.commands.install()
        .on("log", function(data) {
            gutil.log("bower", gutil.colors.cyan(data.id), data.message);
        });
});

gulp.task("git-check", function(done) {
    if (!sh.which("git")) {
        console.log(
            "  " + gutil.colors.red("Git is not installed."),
            "\n  Git, the version control system, is required to download Ionic.",
            "\n  Download git here:", gutil.colors.cyan("http://git-scm.com/downloads") + ".",
            "\n  Once git is installed, run \"" + gutil.colors.cyan("gulp install") + "\" again."
        );
        process.exit(1);
    }
    done();
});
