# mAuth: Macaroon-based authentication middleware for Express

## What is mAuth?

This is an experimental project to build an Express-based authorization middleware based on [Google Macaroons](https://research.google.com/pubs/pub41892.html) instead of regular cookies.

Right now the project contains two main parts: 
   * A very simple user authentication system to provide a testing framework for the actual macaroons auth middleware or *mAuth*
   * The actual *mAuth* middleware that verifies the requests to restricted API resources, and either allows or denies access to it.

The included authentication system is just the default set of API endpoints needed to provide a (very) simple login functionality that can show the *mAuth* system working (i.e. `POST /register` to create a new user, `POST /login` to login as an existing user, `POST /logout` to logout the user, etc)

The interesting parts are in the two core modules: the mint and the verifier (plus an optional, auxiliary method) that provide the actual proof-of-authorization Macaroons workflow.

## How does mAuth work?

The proposed workflow for this first approach is the following:

   * After a user is registered and logs into the system, the *mAuth* mint module [creates four Macaroons](https://github.com/Saganus/macaroons-express-demo/blob/master/routes/index.js#L125-L127), one for each HTTP method (GET, POST, PUT and DELETE) based on the provided user policy
   * The generated Macaroons are [stored as four different cookies](https://github.com/Saganus/macaroons-express-demo/blob/master/routes/index.js#L68-L74) in their serialized forms (this is the suggested use, however it's not a requirement. The serialized Macaroons can be stored in pretty much any way)

On the other hand, to protect a restricted resource one needs only to 
   * [use the verifier middleware](https://github.com/Saganus/macaroons-express-demo/blob/master/routes/index.js#L34) which after proper configuration will allow public scopes to be accessed without presenting a Macaroon 
   * or will [verify that the presented Macaroon authorizes the user](https://github.com/Saganus/macaroons-express-demo/blob/master/middleware/verify_macaroons.js#L50-L93) to access the restricted resource
   
The way the Macaroons are used to restrict access is basically by using first-party caveats only (although I have plans to use a more sophisticated Macaroon construction including a "local login" third-party caveat structure suggested by Robert Escriva) and then verifying that those caveats hold at the time of access. 

Each access Macaroon consists of [the following first-party caveats](https://github.com/Saganus/macaroons-express-demo/blob/master/middleware/verify_macaroons.js#L58-L63):

   * `serverId=<the serverId specified in the env var>`
   * `method=<the HTTP method used for the request>`
   * `route=<the requested API path>`
   * `time < <"now" + X minutes>` (the Macaroon expiry time)

All these caveats must hold at the time of the request for it to be valid and thus allowed to be processed. This provides intersesting functionality, like the ability to invalidate *all* Macaroons by just changing the serverId. Also, due to having a Macaroon for each method we can better define user policies and isolate dangerous functionality (DELETE, PUT) and make it harder for an attacker to cause damage in case Macaroons are stolen. 

## How do you grant or deny user access to a resource?

By providing a user policy when the Macaroons are mint, you can define which routes are accesible via which methods and the mint will use this structure to create the corresponding Macaroons.

For example, a user policy looks like this:

    {
        name : "memberAccess",
        description: "Access policy for members of the site",
        serverId : serverId,
        expires : 60*60*24,
        scopes : [
            {
                name : "restricted",
                routes : ["/restricted"],
                methods : ["GET", "POST"]
            },
            {
                name : "logout user",
                routes : ["/logout"],
                methods : ["POST"]
            }
        ]
    }

A user with this policy will only be able to do `GET /restricted` or `POST /restricted` requests to the API, or `POST /logout` (which should be standard for all users, but not public).

On the other hand, authorized routes will support wildcards so you can determine which resources can each user request, without the need for long whitelists.

## Advantages

### Simple to use
   
The idea is to provide a very simple to use middleware with per-instance and per-verb granularity in the access rules, while at the same time providing enhanced protection compared to a cookie-based approach. 

The verifier middleware can be [used by adding only one line](https://github.com/Saganus/macaroons-express-demo/blob/master/routes/index.js#L34). It does not require any DB or network access and it's very fast to execute thanks to the way Macaroons are designed. 

This allows you to easily and quickly protect several services backed up by a single Macaroon mint service. Whenever a new service is brought online the added verifier will immediately start enforcing whatever user policy you are using to mint the Macaroons.

### Secure

Since the access Macaroons are cryptographycally signed and include the context in which they are valid, it's much harder to do unauthorized actions in case of Macaroon theft. 

In contrast, in a traditional cookie-based system it's an all-or-nothing approach. I.e. an auth token stored in a cookie either grants complete access in case it's stolen, and only by revoking the cookie can access be prevented.

With the *mAuth* system, if for example the most commonly used Macaroon is the GET Macaroon and it happens to be stolen by a MITM, the attacker won't be able to do anything else other than GET requests while the Macaroon is valid, and only to those restricted routes specified in the user policy.

### Fine granularity (WIP)

On one hand we generate one Macaroon for each HTTP method, so you can decide exactly which methods is a user authorized to work with.

On the other hand, authorized routes will support wildcards so you can determine which resources can each user request, without the need for long whitelists.

Also, due to the way routes are defined, you can "group them up" with scopes, so that commonly used scopes can be defined once and reused for many users, giving you the chance to completely customize a user's access policy.

For example:

    scopes : 
        [
            {
                name : "restricted",
                routes : ["/restricted"],
                methods : ["GET", "POST"]
            },
            {
                name : "user profile",
                routes : ["/users/:userId/**"],
                methods : ["GET", "POST", "PUT"]
            },
            {
                name : "user projects",
                routes : ["/projects/:userId_*/*"],
                methods : ["GET", "POST"]
            },
            {
                name : "logout user",
                routes : ["/logout/:userId"],
                methods : ["POST"]
            } 
        ]
        
With this policy a user will have authorized access with `GET` and `POST` to `/restricted` as well as to the profile page, which as you can see is defined with wildcards of two different types. One of them is a variable (:userId) which will be replaced with the corresponding value at mint time, and the second `/**` one indicates that the access is granted recursively, i.e. the user will have access to any route that starts with `/users/:userId` so that if more features are added under that prefix, the user will still have access to them.

In the next case, for the scope "user projects", the user is granted acces to anything that starts with `/projects/:userId` but only up to the first level. e.g. `/projects/<userId_projectId>/getDetails` but not `/projects/<userId_projectId>/files/<fileId>`, unlike in the previous case.

Finally, the user is only authorized to do a POST to `/logout/:userId` (or maybe this can be changed to `/logout` and enforce the correct userId to be logged out in the actual logout function)

## How to use the mAuth middleware?

To use mAuth, first install it from npm:

    npm install mauth
    
Then `require()` either the verifier or the mint:

    var mAuthVerifier       = require("mauth").mAuthVerifier;
    var mAuthMint           = require("mauth").mAuthMint;
    
### Using the verifier middleware

Set the verifier middleware before the requests are routed to their endpoints, so that it can restrict or grant access. You can optionally specify a public scope which will configure which API resources do not require any authorization to be requested (i.e. public endpoints):

    var publicScope = {
        GET : ["/", "/login"],
        POST : ["/login", "/register", "/resetPassword"]
    };

    router.use(getMacaroonSecret({collection: "ACEs"}));  // this is a helper method used to set req.macaroonSecret
    router.use(mAuthVerifier({serverId : serverId, publicScope : publicScope}));

**That's it! Nothing else is required to restrict access to an API endpoint with your specified policy!**

#### Set req.macaroonSecret

Note that for the verifier to work you need to set the macaroonSecret for each request, i.e. either set it to a fixed value or use a helper middleware to set the variable depending on e.g. a DB query result (in this example that's what `getMacaroonSecret({collection: "ACEs"})` is used for)

The macaroonSecret value is the same one used when the macaroon was first created. It allows the server to verify that the macaroon hasn't been tampered with (i.e. it's used to calculate the signature)

### Using the mint module

The mint module is used to create the macaroons needed to access a restricted API resource.

You will generally use the mint module with your existing login infrastructure, to generate the macaroons just after the user has been authenticated. 

In a typical login system, you will have something like this:

    // first we search for the user
    collection.findOne({userId : userId}) 
        .then(function(user){
            if(user !== null){  
                // if we find it we verify that the provided password is the correct one
                var isAuthenticated = scrypt.verifyKdfSync(Buffer.from(user.pass, "hex"), pass);
                
                if(isAuthenticated){
                    // if the user is authenticated we generate the macaroons according to the user policy
                    var userPolicy      = getUserPolicy(user.userId);
                    var macaroonSecret  = mAuthMint.calculateMacaroonSecret(user.macaroonSecret);
                    authMacaroons       = mAuthMint.mintMacaroons(userPolicy, location, macaroonSecret, user.identifier);
                    
                    // we return an array of four macaroons (one for each HTTP verb)
                    // that can be stored as cookies, localStorage or any other mechanism
                    resolve(authMacaroons);
                }
                else{
                    var error = new Error("Authentication failed");
                    reject(error);
                }
            }
            else{
                var error = new Error("User not found: " + userId);
                reject(error);
            }
        }).catch(function (error) {
            console.log(error);
            reject(error);
        });

That's it. One line (plus an optional calculation step for the secret, which can be replaced for whatever other function we want) and we generate the necessary proof-of-authorization pieces to access a restricted API protected by the mAuth verifier module.

Simple!, right?
