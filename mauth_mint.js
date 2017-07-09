var MacaroonsBuilder        = require("macaroons.js").MacaroonsBuilder;
var MacaroonsVerifier       = require("macaroons.js").MacaroonsVerifier;

const crypto                = require("crypto");
var macaroonServerSecret    = process.env.MACAROON_SERVER_SECRET;

var _ = require('lodash');

//var caveatKey         = "secret2";
//var caveatId          = "random2-32"

// in minutes from now
var defaultExpiration   = 5; 

function mintMacaroons(userPolicy, location, macaroonSecret, identifier){
    var macaroonScopes  = getMacaroonScopes(userPolicy);

    var serverMacaroon  = MacaroonsBuilder.create(location, macaroonSecret, identifier);
    serverMacaroon      = MacaroonsBuilder.modify(serverMacaroon).add_first_party_caveat("server-id="+userPolicy.serverId).getMacaroon();

    var authMacaroons   = {};

    Object.keys(macaroonScopes).forEach(function(key, index){
        if (macaroonScopes[key].length > 0){
            authMacaroons[key] = mintRestrictedMacaroon(serverMacaroon, key, macaroonScopes[key], location);
        }

    });

    return authMacaroons;
};

function getMacaroonScopes(userPolicy){

    var getScopes       = getScopeRoutes(userPolicy.scopes, "GET");
    var postScopes      = getScopeRoutes(userPolicy.scopes, "POST");
    var putScopes       = getScopeRoutes(userPolicy.scopes, "PUT");
    var deleteScopes    = getScopeRoutes(userPolicy.scopes, "DELETE");

    var macaroonScopes          = {};
    macaroonScopes["GET"]       = getScopes;
    macaroonScopes["POST"]      = postScopes;
    macaroonScopes["PUT"]       = putScopes;
    macaroonScopes["DELETE"]    = deleteScopes;

    return macaroonScopes;
};

function getScopeRoutes(scopes, method){
    return _.flatMap(scopes, function(scope) { 
        if (scope.methods.indexOf(method) > -1){
            return scope.routes;        }
        else{
            return [];
        }
    });
};


function mintRestrictedMacaroon(serverMacaroon, method, scopes, location){
    restrictedMacaroon = addMethodToMacaroon(serverMacaroon, method);
    restrictedMacaroon = addScopesToMacaroon(restrictedMacaroon, scopes);
    restrictedMacaroon = addTimeExpirationToMacaroon(restrictedMacaroon, defaultExpiration);
    //restrictedMacaroon = addDisjunctionCaveat(restrictedMacaroon, location, caveatKey, caveatId);
    return restrictedMacaroon.serialize();
}

function addFirstPartyCaveat(macaroon, caveatName, caveatValue){
    return MacaroonsBuilder.modify(macaroon)
        .add_first_party_caveat(caveatName + "=" + caveatValue);
        .getMacaroon();
}

function addDisjunctionCaveat(macaroon, location, caveatKey, identifier){
    return MacaroonsBuilder.modify(macaroon)
        .add_third_party_caveat(location, caveatKey, identifier)
        .getMacaroon();
};

function addScopesToMacaroon(macaroon, scopes){
    scopeCaveat = scopes.join(",");
    
    return addFirstPartyCaveat("routes", scopeCaveat);
};

function addMethodToMacaroon(macaroon, method){
    return addFirstPartyCaveat("method", method);
};

function addTimeExpirationToMacaroon(macaroon, minutesFromNow){
    var expiration  = new Date();
    expiration      = new Date(expiration.getTime() + (minutesFromNow * 60 * 1000));

    return addFirstPartyCaveat("time < ", expiration.toJSON().toString());
};  

function calculateMacaroonSecret(macaroonUserSecret){
    const hash = crypto.createHash('sha256');
    hash.update(macaroonServerSecret + macaroonUserSecret);
    var macaroonSecretHash = hash.digest("hex");
    var macaroonSecret = Buffer.from(macaroonSecretHash, "hex"); 

    return macaroonSecret;
};


module.exports = {
    mintMacaroons : mintMacaroons,
    calculateMacaroonSecret : calculateMacaroonSecret
};