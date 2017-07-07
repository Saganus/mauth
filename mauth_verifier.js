
var MacaroonsBuilder        = require("macaroons.js").MacaroonsBuilder;
var MacaroonsVerifier       = require("macaroons.js").MacaroonsVerifier;
var TimestampCaveatVerifier = require('macaroons.js').verifier.TimestampCaveatVerifier;

var location                = "http://www.endofgreatness.net";
var routesCaveatRegex       = /routes=(.*)/;

//var caveatKey           = "secret2";
//var caveatId            = "random2-32"

module.exports = function(options) {
    return function verifyMacaroons(req, res, next) {
        var serverId            = options.serverId;
        var publicScope         = options.publicScope;
        var serializedMacaroon  = req.cookies[serverId + "/" + req.method];
        var macaroonSecret      = req.macaroonSecret;
        
        if(typeof macaroonSecret !== "undefined" && macaroonSecret !== null){
            validateRequest(publicScope, serverId, serializedMacaroon, macaroonSecret, req.method, req.path)
                .then(function(isValid){
                    if(isValid){
                        next();
                    }
                    else{
                        res.sendStatus("401");
                    }
                }).catch(function (error) {
                    console.log("Promise rejected:");
                    console.log(error);
                    res.sendStatus("401");
                });
        }else{
            //Allow only access to public scope
            if(typeof publicScope !== "undefined" && typeof publicScope[req.method] !== "undefined" && publicScope[req.method].indexOf(req.path) > -1){
                console.log("No macaroon secret found but allowing access to public scope");
                next();
            }
            else{
                console.log("No macaroon secret found. Denying access to non-public scope");
                res.sendStatus("401");
            }
        }

    };
};

function validateRequest(publicScope, serverId, serializedMacaroon, macaroonSecret, method, path){
    return new Promise((resolve, reject) => {
        if(typeof publicScope !== "undefined" && typeof publicScope[method] !== "undefined" && publicScope[method].indexOf(path) > -1){
            return resolve(true);
        }
        else if(typeof serializedMacaroon !== "undefined" && serializedMacaroon !== ""){
            macaroon = MacaroonsBuilder.deserialize(serializedMacaroon);

            var verifier = new MacaroonsVerifier(macaroon);

            verifier.satisfyExact("server-id="+serverId);
            verifier.satisfyExact("method="+method);
            verifier.satisfyExact("route="+path);

            verifier.satisfyGeneral(TimestampCaveatVerifier);
            verifier.satisfyGeneral(function RouteCaveatVerifier(caveat) {
                var match = routesCaveatRegex.exec(caveat);
                if (match !== null) {
                    var parsedRoutes = match[1].split(",");
                    
                    if(parsedRoutes.indexOf(path) > -1){
                        return true;
                    }
                    else{
                        return false;
                    }
                }
                else{
                    return false;
                }
            });

            if(verifier.isValid(macaroonSecret)){
                return resolve(true);
            }
            else{
                console.log("Provided Macaroon is invalid");
                console.log(macaroon.inspect());
                return resolve(false);
            }
        }
        else{
            var error = new Error("No Macaroon provided for this request type");
            return resolve(false);
        }
    });  
};

/*
function isValidGetRequest(serverId, getMacaroon, path){
    if(typeof getMacaroon != "undefined"){
        macaroon = MacaroonsBuilder.deserialize(getMacaroon);
        console.log("GET Macaroon:");
        console.log(macaroon.inspect());
        var verifier = new MacaroonsVerifier(macaroon);
        verifier.satisfyExact("server-id="+serverId);
        verifier.satisfyExact("method=GET");
        verifier.satisfyExact("route="+path);
        verifier.satisfyGeneral(TimestampCaveatVerifier);
        verifier.satisfyGeneral(function RouteCaveatVerifier(caveat) {
            var match = routesCaveatRegex.exec(caveat);
            if (match !== null) {
                var parsedRoutes = match[1].split(",");
                console.log("Allowed routes: ");
                console.log(parsedRoutes);
                if(parsedRoutes.indexOf(path) > -1){
                    return true
                }
            }
            else{
                return false;
            }
        });
        //var disjunctionDischarge = getDisjunctionDischarge(location, caveatKey, caveatId, req.path);
        //console.log("disjunctionDischarge Macaroon:");
        //console.log(disjunctionDischarge.inspect());

        //var dp = MacaroonsBuilder.modify(macaroon).prepare_for_request(disjunctionDischarge).getMacaroon();
        //console.log("GET Macaroon after prepare for request:");
        //console.log(dp.serialize());

        //verifier.satisfy3rdParty(dp);

        if(verifier.isValid(macaroonSecret)){
            console.log("Provided Macaroon is valid");
            return true;
        }
        else{
            console.log("Provided Macaroon is invalid");
            console.log(macaroon.inspect())
            return false;
        }
    }
    else{
        console.log("No Macaroon provided for this request type");
        return false;
    }
};

function getDisjunctionDischarge(location, caveatKey, identifier, path){
    dischargeMacaroon = MacaroonsBuilder.create(location, caveatKey, identifier);
    dischargeMacaroon = MacaroonsBuilder.modify(dischargeMacaroon).add_first_party_caveat("route="+path) .getMacaroon();
    return dischargeMacaroon;
};
*/

