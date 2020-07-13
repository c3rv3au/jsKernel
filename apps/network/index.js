// We load all network plugins
var kernel = {}

var express = require('express');
var app = express();
var server = require('http').Server(app);
var bodyParser = require('body-parser');
var io = require('socket.io')(server);

var net;
var list_port = process.env.PORT || 3010;

function get_my_pub_ip() {
    var request = require('request');
    request('https://api.ipify.org?format=json', function (error, response, body) {
        try {
            body = JSON.parse(body);
            net.my_ip = body.ip;	
            kernel.debug.log("network", "My public ip is: " + body.ip);
        } catch (err) {
        }
    });
}

var addPeer = function (peerIp, peerPort) {
    var socket = require('socket.io-client')('ws://' + peerIp + ':' + peerPort, {reconnection: false});
    socket.on('connect', function() { 
        kernel.debug.log("Network","Peer " + peerIp + " connected as client");
        send_announce(socket);
    });
    socket.on('event', function(data){});
    socket.on('disconnect', function(){});
    init_socket(socket);
}

function create_announce() {
    var announce = {}
    announce.identityId = kernel.identityId;
    //announce.script = kernel.script;
    //announce.version = config.version;
    announce.port = list_port;
    announce.peers = kernel.network.peers_routes; // Who we can see directly
    return announce;
  }
  
function broadcast_announce() {
    var announce = create_announce();
  
    net.peers.forEach( function (peer) {
      //console.log("Emit to " + peer.identityId);
      peer.socket.emit('announce', announce);
    });
}
  
setInterval( function () {
    //console.log("Broadcast announce");
    broadcast_announce();
    //compile_routes();
}, 10000);
  
  function send_announce(socket) {
    // Sending him an announcement
    var announce = create_announce();
    socket.emit('announce', announce);
    //console.log("emit sent");
  }

var os = require('os');
var ifaces = os.networkInterfaces();
var local_ips = [];

Object.keys(ifaces).forEach(function (ifname) {
  var alias = 0;

  ifaces[ifname].forEach(function (iface) {
    if ('IPv4' !== iface.family || iface.internal !== false) {
      // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
      return;
    }

    if (alias >= 1) {
      // this single interface has multiple ipv4 addresses
      c//onsole.log(ifname + ':' + alias, iface.address);
    } else {
      // this interface has only one ipv4 adress
      //console.log(ifname, iface.address);
    }
    local_ips.push(iface.address);
    ++alias;
  });
});

function remove_peer(identityId) {
    net.peers.forEach( function (peer) {
      if (peer.identityId == identityId) {
        var index = net.peers.indexOf(peer);
        if (index > -1) {
          kernel.debug.log("Peers","Removing peers");
          net.peers.splice(index, 1);
          compile_routes();
        }
      }
    });
  }
  
function removePeerIp(ip) {
    net.peers.forEach( function (peer) {
      if (peer.host == ip) {
        var index = net.peers.indexOf(peer);
        if (index > -1) {
          kernel.debug.log("Peers","Removing peers with IP");
          net.peers.splice(index, 1);
          compile_routes();
        }
      }
    });
}
  
function getPeerWithIp(ip) {
    var found = null;
    net.peers.forEach( function (peer) {
      if (peer.host == ip) {
        found = peer;
      }
    });
    return found;
}

var compile_routes = function cr() {
    var new_routes = [];
  
    function get_exist(identityId, gateway) {
      var route = null;
      var hop = 9999;
      new_routes.forEach(function (r) {
        if (r.identityId == identityId && r.gateway == gateway && r.hop < hop) {
          hop = r.hop;
          route = r;
        }
      });
      return route;
    }
  
    net.peers.forEach( function peer(peer) {
      if (peer.ts < (new Date().getTime() - 20000)) return; // Not available on connect
      var route = {}
      route.identityId = peer.identityId;
      route.gateway = peer.identityId;
      route.hop = 0;
      new_routes.push(route);
      //console.log("neighbors:");
      //console.log(peer.peers);
  
      if (typeof peer.peers !== "undefined")
        peer.peers.forEach(function (p2) {
          if (p2.identityId != config.identityId && peer.identityId != config.identityId && p2.identityId != peer.identityId && p2.hop == 0) {
            var route = get_exist(p2.identityId, peer.identity);
            if (route==null) {
              var route = {}
              route.identityId = p2.identityId;
              route.gateway = peer.identityId;
              route.hop = 1;
              new_routes.push(route);
            }
          }
        });
    });
  
    console.log('ROUTE TABLE');
    console.log('------------------------------');
    console.log(new_routes);
    console.log('------------------------------');
  
    net.peers_routes = new_routes;
}

var hostDiscovery = require('host-discovery');

var start = function () {
    get_my_pub_ip();

    kernel.debug.log("network","Starting host-discovery");
    var service = new hostDiscovery();
    kernel.network.serviceDiscovery = service;
    kernel.network.local_ips = local_ips;

    service.on('join', (ip) => {
        var pls_continue = true;
        local_ips.forEach( function (lip){
            if (lip==ip) {
                pls_continue=false;
            }
        });
        if (!pls_continue) return;
        kernel.debug.log("network",'A new member has joined the group : ' + ip);

        var found = false;
        net.peers.forEach( function (one) {
            if (one.host == ip)
            found = true;
        });

        if (!found) {
            kernel.debug.log("network","Peer not found in the list. Try to connect now to " + ip);

            try_port(list_port);
            if (list_port != 3000)
            try_port(3000);

            function try_port(port) {
            }
        } else {
            kernel.debug.log("network","Already found in peer list");
        }
    });

    service.on('leave', (ip) => {
        kernel.debug.log("network",'A member has left the group : ' + ip);
        removePeerIp(ip);
    });

    var listening_func = function (list_port) {
        kernel.debug.log('network','OS listening on port ' + list_port);
    }
      
    server.listen(list_port, listening_func(list_port));
      
    io.on('connection', function(socket){
        kernel.debug.log("network",'A user has connected');
      
          // Check if he is trying to connect another time
          var peer = getPeerWithIp(socket.request.connection.remoteAddress);
          if (peer == null) {
            send_announce(socket);
      
            // Init socket
            init_socket(socket);
          } else {
              // Should we do something?
          }
    });
}

module.exports = function (the_kernel) {
    kernel = the_kernel;
    kernel.network = {
        peers : [],
        peers_routes : [],
        my_ip: "",
        addPeer: addPeer
    }
    net = kernel.network;

    start();
}