var kernel = {
    network: {}
};
var k = kernel;
k.identityId = "OhLaLaLaLaLa";

// Debug and almost everything can be overide
kernel.debug = {
    log: function (mod,texte) {
        console.log(mod,texte);
    }
}

function load_app(path) {
    k.debug.log("Kernel","Loading app: " + path);
    var the_mod = require(path + "/index.js");
    the_mod(kernel);
}

load_app("./apps/network");

exports = kernel;